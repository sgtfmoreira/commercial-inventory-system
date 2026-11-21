-- Recovery migration for portioning objects originally introduced through schema drift.
-- It is intentionally ordered before 20261011213000_add_inventory_lots_and_portioning_yield.
-- Existing compatible objects are preserved; incompatible objects abort the transaction.

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_table(relation_name text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE relation_kind "char";
BEGIN
  SELECT c.relkind INTO relation_kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=relation_name;
  IF relation_kind IS NOT NULL AND relation_kind NOT IN ('r','p') THEN
    RAISE EXCEPTION 'B2.8 incompatible relation public.%: expected table, found relkind %', relation_name, relation_kind USING ERRCODE='P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_require_table(relation_name text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(format('public.%I', relation_name)) IS NULL THEN
    RAISE EXCEPTION 'B2.8 missing prerequisite table public.%', relation_name USING ERRCODE='P0001';
  END IF;
  PERFORM pg_temp.bastidor_assert_table(relation_name);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_column(relation_name text, column_name text, expected_type text, expected_not_null boolean, expected_default text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual_type text; actual_not_null boolean; actual_default text;
BEGIN
  SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
  INTO actual_type,actual_not_null,actual_default
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND c.relname=relation_name AND a.attname=column_name AND a.attnum>0 AND NOT a.attisdropped;
  IF NOT FOUND THEN RETURN; END IF;
  IF actual_type<>expected_type OR actual_not_null<>expected_not_null THEN
    RAISE EXCEPTION 'B2.8 incompatible column %.%: type/not-null is %/%, expected %/%',relation_name,column_name,actual_type,actual_not_null,expected_type,expected_not_null USING ERRCODE='P0001';
  END IF;
  IF expected_default='none' AND actual_default IS NOT NULL THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected none',relation_name,column_name,actual_default USING ERRCODE='P0001';
  ELSIF expected_default='zero' AND COALESCE(actual_default,'') !~ '^0+(\.0+)?$' THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected zero',relation_name,column_name,actual_default USING ERRCODE='P0001';
  ELSIF expected_default='now' AND upper(COALESCE(actual_default,''))<>'CURRENT_TIMESTAMP' THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected CURRENT_TIMESTAMP',relation_name,column_name,actual_default USING ERRCODE='P0001';
  ELSIF expected_default='pending' AND COALESCE(actual_default,'') !~ '^''PENDING''::"ProductionStatus"$' THEN
    RAISE EXCEPTION 'B2.8 incompatible default %.%: %, expected PENDING',relation_name,column_name,actual_default USING ERRCODE='P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_primary_key(relation_name text, expected_column text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual_columns text[];
BEGIN
  SELECT array_agg(a.attname ORDER BY k.ordinality) INTO actual_columns
  FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  JOIN unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality) ON true
  JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=k.attnum
  WHERE n.nspname='public' AND r.relname=relation_name AND c.contype='p';
  IF actual_columns IS NOT NULL AND actual_columns<>ARRAY[expected_column] THEN
    RAISE EXCEPTION 'B2.8 incompatible primary key on %: %, expected %',relation_name,actual_columns,expected_column USING ERRCODE='P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_fk(relation_name text,constraint_name text,local_column text,referenced_relation text,referenced_column text,expected_delete "char",expected_update "char") RETURNS void
LANGUAGE plpgsql AS $$
DECLARE candidate record;
BEGIN
  FOR candidate IN
    SELECT c.conname,rr.relname ref_table,ra.attname ref_col,c.confdeltype,c.confupdtype,c.convalidated
    FROM pg_constraint c JOIN pg_class lr ON lr.oid=c.conrelid JOIN pg_namespace ln ON ln.oid=lr.relnamespace
    JOIN pg_class rr ON rr.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=rr.relnamespace
    JOIN pg_attribute la ON la.attrelid=lr.oid AND la.attnum=c.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid=rr.oid AND ra.attnum=c.confkey[1]
    WHERE ln.nspname='public' AND rn.nspname='public' AND lr.relname=relation_name AND c.contype='f'
      AND array_length(c.conkey,1)=1 AND la.attname=local_column
  LOOP
    IF candidate.conname<>constraint_name THEN
      RAISE EXCEPTION 'B2.8 unexpected FK % already covers %.%; expected %',candidate.conname,relation_name,local_column,constraint_name USING ERRCODE='P0001';
    END IF;
    IF candidate.ref_table<>referenced_relation OR candidate.ref_col<>referenced_column OR candidate.confdeltype<>expected_delete OR candidate.confupdtype<>expected_update OR NOT candidate.convalidated THEN
      RAISE EXCEPTION 'B2.8 incompatible FK % on %.%',constraint_name,relation_name,local_column USING ERRCODE='P0001';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_assert_index(relation_name text,index_name text,expected_columns text[],expected_unique boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual_columns text[]; actual_unique boolean; actual_valid boolean; actual_predicate pg_node_tree;
BEGIN
  SELECT array_agg(a.attname ORDER BY k.ordinality),i.indisunique,i.indisvalid,i.indpred
  INTO actual_columns,actual_unique,actual_valid,actual_predicate
  FROM pg_class idx JOIN pg_namespace ni ON ni.oid=idx.relnamespace JOIN pg_index i ON i.indexrelid=idx.oid
  JOIN pg_class tbl ON tbl.oid=i.indrelid JOIN pg_namespace nt ON nt.oid=tbl.relnamespace
  JOIN unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ordinality) ON k.attnum>0
  JOIN pg_attribute a ON a.attrelid=tbl.oid AND a.attnum=k.attnum
  WHERE ni.nspname='public' AND nt.nspname='public' AND idx.relname=index_name AND tbl.relname=relation_name
  GROUP BY i.indisunique,i.indisvalid,i.indpred;
  IF FOUND AND (actual_columns<>expected_columns OR actual_unique<>expected_unique OR NOT actual_valid OR actual_predicate IS NOT NULL) THEN
    RAISE EXCEPTION 'B2.8 incompatible index % on %',index_name,relation_name USING ERRCODE='P0001';
  END IF;
END;
$$;

SELECT pg_temp.bastidor_require_table('products');
SELECT pg_temp.bastidor_require_table('establishments');
SELECT pg_temp.bastidor_require_table('users');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='ProductionStatus') THEN
    RAISE EXCEPTION 'B2.8 missing prerequisite enum public.ProductionStatus' USING ERRCODE='P0001';
  END IF;
END $$;

SELECT pg_temp.bastidor_assert_table('portioning_recipes');
SELECT pg_temp.bastidor_assert_table('portioning_recipe_items');
SELECT pg_temp.bastidor_assert_table('portioning_orders');
SELECT pg_temp.bastidor_assert_table('portioning_order_items');

SELECT pg_temp.bastidor_assert_column('portioning_recipes','id','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_recipes','sourceProductId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_recipes','establishmentId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_recipes','createdAt','timestamp(3) without time zone',true,'now');
SELECT pg_temp.bastidor_assert_column('portioning_recipe_items','id','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_recipe_items','portioningRecipeId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_recipe_items','targetProductId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_recipe_items','costAllocationPercentage','numeric(5,2)',true,'zero');
SELECT pg_temp.bastidor_assert_column('portioning_recipe_items','createdAt','timestamp(3) without time zone',true,'now');
SELECT pg_temp.bastidor_assert_column('portioning_orders','id','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_orders','sourceProductId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_orders','sourceQuantity','numeric(12,3)',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_orders','status','"ProductionStatus"',true,'pending');
SELECT pg_temp.bastidor_assert_column('portioning_orders','notes','text',false,'none');
SELECT pg_temp.bastidor_assert_column('portioning_orders','establishmentId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_orders','createdBy','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_orders','completedAt','timestamp(3) without time zone',false,'none');
SELECT pg_temp.bastidor_assert_column('portioning_orders','createdAt','timestamp(3) without time zone',true,'now');
SELECT pg_temp.bastidor_assert_column('portioning_order_items','id','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_order_items','portioningOrderId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_order_items','targetProductId','uuid',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_order_items','quantity','numeric(12,3)',true,'none');
SELECT pg_temp.bastidor_assert_column('portioning_order_items','costAllocationPercentage','numeric(5,2)',true,'zero');
SELECT pg_temp.bastidor_assert_column('portioning_order_items','createdAt','timestamp(3) without time zone',true,'now');

BEGIN;

CREATE TABLE IF NOT EXISTS "portioning_recipes" (
  "id" UUID NOT NULL, "sourceProductId" UUID NOT NULL, "establishmentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "portioning_recipe_items" (
  "id" UUID NOT NULL, "portioningRecipeId" UUID NOT NULL, "targetProductId" UUID NOT NULL,
  "costAllocationPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "portioning_orders" (
  "id" UUID NOT NULL, "sourceProductId" UUID NOT NULL, "sourceQuantity" DECIMAL(12,3) NOT NULL,
  "status" "ProductionStatus" NOT NULL DEFAULT 'PENDING', "notes" TEXT,
  "establishmentId" UUID NOT NULL, "createdBy" UUID NOT NULL,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "portioning_order_items" (
  "id" UUID NOT NULL, "portioningOrderId" UUID NOT NULL, "targetProductId" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL, "costAllocationPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "portioning_recipes" ADD COLUMN IF NOT EXISTS "id" UUID NOT NULL;
ALTER TABLE "portioning_recipes" ADD COLUMN IF NOT EXISTS "sourceProductId" UUID NOT NULL;
ALTER TABLE "portioning_recipes" ADD COLUMN IF NOT EXISTS "establishmentId" UUID NOT NULL;
ALTER TABLE "portioning_recipes" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "portioning_recipe_items" ADD COLUMN IF NOT EXISTS "id" UUID NOT NULL;
ALTER TABLE "portioning_recipe_items" ADD COLUMN IF NOT EXISTS "portioningRecipeId" UUID NOT NULL;
ALTER TABLE "portioning_recipe_items" ADD COLUMN IF NOT EXISTS "targetProductId" UUID NOT NULL;
ALTER TABLE "portioning_recipe_items" ADD COLUMN IF NOT EXISTS "costAllocationPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "portioning_recipe_items" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "id" UUID NOT NULL;
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "sourceProductId" UUID NOT NULL;
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "sourceQuantity" DECIMAL(12,3) NOT NULL;
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "status" "ProductionStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "establishmentId" UUID NOT NULL;
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "createdBy" UUID NOT NULL;
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "portioning_orders" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "portioning_order_items" ADD COLUMN IF NOT EXISTS "id" UUID NOT NULL;
ALTER TABLE "portioning_order_items" ADD COLUMN IF NOT EXISTS "portioningOrderId" UUID NOT NULL;
ALTER TABLE "portioning_order_items" ADD COLUMN IF NOT EXISTS "targetProductId" UUID NOT NULL;
ALTER TABLE "portioning_order_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,3) NOT NULL;
ALTER TABLE "portioning_order_items" ADD COLUMN IF NOT EXISTS "costAllocationPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "portioning_order_items" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

SELECT pg_temp.bastidor_assert_primary_key('portioning_recipes','id');
SELECT pg_temp.bastidor_assert_primary_key('portioning_recipe_items','id');
SELECT pg_temp.bastidor_assert_primary_key('portioning_orders','id');
SELECT pg_temp.bastidor_assert_primary_key('portioning_order_items','id');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_recipes'::regclass AND contype='p') THEN ALTER TABLE "portioning_recipes" ADD CONSTRAINT "portioning_recipes_pkey" PRIMARY KEY ("id"); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_recipe_items'::regclass AND contype='p') THEN ALTER TABLE "portioning_recipe_items" ADD CONSTRAINT "portioning_recipe_items_pkey" PRIMARY KEY ("id"); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_orders'::regclass AND contype='p') THEN ALTER TABLE "portioning_orders" ADD CONSTRAINT "portioning_orders_pkey" PRIMARY KEY ("id"); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_order_items'::regclass AND contype='p') THEN ALTER TABLE "portioning_order_items" ADD CONSTRAINT "portioning_order_items_pkey" PRIMARY KEY ("id"); END IF;
END $$;

SELECT pg_temp.bastidor_assert_index('portioning_recipes','portioning_recipes_sourceProductId_key',ARRAY['sourceProductId'],true);
SELECT pg_temp.bastidor_assert_index('portioning_recipe_items','portioning_recipe_items_portioningRecipeId_targetProductId_key',ARRAY['portioningRecipeId','targetProductId'],true);
SELECT pg_temp.bastidor_assert_index('portioning_orders','portioning_orders_establishmentId_idx',ARRAY['establishmentId'],false);
SELECT pg_temp.bastidor_assert_index('portioning_orders','portioning_orders_createdAt_idx',ARRAY['createdAt'],false);
SELECT pg_temp.bastidor_assert_index('portioning_orders','portioning_orders_status_idx',ARRAY['status'],false);
CREATE UNIQUE INDEX IF NOT EXISTS "portioning_recipes_sourceProductId_key" ON "portioning_recipes"("sourceProductId");
CREATE UNIQUE INDEX IF NOT EXISTS "portioning_recipe_items_portioningRecipeId_targetProductId_key" ON "portioning_recipe_items"("portioningRecipeId","targetProductId");
CREATE INDEX IF NOT EXISTS "portioning_orders_establishmentId_idx" ON "portioning_orders"("establishmentId");
CREATE INDEX IF NOT EXISTS "portioning_orders_createdAt_idx" ON "portioning_orders"("createdAt");
CREATE INDEX IF NOT EXISTS "portioning_orders_status_idx" ON "portioning_orders"("status");

SELECT pg_temp.bastidor_assert_fk('portioning_recipes','portioning_recipes_sourceProductId_fkey','sourceProductId','products','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_recipes','portioning_recipes_establishmentId_fkey','establishmentId','establishments','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_recipe_items','portioning_recipe_items_portioningRecipeId_fkey','portioningRecipeId','portioning_recipes','id','c','c');
SELECT pg_temp.bastidor_assert_fk('portioning_recipe_items','portioning_recipe_items_targetProductId_fkey','targetProductId','products','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_orders','portioning_orders_sourceProductId_fkey','sourceProductId','products','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_orders','portioning_orders_establishmentId_fkey','establishmentId','establishments','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_orders','portioning_orders_createdBy_fkey','createdBy','users','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_order_items','portioning_order_items_portioningOrderId_fkey','portioningOrderId','portioning_orders','id','c','c');
SELECT pg_temp.bastidor_assert_fk('portioning_order_items','portioning_order_items_targetProductId_fkey','targetProductId','products','id','r','c');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_recipes'::regclass AND conname='portioning_recipes_sourceProductId_fkey') THEN ALTER TABLE "portioning_recipes" ADD CONSTRAINT "portioning_recipes_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_recipes'::regclass AND conname='portioning_recipes_establishmentId_fkey') THEN ALTER TABLE "portioning_recipes" ADD CONSTRAINT "portioning_recipes_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_recipe_items'::regclass AND conname='portioning_recipe_items_portioningRecipeId_fkey') THEN ALTER TABLE "portioning_recipe_items" ADD CONSTRAINT "portioning_recipe_items_portioningRecipeId_fkey" FOREIGN KEY ("portioningRecipeId") REFERENCES "portioning_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_recipe_items'::regclass AND conname='portioning_recipe_items_targetProductId_fkey') THEN ALTER TABLE "portioning_recipe_items" ADD CONSTRAINT "portioning_recipe_items_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_orders'::regclass AND conname='portioning_orders_sourceProductId_fkey') THEN ALTER TABLE "portioning_orders" ADD CONSTRAINT "portioning_orders_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_orders'::regclass AND conname='portioning_orders_establishmentId_fkey') THEN ALTER TABLE "portioning_orders" ADD CONSTRAINT "portioning_orders_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_orders'::regclass AND conname='portioning_orders_createdBy_fkey') THEN ALTER TABLE "portioning_orders" ADD CONSTRAINT "portioning_orders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_order_items'::regclass AND conname='portioning_order_items_portioningOrderId_fkey') THEN ALTER TABLE "portioning_order_items" ADD CONSTRAINT "portioning_order_items_portioningOrderId_fkey" FOREIGN KEY ("portioningOrderId") REFERENCES "portioning_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.portioning_order_items'::regclass AND conname='portioning_order_items_targetProductId_fkey') THEN ALTER TABLE "portioning_order_items" ADD CONSTRAINT "portioning_order_items_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
END $$;

SELECT pg_temp.bastidor_assert_primary_key('portioning_recipes','id');
SELECT pg_temp.bastidor_assert_primary_key('portioning_recipe_items','id');
SELECT pg_temp.bastidor_assert_primary_key('portioning_orders','id');
SELECT pg_temp.bastidor_assert_primary_key('portioning_order_items','id');
SELECT pg_temp.bastidor_assert_index('portioning_recipes','portioning_recipes_sourceProductId_key',ARRAY['sourceProductId'],true);
SELECT pg_temp.bastidor_assert_index('portioning_recipe_items','portioning_recipe_items_portioningRecipeId_targetProductId_key',ARRAY['portioningRecipeId','targetProductId'],true);
SELECT pg_temp.bastidor_assert_index('portioning_orders','portioning_orders_establishmentId_idx',ARRAY['establishmentId'],false);
SELECT pg_temp.bastidor_assert_index('portioning_orders','portioning_orders_createdAt_idx',ARRAY['createdAt'],false);
SELECT pg_temp.bastidor_assert_index('portioning_orders','portioning_orders_status_idx',ARRAY['status'],false);
SELECT pg_temp.bastidor_assert_fk('portioning_recipes','portioning_recipes_sourceProductId_fkey','sourceProductId','products','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_recipes','portioning_recipes_establishmentId_fkey','establishmentId','establishments','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_recipe_items','portioning_recipe_items_portioningRecipeId_fkey','portioningRecipeId','portioning_recipes','id','c','c');
SELECT pg_temp.bastidor_assert_fk('portioning_recipe_items','portioning_recipe_items_targetProductId_fkey','targetProductId','products','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_orders','portioning_orders_sourceProductId_fkey','sourceProductId','products','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_orders','portioning_orders_establishmentId_fkey','establishmentId','establishments','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_orders','portioning_orders_createdBy_fkey','createdBy','users','id','r','c');
SELECT pg_temp.bastidor_assert_fk('portioning_order_items','portioning_order_items_portioningOrderId_fkey','portioningOrderId','portioning_orders','id','c','c');
SELECT pg_temp.bastidor_assert_fk('portioning_order_items','portioning_order_items_targetProductId_fkey','targetProductId','products','id','r','c');

COMMIT;
