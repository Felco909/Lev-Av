-- AlterTable
ALTER TABLE "fuel_records" ADD COLUMN     "vehicle_trip_id" TEXT;

-- CreateIndex
CREATE INDEX "fuel_records_vehicle_trip_id_idx" ON "fuel_records"("vehicle_trip_id");

-- AddForeignKey
ALTER TABLE "fuel_records" ADD CONSTRAINT "fuel_records_vehicle_trip_id_fkey" FOREIGN KEY ("vehicle_trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
