CREATE TYPE "ChecklistScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

CREATE TABLE "checklist_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "establishmentId" UUID NOT NULL,
  "templateVersionId" UUID NOT NULL,
  "assignedMembershipId" UUID NOT NULL,
  "createdByMembershipId" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "localTime" VARCHAR(5) NOT NULL,
  "timeZone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  "dueAfterMinutes" INTEGER NOT NULL DEFAULT 1440,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "status" "ChecklistScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastAttemptAt" TIMESTAMP(3),
  "lastGeneratedAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checklist_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_schedules_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "checklist_schedules_local_time_check" CHECK ("localTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "checklist_schedules_due_after_check" CHECK ("dueAfterMinutes" BETWEEN 15 AND 10080),
  CONSTRAINT "checklist_schedules_dates_check" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"),
  CONSTRAINT "checklist_schedules_version_check" CHECK ("version" > 0)
);

ALTER TABLE "checklist_runs"
  ADD COLUMN "scheduleId" UUID,
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD CONSTRAINT "checklist_runs_schedule_shape_check" CHECK (
    ("scheduleId" IS NULL AND "scheduledFor" IS NULL)
    OR ("scheduleId" IS NOT NULL AND "scheduledFor" IS NOT NULL)
  );

CREATE INDEX "checklist_schedules_status_nextRunAt_idx" ON "checklist_schedules"("status", "nextRunAt");
CREATE INDEX "checklist_schedules_establishmentId_status_nextRunAt_idx" ON "checklist_schedules"("establishmentId", "status", "nextRunAt");
CREATE INDEX "checklist_schedules_assignedMembershipId_status_idx" ON "checklist_schedules"("assignedMembershipId", "status");
CREATE INDEX "checklist_schedules_templateVersionId_status_idx" ON "checklist_schedules"("templateVersionId", "status");
CREATE UNIQUE INDEX "checklist_runs_scheduleId_scheduledFor_key" ON "checklist_runs"("scheduleId", "scheduledFor");

ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_establishmentId_fkey"
  FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_templateVersionId_fkey"
  FOREIGN KEY ("templateVersionId") REFERENCES "checklist_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_assignedMembershipId_fkey"
  FOREIGN KEY ("assignedMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "checklist_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION checklist_schedule_guard() RETURNS trigger AS $$
DECLARE
  establishment_organization_id TEXT;
  template_organization_id TEXT;
  assigned_establishment_id UUID;
  creator_establishment_id UUID;
BEGIN
  SELECT e."organizationId" INTO establishment_organization_id
    FROM "establishments" e WHERE e."id" = NEW."establishmentId";
  SELECT t."organizationId" INTO template_organization_id
    FROM "checklist_template_versions" v
    JOIN "checklist_templates" t ON t."id" = v."templateId"
   WHERE v."id" = NEW."templateVersionId";
  SELECT ue."establishmentId" INTO assigned_establishment_id
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."assignedMembershipId";
  SELECT ue."establishmentId" INTO creator_establishment_id
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."createdByMembershipId";
  IF establishment_organization_id IS NULL
     OR NEW."organizationId" IS DISTINCT FROM establishment_organization_id
     OR NEW."organizationId" IS DISTINCT FROM template_organization_id
     OR NEW."establishmentId" IS DISTINCT FROM assigned_establishment_id
     OR NEW."establishmentId" IS DISTINCT FROM creator_establishment_id THEN
    RAISE EXCEPTION 'checklist schedule tenant or membership mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_schedules_guard"
BEFORE INSERT OR UPDATE OF "organizationId", "establishmentId", "templateVersionId", "assignedMembershipId", "createdByMembershipId"
ON "checklist_schedules"
FOR EACH ROW EXECUTE FUNCTION checklist_schedule_guard();

CREATE OR REPLACE FUNCTION checklist_scheduled_run_guard() RETURNS trigger AS $$
DECLARE
  schedule_row "checklist_schedules"%ROWTYPE;
BEGIN
  IF NEW."scheduleId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO schedule_row FROM "checklist_schedules" WHERE "id" = NEW."scheduleId";
  IF schedule_row."id" IS NULL
     OR NEW."organizationId" IS DISTINCT FROM schedule_row."organizationId"
     OR NEW."establishmentId" IS DISTINCT FROM schedule_row."establishmentId"
     OR NEW."templateVersionId" IS DISTINCT FROM schedule_row."templateVersionId"
     OR NEW."assignedMembershipId" IS DISTINCT FROM schedule_row."assignedMembershipId"
     OR NEW."createdByMembershipId" IS DISTINCT FROM schedule_row."createdByMembershipId" THEN
    RAISE EXCEPTION 'scheduled checklist run does not match its schedule';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_scheduled_runs_guard"
BEFORE INSERT OR UPDATE OF "scheduleId", "scheduledFor", "organizationId", "establishmentId", "templateVersionId", "assignedMembershipId", "createdByMembershipId"
ON "checklist_runs"
FOR EACH ROW EXECUTE FUNCTION checklist_scheduled_run_guard();
