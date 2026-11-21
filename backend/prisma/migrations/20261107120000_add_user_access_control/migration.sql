-- Phase B2: additive authorization infrastructure only.
-- No backfill is intentional: absence of user_establishment_accesses means LEGACY.
CREATE TYPE "AuthorizationMode" AS ENUM ('LEGACY', 'PROFILED');
CREATE TYPE "AccessProfileCode" AS ENUM ('OWNER', 'ADMINISTRATOR', 'MANAGER', 'SUPERVISOR', 'COLLABORATOR', 'AUDITOR');
CREATE TYPE "AccessConfigurationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');
CREATE TYPE "OrganizationAuthorityType" AS ENUM ('OWNER');

CREATE TABLE "user_establishment_accesses" (
    "id" UUID NOT NULL,
    "userEstablishmentId" UUID NOT NULL,
    "mode" "AuthorizationMode" NOT NULL DEFAULT 'LEGACY',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_establishment_accesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_configurations" (
    "id" UUID NOT NULL,
    "accessId" UUID NOT NULL,
    "profileCode" "AccessProfileCode" NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "status" "AccessConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "basedOnLegacyRole" TEXT NOT NULL,
    "previousConfigurationId" UUID,
    "createdByMembershipId" UUID NOT NULL,
    "activatedByMembershipId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    CONSTRAINT "access_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permission_overrides" (
    "id" UUID NOT NULL,
    "configurationId" UUID NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_authorities" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" "OrganizationAuthorityType" NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "verifiedByUserId" UUID,
    "verificationMethod" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" UUID,
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_authorities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_audit_events" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "establishmentId" UUID,
    "actorUserId" UUID NOT NULL,
    "actorMembershipId" UUID,
    "targetUserId" UUID,
    "targetMembershipId" UUID,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_establishment_accesses_userEstablishmentId_key" ON "user_establishment_accesses"("userEstablishmentId");
CREATE INDEX "user_establishment_accesses_mode_idx" ON "user_establishment_accesses"("mode");
CREATE INDEX "access_configurations_accessId_status_idx" ON "access_configurations"("accessId", "status");
CREATE INDEX "access_configurations_createdByMembershipId_createdAt_idx" ON "access_configurations"("createdByMembershipId", "createdAt");
CREATE UNIQUE INDEX "access_configurations_one_draft_per_access" ON "access_configurations"("accessId") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "access_configurations_one_active_per_access" ON "access_configurations"("accessId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "permission_overrides_configurationId_permissionCode_key" ON "permission_overrides"("configurationId", "permissionCode");
CREATE INDEX "permission_overrides_permissionCode_effect_idx" ON "permission_overrides"("permissionCode", "effect");
CREATE UNIQUE INDEX "organization_authorities_organizationId_userId_type_key" ON "organization_authorities"("organizationId", "userId", "type");
CREATE INDEX "organization_authorities_organizationId_type_isActive_idx" ON "organization_authorities"("organizationId", "type", "isActive");
CREATE INDEX "security_audit_events_organizationId_occurredAt_idx" ON "security_audit_events"("organizationId", "occurredAt");
CREATE INDEX "security_audit_events_establishmentId_occurredAt_idx" ON "security_audit_events"("establishmentId", "occurredAt");
CREATE INDEX "security_audit_events_targetMembershipId_occurredAt_idx" ON "security_audit_events"("targetMembershipId", "occurredAt");
CREATE INDEX "security_audit_events_entityType_entityId_occurredAt_idx" ON "security_audit_events"("entityType", "entityId", "occurredAt");

ALTER TABLE "user_establishment_accesses" ADD CONSTRAINT "user_establishment_accesses_userEstablishmentId_fkey" FOREIGN KEY ("userEstablishmentId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_configurations" ADD CONSTRAINT "access_configurations_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "user_establishment_accesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_configurations" ADD CONSTRAINT "access_configurations_previousConfigurationId_fkey" FOREIGN KEY ("previousConfigurationId") REFERENCES "access_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_configurations" ADD CONSTRAINT "access_configurations_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_configurations" ADD CONSTRAINT "access_configurations_activatedByMembershipId_fkey" FOREIGN KEY ("activatedByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "access_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_authorities" ADD CONSTRAINT "organization_authorities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_authorities" ADD CONSTRAINT "organization_authorities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_authorities" ADD CONSTRAINT "organization_authorities_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_authorities" ADD CONSTRAINT "organization_authorities_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_targetMembershipId_fkey" FOREIGN KEY ("targetMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Security audit history is append-only at the database boundary.
CREATE OR REPLACE FUNCTION deny_security_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "security_audit_events_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "security_audit_events"
FOR EACH ROW EXECUTE FUNCTION deny_security_audit_event_mutation();
