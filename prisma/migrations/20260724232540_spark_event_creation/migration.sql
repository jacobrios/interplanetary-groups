/*
  Warnings:

  - A unique constraint covering the columns `[gaugeId]` on the table `Event` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[scheduledKey]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Event_groupId_startsAt_key";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "gaugeId" TEXT,
ADD COLUMN     "scheduledKey" TEXT;

-- AlterTable
ALTER TABLE "Gauge" ADD COLUMN     "proposedTime" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_gaugeId_key" ON "Event"("gaugeId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_scheduledKey_key" ON "Event"("scheduledKey");

-- CreateIndex
CREATE INDEX "Event_groupId_startsAt_idx" ON "Event"("groupId", "startsAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_gaugeId_fkey" FOREIGN KEY ("gaugeId") REFERENCES "Gauge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
