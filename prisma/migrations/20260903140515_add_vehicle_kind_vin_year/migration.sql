-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'tractor',
ADD COLUMN     "vin" TEXT,
ADD COLUMN     "year" INTEGER;
