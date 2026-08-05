// src/lib/gauges/threshold.ts
//
// Whether a gauge has reached the bar. Derived from the vote rows every time
// and never stored, the same rule RSVP counts follow: a stored count can drift
// out of sync with the rows it describes, and being right about who is coming
// is the entire value of this product.
//
// The number itself lives in spark-copy.ts beside the copy that counts down to
// it, so the tally and the creation path can never disagree about the bar.

import type { GaugeAnswer } from "@prisma/client"
import { SPARK_THRESHOLD } from "@/lib/orbit/spark-copy"

export { SPARK_THRESHOLD }

/** How many people said yes to the day being proposed. */
export function countIn(votes: { answer: GaugeAnswer }[]): number {
  return votes.filter((v) => v.answer === "IN").length
}

/**
 * Only IN counts. NOT_THAT_DAY is interest in the idea without attendance on
 * this day, and the event this unlocks is for this day.
 */
export function hasReachedThreshold(votes: { answer: GaugeAnswer }[]): boolean {
  return countIn(votes) >= SPARK_THRESHOLD
}

/** How many current answers are "yes, but not that day". */
export function countNotThatDay(votes: { answer: GaugeAnswer }[]): number {
  return votes.filter((v) => v.answer === "NOT_THAT_DAY").length
}

/**
 * Would this gauge have cleared the bar if the day had worked? True when IN
 * plus NOT_THAT_DAY together reach SPARK_THRESHOLD, at least one of them is a
 * NOT_THAT_DAY (otherwise the day was never the blocker), and the gauge is
 * genuinely short (3 IN would have promoted instead). Callers pass
 * member-filtered votes, same as every other count.
 * (Spec: wrong-day-retry, decisions 1 and 2.)
 */
export function isRetryEligible(votes: { answer: GaugeAnswer }[]): boolean {
  const inCount = countIn(votes)
  const cantDay = countNotThatDay(votes)
  return inCount < SPARK_THRESHOLD && cantDay >= 1 && inCount + cantDay >= SPARK_THRESHOLD
}
