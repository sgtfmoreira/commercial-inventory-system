CREATE TYPE "OrganizationSubscriptionStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELED',
  'LEGACY'
);

ALTER TABLE "establishments"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" UUID,
  ADD COLUMN "archiveReason" TEXT;

-- Every tenant must have an organization before subscriptions are introduced.
INSERT INTO "Organization" ("id", "name", "createdAt")
SELECT
  md5('legacy-organization:' || establishment."id")::uuid::text,
  'Organização ' || establishment."name",
  CURRENT_TIMESTAMP
FROM "establishments" establishment
WHERE establishment."organizationId" IS NULL;

UPDATE "establishments" establishment
SET "organizationId" = md5('legacy-organization:' || establishment."id")::uuid::text
WHERE establishment."organizationId" IS NULL;

CREATE TABLE "organization_subscriptions" (
  "id" UUID NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL DEFAULT 'COMMERCIAL_MONTHLY',
  "status" "OrganizationSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "includedEstablishments" INTEGER NOT NULL DEFAULT 1,
  "basePriceCents" INTEGER NOT NULL DEFAULT 14900,
  "additionalEstablishmentPriceCents" INTEGER NOT NULL DEFAULT 12000,
  "externalCustomerId" TEXT,
  "externalSubscriptionId" TEXT,
  "quantitySyncPending" BOOLEAN NOT NULL DEFAULT false,
  "currentPeriodStartsAt" TIMESTAMP(3),
  "currentPeriodEndsAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_subscriptions_prices_check" CHECK (
    "includedEstablishments" >= 1
    AND "basePriceCents" >= 0
    AND "additionalEstablishmentPriceCents" >= 0
  )
);

CREATE UNIQUE INDEX "organization_subscriptions_organizationId_key"
  ON "organization_subscriptions"("organizationId");
CREATE UNIQUE INDEX "organization_subscriptions_externalCustomerId_key"
  ON "organization_subscriptions"("externalCustomerId");
CREATE UNIQUE INDEX "organization_subscriptions_externalSubscriptionId_key"
  ON "organization_subscriptions"("externalSubscriptionId");
CREATE INDEX "organization_subscriptions_status_idx"
  ON "organization_subscriptions"("status");

ALTER TABLE "organization_subscriptions"
  ADD CONSTRAINT "organization_subscriptions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_webhook_events_stripeEventId_key"
  ON "billing_webhook_events"("stripeEventId");
CREATE INDEX "billing_webhook_events_processedAt_idx"
  ON "billing_webhook_events"("processedAt");

-- Existing customers continue without interruption until commercial migration.
INSERT INTO "organization_subscriptions" (
  "id",
  "organizationId",
  "status"
)
SELECT
  md5('organization-subscription:' || organization."id")::uuid,
  organization."id",
  'LEGACY'::"OrganizationSubscriptionStatus"
FROM "Organization" organization
ON CONFLICT ("organizationId") DO NOTHING;
