-- CreateIndex
CREATE UNIQUE INDEX "vehicle_trips_vehicle_id_trip_number_key" ON "vehicle_trips"("vehicle_id", "trip_number");
