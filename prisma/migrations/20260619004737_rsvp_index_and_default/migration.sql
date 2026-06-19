-- AlterTable
ALTER TABLE "Rsvp" ALTER COLUMN "respondedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Rsvp_eventId_idx" ON "Rsvp"("eventId");
