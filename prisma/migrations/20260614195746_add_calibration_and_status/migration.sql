-- AlterTable
ALTER TABLE "Mine" ADD COLUMN     "calibrationAccuracy" DOUBLE PRECISION,
ADD COLUMN     "isCalibrated" BOOLEAN NOT NULL DEFAULT false;
