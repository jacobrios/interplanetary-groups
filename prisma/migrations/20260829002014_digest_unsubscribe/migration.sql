/*
  Warnings:

  - A unique constraint covering the columns `[unsubscribeToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "digestOptOutAt" TIMESTAMP(3),
ADD COLUMN     "unsubscribeToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_unsubscribeToken_key" ON "User"("unsubscribeToken");
