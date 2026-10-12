CREATE TABLE "inventory_lots" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "establishmentId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "supplierId" UUID,
    "purchaseOrderItemId" UUID NOT NULL,
    "initialQuantity" DECIMAL(12,3) NOT NULL,
    "remainingQuantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_lots_code_key" ON "inventory_lots"("code");
CREATE UNIQUE INDEX "inventory_lots_purchaseOrderItemId_key" ON "inventory_lots"("purchaseOrderItemId");
CREATE INDEX "inventory_lots_establishmentId_productId_receivedAt_idx" ON "inventory_lots"("establishmentId", "productId", "receivedAt");
CREATE INDEX "inventory_lots_establishmentId_remainingQuantity_idx" ON "inventory_lots"("establishmentId", "remainingQuantity");

ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portioning_orders" ADD COLUMN "sourceLotId" UUID;
ALTER TABLE "portioning_order_items" ADD COLUMN "netWeightKg" DECIMAL(12,3);
CREATE INDEX "portioning_orders_sourceLotId_idx" ON "portioning_orders"("sourceLotId");
ALTER TABLE "portioning_orders" ADD CONSTRAINT "portioning_orders_sourceLotId_fkey" FOREIGN KEY ("sourceLotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "portioning_order_items" poi
SET "netWeightKg" = poi."quantity"
FROM "products" p
WHERE p."id" = poi."targetProductId"
  AND LOWER(TRIM(p."unit")) IN ('kg', 'quilo', 'quilos', 'quilograma', 'quilogramas');

WITH received_lots AS (
    SELECT
        poi.*,
        po."establishmentId",
        COALESCE(po."completedAt", poi."createdAt") AS "receivedAt",
        p."unit" AS "productUnit",
        p."quantity" AS "currentStock",
        COALESCE(
            SUM(poi."receivedStockQuantity") OVER (
                PARTITION BY poi."productId"
                ORDER BY COALESCE(po."completedAt", poi."createdAt") DESC, poi."id" DESC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
        ) AS "newerReceivedQuantity"
    FROM "purchase_order_items" poi
    JOIN "purchase_orders" po ON po."id" = poi."purchaseOrderId"
    JOIN "products" p ON p."id" = poi."productId"
    WHERE po."status" = 'completed' AND poi."receivedStockQuantity" > 0
)
INSERT INTO "inventory_lots" (
    "id", "code", "establishmentId", "productId", "supplierId", "purchaseOrderItemId",
    "initialQuantity", "remainingQuantity", "unit", "receivedAt"
)
SELECT
    gen_random_uuid(),
    'LOT-' || UPPER(SUBSTRING(REPLACE(rl."id"::text, '-', ''), 1, 12)),
    rl."establishmentId",
    rl."productId",
    rl."supplierId",
    rl."id",
    rl."receivedStockQuantity",
    GREATEST(0, LEAST(rl."receivedStockQuantity", rl."currentStock" - rl."newerReceivedQuantity")),
    COALESCE(rl."receivedUnit", rl."productUnit"),
    rl."receivedAt"
FROM received_lots rl
ON CONFLICT ("purchaseOrderItemId") DO NOTHING;
