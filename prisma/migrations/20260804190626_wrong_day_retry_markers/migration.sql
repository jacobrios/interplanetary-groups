/*
  Warnings:

  - A unique constraint covering the columns `[retryAskMessageId]` on the table `Gauge` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[retryGuessOfGaugeId]` on the table `Gauge` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Gauge" ADD COLUMN     "retryAskMessageId" TEXT,
ADD COLUMN     "retryGuessOfGaugeId" TEXT,
ALTER COLUMN "sourceMessageId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Gauge_retryAskMessageId_key" ON "Gauge"("retryAskMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Gauge_retryGuessOfGaugeId_key" ON "Gauge"("retryGuessOfGaugeId");

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_retryAskMessageId_fkey" FOREIGN KEY ("retryAskMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_retryGuessOfGaugeId_fkey" FOREIGN KEY ("retryGuessOfGaugeId") REFERENCES "Gauge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
