CREATE TYPE "ChecklistRunStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ChecklistAssignmentType" AS ENUM ('INITIAL', 'REASSIGNMENT');
CREATE TYPE "ChecklistRunEventType" AS ENUM ('RUN_CREATED', 'ASSIGNMENT_CHANGED');

CREATE TABLE "checklist_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientRequestId" UUID NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "establishmentId" UUID NOT NULL,
  "templateVersionId" UUID NOT NULL,
  "assignedMembershipId" UUID NOT NULL,
  "createdByMembershipId" UUID NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "ChecklistRunStatus" NOT NULL DEFAULT 'ASSIGNED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "checklist_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_runs_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "checklist_runs_version_check" CHECK ("version" > 0),
  CONSTRAINT "checklist_runs_due_check" CHECK ("dueAt" > "createdAt"),
  CONSTRAINT "checklist_runs_completion_check" CHECK (
    ("status" IN ('APPROVED', 'CANCELLED') AND "completedAt" IS NOT NULL)
    OR ("status" NOT IN ('APPROVED', 'CANCELLED') AND "completedAt" IS NULL)
  )
);

CREATE TABLE "checklist_run_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "runId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previousMembershipId" UUID,
  "assignedMembershipId" UUID NOT NULL,
  "changedByMembershipId" UUID NOT NULL,
  "changeType" "ChecklistAssignmentType" NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checklist_run_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_run_assignments_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "checklist_run_assignments_shape_check" CHECK (
    ("changeType" = 'INITIAL' AND "sequence" = 1 AND "previousMembershipId" IS NULL AND "reason" IS NULL)
    OR
    ("changeType" = 'REASSIGNMENT' AND "sequence" > 1 AND "previousMembershipId" IS NOT NULL
      AND "assignedMembershipId" <> "previousMembershipId" AND length(btrim("reason")) > 0)
  )
);

CREATE TABLE "checklist_run_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "runId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "eventType" "ChecklistRunEventType" NOT NULL,
  "actorMembershipId" UUID,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checklist_run_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_run_events_sequence_check" CHECK ("sequence" > 0)
);

CREATE UNIQUE INDEX "checklist_runs_organizationId_clientRequestId_key" ON "checklist_runs"("organizationId", "clientRequestId");
CREATE INDEX "checklist_runs_establishmentId_status_dueAt_idx" ON "checklist_runs"("establishmentId", "status", "dueAt");
CREATE INDEX "checklist_runs_assignedMembershipId_status_dueAt_idx" ON "checklist_runs"("assignedMembershipId", "status", "dueAt");
CREATE INDEX "checklist_runs_templateVersionId_createdAt_idx" ON "checklist_runs"("templateVersionId", "createdAt");
CREATE UNIQUE INDEX "checklist_run_assignments_runId_sequence_key" ON "checklist_run_assignments"("runId", "sequence");
CREATE INDEX "checklist_run_assignments_assignedMembershipId_createdAt_idx" ON "checklist_run_assignments"("assignedMembershipId", "createdAt");
CREATE INDEX "checklist_run_assignments_changedByMembershipId_createdAt_idx" ON "checklist_run_assignments"("changedByMembershipId", "createdAt");
CREATE UNIQUE INDEX "checklist_run_events_runId_sequence_key" ON "checklist_run_events"("runId", "sequence");
CREATE INDEX "checklist_run_events_eventType_occurredAt_idx" ON "checklist_run_events"("eventType", "occurredAt");

ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_establishmentId_fkey"
  FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_templateVersionId_fkey"
  FOREIGN KEY ("templateVersionId") REFERENCES "checklist_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_assignedMembershipId_fkey"
  FOREIGN KEY ("assignedMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_run_assignments" ADD CONSTRAINT "checklist_run_assignments_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "checklist_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_run_assignments" ADD CONSTRAINT "checklist_run_assignments_previousMembershipId_fkey"
  FOREIGN KEY ("previousMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_run_assignments" ADD CONSTRAINT "checklist_run_assignments_assignedMembershipId_fkey"
  FOREIGN KEY ("assignedMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_run_assignments" ADD CONSTRAINT "checklist_run_assignments_changedByMembershipId_fkey"
  FOREIGN KEY ("changedByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_run_events" ADD CONSTRAINT "checklist_run_events_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "checklist_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_run_events" ADD CONSTRAINT "checklist_run_events_actorMembershipId_fkey"
  FOREIGN KEY ("actorMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION checklist_run_tenant_guard() RETURNS trigger AS $$
DECLARE
  establishment_organization_id TEXT;
  template_organization_id TEXT;
  template_status "ChecklistTemplateVersionStatus";
  assigned_establishment_id UUID;
  assigned_active BOOLEAN;
  creator_establishment_id UUID;
  creator_active BOOLEAN;
BEGIN
  SELECT e."organizationId" INTO establishment_organization_id
    FROM "establishments" e
   WHERE e."id" = NEW."establishmentId" AND e."isActive" = TRUE;
  IF establishment_organization_id IS NULL OR establishment_organization_id IS DISTINCT FROM NEW."organizationId" THEN
    RAISE EXCEPTION 'checklist run establishment must belong to its organization';
  END IF;

  SELECT t."organizationId", v."status" INTO template_organization_id, template_status
    FROM "checklist_template_versions" v
    JOIN "checklist_templates" t ON t."id" = v."templateId"
   WHERE v."id" = NEW."templateVersionId";
  IF template_organization_id IS DISTINCT FROM NEW."organizationId" OR template_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'checklist run requires a published template version from its organization';
  END IF;

  SELECT ue."establishmentId", ue."isActive" INTO assigned_establishment_id, assigned_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."assignedMembershipId";
  IF assigned_establishment_id IS DISTINCT FROM NEW."establishmentId" OR assigned_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'checklist run assignee must be active in its establishment';
  END IF;

  SELECT ue."establishmentId", ue."isActive" INTO creator_establishment_id, creator_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."createdByMembershipId";
  IF creator_establishment_id IS DISTINCT FROM NEW."establishmentId" OR creator_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'checklist run creator must be active in its establishment';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."clientRequestId", NEW."requestFingerprint", NEW."organizationId", NEW."establishmentId", NEW."templateVersionId", NEW."createdByMembershipId", NEW."dueAt", NEW."createdAt")
       IS DISTINCT FROM
       ROW(OLD."clientRequestId", OLD."requestFingerprint", OLD."organizationId", OLD."establishmentId", OLD."templateVersionId", OLD."createdByMembershipId", OLD."dueAt", OLD."createdAt") THEN
      RAISE EXCEPTION 'checklist run identity is immutable';
    END IF;
    IF NEW."assignedMembershipId" IS DISTINCT FROM OLD."assignedMembershipId" THEN
      IF OLD."status" <> 'ASSIGNED' OR NEW."status" <> OLD."status" OR NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION 'invalid checklist run reassignment';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_runs_tenant_guard"
BEFORE INSERT OR UPDATE ON "checklist_runs"
FOR EACH ROW EXECUTE FUNCTION checklist_run_tenant_guard();

CREATE OR REPLACE FUNCTION checklist_run_assignment_guard() RETURNS trigger AS $$
DECLARE
  run_establishment_id UUID;
  run_assigned_membership_id UUID;
  assigned_establishment_id UUID;
  assigned_active BOOLEAN;
  changed_establishment_id UUID;
  changed_active BOOLEAN;
  previous_establishment_id UUID;
  prior_assigned_membership_id UUID;
BEGIN
  SELECT r."establishmentId", r."assignedMembershipId"
    INTO run_establishment_id, run_assigned_membership_id
    FROM "checklist_runs" r WHERE r."id" = NEW."runId";
  SELECT ue."establishmentId", ue."isActive"
    INTO assigned_establishment_id, assigned_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."assignedMembershipId";
  SELECT ue."establishmentId", ue."isActive"
    INTO changed_establishment_id, changed_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."changedByMembershipId";

  IF run_establishment_id IS NULL
     OR assigned_establishment_id IS DISTINCT FROM run_establishment_id
     OR changed_establishment_id IS DISTINCT FROM run_establishment_id
     OR assigned_active IS DISTINCT FROM TRUE OR changed_active IS DISTINCT FROM TRUE
     OR run_assigned_membership_id IS DISTINCT FROM NEW."assignedMembershipId" THEN
    RAISE EXCEPTION 'invalid checklist run assignment scope';
  END IF;

  IF NEW."changeType" = 'REASSIGNMENT' THEN
    SELECT ue."establishmentId" INTO previous_establishment_id
      FROM "UserEstablishment" ue WHERE ue."id" = NEW."previousMembershipId";
    SELECT a."assignedMembershipId" INTO prior_assigned_membership_id
      FROM "checklist_run_assignments" a
     WHERE a."runId" = NEW."runId"
     ORDER BY a."sequence" DESC LIMIT 1;
    IF previous_establishment_id IS DISTINCT FROM run_establishment_id
       OR prior_assigned_membership_id IS DISTINCT FROM NEW."previousMembershipId" THEN
      RAISE EXCEPTION 'invalid checklist reassignment history';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_run_assignments_guard"
BEFORE INSERT ON "checklist_run_assignments"
FOR EACH ROW EXECUTE FUNCTION checklist_run_assignment_guard();

CREATE OR REPLACE FUNCTION checklist_append_only_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'checklist history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_run_assignments_append_only"
BEFORE UPDATE OR DELETE ON "checklist_run_assignments"
FOR EACH ROW EXECUTE FUNCTION checklist_append_only_guard();

CREATE OR REPLACE FUNCTION checklist_run_event_guard() RETURNS trigger AS $$
DECLARE
  run_establishment_id UUID;
  actor_establishment_id UUID;
BEGIN
  SELECT r."establishmentId" INTO run_establishment_id FROM "checklist_runs" r WHERE r."id" = NEW."runId";
  IF NEW."actorMembershipId" IS NOT NULL THEN
    SELECT ue."establishmentId" INTO actor_establishment_id
      FROM "UserEstablishment" ue WHERE ue."id" = NEW."actorMembershipId";
    IF actor_establishment_id IS DISTINCT FROM run_establishment_id THEN
      RAISE EXCEPTION 'checklist event actor must belong to the run establishment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_run_events_guard"
BEFORE INSERT ON "checklist_run_events"
FOR EACH ROW EXECUTE FUNCTION checklist_run_event_guard();

CREATE TRIGGER "checklist_run_events_append_only"
BEFORE UPDATE OR DELETE ON "checklist_run_events"
FOR EACH ROW EXECUTE FUNCTION checklist_append_only_guard();
