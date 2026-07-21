-- AlterTable
ALTER TABLE "vehicle_trip_events" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "vehicle_trips" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by_user_id" TEXT,
ADD COLUMN     "final_expenses_amd" DECIMAL(14,2),
ADD COLUMN     "final_revenue_amd" DECIMAL(14,2);
