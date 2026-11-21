ALTER TYPE "ChecklistRunEventType" ADD VALUE IF NOT EXISTS 'ATTEMPT_STARTED';
ALTER TYPE "ChecklistRunEventType" ADD VALUE IF NOT EXISTS 'RESPONSE_SAVED';
ALTER TYPE "ChecklistRunEventType" ADD VALUE IF NOT EXISTS 'EVIDENCE_ADDED';
ALTER TYPE "ChecklistRunEventType" ADD VALUE IF NOT EXISTS 'ATTEMPT_SUBMITTED';

CREATE TYPE "ChecklistAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "ChecklistResponseOutcome" AS ENUM ('PASS', 'FAIL', 'NOT_APPLICABLE', 'UNASSESSED');
CREATE TYPE "ChecklistEvidenceStatus" AS ENUM ('PENDING', 'AVAILABLE', 'QUARANTINED', 'DELETED');

CREATE TABLE "checklist_execution_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "runId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "executorMembershipId" UUID NOT NULL,
  "status" "ChecklistAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "score" DECIMAL(5,2),
  "earnedPoints" DECIMAL(12,2),
  "applicablePoints" DECIMAL(12,2),
  "isCompliant" BOOLEAN,
  "criticalFailure" BOOLEAN,
  "version" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "checklist_execution_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_attempt_number_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "checklist_attempt_version_check" CHECK ("version" > 0),
  CONSTRAINT "checklist_attempt_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
  CONSTRAINT "checklist_attempt_points_check" CHECK (
    ("earnedPoints" IS NULL AND "applicablePoints" IS NULL)
    OR ("earnedPoints" >= 0 AND "applicablePoints" >= 0 AND "earnedPoints" <= "applicablePoints")
  ),
  CONSTRAINT "checklist_attempt_submission_check" CHECK (
    ("status" = 'IN_PROGRESS' AND "submittedAt" IS NULL AND "score" IS NULL AND "isCompliant" IS NULL AND "criticalFailure" IS NULL)
    OR ("status" <> 'IN_PROGRESS' AND "submittedAt" IS NOT NULL AND "score" IS NOT NULL AND "isCompliant" IS NOT NULL AND "criticalFailure" IS NOT NULL)
  )
);

CREATE TABLE "checklist_responses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attemptId" UUID NOT NULL,
  "templateItemId" UUID NOT NULL,
  "valueJson" JSONB,
  "outcome" "ChecklistResponseOutcome" NOT NULL DEFAULT 'UNASSESSED',
  "note" VARCHAR(1000),
  "earnedPoints" DECIMAL(12,2),
  "maxPointsSnapshot" DECIMAL(12,2) NOT NULL,
  "answeredByMembershipId" UUID NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "checklist_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_response_version_check" CHECK ("version" > 0),
  CONSTRAINT "checklist_response_points_check" CHECK (
    "maxPointsSnapshot" >= 0 AND ("earnedPoints" IS NULL OR ("earnedPoints" >= 0 AND "earnedPoints" <= "maxPointsSnapshot"))
  )
);

CREATE TABLE "checklist_evidences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "responseId" UUID NOT NULL,
  "storageProvider" VARCHAR(40) NOT NULL,
  "objectKey" VARCHAR(255) NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "contentType" VARCHAR(80) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "capturedAt" TIMESTAMP(3),
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedByMembershipId" UUID NOT NULL,
  "status" "ChecklistEvidenceStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "checklist_evidences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_evidence_hash_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "checklist_evidence_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 10485760),
  CONSTRAINT "checklist_evidence_dimensions_check" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)),
  CONSTRAINT "checklist_evidence_type_check" CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE UNIQUE INDEX "checklist_execution_attempts_runId_attemptNumber_key" ON "checklist_execution_attempts"("runId", "attemptNumber");
CREATE INDEX "checklist_execution_attempts_executorMembershipId_status_startedAt_idx" ON "checklist_execution_attempts"("executorMembershipId", "status", "startedAt");
CREATE UNIQUE INDEX "checklist_responses_attemptId_templateItemId_key" ON "checklist_responses"("attemptId", "templateItemId");
CREATE INDEX "checklist_responses_templateItemId_outcome_idx" ON "checklist_responses"("templateItemId", "outcome");
CREATE UNIQUE INDEX "checklist_evidences_objectKey_key" ON "checklist_evidences"("objectKey");
CREATE INDEX "checklist_evidences_responseId_status_uploadedAt_idx" ON "checklist_evidences"("responseId", "status", "uploadedAt");
CREATE INDEX "checklist_evidences_uploadedByMembershipId_uploadedAt_idx" ON "checklist_evidences"("uploadedByMembershipId", "uploadedAt");

ALTER TABLE "checklist_execution_attempts" ADD CONSTRAINT "checklist_execution_attempts_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "checklist_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_execution_attempts" ADD CONSTRAINT "checklist_execution_attempts_executorMembershipId_fkey"
  FOREIGN KEY ("executorMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "checklist_execution_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_templateItemId_fkey"
  FOREIGN KEY ("templateItemId") REFERENCES "checklist_template_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_answeredByMembershipId_fkey"
  FOREIGN KEY ("answeredByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_evidences" ADD CONSTRAINT "checklist_evidences_responseId_fkey"
  FOREIGN KEY ("responseId") REFERENCES "checklist_responses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_evidences" ADD CONSTRAINT "checklist_evidences_uploadedByMembershipId_fkey"
  FOREIGN KEY ("uploadedByMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION checklist_attempt_guard() RETURNS trigger AS $$
DECLARE
  run_establishment_id UUID;
  run_assigned_membership_id UUID;
  run_status "ChecklistRunStatus";
  executor_establishment_id UUID;
  executor_active BOOLEAN;
BEGIN
  SELECT r."establishmentId", r."assignedMembershipId", r."status"
    INTO run_establishment_id, run_assigned_membership_id, run_status
    FROM "checklist_runs" r WHERE r."id" = NEW."runId";
  SELECT ue."establishmentId", ue."isActive"
    INTO executor_establishment_id, executor_active
    FROM "UserEstablishment" ue WHERE ue."id" = NEW."executorMembershipId";
  IF run_establishment_id IS NULL
     OR executor_establishment_id IS DISTINCT FROM run_establishment_id
     OR run_assigned_membership_id IS DISTINCT FROM NEW."executorMembershipId"
     OR executor_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'invalid checklist attempt executor';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'IN_PROGRESS' OR run_status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'REJECTED') THEN
      RAISE EXCEPTION 'invalid checklist attempt start';
    END IF;
  ELSE
    IF ROW(NEW."runId", NEW."attemptNumber", NEW."executorMembershipId", NEW."startedAt")
       IS DISTINCT FROM ROW(OLD."runId", OLD."attemptNumber", OLD."executorMembershipId", OLD."startedAt") THEN
      RAISE EXCEPTION 'checklist attempt identity is immutable';
    END IF;
    IF OLD."status" = 'IN_PROGRESS' AND NEW."status" = 'SUBMITTED' THEN
      NULL;
    ELSIF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'invalid checklist attempt transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_attempts_guard"
BEFORE INSERT OR UPDATE ON "checklist_execution_attempts"
FOR EACH ROW EXECUTE FUNCTION checklist_attempt_guard();

CREATE OR REPLACE FUNCTION checklist_response_guard() RETURNS trigger AS $$
DECLARE
  attempt_status "ChecklistAttemptStatus";
  attempt_executor UUID;
  run_template_version UUID;
  item_template_version UUID;
BEGIN
  SELECT a."status", a."executorMembershipId", r."templateVersionId"
    INTO attempt_status, attempt_executor, run_template_version
    FROM "checklist_execution_attempts" a
    JOIN "checklist_runs" r ON r."id" = a."runId"
   WHERE a."id" = NEW."attemptId";
  SELECT i."templateVersionId" INTO item_template_version
    FROM "checklist_template_items" i WHERE i."id" = NEW."templateItemId";
  IF attempt_status IS DISTINCT FROM 'IN_PROGRESS'
     OR attempt_executor IS DISTINCT FROM NEW."answeredByMembershipId"
     OR item_template_version IS DISTINCT FROM run_template_version THEN
    RAISE EXCEPTION 'invalid checklist response scope';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."attemptId", NEW."templateItemId", NEW."answeredByMembershipId", NEW."answeredAt", NEW."maxPointsSnapshot")
       IS DISTINCT FROM ROW(OLD."attemptId", OLD."templateItemId", OLD."answeredByMembershipId", OLD."answeredAt", OLD."maxPointsSnapshot")
       OR NEW."version" <> OLD."version" + 1 THEN
      RAISE EXCEPTION 'invalid checklist response update';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_responses_guard"
BEFORE INSERT OR UPDATE ON "checklist_responses"
FOR EACH ROW EXECUTE FUNCTION checklist_response_guard();

CREATE OR REPLACE FUNCTION checklist_evidence_guard() RETURNS trigger AS $$
DECLARE
  attempt_status "ChecklistAttemptStatus";
  attempt_executor UUID;
BEGIN
  SELECT a."status", a."executorMembershipId" INTO attempt_status, attempt_executor
    FROM "checklist_responses" r
    JOIN "checklist_execution_attempts" a ON a."id" = r."attemptId"
   WHERE r."id" = NEW."responseId";
  IF attempt_status IS DISTINCT FROM 'IN_PROGRESS'
     OR attempt_executor IS DISTINCT FROM NEW."uploadedByMembershipId" THEN
    RAISE EXCEPTION 'invalid checklist evidence scope';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_evidences_guard"
BEFORE INSERT ON "checklist_evidences"
FOR EACH ROW EXECUTE FUNCTION checklist_evidence_guard();

CREATE TRIGGER "checklist_evidences_append_only"
BEFORE UPDATE OR DELETE ON "checklist_evidences"
FOR EACH ROW EXECUTE FUNCTION checklist_append_only_guard();

CREATE TRIGGER "checklist_attempts_no_delete"
BEFORE DELETE ON "checklist_execution_attempts"
FOR EACH ROW EXECUTE FUNCTION checklist_append_only_guard();

CREATE TRIGGER "checklist_responses_no_delete"
BEFORE DELETE ON "checklist_responses"
FOR EACH ROW EXECUTE FUNCTION checklist_append_only_guard();
