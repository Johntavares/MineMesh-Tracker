-- CreateTable
CREATE TABLE "CleaningRecord" (
    "id" TEXT NOT NULL,
    "syncId" TEXT NOT NULL,
    "repeaterId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "notes" TEXT,
    "cleanedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleaningRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CleaningRecord_syncId_key" ON "CleaningRecord"("syncId");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningRecord_repeaterId_weekStart_key" ON "CleaningRecord"("repeaterId", "weekStart");

-- AddForeignKey
ALTER TABLE "CleaningRecord" ADD CONSTRAINT "CleaningRecord_repeaterId_fkey" FOREIGN KEY ("repeaterId") REFERENCES "Repeater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRecord" ADD CONSTRAINT "CleaningRecord_cleanedById_fkey" FOREIGN KEY ("cleanedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
