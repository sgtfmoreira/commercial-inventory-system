ALTER TABLE "StockTransfer"
    ADD COLUMN "destinationQuantity" DOUBLE PRECISION,
    ADD COLUMN "sourceUnit" TEXT,
    ADD COLUMN "destinationUnit" TEXT,
    ADD COLUMN "sourcePackQuantity" DOUBLE PRECISION,
    ADD COLUMN "destinationPackQuantity" DOUBLE PRECISION,
    ADD COLUMN "conversionFactor" DOUBLE PRECISION;

-- Preserva a intencao das transferencias ainda pendentes criadas antes desta
-- versao. Transferencias ja aprovadas nao sao reescritas, pois exigem
-- conciliacao com o historico de movimentacoes.
UPDATE "StockTransfer" AS transfer
SET
    "destinationQuantity" = CASE
        WHEN LOWER(TRIM(source."unit")) = LOWER(TRIM(destination."unit"))
            THEN transfer."quantity"
        ELSE transfer."quantity"
            / COALESCE(NULLIF(source."packQuantity", 0), 1)
            * COALESCE(NULLIF(destination."packQuantity", 0), 1)
    END,
    "sourceUnit" = source."unit",
    "destinationUnit" = destination."unit",
    "sourcePackQuantity" = COALESCE(NULLIF(source."packQuantity", 0), 1),
    "destinationPackQuantity" = COALESCE(NULLIF(destination."packQuantity", 0), 1),
    "conversionFactor" = CASE
        WHEN LOWER(TRIM(source."unit")) = LOWER(TRIM(destination."unit")) THEN 1
        ELSE COALESCE(NULLIF(destination."packQuantity", 0), 1)
            / COALESCE(NULLIF(source."packQuantity", 0), 1)
    END
FROM "products" AS source, "products" AS destination
WHERE transfer."productId" = source."id"
  AND transfer."destinationProductId" = destination."id"
  AND transfer."status" = 'PENDING'
  AND transfer."destinationQuantity" IS NULL
  AND (
      LOWER(TRIM(source."unit")) = LOWER(TRIM(destination."unit"))
      OR (
          NULLIF(LOWER(TRIM(source."purchaseUnit")), '') IS NOT NULL
          AND LOWER(TRIM(source."purchaseUnit")) = LOWER(TRIM(destination."purchaseUnit"))
      )
  );

UPDATE "StockTransfer" AS transfer
SET
    "destinationQuantity" = transfer."quantity",
    "sourceUnit" = source."unit",
    "destinationUnit" = source."unit",
    "sourcePackQuantity" = COALESCE(NULLIF(source."packQuantity", 0), 1),
    "destinationPackQuantity" = COALESCE(NULLIF(source."packQuantity", 0), 1),
    "conversionFactor" = 1
FROM "products" AS source
WHERE transfer."productId" = source."id"
  AND transfer."destinationProductId" IS NULL
  AND transfer."status" = 'PENDING'
  AND transfer."destinationQuantity" IS NULL;
