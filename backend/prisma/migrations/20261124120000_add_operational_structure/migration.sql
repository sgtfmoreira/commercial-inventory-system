-- O1: additive operational sectors and roles.
-- No backfill, seed, or mutation of existing business data.

CREATE TABLE "operational_sectors" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByMembershipId" UUID NOT NULL,
    "updatedByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "operational_sectors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_sectors_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "operational_sectors_normalized_name_check" CHECK (char_length(btrim("normalizedName")) BETWEEN 1 AND 120),
    CONSTRAINT "operational_sectors_description_check" CHECK ("description" IS NULL OR char_length(btrim("description")) BETWEEN 1 AND 500),
    CONSTRAINT "operational_sectors_version_check" CHECK ("version" > 0),
    CONSTRAINT "operational_sectors_deactivation_check" CHECK (
        ("isActive" = true AND "deactivatedAt" IS NULL)
        OR ("isActive" = false AND "deactivatedAt" IS NOT NULL)
    )
);

CREATE TABLE "operational_roles" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "establishmentId" UUID NOT NULL,
    "sectorId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByMembershipId" UUID NOT NULL,
    "updatedByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "operational_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_roles_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "operational_roles_normalized_name_check" CHECK (char_length(btrim("normalizedName")) BETWEEN 1 AND 120),
    CONSTRAINT "operational_roles_description_check" CHECK ("description" IS NULL OR char_length(btrim("description")) BETWEEN 1 AND 1000),
    CONSTRAINT "operational_roles_version_check" CHECK ("version" > 0),
    CONSTRAINT "operational_roles_deactivation_check" CHECK (
        ("isActive" = true AND "deactivatedAt" IS NULL)
        OR ("isActive" = false AND "deactivatedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "operational_sectors_establishmentId_normalizedName_key"
    ON "operational_sectors"("establishmentId", "normalizedName");
CREATE UNIQUE INDEX "operational_sectors_id_establishmentId_key"
    ON "operational_sectors"("id", "establishmentId");
CREATE INDEX "operational_sectors_organizationId_establishmentId_isActive_idx"
    ON "operational_sectors"("organizationId", "establishmentId", "isActive");
CREATE INDEX "operational_sectors_establishmentId_name_idx"
    ON "operational_sectors"("establishmentId", "name");

CREATE UNIQUE INDEX "operational_roles_establishmentId_normalizedName_key"
    ON "operational_roles"("establishmentId", "normalizedName");
CREATE INDEX "operational_roles_organizationId_establishmentId_isActive_idx"
    ON "operational_roles"("organizationId", "establishmentId", "isActive");
CREATE INDEX "operational_roles_sectorId_isActive_name_idx"
    ON "operational_roles"("sectorId", "isActive", "name");

ALTER TABLE "operational_sectors" ADD CONSTRAINT "operational_sectors_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_sectors" ADD CONSTRAINT "operational_sectors_establishmentId_fkey"
    FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_sectors" ADD CONSTRAINT "operational_sectors_createdByMembershipId_fkey"
    FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_sectors" ADD CONSTRAINT "operational_sectors_updatedByMembershipId_fkey"
    FOREIGN KEY ("updatedByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_roles" ADD CONSTRAINT "operational_roles_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_roles" ADD CONSTRAINT "operational_roles_establishmentId_fkey"
    FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_roles" ADD CONSTRAINT "operational_roles_sectorId_establishmentId_fkey"
    FOREIGN KEY ("sectorId", "establishmentId") REFERENCES "operational_sectors"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_roles" ADD CONSTRAINT "operational_roles_createdByMembershipId_fkey"
    FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_roles" ADD CONSTRAINT "operational_roles_updatedByMembershipId_fkey"
    FOREIGN KEY ("updatedByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION operational_sector_guard() RETURNS trigger AS $$
DECLARE
    establishment_organization_id TEXT;
    actor_establishment_id UUID;
    actor_is_active BOOLEAN;
BEGIN
    SELECT e."organizationId" INTO establishment_organization_id
    FROM "establishments" e WHERE e."id" = NEW."establishmentId" AND e."isActive" = true;

    IF establishment_organization_id IS NULL OR establishment_organization_id <> NEW."organizationId" THEN
        RAISE EXCEPTION 'operational sector tenant mismatch';
    END IF;

    SELECT ue."establishmentId", ue."isActive" INTO actor_establishment_id, actor_is_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."updatedByMembershipId";
    IF actor_establishment_id IS DISTINCT FROM NEW."establishmentId" OR actor_is_active IS NOT true THEN
        RAISE EXCEPTION 'operational sector updater must be active in its establishment';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT ue."establishmentId", ue."isActive" INTO actor_establishment_id, actor_is_active
        FROM "UserEstablishment" ue WHERE ue."id" = NEW."createdByMembershipId";
        IF actor_establishment_id IS DISTINCT FROM NEW."establishmentId" OR actor_is_active IS NOT true THEN
            RAISE EXCEPTION 'operational sector creator must be active in its establishment';
        END IF;
    ELSE
        IF NEW."organizationId" <> OLD."organizationId"
           OR NEW."establishmentId" <> OLD."establishmentId"
           OR NEW."createdByMembershipId" <> OLD."createdByMembershipId"
           OR NEW."createdAt" <> OLD."createdAt" THEN
            RAISE EXCEPTION 'operational sector identity is immutable';
        END IF;
        IF OLD."isActive" = true AND NEW."isActive" = false AND EXISTS (
            SELECT 1 FROM "operational_roles" r WHERE r."sectorId" = OLD."id" AND r."isActive" = true
        ) THEN
            RAISE EXCEPTION 'operational sector has active roles';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "operational_sectors_guard"
BEFORE INSERT OR UPDATE ON "operational_sectors"
FOR EACH ROW EXECUTE FUNCTION operational_sector_guard();

CREATE OR REPLACE FUNCTION operational_role_guard() RETURNS trigger AS $$
DECLARE
    establishment_organization_id TEXT;
    sector_organization_id TEXT;
    sector_is_active BOOLEAN;
    actor_establishment_id UUID;
    actor_is_active BOOLEAN;
BEGIN
    SELECT e."organizationId" INTO establishment_organization_id
    FROM "establishments" e WHERE e."id" = NEW."establishmentId" AND e."isActive" = true;
    IF establishment_organization_id IS NULL OR establishment_organization_id <> NEW."organizationId" THEN
        RAISE EXCEPTION 'operational role tenant mismatch';
    END IF;

    SELECT s."organizationId", s."isActive" INTO sector_organization_id, sector_is_active
    FROM "operational_sectors" s
    WHERE s."id" = NEW."sectorId" AND s."establishmentId" = NEW."establishmentId";
    IF sector_organization_id IS NULL OR sector_organization_id <> NEW."organizationId" THEN
        RAISE EXCEPTION 'operational role sector mismatch';
    END IF;
    IF NEW."isActive" = true AND sector_is_active IS NOT true THEN
        RAISE EXCEPTION 'active operational role requires an active sector';
    END IF;

    SELECT ue."establishmentId", ue."isActive" INTO actor_establishment_id, actor_is_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."updatedByMembershipId";
    IF actor_establishment_id IS DISTINCT FROM NEW."establishmentId" OR actor_is_active IS NOT true THEN
        RAISE EXCEPTION 'operational role updater must be active in its establishment';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT ue."establishmentId", ue."isActive" INTO actor_establishment_id, actor_is_active
        FROM "UserEstablishment" ue WHERE ue."id" = NEW."createdByMembershipId";
        IF actor_establishment_id IS DISTINCT FROM NEW."establishmentId" OR actor_is_active IS NOT true THEN
            RAISE EXCEPTION 'operational role creator must be active in its establishment';
        END IF;
    ELSE
        IF NEW."organizationId" <> OLD."organizationId"
           OR NEW."establishmentId" <> OLD."establishmentId"
           OR NEW."createdByMembershipId" <> OLD."createdByMembershipId"
           OR NEW."createdAt" <> OLD."createdAt" THEN
            RAISE EXCEPTION 'operational role identity is immutable';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "operational_roles_guard"
BEFORE INSERT OR UPDATE ON "operational_roles"
FOR EACH ROW EXECUTE FUNCTION operational_role_guard();
