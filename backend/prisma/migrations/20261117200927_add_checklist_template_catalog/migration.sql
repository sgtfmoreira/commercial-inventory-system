-- B2.21.1: additive checklist template catalog only.
-- No backfill or mutation of existing business data is intentional.
-- CreateEnum
CREATE TYPE "ChecklistTemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChecklistTemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ChecklistResponseType" AS ENUM ('BOOLEAN', 'CHOICE', 'NUMBER', 'TEXT');

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(80),
    "description" VARCHAR(500),
    "status" "ChecklistTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_versions" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ChecklistTemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "passingScore" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "scoringAlgorithmVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceVersionId" UUID,
    "createdByMembershipId" UUID NOT NULL,
    "publishedByMembershipId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "checklist_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_sections" (
    "id" UUID NOT NULL,
    "templateVersionId" UUID NOT NULL,
    "stableKey" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_template_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_items" (
    "id" UUID NOT NULL,
    "templateVersionId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "stableKey" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "instructions" TEXT,
    "position" INTEGER NOT NULL,
    "responseType" "ChecklistResponseType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "allowNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "maxPoints" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "answerConfigJson" JSONB,
    "scoringConfigJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_templates_organizationId_status_name_idx" ON "checklist_templates"("organizationId", "status", "name");

-- CreateIndex
CREATE INDEX "checklist_templates_createdByMembershipId_createdAt_idx" ON "checklist_templates"("createdByMembershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_organizationId_code_key" ON "checklist_templates"("organizationId", "code");

-- CreateIndex
CREATE INDEX "checklist_template_versions_templateId_status_createdAt_idx" ON "checklist_template_versions"("templateId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "checklist_template_versions_createdByMembershipId_createdAt_idx" ON "checklist_template_versions"("createdByMembershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_versions_templateId_version_key" ON "checklist_template_versions"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_sections_templateVersionId_stableKey_key" ON "checklist_template_sections"("templateVersionId", "stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_sections_templateVersionId_position_key" ON "checklist_template_sections"("templateVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_sections_id_templateVersionId_key" ON "checklist_template_sections"("id", "templateVersionId");

-- CreateIndex
CREATE INDEX "checklist_template_items_templateVersionId_position_idx" ON "checklist_template_items"("templateVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_items_templateVersionId_stableKey_key" ON "checklist_template_items"("templateVersionId", "stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_items_sectionId_position_key" ON "checklist_template_items"("sectionId", "position");

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_versions" ADD CONSTRAINT "checklist_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_versions" ADD CONSTRAINT "checklist_template_versions_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "checklist_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_versions" ADD CONSTRAINT "checklist_template_versions_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_versions" ADD CONSTRAINT "checklist_template_versions_publishedByMembershipId_fkey" FOREIGN KEY ("publishedByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_sections" ADD CONSTRAINT "checklist_template_sections_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "checklist_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_sectionId_templateVersionId_fkey" FOREIGN KEY ("sectionId", "templateVersionId") REFERENCES "checklist_template_sections"("id", "templateVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints not representable by Prisma alone.
ALTER TABLE "checklist_templates"
  ADD CONSTRAINT "checklist_templates_code_format_check"
    CHECK ("code" ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  ADD CONSTRAINT "checklist_templates_name_not_blank_check"
    CHECK (length(btrim("name")) > 0);

ALTER TABLE "checklist_template_versions"
  ADD CONSTRAINT "checklist_template_versions_version_check"
    CHECK ("version" > 0),
  ADD CONSTRAINT "checklist_template_versions_passing_score_check"
    CHECK ("passingScore" >= 0 AND "passingScore" <= 100),
  ADD CONSTRAINT "checklist_template_versions_algorithm_check"
    CHECK ("scoringAlgorithmVersion" > 0),
  ADD CONSTRAINT "checklist_template_versions_source_check"
    CHECK ("sourceVersionId" IS NULL OR "sourceVersionId" <> "id"),
  ADD CONSTRAINT "checklist_template_versions_state_check"
    CHECK (
      ("status" = 'DRAFT' AND "publishedByMembershipId" IS NULL AND "publishedAt" IS NULL AND "retiredAt" IS NULL)
      OR ("status" = 'PUBLISHED' AND "publishedByMembershipId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "retiredAt" IS NULL)
      OR ("status" = 'RETIRED' AND "publishedByMembershipId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "retiredAt" IS NOT NULL)
    );

ALTER TABLE "checklist_template_sections"
  ADD CONSTRAINT "checklist_template_sections_stable_key_check"
    CHECK ("stableKey" ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  ADD CONSTRAINT "checklist_template_sections_title_not_blank_check"
    CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "checklist_template_sections_position_check"
    CHECK ("position" > 0);

ALTER TABLE "checklist_template_items"
  ADD CONSTRAINT "checklist_template_items_stable_key_check"
    CHECK ("stableKey" ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  ADD CONSTRAINT "checklist_template_items_title_not_blank_check"
    CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "checklist_template_items_position_check"
    CHECK ("position" > 0),
  ADD CONSTRAINT "checklist_template_items_max_points_check"
    CHECK ("maxPoints" > 0);

CREATE UNIQUE INDEX "checklist_template_versions_one_draft_per_template"
ON "checklist_template_versions"("templateId")
WHERE "status" = 'DRAFT';

-- A membership recorded as an author/publisher must belong to the template organization.
CREATE OR REPLACE FUNCTION checklist_template_tenant_guard() RETURNS trigger AS $$
DECLARE
  membership_organization_id TEXT;
BEGIN
  SELECT e."organizationId"
    INTO membership_organization_id
    FROM "UserEstablishment" ue
    JOIN "establishments" e ON e."id" = ue."establishmentId"
   WHERE ue."id" = NEW."createdByMembershipId";

  IF membership_organization_id IS NULL OR membership_organization_id IS DISTINCT FROM NEW."organizationId" THEN
    RAISE EXCEPTION 'checklist template author must belong to the template organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_templates_tenant_guard"
BEFORE INSERT OR UPDATE ON "checklist_templates"
FOR EACH ROW EXECUTE FUNCTION checklist_template_tenant_guard();

CREATE OR REPLACE FUNCTION checklist_template_version_tenant_guard() RETURNS trigger AS $$
DECLARE
  template_organization_id TEXT;
  creator_organization_id TEXT;
  publisher_organization_id TEXT;
  source_template_id UUID;
BEGIN
  SELECT t."organizationId"
    INTO template_organization_id
    FROM "checklist_templates" t
   WHERE t."id" = NEW."templateId";

  SELECT e."organizationId"
    INTO creator_organization_id
    FROM "UserEstablishment" ue
    JOIN "establishments" e ON e."id" = ue."establishmentId"
   WHERE ue."id" = NEW."createdByMembershipId";

  IF template_organization_id IS NULL OR creator_organization_id IS DISTINCT FROM template_organization_id THEN
    RAISE EXCEPTION 'checklist version author must belong to the template organization';
  END IF;

  IF NEW."publishedByMembershipId" IS NOT NULL THEN
    SELECT e."organizationId"
      INTO publisher_organization_id
      FROM "UserEstablishment" ue
      JOIN "establishments" e ON e."id" = ue."establishmentId"
     WHERE ue."id" = NEW."publishedByMembershipId";
    IF publisher_organization_id IS DISTINCT FROM template_organization_id THEN
      RAISE EXCEPTION 'checklist version publisher must belong to the template organization';
    END IF;
  END IF;

  IF NEW."sourceVersionId" IS NOT NULL THEN
    SELECT v."templateId" INTO source_template_id
      FROM "checklist_template_versions" v
     WHERE v."id" = NEW."sourceVersionId";
    IF source_template_id IS NULL OR source_template_id IS DISTINCT FROM NEW."templateId" THEN
      RAISE EXCEPTION 'source checklist version must belong to the same template';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_template_versions_tenant_guard"
BEFORE INSERT OR UPDATE ON "checklist_template_versions"
FOR EACH ROW EXECUTE FUNCTION checklist_template_version_tenant_guard();

-- Published content is immutable. The only allowed post-publication change is retirement.
CREATE OR REPLACE FUNCTION checklist_template_version_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'published checklist versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'DRAFT' THEN
    IF NEW."status" NOT IN ('DRAFT', 'PUBLISHED') THEN
      RAISE EXCEPTION 'invalid checklist version transition';
    END IF;
    IF NEW."status" = 'PUBLISHED' THEN
      IF NOT EXISTS (
        SELECT 1 FROM "checklist_template_sections" s
         WHERE s."templateVersionId" = NEW."id"
      ) OR EXISTS (
        SELECT 1 FROM "checklist_template_sections" s
         WHERE s."templateVersionId" = NEW."id"
           AND NOT EXISTS (
             SELECT 1 FROM "checklist_template_items" i
              WHERE i."sectionId" = s."id"
                AND i."templateVersionId" = s."templateVersionId"
           )
      ) THEN
        RAISE EXCEPTION 'published checklist version requires sections with items';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PUBLISHED' THEN
    IF NEW."status" <> 'RETIRED'
       OR ROW(NEW."templateId", NEW."version", NEW."approvalRequired", NEW."passingScore", NEW."scoringAlgorithmVersion", NEW."sourceVersionId", NEW."createdByMembershipId", NEW."publishedByMembershipId", NEW."publishedAt", NEW."createdAt")
          IS DISTINCT FROM
          ROW(OLD."templateId", OLD."version", OLD."approvalRequired", OLD."passingScore", OLD."scoringAlgorithmVersion", OLD."sourceVersionId", OLD."createdByMembershipId", OLD."publishedByMembershipId", OLD."publishedAt", OLD."createdAt") THEN
      RAISE EXCEPTION 'published checklist version is immutable';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'retired checklist version is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_template_versions_guard"
BEFORE UPDATE OR DELETE ON "checklist_template_versions"
FOR EACH ROW EXECUTE FUNCTION checklist_template_version_guard();

CREATE OR REPLACE FUNCTION checklist_template_content_guard() RETURNS trigger AS $$
DECLARE
  version_id UUID;
  version_status "ChecklistTemplateVersionStatus";
BEGIN
  version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."templateVersionId" ELSE NEW."templateVersionId" END;
  IF TG_OP = 'UPDATE' AND OLD."templateVersionId" IS DISTINCT FROM NEW."templateVersionId" THEN
    RAISE EXCEPTION 'checklist content cannot move between versions';
  END IF;
  SELECT v."status" INTO version_status
    FROM "checklist_template_versions" v
   WHERE v."id" = version_id;
  IF version_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'published checklist content is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_template_sections_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "checklist_template_sections"
FOR EACH ROW EXECUTE FUNCTION checklist_template_content_guard();

CREATE TRIGGER "checklist_template_items_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "checklist_template_items"
FOR EACH ROW EXECUTE FUNCTION checklist_template_content_guard();
