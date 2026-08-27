-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailAskCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailAskedAt" TIMESTAMP(3);
