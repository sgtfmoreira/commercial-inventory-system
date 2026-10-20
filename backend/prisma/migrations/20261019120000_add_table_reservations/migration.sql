CREATE TYPE "TableReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

CREATE TABLE "table_reservations" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "reservationDate" DATE NOT NULL,
    "reservationTime" TIME(0) NOT NULL,
    "customerName" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(30),
    "partySize" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "TableReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "table_reservations_table_number_check" CHECK ("tableNumber" BETWEEN 1 AND 27),
    CONSTRAINT "table_reservations_party_size_check" CHECK ("partySize" > 0)
);

CREATE INDEX "table_reservations_establishmentId_reservationDate_idx"
    ON "table_reservations"("establishmentId", "reservationDate");
CREATE INDEX "table_reservations_establishmentId_reservationDate_status_idx"
    ON "table_reservations"("establishmentId", "reservationDate", "status");
CREATE INDEX "table_reservations_createdByUserId_idx" ON "table_reservations"("createdByUserId");
CREATE INDEX "table_reservations_updatedByUserId_idx" ON "table_reservations"("updatedByUserId");

-- O índice parcial permite histórico cancelado e impede duas reservas ativas,
-- inclusive quando as requisições chegam simultaneamente.
CREATE UNIQUE INDEX "table_reservations_active_table_date_key"
    ON "table_reservations"("establishmentId", "tableNumber", "reservationDate")
    WHERE "status" = 'CONFIRMED';

ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_establishmentId_fkey"
    FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
