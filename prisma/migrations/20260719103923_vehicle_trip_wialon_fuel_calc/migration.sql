-- AlterTable
ALTER TABLE "vehicle_trips" ADD COLUMN     "calculated_fuel_consumed_l" DOUBLE PRECISION,
ADD COLUMN     "calculated_km" DOUBLE PRECISION,
ADD COLUMN     "fuel_calc_at" TIMESTAMP(3),
ADD COLUMN     "fuel_calc_source" TEXT;
