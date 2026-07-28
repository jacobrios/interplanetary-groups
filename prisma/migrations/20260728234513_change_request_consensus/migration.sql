/*
  Warnings:

  - A unique constraint covering the columns `[sourceMessageId,kind]` on the table `ChangeProposal` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('VERIFY', 'GROUP');

-- CreateEnum
CREATE TYPE "ProposalVoteAnswer" AS ENUM ('YES', 'KEEP');

-- AlterEnum
ALTER TYPE "ProposalAnswer" ADD VALUE 'SUPERSEDED';

-- DropIndex
DROP INDEX "ChangeProposal_sourceMessageId_key";

-- AlterTable
ALTER TABLE "ChangeProposal" ADD COLUMN     "kind" "ProposalKind" NOT NULL DEFAULT 'VERIFY';

-- CreateTable
CREATE TABLE "ProposalVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" "ProposalVoteAnswer" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalVote_proposalId_idx" ON "ProposalVote"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalVote_userId_idx" ON "ProposalVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalVote_proposalId_userId_key" ON "ProposalVote"("proposalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeProposal_sourceMessageId_kind_key" ON "ChangeProposal"("sourceMessageId", "kind");

-- AddForeignKey
ALTER TABLE "ProposalVote" ADD CONSTRAINT "ProposalVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ChangeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalVote" ADD CONSTRAINT "ProposalVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
