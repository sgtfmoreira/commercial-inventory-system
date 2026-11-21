ALTER TABLE "table_reservations"
    ADD COLUMN "checkedInAt" TIMESTAMP(3),
    ADD COLUMN "checkedInByUserId" UUID;

ALTER TABLE "table_occupancies"
    ADD COLUMN "reservationId" UUID;

CREATE INDEX "table_reservations_checkedInByUserId_idx"
    ON "table_reservations"("checkedInByUserId");

CREATE UNIQUE INDEX "table_occupancies_reservationId_key"
    ON "table_occupancies"("reservationId");

ALTER TABLE "table_reservations"
    ADD CONSTRAINT "table_reservations_checkedInByUserId_fkey"
    FOREIGN KEY ("checkedInByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "table_occupancies"
    ADD CONSTRAINT "table_occupancies_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "table_reservations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
