/*
  Warnings:

  - You are about to drop the `wialon_zone_roles` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "vehicle_trips" ADD COLUMN     "departure_confirmed_by_gps" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "at_base" BOOLEAN DEFAULT true,
ADD COLUMN     "at_base_changed_at" TIMESTAMP(3);

-- DropTable
DROP TABLE "wialon_zone_roles";

-- CreateTable
CREATE TABLE "company_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'base',
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "radius_meters" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_zones_pkey" PRIMARY KEY ("id")
);
