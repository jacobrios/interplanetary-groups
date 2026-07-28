-- CreateEnum
CREATE TYPE "ProposalAnswer" AS ENUM ('CONFIRMED', 'DECLINED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "previousStartsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChangeProposal" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "askerUserId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "orbitMessageId" TEXT NOT NULL,
    "proposedStartsAt" TIMESTAMP(3) NOT NULL,
    "priorStartsAt" TIMESTAMP(3) NOT NULL,
    "answer" "ProposalAnswer",
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeProposal_sourceMessageId_key" ON "ChangeProposal"("sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeProposal_orbitMessageId_key" ON "ChangeProposal"("orbitMessageId");

-- CreateIndex
CREATE INDEX "ChangeProposal_groupId_idx" ON "ChangeProposal"("groupId");

-- CreateIndex
CREATE INDEX "ChangeProposal_eventId_idx" ON "ChangeProposal"("eventId");

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_askerUserId_fkey" FOREIGN KEY ("askerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_orbitMessageId_fkey" FOREIGN KEY ("orbitMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
