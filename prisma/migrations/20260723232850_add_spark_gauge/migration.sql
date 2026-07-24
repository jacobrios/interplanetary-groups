-- CreateEnum
CREATE TYPE "GaugeAnswer" AS ENUM ('IN', 'OUT', 'NOT_THAT_DAY');

-- CreateTable
CREATE TABLE "Gauge" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "orbitMessageId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "proposedDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gauge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaugeVote" (
    "id" TEXT NOT NULL,
    "gaugeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" "GaugeAnswer" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaugeVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gauge_sourceMessageId_key" ON "Gauge"("sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Gauge_orbitMessageId_key" ON "Gauge"("orbitMessageId");

-- CreateIndex
CREATE INDEX "Gauge_groupId_idx" ON "Gauge"("groupId");

-- CreateIndex
CREATE INDEX "GaugeVote_gaugeId_idx" ON "GaugeVote"("gaugeId");

-- CreateIndex
CREATE INDEX "GaugeVote_userId_idx" ON "GaugeVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GaugeVote_gaugeId_userId_key" ON "GaugeVote"("gaugeId", "userId");

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gauge" ADD CONSTRAINT "Gauge_orbitMessageId_fkey" FOREIGN KEY ("orbitMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaugeVote" ADD CONSTRAINT "GaugeVote_gaugeId_fkey" FOREIGN KEY ("gaugeId") REFERENCES "Gauge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaugeVote" ADD CONSTRAINT "GaugeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
