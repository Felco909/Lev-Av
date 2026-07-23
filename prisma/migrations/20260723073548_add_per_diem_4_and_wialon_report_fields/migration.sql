-- AlterTable
ALTER TABLE "vehicle_trips" ADD COLUMN     "per_diem_4" DECIMAL(12,2),
ADD COLUMN     "per_diem_4_amd" DECIMAL(14,2),
ADD COLUMN     "per_diem_4_currency" TEXT NOT NULL DEFAULT 'AMD',
ADD COLUMN     "per_diem_4_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
ADD COLUMN     "wialon_avg_fuel_consumption_per_100km" DOUBLE PRECISION,
ADD COLUMN     "wialon_engine_hours_sec" DOUBLE PRECISION,
ADD COLUMN     "wialon_filled_l" DOUBLE PRECISION,
ADD COLUMN     "wialon_fillings_count" INTEGER,
ADD COLUMN     "wialon_fuel_level_begin_l" DOUBLE PRECISION,
ADD COLUMN     "wialon_fuel_level_end_l" DOUBLE PRECISION,
ADD COLUMN     "wialon_thefted_l" DOUBLE PRECISION,
ADD COLUMN     "wialon_thefts_count" INTEGER;
