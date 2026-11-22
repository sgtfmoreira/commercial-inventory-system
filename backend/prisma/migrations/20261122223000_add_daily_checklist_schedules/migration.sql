ALTER TABLE "checklist_schedules"
  ADD COLUMN "weekdays" INTEGER[];

UPDATE "checklist_schedules"
SET "weekdays" = ARRAY["weekday"];

CREATE FUNCTION checklist_weekdays_are_unique(INTEGER[]) RETURNS BOOLEAN AS $$
  SELECT COUNT(*) = COUNT(DISTINCT value) FROM unnest($1) AS day(value);
$$ LANGUAGE SQL IMMUTABLE STRICT;

ALTER TABLE "checklist_schedules"
  DROP CONSTRAINT "checklist_schedules_weekday_check",
  ALTER COLUMN "weekdays" SET NOT NULL,
  DROP COLUMN "weekday",
  ADD CONSTRAINT "checklist_schedules_weekdays_check" CHECK (
    cardinality("weekdays") BETWEEN 1 AND 7
    AND "weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
    AND checklist_weekdays_are_unique("weekdays")
  );

CREATE INDEX "checklist_schedules_weekdays_gin_idx"
  ON "checklist_schedules" USING GIN ("weekdays");
