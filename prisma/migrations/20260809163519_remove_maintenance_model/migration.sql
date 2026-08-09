/*
  Warnings:

  - You are about to drop the `maintenances` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "maintenances" DROP CONSTRAINT "maintenances_vehicle_id_fkey";

-- DropTable
DROP TABLE "maintenances";
