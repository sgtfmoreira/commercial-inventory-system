ALTER TABLE "table_occupancies"
    ADD COLUMN "occupancyGroupId" UUID;

CREATE INDEX "table_occupancies_occupancyGroupId_idx"
    ON "table_occupancies"("occupancyGroupId");
