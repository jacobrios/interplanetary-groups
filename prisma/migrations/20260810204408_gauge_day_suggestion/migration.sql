/*
  Warnings:

  - A unique constraint covering the columns `[suggestedMessageId]` on the table `Gauge` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Gauge" ADD COLUMN     "suggestedByUserId" TEXT,
ADD COLUMN     "suggestedDayOfWeek" INTEGER,
ADD COLUMN     "suggestedMessageId" TEXT,
ADD COLUMN     "suggestedTime" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Gauge_suggestedMessageId_key" ON "Gauge"("suggestedMessageId");

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_suggestedByUserId_fkey" FOREIGN KEY ("suggestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_suggestedMessageId_fkey" FOREIGN KEY ("suggestedMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
