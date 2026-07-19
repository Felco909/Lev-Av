-- DropForeignKey
ALTER TABLE "service_records" DROP CONSTRAINT "service_records_regulation_id_fkey";

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "is_unscheduled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "work_type" TEXT,
ALTER COLUMN "regulation_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_regulations" ADD COLUMN     "vehicle_model" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "current_mileage_updated_at" TIMESTAMP(3),
ADD COLUMN     "wialon_unit_id" TEXT;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_regulation_id_fkey" FOREIGN KEY ("regulation_id") REFERENCES "service_regulations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
