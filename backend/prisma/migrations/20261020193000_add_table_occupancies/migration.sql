CREATE TYPE "TableOccupancyStatus" AS ENUM ('ACTIVE', 'RELEASED');

CREATE TABLE "table_occupancies" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "customerName" VARCHAR(160),
    "partySize" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "TableOccupancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "releasedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_occupancies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "table_occupancies_table_number_check" CHECK ("tableNumber" BETWEEN 1 AND 27),
    CONSTRAINT "table_occupancies_party_size_check" CHECK ("partySize" > 0)
);

CREATE INDEX "table_occupancies_establishmentId_status_idx"
    ON "table_occupancies"("establishmentId", "status");
CREATE INDEX "table_occupancies_createdByUserId_idx" ON "table_occupancies"("createdByUserId");
CREATE INDEX "table_occupancies_releasedByUserId_idx" ON "table_occupancies"("releasedByUserId");

CREATE UNIQUE INDEX "table_occupancies_active_table_key"
    ON "table_occupancies"("establishmentId", "tableNumber")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "table_occupancies" ADD CONSTRAINT "table_occupancies_establishmentId_fkey"
    FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_occupancies" ADD CONSTRAINT "table_occupancies_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_occupancies" ADD CONSTRAINT "table_occupancies_releasedByUserId_fkey"
    FOREIGN KEY ("releasedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
