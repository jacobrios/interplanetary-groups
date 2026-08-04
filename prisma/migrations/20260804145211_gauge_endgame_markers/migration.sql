/*
  Warnings:

  - A unique constraint covering the columns `[bumpMessageId]` on the table `Gauge` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[closureMessageId]` on the table `Gauge` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Gauge" ADD COLUMN     "bumpMessageId" TEXT,
ADD COLUMN     "closureMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Gauge_bumpMessageId_key" ON "Gauge"("bumpMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Gauge_closureMessageId_key" ON "Gauge"("closureMessageId");

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_bumpMessageId_fkey" FOREIGN KEY ("bumpMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_closureMessageId_fkey" FOREIGN KEY ("closureMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
