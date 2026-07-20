-- AlterTable
ALTER TABLE "vehicle_trips" ADD COLUMN     "calculated_idle_minutes" DOUBLE PRECISION,
ADD COLUMN     "departure_lat" DOUBLE PRECISION,
ADD COLUMN     "departure_lon" DOUBLE PRECISION,
ADD COLUMN     "return_lat" DOUBLE PRECISION,
ADD COLUMN     "return_lon" DOUBLE PRECISION,
ALTER COLUMN "departure_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "return_date" SET DATA TYPE TIMESTAMP(3);
