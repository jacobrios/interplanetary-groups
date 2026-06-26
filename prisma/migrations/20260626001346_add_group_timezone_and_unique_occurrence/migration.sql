/*
  Warnings:

  - A unique constraint covering the columns `[groupId,startsAt]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Event_groupId_startsAt_idx";

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateIndex
CREATE UNIQUE INDEX "Event_groupId_startsAt_key" ON "Event"("groupId", "startsAt");
