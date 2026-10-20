ALTER TABLE "table_reservations"
    ADD COLUMN "reservationGroupId" UUID;

-- Reservas em lote anteriores a esta migração foram criadas na mesma transação.
-- Agrupamos somente registros com dados idênticos e criação no mesmo segundo.
WITH grouped_reservations AS (
    SELECT
        "establishmentId",
        "reservationDate",
        "reservationTime",
        "customerName",
        COALESCE("phone", '') AS phone_key,
        "partySize",
        COALESCE("notes", '') AS notes_key,
        "status",
        "createdByUserId",
        date_trunc('second', "createdAt") AS created_second,
        md5(concat_ws('|',
            "establishmentId"::text,
            "reservationDate"::text,
            "reservationTime"::text,
            "customerName",
            COALESCE("phone", ''),
            "partySize"::text,
            COALESCE("notes", ''),
            "status"::text,
            "createdByUserId"::text,
            date_trunc('second', "createdAt")::text
        ))::uuid AS group_id
    FROM "table_reservations"
    GROUP BY
        "establishmentId", "reservationDate", "reservationTime", "customerName",
        COALESCE("phone", ''), "partySize", COALESCE("notes", ''), "status",
        "createdByUserId", date_trunc('second', "createdAt")
    HAVING COUNT(*) > 1
)
UPDATE "table_reservations" AS reservation
SET "reservationGroupId" = grouped.group_id
FROM grouped_reservations AS grouped
WHERE reservation."establishmentId" = grouped."establishmentId"
  AND reservation."reservationDate" = grouped."reservationDate"
  AND reservation."reservationTime" = grouped."reservationTime"
  AND reservation."customerName" = grouped."customerName"
  AND COALESCE(reservation."phone", '') = grouped.phone_key
  AND reservation."partySize" = grouped."partySize"
  AND COALESCE(reservation."notes", '') = grouped.notes_key
  AND reservation."status" = grouped."status"
  AND reservation."createdByUserId" = grouped."createdByUserId"
  AND date_trunc('second', reservation."createdAt") = grouped.created_second;

CREATE INDEX "table_reservations_reservationGroupId_idx"
    ON "table_reservations"("reservationGroupId");
