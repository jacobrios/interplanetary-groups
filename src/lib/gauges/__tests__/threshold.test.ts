// src/lib/gauges/__tests__/threshold.test.ts
//
// The bar is three people. Pure derivation from vote rows: nothing about a
// tally is ever stored, the same rule RSVPs follow.

import { describe, it, expect } from "vitest"
import { GaugeAnswer } from "@prisma/client"
import { countIn, hasReachedThreshold, SPARK_THRESHOLD } from "../threshold"

const v = (answer: GaugeAnswer) => ({ answer })

describe("countIn", () => {
  it("counts only yes answers", () => {
    expect(countIn([v("IN"), v("OUT"), v("NOT_THAT_DAY"), v("IN")])).toBe(2)
  })

  it("counts nothing in an empty gauge", () => {
    expect(countIn([])).toBe(0)
  })
})

describe("hasReachedThreshold", () => {
  it("is false below the bar", () => {
    expect(hasReachedThreshold([v("IN"), v("IN")])).toBe(false)
  })

  it("is true at the bar", () => {
    expect(hasReachedThreshold([v("IN"), v("IN"), v("IN")])).toBe(true)
  })

  it("stays true above the bar", () => {
    expect(hasReachedThreshold([v("IN"), v("IN"), v("IN"), v("IN")])).toBe(true)
  })

  it("does not let willing-but-not-that-day answers reach the bar", () => {
    // "Yes, can't Fri" is interest in the idea, not attendance on the day
    // being proposed, and the event created here is for that day.
    expect(hasReachedThreshold([v("IN"), v("IN"), v("NOT_THAT_DAY")])).toBe(false)
  })

  it("agrees with the exported number", () => {
    expect(hasReachedThreshold(Array(SPARK_THRESHOLD).fill(v("IN")))).toBe(true)
    expect(hasReachedThreshold(Array(SPARK_THRESHOLD - 1).fill(v("IN")))).toBe(false)
  })
})
