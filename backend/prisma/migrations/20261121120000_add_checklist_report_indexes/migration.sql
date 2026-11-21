CREATE INDEX "checklist_runs_establishmentId_dueAt_idx"
  ON "checklist_runs"("establishmentId", "dueAt");

CREATE INDEX "checklist_execution_attempts_submittedAt_status_idx"
  ON "checklist_execution_attempts"("submittedAt", "status");
