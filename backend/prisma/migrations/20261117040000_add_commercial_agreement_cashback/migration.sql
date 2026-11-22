CREATE TYPE "CommercialAgreementBenefitType" AS ENUM ('PRODUCT_BONUS', 'CASHBACK_FIXED_PER_UNIT');
CREATE TYPE "CashbackSettlementStatus" AS ENUM ('RECEIVED', 'CANCELLED');

ALTER TABLE "commercial_agreements"
  ADD COLUMN "benefitType" "CommercialAgreementBenefitType" NOT NULL DEFAULT 'PRODUCT_BONUS',
  ADD COLUMN "cashbackPerUnit" DECIMAL(14,2);

ALTER TABLE "bonus_accruals"
  ADD COLUMN "earnedCashbackAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "commercial_agreement_cashback_settlements" (
  "id" UUID NOT NULL,
  "establishmentId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "agreementId" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "status" "CashbackSettlementStatus" NOT NULL DEFAULT 'RECEIVED',
  "createdByUserId" UUID NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_agreement_cashback_settlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commercial_agreement_cashback_settlements_agreementId_receivedAt_idx"
  ON "commercial_agreement_cashback_settlements"("agreementId", "receivedAt");

CREATE INDEX "commercial_agreement_cashback_settlements_establishmentId_status_idx"
  ON "commercial_agreement_cashback_settlements"("establishmentId", "status");

ALTER TABLE "commercial_agreement_cashback_settlements"
  ADD CONSTRAINT "commercial_agreement_cashback_settlements_establishmentId_fkey"
  FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commercial_agreement_cashback_settlements"
  ADD CONSTRAINT "commercial_agreement_cashback_settlements_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commercial_agreement_cashback_settlements"
  ADD CONSTRAINT "commercial_agreement_cashback_settlements_agreementId_fkey"
  FOREIGN KEY ("agreementId") REFERENCES "commercial_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
