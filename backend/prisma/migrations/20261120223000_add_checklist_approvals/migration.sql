ALTER TYPE "ChecklistRunEventType" ADD VALUE IF NOT EXISTS 'ATTEMPT_APPROVED';
ALTER TYPE "ChecklistRunEventType" ADD VALUE IF NOT EXISTS 'ATTEMPT_REJECTED';
ALTER TYPE "ChecklistRunEventType" ADD VALUE IF NOT EXISTS 'ATTEMPT_AUTO_APPROVED';

CREATE TYPE "ChecklistApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

CREATE TABLE "checklist_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attemptId" UUID NOT NULL,
  "decision" "ChecklistApprovalDecision" NOT NULL,
  "reason" VARCHAR(1000),
  "approverMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checklist_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_approval_rejection_reason_check" CHECK (
    "decision" <> 'REJECT' OR length(trim("reason")) >= 3
  )
);

CREATE UNIQUE INDEX "checklist_approvals_attemptId_key" ON "checklist_approvals"("attemptId");
CREATE INDEX "checklist_approvals_approverMembershipId_createdAt_idx" ON "checklist_approvals"("approverMembershipId", "createdAt");

ALTER TABLE "checklist_approvals" ADD CONSTRAINT "checklist_approvals_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "checklist_execution_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_approvals" ADD CONSTRAINT "checklist_approvals_approverMembershipId_fkey"
  FOREIGN KEY ("approverMembershipId") REFERENCES "UserEstablishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
       IS DISTINCT FROM ROW(OLD."runId", OLD."attemptNumber", OLD."executorMembershipId", OLD."startedAt")
       OR NEW."version" <> OLD."version" + 1 THEN
      RAISE EXCEPTION 'checklist attempt identity is immutable';
    END IF;
    IF OLD."status" = 'IN_PROGRESS' AND NEW."status" = 'SUBMITTED' THEN
      IF NEW."decidedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'submitted checklist attempt cannot be decided';
      END IF;
    ELSIF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED', 'REJECTED') THEN
      IF NEW."decidedAt" IS NULL
         OR ROW(NEW."score", NEW."earnedPoints", NEW."applicablePoints", NEW."isCompliant", NEW."criticalFailure", NEW."submittedAt")
            IS DISTINCT FROM ROW(OLD."score", OLD."earnedPoints", OLD."applicablePoints", OLD."isCompliant", OLD."criticalFailure", OLD."submittedAt") THEN
        RAISE EXCEPTION 'invalid checklist attempt decision';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid checklist attempt transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION checklist_approval_guard() RETURNS trigger AS $$
DECLARE
  attempt_status "ChecklistAttemptStatus";
  executor_membership_id UUID;
  run_status "ChecklistRunStatus";
  run_establishment_id UUID;
  approval_required BOOLEAN;
  approver_establishment_id UUID;
  approver_active BOOLEAN;
  establishment_active BOOLEAN;
BEGIN
  SELECT a."status", a."executorMembershipId", r."status", r."establishmentId", tv."approvalRequired"
    INTO attempt_status, executor_membership_id, run_status, run_establishment_id, approval_required
    FROM "checklist_execution_attempts" a
    JOIN "checklist_runs" r ON r."id" = a."runId"
    JOIN "checklist_template_versions" tv ON tv."id" = r."templateVersionId"
   WHERE a."id" = NEW."attemptId";
  SELECT ue."establishmentId", ue."isActive", e."isActive"
    INTO approver_establishment_id, approver_active, establishment_active
    FROM "UserEstablishment" ue
    JOIN "establishments" e ON e."id" = ue."establishmentId"
   WHERE ue."id" = NEW."approverMembershipId";
  IF attempt_status IS DISTINCT FROM 'SUBMITTED'
     OR run_status IS DISTINCT FROM 'SUBMITTED'
     OR approval_required IS DISTINCT FROM TRUE
     OR approver_establishment_id IS DISTINCT FROM run_establishment_id
     OR approver_active IS DISTINCT FROM TRUE
     OR establishment_active IS DISTINCT FROM TRUE
     OR executor_membership_id IS NOT DISTINCT FROM NEW."approverMembershipId" THEN
    RAISE EXCEPTION 'invalid checklist approval scope';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checklist_approvals_guard"
BEFORE INSERT ON "checklist_approvals"
FOR EACH ROW EXECUTE FUNCTION checklist_approval_guard();

CREATE TRIGGER "checklist_approvals_append_only"
BEFORE UPDATE OR DELETE ON "checklist_approvals"
FOR EACH ROW EXECUTE FUNCTION checklist_append_only_guard();
