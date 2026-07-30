-- CreateIndex
CREATE INDEX "trips_client_id_idx" ON "trips"("client_id");

-- CreateIndex
CREATE INDEX "trips_vehicle_id_idx" ON "trips"("vehicle_id");

-- CreateIndex
CREATE INDEX "trips_driver_id_idx" ON "trips"("driver_id");

-- CreateIndex
CREATE INDEX "trips_carrier_id_idx" ON "trips"("carrier_id");
