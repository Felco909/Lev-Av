-- AlterTable
ALTER TABLE "vehicle_trips" ADD COLUMN     "current_zone_id" TEXT,
ADD COLUMN     "geofence_status" TEXT,
ADD COLUMN     "geofence_status_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "wialon_zone_roles" (
    "id" TEXT NOT NULL,
    "wialon_zone_id" TEXT NOT NULL,
    "zone_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wialon_zone_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_trip_events" (
    "id" TEXT NOT NULL,
    "vehicle_trip_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "zone_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wialon_zone_roles_wialon_zone_id_key" ON "wialon_zone_roles"("wialon_zone_id");

-- CreateIndex
CREATE INDEX "vehicle_trip_events_vehicle_trip_id_idx" ON "vehicle_trip_events"("vehicle_trip_id");

-- CreateIndex
CREATE INDEX "vehicle_trip_events_created_at_idx" ON "vehicle_trip_events"("created_at");

-- AddForeignKey
ALTER TABLE "vehicle_trip_events" ADD CONSTRAINT "vehicle_trip_events_vehicle_trip_id_fkey" FOREIGN KEY ("vehicle_trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
