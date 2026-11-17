CREATE TABLE "commercial_agreement_cashback_allocations" (
  "id" UUID NOT NULL,
  "settlementId" UUID NOT NULL,
  "accrualId" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_agreement_cashback_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_agreement_cashback_allocations_settlementId_accrualId_key"
  ON "commercial_agreement_cashback_allocations"("settlementId", "accrualId");

CREATE INDEX "commercial_agreement_cashback_allocations_accrualId_idx"
  ON "commercial_agreement_cashback_allocations"("accrualId");

ALTER TABLE "commercial_agreement_cashback_allocations"
  ADD CONSTRAINT "commercial_agreement_cashback_allocations_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "commercial_agreement_cashback_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commercial_agreement_cashback_allocations"
  ADD CONSTRAINT "commercial_agreement_cashback_allocations_accrualId_fkey"
  FOREIGN KEY ("accrualId") REFERENCES "bonus_accruals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
