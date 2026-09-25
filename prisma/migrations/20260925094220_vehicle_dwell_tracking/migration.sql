-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "last_gps_message_at" TIMESTAMP(3),
ADD COLUMN     "last_moving_at" TIMESTAMP(3);
