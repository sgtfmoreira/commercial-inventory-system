-- O2: additive employee-to-operational-role assignments.
-- This structure does not alter authentication, access profiles or legacy roles.

CREATE TYPE "MembershipOperationalRoleStatus" AS ENUM ('ACTIVE', 'ENDED');

CREATE TABLE "membership_operational_roles" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "establishmentId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "operationalRoleId" UUID NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "MembershipOperationalRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" VARCHAR(500),
    "createdByMembershipId" UUID NOT NULL,
    "endedByMembershipId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "membership_operational_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "membership_operational_roles_version_check" CHECK ("version" > 0),
    CONSTRAINT "membership_operational_roles_validity_check" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom"),
    CONSTRAINT "membership_operational_roles_reason_check" CHECK ("reason" IS NULL OR char_length(btrim("reason")) BETWEEN 3 AND 500),
    CONSTRAINT "membership_operational_roles_status_check" CHECK (
        ("status" = 'ACTIVE' AND "validUntil" IS NULL AND "endedAt" IS NULL AND "endedByMembershipId" IS NULL)
        OR
        ("status" = 'ENDED' AND "validUntil" IS NOT NULL AND "endedAt" = "validUntil" AND "endedByMembershipId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "membership_operational_roles_active_role_key"
    ON "membership_operational_roles"("membershipId", "operationalRoleId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "membership_operational_roles_active_primary_key"
    ON "membership_operational_roles"("membershipId") WHERE "status" = 'ACTIVE' AND "isPrimary" = true;
CREATE INDEX "membership_operational_roles_scope_status_idx"
    ON "membership_operational_roles"("organizationId", "establishmentId", "status");
CREATE INDEX "membership_operational_roles_membership_status_idx"
    ON "membership_operational_roles"("membershipId", "status");
CREATE INDEX "membership_operational_roles_role_status_idx"
    ON "membership_operational_roles"("operationalRoleId", "status");

ALTER TABLE "membership_operational_roles" ADD CONSTRAINT "membership_operational_roles_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_operational_roles" ADD CONSTRAINT "membership_operational_roles_establishmentId_fkey"
    FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_operational_roles" ADD CONSTRAINT "membership_operational_roles_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_operational_roles" ADD CONSTRAINT "membership_operational_roles_operationalRoleId_fkey"
    FOREIGN KEY ("operationalRoleId") REFERENCES "operational_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_operational_roles" ADD CONSTRAINT "membership_operational_roles_createdByMembershipId_fkey"
    FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_operational_roles" ADD CONSTRAINT "membership_operational_roles_endedByMembershipId_fkey"
    FOREIGN KEY ("endedByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION membership_operational_role_guard() RETURNS trigger AS $$
DECLARE
    establishment_organization_id TEXT;
    target_establishment_id UUID;
    target_active BOOLEAN;
    role_organization_id TEXT;
    role_establishment_id UUID;
    role_active BOOLEAN;
    sector_active BOOLEAN;
    actor_establishment_id UUID;
    actor_active BOOLEAN;
BEGIN
    SELECT e."organizationId" INTO establishment_organization_id
    FROM "establishments" e WHERE e."id" = NEW."establishmentId" AND e."isActive" = true;
    IF establishment_organization_id IS NULL OR establishment_organization_id <> NEW."organizationId" THEN
        RAISE EXCEPTION 'operational assignment tenant mismatch';
    END IF;

    SELECT ue."establishmentId", ue."isActive" INTO target_establishment_id, target_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."membershipId";
    IF target_establishment_id IS DISTINCT FROM NEW."establishmentId" OR target_active IS NOT true THEN
        RAISE EXCEPTION 'operational assignment requires active membership in its establishment';
    END IF;

    SELECT r."organizationId", r."establishmentId", r."isActive", s."isActive"
    INTO role_organization_id, role_establishment_id, role_active, sector_active
    FROM "operational_roles" r
    JOIN "operational_sectors" s ON s."id" = r."sectorId"
    WHERE r."id" = NEW."operationalRoleId";
    IF role_organization_id IS DISTINCT FROM NEW."organizationId"
       OR role_establishment_id IS DISTINCT FROM NEW."establishmentId"
       OR (TG_OP = 'INSERT' AND (role_active IS NOT true OR sector_active IS NOT true)) THEN
        RAISE EXCEPTION 'operational assignment role must be active in its establishment';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT ue."establishmentId", ue."isActive" INTO actor_establishment_id, actor_active
        FROM "UserEstablishment" ue WHERE ue."id" = NEW."createdByMembershipId";
        IF actor_establishment_id IS DISTINCT FROM NEW."establishmentId" OR actor_active IS NOT true THEN
            RAISE EXCEPTION 'operational assignment creator must be active in its establishment';
        END IF;
        IF NEW."status" <> 'ACTIVE' OR NEW."endedAt" IS NOT NULL OR NEW."endedByMembershipId" IS NOT NULL THEN
            RAISE EXCEPTION 'operational assignment must start active';
        END IF;
    ELSE
        IF OLD."status" = 'ENDED' THEN
            RAISE EXCEPTION 'ended operational assignment is immutable';
        END IF;
        IF NEW."organizationId" <> OLD."organizationId"
           OR NEW."establishmentId" <> OLD."establishmentId"
           OR NEW."membershipId" <> OLD."membershipId"
           OR NEW."operationalRoleId" <> OLD."operationalRoleId"
           OR NEW."validFrom" <> OLD."validFrom"
           OR NEW."isPrimary" <> OLD."isPrimary"
           OR NEW."createdByMembershipId" <> OLD."createdByMembershipId"
           OR NEW."createdAt" <> OLD."createdAt" THEN
            RAISE EXCEPTION 'operational assignment identity is immutable';
        END IF;
        IF NEW."status" <> 'ENDED' OR NEW."version" <> OLD."version" + 1 THEN
            RAISE EXCEPTION 'operational assignment can only be ended with optimistic locking';
        END IF;
        SELECT ue."establishmentId", ue."isActive" INTO actor_establishment_id, actor_active
        FROM "UserEstablishment" ue WHERE ue."id" = NEW."endedByMembershipId";
        IF actor_establishment_id IS DISTINCT FROM NEW."establishmentId" OR actor_active IS NOT true THEN
            RAISE EXCEPTION 'operational assignment end actor must be active in its establishment';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "membership_operational_roles_guard"
BEFORE INSERT OR UPDATE ON "membership_operational_roles"
FOR EACH ROW EXECUTE FUNCTION membership_operational_role_guard();

CREATE OR REPLACE FUNCTION membership_operational_role_delete_guard() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'operational assignments are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "membership_operational_roles_delete_guard"
BEFORE DELETE ON "membership_operational_roles"
FOR EACH ROW EXECUTE FUNCTION membership_operational_role_delete_guard();

CREATE OR REPLACE FUNCTION operational_role_active_assignment_guard() RETURNS trigger AS $$
BEGIN
    IF OLD."isActive" = true AND NEW."isActive" = false AND EXISTS (
        SELECT 1 FROM "membership_operational_roles" a
        WHERE a."operationalRoleId" = OLD."id" AND a."status" = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'operational role has active employee assignments';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "operational_roles_active_assignment_guard"
BEFORE UPDATE ON "operational_roles"
FOR EACH ROW EXECUTE FUNCTION operational_role_active_assignment_guard();
