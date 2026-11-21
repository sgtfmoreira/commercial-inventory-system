-- Forward-only recovery for five supporting indexes omitted from the original
-- commercial agreement migration. This deliberately uses transactional CREATE
-- INDEX for atomicity. It is validated only on disposable local databases until
-- table volume and an operational lock window are audited for shared environments.

CREATE OR REPLACE FUNCTION pg_temp.bastidor_b210_assert_supporting_index(
  relation_name text,
  index_name text,
  expected_columns text[],
  required boolean
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  candidate record;
  expected_found boolean := false;
  named_relation_kind "char";
BEGIN
  SELECT c.relkind INTO named_relation_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = index_name;
  IF FOUND AND named_relation_kind <> 'i' THEN
    RAISE EXCEPTION 'B2.10 relation public.% exists but is not an index', index_name USING ERRCODE = 'P0001';
  END IF;

  FOR candidate IN
    SELECT idx.relname AS candidate_name,
           array_agg(a.attname::text ORDER BY k.ordinality) AS columns,
           i.indisunique, i.indisvalid, i.indisready,
           i.indpred, i.indexprs, am.amname,
           array_agg(o.option ORDER BY o.ordinality) AS options
    FROM pg_class idx
    JOIN pg_namespace ni ON ni.oid = idx.relnamespace
    JOIN pg_index i ON i.indexrelid = idx.oid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace nt ON nt.oid = tbl.relnamespace
    JOIN pg_am am ON am.oid = idx.relam
    JOIN unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum, ordinality) ON k.attnum > 0
    JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = k.attnum
    JOIN unnest(i.indoption::int2[]) WITH ORDINALITY o(option, ordinality) ON o.ordinality = k.ordinality
    WHERE ni.nspname = 'public' AND nt.nspname = 'public' AND tbl.relname = relation_name
    GROUP BY idx.relname, i.indisunique, i.indisvalid, i.indisready,
             i.indpred, i.indexprs, am.amname
  LOOP
    IF candidate.candidate_name = index_name THEN
      expected_found := true;
      IF candidate.columns <> expected_columns OR candidate.indisunique
         OR NOT candidate.indisvalid OR NOT candidate.indisready
         OR candidate.indpred IS NOT NULL OR candidate.indexprs IS NOT NULL
         OR candidate.amname <> 'btree'
         OR EXISTS (SELECT 1 FROM unnest(candidate.options) option WHERE option <> 0) THEN
        RAISE EXCEPTION 'B2.10 incompatible index % on %', index_name, relation_name USING ERRCODE = 'P0001';
      END IF;
    ELSIF candidate.columns = expected_columns AND NOT candidate.indisunique
          AND candidate.indisvalid AND candidate.indisready
          AND candidate.indpred IS NULL AND candidate.indexprs IS NULL
          AND candidate.amname = 'btree'
          AND NOT EXISTS (SELECT 1 FROM unnest(candidate.options) option WHERE option <> 0) THEN
      RAISE EXCEPTION 'B2.10 equivalent index % already exists on %; expected canonical name %',
        candidate.candidate_name, relation_name, index_name USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF required AND NOT expected_found THEN
    RAISE EXCEPTION 'B2.10 missing required index % on %', index_name, relation_name USING ERRCODE = 'P0001';
  END IF;
END;
$$;

SELECT pg_temp.bastidor_b210_assert_supporting_index('bonus_receipt_items',
  'bonus_receipt_items_bonusReceiptId_idx', ARRAY['bonusReceiptId'], false);
SELECT pg_temp.bastidor_b210_assert_supporting_index('bonus_receipt_items',
  'bonus_receipt_items_productId_idx', ARRAY['productId'], false);
SELECT pg_temp.bastidor_b210_assert_supporting_index('commercial_agreement_products',
  'commercial_agreement_products_productId_idx', ARRAY['productId'], false);
SELECT pg_temp.bastidor_b210_assert_supporting_index('purchase_invoice_items',
  'purchase_invoice_items_invoiceId_idx', ARRAY['invoiceId'], false);
SELECT pg_temp.bastidor_b210_assert_supporting_index('purchase_invoice_items',
  'purchase_invoice_items_productId_idx', ARRAY['productId'], false);

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "bonus_receipt_items_bonusReceiptId_idx"
  ON "bonus_receipt_items"("bonusReceiptId");
CREATE INDEX IF NOT EXISTS "bonus_receipt_items_productId_idx"
  ON "bonus_receipt_items"("productId");
CREATE INDEX IF NOT EXISTS "commercial_agreement_products_productId_idx"
  ON "commercial_agreement_products"("productId");
CREATE INDEX IF NOT EXISTS "purchase_invoice_items_invoiceId_idx"
  ON "purchase_invoice_items"("invoiceId");
CREATE INDEX IF NOT EXISTS "purchase_invoice_items_productId_idx"
  ON "purchase_invoice_items"("productId");

SELECT pg_temp.bastidor_b210_assert_supporting_index('bonus_receipt_items',
  'bonus_receipt_items_bonusReceiptId_idx', ARRAY['bonusReceiptId'], true);
SELECT pg_temp.bastidor_b210_assert_supporting_index('bonus_receipt_items',
  'bonus_receipt_items_productId_idx', ARRAY['productId'], true);
SELECT pg_temp.bastidor_b210_assert_supporting_index('commercial_agreement_products',
  'commercial_agreement_products_productId_idx', ARRAY['productId'], true);
SELECT pg_temp.bastidor_b210_assert_supporting_index('purchase_invoice_items',
  'purchase_invoice_items_invoiceId_idx', ARRAY['invoiceId'], true);
SELECT pg_temp.bastidor_b210_assert_supporting_index('purchase_invoice_items',
  'purchase_invoice_items_productId_idx', ARRAY['productId'], true);

COMMIT;
