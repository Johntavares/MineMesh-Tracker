-- AlterTable
ALTER TABLE "Mine" ADD COLUMN     "terrainEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "terrainResolution" INTEGER,
ADD COLUMN     "terrainSource" TEXT;
