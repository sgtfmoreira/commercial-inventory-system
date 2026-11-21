-- Recovery migration for schema objects originally introduced through schema drift.
-- It is intentionally ordered before 20260921180000_guard_stock_location_tenant.
-- Existing compatible objects are preserved; incompatible objects abort the transaction.

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_table(relation_name text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  relation_kind "char";
BEGIN
  SELECT c.relkind INTO relation_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = relation_name;

  IF relation_kind IS NOT NULL AND relation_kind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION 'B2.8 incompatible relation public.%: expected table, found relkind %', relation_name, relation_kind
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_require_table(relation_name text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(format('public.%I', relation_name)) IS NULL THEN
    RAISE EXCEPTION 'B2.8 missing prerequisite table public.%', relation_name USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_temp.bastidor_assert_table(relation_name);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_column(
  relation_name text,
  column_name text,
  expected_type text,
  expected_not_null boolean,
  expected_default text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actual_type text;
  actual_not_null boolean;
  actual_default text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull,
         pg_get_expr(d.adbin, d.adrelid)
  INTO actual_type, actual_not_null, actual_default
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relname = relation_name
    AND a.attname = column_name AND a.attnum > 0 AND NOT a.attisdropped;

  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF actual_type <> expected_type OR actual_not_null <> expected_not_null THEN
    RAISE EXCEPTION 'B2.8 incompatible column %.%: type/not-null is %/%, expected %/%',
      relation_name, column_name, actual_type, actual_not_null, expected_type, expected_not_null
      USING ERRCODE = 'P0001';
  END IF;
  IF expected_default = 'none' AND actual_default IS NOT NULL THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected none', relation_name, column_name, actual_default USING ERRCODE = 'P0001';
  ELSIF expected_default = 'false' AND COALESCE(actual_default, '') !~* '^false(::boolean)?$' THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected false', relation_name, column_name, actual_default USING ERRCODE = 'P0001';
  ELSIF expected_default = 'zero' AND COALESCE(actual_default, '') !~ '^0+(\.0+)?$' THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected zero', relation_name, column_name, actual_default USING ERRCODE = 'P0001';
  ELSIF expected_default = 'now' AND upper(COALESCE(actual_default, '')) <> 'CURRENT_TIMESTAMP' THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected CURRENT_TIMESTAMP', relation_name, column_name, actual_default USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_primary_key(relation_name text, expected_column text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actual_columns text[];
BEGIN
  SELECT array_agg(a.attname ORDER BY k.ordinality) INTO actual_columns
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ordinality) ON true
  JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum = k.attnum
  WHERE n.nspname = 'public' AND r.relname = relation_name AND c.contype = 'p';

  IF actual_columns IS NOT NULL AND actual_columns <> ARRAY[expected_column] THEN
    RAISE EXCEPTION 'B2.8 incompatible primary key on %: %, expected %', relation_name, actual_columns, expected_column USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_fk(
  relation_name text,
  constraint_name text,
  local_column text,
  referenced_relation text,
  referenced_column text,
  expected_delete "char",
  expected_update "char"
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  candidate record;
  named_found boolean := false;
BEGIN
  FOR candidate IN
    SELECT c.conname, lr.relname AS local_table, la.attname AS local_col,
           rr.relname AS ref_table, ra.attname AS ref_col,
           c.confdeltype, c.confupdtype, c.convalidated
    FROM pg_constraint c
    JOIN pg_class lr ON lr.oid = c.conrelid
    JOIN pg_namespace ln ON ln.oid = lr.relnamespace
    JOIN pg_class rr ON rr.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rr.relnamespace
    JOIN pg_attribute la ON la.attrelid = lr.oid AND la.attnum = c.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid = rr.oid AND ra.attnum = c.confkey[1]
    WHERE ln.nspname = 'public' AND rn.nspname = 'public'
      AND lr.relname = relation_name AND c.contype = 'f'
      AND array_length(c.conkey, 1) = 1 AND la.attname = local_column
  LOOP
    IF candidate.conname = constraint_name THEN
      named_found := true;
      IF candidate.ref_table <> referenced_relation OR candidate.ref_col <> referenced_column
         OR candidate.confdeltype <> expected_delete OR candidate.confupdtype <> expected_update
         OR NOT candidate.convalidated THEN
        RAISE EXCEPTION 'B2.8 incompatible FK % on %.%', constraint_name, relation_name, local_column USING ERRCODE = 'P0001';
      END IF;
    ELSE
      RAISE EXCEPTION 'B2.8 unexpected FK % already covers %.%; expected %', candidate.conname, relation_name, local_column, constraint_name USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_index(
  relation_name text,
  index_name text,
  expected_columns text[],
  expected_unique boolean
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actual_columns text[];
  actual_unique boolean;
  actual_valid boolean;
  actual_predicate pg_node_tree;
BEGIN
  SELECT array_agg(a.attname ORDER BY k.ordinality), i.indisunique, i.indisvalid, i.indpred
  INTO actual_columns, actual_unique, actual_valid, actual_predicate
  FROM pg_class idx
  JOIN pg_namespace ni ON ni.oid = idx.relnamespace
  JOIN pg_index i ON i.indexrelid = idx.oid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace nt ON nt.oid = tbl.relnamespace
  JOIN unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum, ordinality) ON k.attnum > 0
  JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = k.attnum
  WHERE ni.nspname = 'public' AND nt.nspname = 'public'
    AND idx.relname = index_name AND tbl.relname = relation_name
  GROUP BY i.indisunique, i.indisvalid, i.indpred;

  IF FOUND AND (actual_columns <> expected_columns OR actual_unique <> expected_unique
                OR NOT actual_valid OR actual_predicate IS NOT NULL) THEN
    RAISE EXCEPTION 'B2.8 incompatible index % on %', index_name, relation_name USING ERRCODE = 'P0001';
  END IF;
END;
$$;

SELECT pg_temp.bastidor_require_table('establishments');
SELECT pg_temp.bastidor_require_table('products');
SELECT pg_temp.bastidor_require_table('stock_movements');
SELECT pg_temp.bastidor_require_table('stock_audit_items');
SELECT pg_temp.bastidor_require_table('consumption_event_items');
SELECT pg_temp.bastidor_assert_table('stock_locations');
SELECT pg_temp.bastidor_assert_table('product_stocks');

SELECT pg_temp.bastidor_assert_column('stock_locations', 'id', 'uuid', true, 'none');
SELECT pg_temp.bastidor_assert_column('stock_locations', 'name', 'text', true, 'none');
SELECT pg_temp.bastidor_assert_column('stock_locations', 'isDefault', 'boolean', true, 'false');
SELECT pg_temp.bastidor_assert_column('stock_locations', 'establishmentId', 'uuid', true, 'none');
SELECT pg_temp.bastidor_assert_column('stock_locations', 'createdAt', 'timestamp(3) without time zone', true, 'now');
SELECT pg_temp.bastidor_assert_column('product_stocks', 'id', 'uuid', true, 'none');
SELECT pg_temp.bastidor_assert_column('product_stocks', 'productId', 'uuid', true, 'none');
SELECT pg_temp.bastidor_assert_column('product_stocks', 'locationId', 'uuid', true, 'none');
SELECT pg_temp.bastidor_assert_column('product_stocks', 'quantity', 'numeric(12,3)', true, 'zero');
SELECT pg_temp.bastidor_assert_column('product_stocks', 'updatedAt', 'timestamp(3) without time zone', true, 'none');
SELECT pg_temp.bastidor_assert_column('products', 'defaultLocationId', 'uuid', false, 'none');
SELECT pg_temp.bastidor_assert_column('stock_movements', 'locationId', 'uuid', false, 'none');
SELECT pg_temp.bastidor_assert_column('stock_audit_items', 'locationId', 'uuid', false, 'none');
SELECT pg_temp.bastidor_assert_column('consumption_event_items', 'locationId', 'uuid', false, 'none');

BEGIN;

CREATE TABLE IF NOT EXISTS "stock_locations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "establishmentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "stock_locations" ADD COLUMN IF NOT EXISTS "id" UUID NOT NULL;
ALTER TABLE "stock_locations" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;
ALTER TABLE "stock_locations" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stock_locations" ADD COLUMN IF NOT EXISTS "establishmentId" UUID NOT NULL;
ALTER TABLE "stock_locations" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "product_stocks" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "product_stocks" ADD COLUMN IF NOT EXISTS "id" UUID NOT NULL;
ALTER TABLE "product_stocks" ADD COLUMN IF NOT EXISTS "productId" UUID NOT NULL;
ALTER TABLE "product_stocks" ADD COLUMN IF NOT EXISTS "locationId" UUID NOT NULL;
ALTER TABLE "product_stocks" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "product_stocks" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "defaultLocationId" UUID;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "locationId" UUID;
ALTER TABLE "stock_audit_items" ADD COLUMN IF NOT EXISTS "locationId" UUID;
ALTER TABLE "consumption_event_items" ADD COLUMN IF NOT EXISTS "locationId" UUID;

SELECT pg_temp.bastidor_assert_primary_key('stock_locations', 'id');
SELECT pg_temp.bastidor_assert_primary_key('product_stocks', 'id');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.stock_locations'::regclass AND contype = 'p') THEN
    ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.product_stocks'::regclass AND contype = 'p') THEN
    ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

SELECT pg_temp.bastidor_assert_index('stock_locations', 'stock_locations_name_establishmentId_key', ARRAY['name','establishmentId'], true);
SELECT pg_temp.bastidor_assert_index('product_stocks', 'product_stocks_productId_locationId_key', ARRAY['productId','locationId'], true);
CREATE UNIQUE INDEX IF NOT EXISTS "stock_locations_name_establishmentId_key" ON "stock_locations"("name", "establishmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "product_stocks_productId_locationId_key" ON "product_stocks"("productId", "locationId");

SELECT pg_temp.bastidor_assert_fk('stock_locations', 'stock_locations_establishmentId_fkey', 'establishmentId', 'establishments', 'id', 'r', 'c');
SELECT pg_temp.bastidor_assert_fk('product_stocks', 'product_stocks_productId_fkey', 'productId', 'products', 'id', 'r', 'c');
SELECT pg_temp.bastidor_assert_fk('product_stocks', 'product_stocks_locationId_fkey', 'locationId', 'stock_locations', 'id', 'r', 'c');
SELECT pg_temp.bastidor_assert_fk('products', 'products_defaultLocationId_fkey', 'defaultLocationId', 'stock_locations', 'id', 'n', 'c');
SELECT pg_temp.bastidor_assert_fk('stock_movements', 'stock_movements_locationId_fkey', 'locationId', 'stock_locations', 'id', 'n', 'c');
SELECT pg_temp.bastidor_assert_fk('stock_audit_items', 'stock_audit_items_locationId_fkey', 'locationId', 'stock_locations', 'id', 'n', 'c');
SELECT pg_temp.bastidor_assert_fk('consumption_event_items', 'consumption_event_items_locationId_fkey', 'locationId', 'stock_locations', 'id', 'n', 'c');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.stock_locations'::regclass AND conname='stock_locations_establishmentId_fkey') THEN
    ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.product_stocks'::regclass AND conname='product_stocks_productId_fkey') THEN
    ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.product_stocks'::regclass AND conname='product_stocks_locationId_fkey') THEN
    ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.products'::regclass AND conname='products_defaultLocationId_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.stock_movements'::regclass AND conname='stock_movements_locationId_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.stock_audit_items'::regclass AND conname='stock_audit_items_locationId_fkey') THEN
    ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.consumption_event_items'::regclass AND conname='consumption_event_items_locationId_fkey') THEN
    ALTER TABLE "consumption_event_items" ADD CONSTRAINT "consumption_event_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Postconditions use the same strict checks after all additive operations.
SELECT pg_temp.bastidor_assert_primary_key('stock_locations', 'id');
SELECT pg_temp.bastidor_assert_primary_key('product_stocks', 'id');
SELECT pg_temp.bastidor_assert_index('stock_locations', 'stock_locations_name_establishmentId_key', ARRAY['name','establishmentId'], true);
SELECT pg_temp.bastidor_assert_index('product_stocks', 'product_stocks_productId_locationId_key', ARRAY['productId','locationId'], true);
SELECT pg_temp.bastidor_assert_fk('stock_locations', 'stock_locations_establishmentId_fkey', 'establishmentId', 'establishments', 'id', 'r', 'c');
SELECT pg_temp.bastidor_assert_fk('product_stocks', 'product_stocks_productId_fkey', 'productId', 'products', 'id', 'r', 'c');
SELECT pg_temp.bastidor_assert_fk('product_stocks', 'product_stocks_locationId_fkey', 'locationId', 'stock_locations', 'id', 'r', 'c');
SELECT pg_temp.bastidor_assert_fk('products', 'products_defaultLocationId_fkey', 'defaultLocationId', 'stock_locations', 'id', 'n', 'c');
SELECT pg_temp.bastidor_assert_fk('stock_movements', 'stock_movements_locationId_fkey', 'locationId', 'stock_locations', 'id', 'n', 'c');
SELECT pg_temp.bastidor_assert_fk('stock_audit_items', 'stock_audit_items_locationId_fkey', 'locationId', 'stock_locations', 'id', 'n', 'c');
SELECT pg_temp.bastidor_assert_fk('consumption_event_items', 'consumption_event_items_locationId_fkey', 'locationId', 'stock_locations', 'id', 'n', 'c');

COMMIT;
