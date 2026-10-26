CREATE TYPE "CommercialEventStatus" AS ENUM ('DRAFT', 'BUDGETING', 'APPROVED', 'PLANNING_PENDING', 'CANCELLED');
CREATE TYPE "CommercialEventType" AS ENUM ('CORPORATE', 'WEDDING', 'BIRTHDAY', 'GRADUATION', 'GET_TOGETHER', 'CATERING', 'INTERNAL', 'OTHER');
CREATE TYPE "EventBudgetStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "EventBudgetItemType" AS ENUM ('RECIPE', 'PRODUCT', 'MANUAL', 'STAFF', 'SERVICE', 'EQUIPMENT', 'TRANSPORT', 'FEE', 'OTHER');
CREATE TYPE "EventBudgetCostGroup" AS ENUM ('MENU', 'STAFF', 'SERVICE', 'EQUIPMENT', 'TRANSPORT', 'FEE', 'OTHER');
CREATE TYPE "EventQuantityMode" AS ENUM ('FIXED', 'PER_GUEST');

CREATE TABLE "commercial_event_customers" (
  "id" UUID NOT NULL,
  "establishmentId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "document" VARCHAR(30),
  "phone" VARCHAR(30),
  "email" VARCHAR(254),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_event_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_events" (
  "id" UUID NOT NULL,
  "establishmentId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "type" "CommercialEventType" NOT NULL,
  "eventDate" DATE NOT NULL,
  "startTime" TIME(0),
  "endTime" TIME(0),
  "guestCount" INTEGER NOT NULL CHECK ("guestCount" > 0),
  "location" TEXT,
  "responsibleUserId" UUID,
  "status" "CommercialEventStatus" NOT NULL DEFAULT 'DRAFT',
  "internalNotes" TEXT,
  "approvedBudgetId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_budgets" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "parentBudgetId" UUID,
  "status" "EventBudgetStatus" NOT NULL DEFAULT 'DRAFT',
  "validUntil" DATE,
  "customerSnapshot" JSONB,
  "eventSnapshot" JSONB,
  "guestCountSnapshot" INTEGER NOT NULL CHECK ("guestCountSnapshot" > 0),
  "costMenu" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("costMenu" >= 0),
  "costStaff" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("costStaff" >= 0),
  "costService" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("costService" >= 0),
  "costEquipment" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("costEquipment" >= 0),
  "costTransport" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("costTransport" >= 0),
  "costFees" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("costFees" >= 0),
  "costOther" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("costOther" >= 0),
  "totalCost" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("totalCost" >= 0),
  "desiredMarginPercent" DECIMAL(7,4) NOT NULL DEFAULT 30 CHECK ("desiredMarginPercent" BETWEEN 0 AND 100),
  "taxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0 CHECK ("taxPercent" BETWEEN 0 AND 100),
  "commissionPercent" DECIMAL(7,4) NOT NULL DEFAULT 0 CHECK ("commissionPercent" BETWEEN 0 AND 100),
  "cardFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 0 CHECK ("cardFeePercent" BETWEEN 0 AND 100),
  "otherFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 0 CHECK ("otherFeePercent" BETWEEN 0 AND 100),
  "recommendedPrice" DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK ("recommendedPrice" >= 0),
  "quotedPrice" DECIMAL(14,4) CHECK ("quotedPrice" >= 0),
  "expectedRevenue" DECIMAL(14,4),
  "expectedFeeAmount" DECIMAL(14,4),
  "expectedProfit" DECIMAL(14,4),
  "effectiveMarginPercent" DECIMAL(7,4),
  "menuCMVPercent" DECIMAL(7,4),
  "pricePerGuest" DECIMAL(14,4),
  "costPerGuest" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "profitPerGuest" DECIMAL(14,4),
  "calculationVersion" VARCHAR(40) NOT NULL DEFAULT 'EVENT_PRICING_V1',
  "customerProposalNotes" TEXT,
  "internalNotes" TEXT,
  "sentAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_budgets_percent_total_check" CHECK (
    "desiredMarginPercent" + "taxPercent" + "commissionPercent" + "cardFeePercent" + "otherFeePercent" < 100
  )
);

CREATE TABLE "event_budget_items" (
  "id" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "itemType" "EventBudgetItemType" NOT NULL,
  "costGroup" "EventBudgetCostGroup" NOT NULL,
  "sourceId" UUID,
  "sourceType" VARCHAR(50),
  "nameSnapshot" VARCHAR(180) NOT NULL,
  "categorySnapshot" VARCHAR(100),
  "quantityMode" "EventQuantityMode" NOT NULL,
  "fixedQuantity" DECIMAL(14,3),
  "quantityPerGuest" DECIMAL(14,4),
  "guestCountSnapshot" INTEGER NOT NULL CHECK ("guestCountSnapshot" > 0),
  "safetyPercent" DECIMAL(7,4) NOT NULL DEFAULT 0 CHECK ("safetyPercent" BETWEEN 0 AND 100),
  "plannedQuantity" DECIMAL(14,3) NOT NULL CHECK ("plannedQuantity" > 0),
  "unitSnapshot" VARCHAR(30) NOT NULL,
  "unitCostSnapshot" DECIMAL(14,4) NOT NULL CHECK ("unitCostSnapshot" >= 0),
  "totalCost" DECIMAL(14,4) NOT NULL CHECK ("totalCost" >= 0),
  "suggestedUnitPriceSnapshot" DECIMAL(14,4) CHECK ("suggestedUnitPriceSnapshot" >= 0),
  "visibleInProposal" BOOLEAN NOT NULL DEFAULT true,
  "proposalLabel" VARCHAR(180),
  "internalNotes" TEXT,
  "compositionSnapshot" JSONB,
  "sourceSnapshot" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0 CHECK ("sortOrder" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_budget_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_budget_items_quantity_mode_check" CHECK (
    ("quantityMode" = 'FIXED' AND "fixedQuantity" > 0 AND "quantityPerGuest" IS NULL)
    OR
    ("quantityMode" = 'PER_GUEST' AND "quantityPerGuest" > 0 AND "fixedQuantity" IS NULL)
  )
);

CREATE INDEX "commercial_event_customers_establishmentId_name_idx" ON "commercial_event_customers"("establishmentId", "name");
CREATE INDEX "commercial_event_customers_establishmentId_document_idx" ON "commercial_event_customers"("establishmentId", "document");
CREATE UNIQUE INDEX "commercial_events_establishmentId_code_key" ON "commercial_events"("establishmentId", "code");
CREATE UNIQUE INDEX "commercial_events_approvedBudgetId_key" ON "commercial_events"("approvedBudgetId");
CREATE INDEX "commercial_events_establishmentId_eventDate_idx" ON "commercial_events"("establishmentId", "eventDate");
CREATE INDEX "commercial_events_establishmentId_status_eventDate_idx" ON "commercial_events"("establishmentId", "status", "eventDate");
CREATE INDEX "commercial_events_customerId_idx" ON "commercial_events"("customerId");
CREATE UNIQUE INDEX "event_budgets_eventId_revision_key" ON "event_budgets"("eventId", "revision");
CREATE UNIQUE INDEX "event_budgets_one_approved_per_event" ON "event_budgets"("eventId") WHERE "status" = 'APPROVED';
CREATE INDEX "event_budgets_eventId_status_idx" ON "event_budgets"("eventId", "status");
CREATE INDEX "event_budgets_createdByUserId_idx" ON "event_budgets"("createdByUserId");
CREATE INDEX "event_budgets_approvedByUserId_idx" ON "event_budgets"("approvedByUserId");
CREATE INDEX "event_budget_items_budgetId_sortOrder_idx" ON "event_budget_items"("budgetId", "sortOrder");
CREATE INDEX "event_budget_items_sourceId_idx" ON "event_budget_items"("sourceId");

ALTER TABLE "commercial_event_customers" ADD CONSTRAINT "commercial_event_customers_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_events" ADD CONSTRAINT "commercial_events_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_events" ADD CONSTRAINT "commercial_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "commercial_event_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_events" ADD CONSTRAINT "commercial_events_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_budgets" ADD CONSTRAINT "event_budgets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "commercial_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_budgets" ADD CONSTRAINT "event_budgets_parentBudgetId_fkey" FOREIGN KEY ("parentBudgetId") REFERENCES "event_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_budgets" ADD CONSTRAINT "event_budgets_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_budgets" ADD CONSTRAINT "event_budgets_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_budget_items" ADD CONSTRAINT "event_budget_items_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "event_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_events" ADD CONSTRAINT "commercial_events_approvedBudgetId_fkey" FOREIGN KEY ("approvedBudgetId") REFERENCES "event_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
