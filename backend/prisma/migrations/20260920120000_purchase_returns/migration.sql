ALTER TABLE "purchase_order_items"
  ADD COLUMN "receivedStockQuantity" DECIMAL(12,3),
  ADD COLUMN "receivedUnitCost" DECIMAL(12,4),
  ADD COLUMN "receivedUnit" TEXT;

CREATE TABLE "purchase_returns" (
  "id" UUID NOT NULL,
  "establishmentId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "purchaseOrderItemId" UUID NOT NULL,
  "stockMovementId" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL CHECK ("quantity" > 0),
  "purchaseQuantity" DECIMAL(18,9) NOT NULL CHECK ("purchaseQuantity" > 0),
  "unitCost" DECIMAL(12,4) NOT NULL CHECK ("unitCost" >= 0),
  "totalCost" DECIMAL(14,4) NOT NULL CHECK ("totalCost" >= 0),
  "returnedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedByUserId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "financialTreatment" TEXT NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_returns_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_returns_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_returns_stockMovementId_key" ON "purchase_returns"("stockMovementId");
CREATE UNIQUE INDEX "purchase_returns_establishmentId_requestId_key" ON "purchase_returns"("establishmentId", "requestId");
CREATE INDEX "purchase_returns_establishmentId_returnedAt_idx" ON "purchase_returns"("establishmentId", "returnedAt");
CREATE INDEX "purchase_returns_purchaseOrderItemId_idx" ON "purchase_returns"("purchaseOrderItemId");
