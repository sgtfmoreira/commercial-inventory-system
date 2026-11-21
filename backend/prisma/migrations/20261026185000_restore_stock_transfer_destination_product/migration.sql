-- Restores a schema dependency that was introduced in schema.prisma without DDL.
-- This migration is intentionally ordered immediately before
-- 20261026190000_add_stock_transfer_conversion, its first SQL consumer.
-- Compatible existing objects are preserved; incompatible objects fail closed.

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_require_table(relation_name text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  relation_kind "char";
BEGIN
  SELECT c.relkind INTO relation_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = relation_name;

  IF relation_kind IS NULL THEN
    RAISE EXCEPTION 'B2.10 missing prerequisite table public.%', relation_name USING ERRCODE = 'P0001';
  END IF;
  IF relation_kind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION 'B2.10 incompatible relation public.%: expected table, found relkind %', relation_name, relation_kind
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_assert_column(
  relation_name text,
  column_name text,
  expected_type text,
  expected_not_null boolean,
  required boolean
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actual_type text;
  actual_not_null boolean;
  actual_default text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO actual_type, actual_not_null, actual_default
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relname = relation_name
    AND a.attname = column_name AND a.attnum > 0 AND NOT a.attisdropped;

  IF NOT FOUND THEN
    IF required THEN
      RAISE EXCEPTION 'B2.10 missing required column %.%', relation_name, column_name USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;

  IF actual_type <> expected_type OR actual_not_null <> expected_not_null OR actual_default IS NOT NULL THEN
    RAISE EXCEPTION 'B2.10 incompatible column %.%: type/not-null/default is %/%/%, expected %/%/none',
      relation_name, column_name, actual_type, actual_not_null, actual_default, expected_type, expected_not_null
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_assert_fk(
  relation_name text,
  constraint_name text,
  local_column text,
  referenced_relation text,
  referenced_column text,
  expected_delete "char",
  expected_update "char",
  required boolean
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  candidate record;
  expected_found boolean := false;
BEGIN
  FOR candidate IN
    SELECT c.conname, la.attname AS local_col, rr.relname AS ref_table,
           ra.attname AS ref_col, c.confdeltype, c.confupdtype, c.convalidated,
           array_length(c.conkey, 1) AS local_column_count,
           array_length(c.confkey, 1) AS referenced_column_count
    FROM pg_constraint c
    JOIN pg_class lr ON lr.oid = c.conrelid
    JOIN pg_namespace ln ON ln.oid = lr.relnamespace
    JOIN pg_class rr ON rr.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rr.relnamespace
    LEFT JOIN pg_attribute la ON la.attrelid = lr.oid AND la.attnum = c.conkey[1]
    LEFT JOIN pg_attribute ra ON ra.attrelid = rr.oid AND ra.attnum = c.confkey[1]
    WHERE ln.nspname = 'public' AND rn.nspname = 'public'
      AND lr.relname = relation_name AND c.contype = 'f'
      AND (c.conname = constraint_name OR la.attname = local_column)
  LOOP
    IF candidate.conname <> constraint_name THEN
      RAISE EXCEPTION 'B2.10 unexpected FK % already covers %.%; expected %',
        candidate.conname, relation_name, local_column, constraint_name USING ERRCODE = 'P0001';
    END IF;
    expected_found := true;
    IF candidate.local_column_count <> 1 OR candidate.referenced_column_count <> 1
       OR candidate.local_col <> local_column
       OR candidate.ref_table <> referenced_relation OR candidate.ref_col <> referenced_column
       OR candidate.confdeltype <> expected_delete OR candidate.confupdtype <> expected_update
       OR NOT candidate.convalidated THEN
      RAISE EXCEPTION 'B2.10 incompatible FK % on %.%', constraint_name, relation_name, local_column
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF required AND NOT expected_found THEN
    RAISE EXCEPTION 'B2.10 missing required FK % on %.%', constraint_name, relation_name, local_column
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

SELECT pg_temp.bastidor_b210_require_table('StockTransfer');
SELECT pg_temp.bastidor_b210_require_table('products');
SELECT pg_temp.bastidor_b210_assert_column('StockTransfer', 'destinationProductId', 'uuid', false, false);
SELECT pg_temp.bastidor_b210_assert_fk(
  'StockTransfer', 'StockTransfer_destinationProductId_fkey', 'destinationProductId',
  'products', 'id', 'n', 'c', false
);

BEGIN;

ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "destinationProductId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."StockTransfer"'::regclass
      AND conname = 'StockTransfer_destinationProductId_fkey'
  ) THEN
    ALTER TABLE "StockTransfer"
      ADD CONSTRAINT "StockTransfer_destinationProductId_fkey"
      FOREIGN KEY ("destinationProductId") REFERENCES "products"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END;
$$;

SELECT pg_temp.bastidor_b210_assert_column('StockTransfer', 'destinationProductId', 'uuid', false, true);
SELECT pg_temp.bastidor_b210_assert_fk(
  'StockTransfer', 'StockTransfer_destinationProductId_fkey', 'destinationProductId',
  'products', 'id', 'n', 'c', true
);

COMMIT;
