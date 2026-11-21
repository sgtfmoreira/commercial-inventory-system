-- Forward-only recovery for a schema-only recipe column and five PostgreSQL
-- identifier truncations. Renames occur only after exact structural matching.

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_require_table(relation_name text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE relation_kind "char";
BEGIN
  SELECT c.relkind INTO relation_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
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

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_assert_yield(required boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actual_type text;
  actual_not_null boolean;
  actual_default text;
  normalized_default text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO actual_type, actual_not_null, actual_default
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relname = 'recipes'
    AND a.attname = 'yieldQuantity' AND a.attnum > 0 AND NOT a.attisdropped;

  IF NOT FOUND THEN
    IF required THEN
      RAISE EXCEPTION 'B2.10 missing required column recipes.yieldQuantity' USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;

  normalized_default := regexp_replace(COALESCE(actual_default, ''), '[[:space:]()]', '', 'g');
  IF actual_type <> 'numeric(12,3)' OR NOT actual_not_null
     OR normalized_default !~ '^''?1(\.0+)?''?(::numeric)?$' THEN
    RAISE EXCEPTION 'B2.10 incompatible column recipes.yieldQuantity: type/not-null/default is %/%/%',
      actual_type, actual_not_null, actual_default USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_assert_named_index(
  relation_name text,
  index_name text,
  expected_columns text[],
  expected_unique boolean,
  required boolean
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  relation_kind "char";
  actual_table text;
  actual_columns text[];
  actual_unique boolean;
  actual_valid boolean;
  actual_ready boolean;
  actual_predicate pg_node_tree;
  actual_expressions pg_node_tree;
  actual_method text;
  actual_options int2[];
BEGIN
  SELECT c.relkind INTO relation_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = index_name;

  IF NOT FOUND THEN
    IF required THEN
      RAISE EXCEPTION 'B2.10 missing required index %', index_name USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;
  IF relation_kind <> 'i' THEN
    RAISE EXCEPTION 'B2.10 relation public.% exists but is not an index', index_name USING ERRCODE = 'P0001';
  END IF;

  SELECT tbl.relname,
         array_agg(a.attname ORDER BY k.ordinality),
         i.indisunique, i.indisvalid, i.indisready, i.indpred, i.indexprs,
         am.amname, array_agg(o.option ORDER BY o.ordinality)
  INTO actual_table, actual_columns, actual_unique, actual_valid, actual_ready,
       actual_predicate, actual_expressions, actual_method, actual_options
  FROM pg_class idx
  JOIN pg_namespace ni ON ni.oid = idx.relnamespace
  JOIN pg_index i ON i.indexrelid = idx.oid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace nt ON nt.oid = tbl.relnamespace
  JOIN pg_am am ON am.oid = idx.relam
  JOIN unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum, ordinality) ON k.attnum > 0
  JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = k.attnum
  JOIN unnest(i.indoption::int2[]) WITH ORDINALITY o(option, ordinality) ON o.ordinality = k.ordinality
  WHERE ni.nspname = 'public' AND nt.nspname = 'public' AND idx.relname = index_name
  GROUP BY tbl.relname, i.indisunique, i.indisvalid, i.indisready,
           i.indpred, i.indexprs, am.amname;

  IF actual_table <> relation_name OR actual_columns <> expected_columns
     OR actual_unique <> expected_unique OR NOT actual_valid OR NOT actual_ready
     OR actual_predicate IS NOT NULL OR actual_expressions IS NOT NULL
     OR actual_method <> 'btree'
     OR EXISTS (SELECT 1 FROM unnest(actual_options) option WHERE option <> 0) THEN
    RAISE EXCEPTION 'B2.10 incompatible index % on %, columns=% unique=%',
      index_name, actual_table, actual_columns, actual_unique USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_prepare_index_rename(
  relation_name text,
  old_name text,
  new_name text,
  expected_columns text[],
  expected_unique boolean
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  old_exists boolean := to_regclass(format('public.%I', old_name)) IS NOT NULL;
  new_exists boolean := to_regclass(format('public.%I', new_name)) IS NOT NULL;
BEGIN
  IF old_exists AND new_exists THEN
    RAISE EXCEPTION 'B2.10 both old and target index names exist: %, %', old_name, new_name USING ERRCODE = 'P0001';
  END IF;
  IF NOT old_exists AND NOT new_exists THEN
    RAISE EXCEPTION 'B2.10 missing prerequisite index: expected % or %', old_name, new_name USING ERRCODE = 'P0001';
  END IF;
  IF old_exists THEN
    PERFORM pg_temp.bastidor_b210_assert_named_index(relation_name, old_name, expected_columns, expected_unique, true);
  ELSE
    PERFORM pg_temp.bastidor_b210_assert_named_index(relation_name, new_name, expected_columns, expected_unique, true);
  END IF;
END;
$$;

SELECT pg_temp.bastidor_b210_require_table('recipes');
SELECT pg_temp.bastidor_b210_assert_yield(false);

SELECT pg_temp.bastidor_b210_prepare_index_rename('bonus_receipts',
  'bonus_receipts_establishmentId_supplierId_invoiceNumber_invoice',
  'bonus_receipts_establishmentId_supplierId_invoiceNumber_inv_key',
  ARRAY['establishmentId','supplierId','invoiceNumber','invoiceSeries'], true);
SELECT pg_temp.bastidor_b210_prepare_index_rename('purchase_invoices',
  'purchase_invoices_establishmentId_supplierId_invoiceNumber_invo',
  'purchase_invoices_establishmentId_supplierId_invoiceNumber__key',
  ARRAY['establishmentId','supplierId','invoiceNumber','invoiceSeries'], true);
SELECT pg_temp.bastidor_b210_prepare_index_rename('stock_movements',
  'stock_movements_establishmentId_purchaseClassification_createdA',
  'stock_movements_establishmentId_purchaseClassification_crea_idx',
  ARRAY['establishmentId','purchaseClassification','createdAt'], false);
SELECT pg_temp.bastidor_b210_prepare_index_rename('supplier_catalog_items',
  'supplier_catalog_items_organizationSupplierId_organizationProdu',
  'supplier_catalog_items_organizationSupplierId_organizationP_key',
  ARRAY['organizationSupplierId','organizationProductId'], true);
SELECT pg_temp.bastidor_b210_prepare_index_rename('supplier_price_update_items',
  'supplier_price_update_items_supplierPriceUpdateId_supplierCatal',
  'supplier_price_update_items_supplierPriceUpdateId_supplierC_key',
  ARRAY['supplierPriceUpdateId','supplierCatalogItemId'], true);

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "yieldQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF to_regclass('public."bonus_receipts_establishmentId_supplierId_invoiceNumber_invoice"') IS NOT NULL THEN
    ALTER INDEX "bonus_receipts_establishmentId_supplierId_invoiceNumber_invoice"
      RENAME TO "bonus_receipts_establishmentId_supplierId_invoiceNumber_inv_key";
  END IF;
  IF to_regclass('public."purchase_invoices_establishmentId_supplierId_invoiceNumber_invo"') IS NOT NULL THEN
    ALTER INDEX "purchase_invoices_establishmentId_supplierId_invoiceNumber_invo"
      RENAME TO "purchase_invoices_establishmentId_supplierId_invoiceNumber__key";
  END IF;
  IF to_regclass('public."stock_movements_establishmentId_purchaseClassification_createdA"') IS NOT NULL THEN
    ALTER INDEX "stock_movements_establishmentId_purchaseClassification_createdA"
      RENAME TO "stock_movements_establishmentId_purchaseClassification_crea_idx";
  END IF;
  IF to_regclass('public."supplier_catalog_items_organizationSupplierId_organizationProdu"') IS NOT NULL THEN
    ALTER INDEX "supplier_catalog_items_organizationSupplierId_organizationProdu"
      RENAME TO "supplier_catalog_items_organizationSupplierId_organizationP_key";
  END IF;
  IF to_regclass('public."supplier_price_update_items_supplierPriceUpdateId_supplierCatal"') IS NOT NULL THEN
    ALTER INDEX "supplier_price_update_items_supplierPriceUpdateId_supplierCatal"
      RENAME TO "supplier_price_update_items_supplierPriceUpdateId_supplierC_key";
  END IF;
END;
$$;

SELECT pg_temp.bastidor_b210_assert_yield(true);
SELECT pg_temp.bastidor_b210_assert_named_index('bonus_receipts',
  'bonus_receipts_establishmentId_supplierId_invoiceNumber_inv_key',
  ARRAY['establishmentId','supplierId','invoiceNumber','invoiceSeries'], true, true);
SELECT pg_temp.bastidor_b210_assert_named_index('purchase_invoices',
  'purchase_invoices_establishmentId_supplierId_invoiceNumber__key',
  ARRAY['establishmentId','supplierId','invoiceNumber','invoiceSeries'], true, true);
SELECT pg_temp.bastidor_b210_assert_named_index('stock_movements',
  'stock_movements_establishmentId_purchaseClassification_crea_idx',
  ARRAY['establishmentId','purchaseClassification','createdAt'], false, true);
SELECT pg_temp.bastidor_b210_assert_named_index('supplier_catalog_items',
  'supplier_catalog_items_organizationSupplierId_organizationP_key',
  ARRAY['organizationSupplierId','organizationProductId'], true, true);
SELECT pg_temp.bastidor_b210_assert_named_index('supplier_price_update_items',
  'supplier_price_update_items_supplierPriceUpdateId_supplierC_key',
  ARRAY['supplierPriceUpdateId','supplierCatalogItemId'], true, true);

COMMIT;
