// src/lib/groups/__tests__/timezone.test.ts
//
// Pure unit tests — no database, no async. The timezone helpers validate a
// client-asserted IANA zone (treated as a claim, per the CLAUDE.md guardrail)
// and derive a human-readable label deterministically from Intl.

import { describe, it, expect } from "vitest"
import { normalizeTimeZone, formatTimeZoneLabel } from "../timezone"

describe("normalizeTimeZone", () => {
  it("passes a valid IANA zone through unchanged", () => {
    expect(normalizeTimeZone("America/Chicago")).toBe("America/Chicago")
  })

  it("passes a valid IANA alias through unchanged (browsers may report aliases)", () => {
    // Asia/Calcutta is a legacy alias for Asia/Kolkata; Intl accepts it.
    expect(normalizeTimeZone("Asia/Calcutta")).toBe("Asia/Calcutta")
  })

  it("passes 'UTC' through unchanged", () => {
    expect(normalizeTimeZone("UTC")).toBe("UTC")
  })

  it("falls back to 'UTC' for an unrecognized zone string", () => {
    expect(normalizeTimeZone("Not/AZone")).toBe("UTC")
  })

  it("falls back to 'UTC' for an empty string", () => {
    expect(normalizeTimeZone("")).toBe("UTC")
  })

  it("falls back to 'UTC' for null", () => {
    expect(normalizeTimeZone(null)).toBe("UTC")
  })

  it("falls back to 'UTC' for undefined", () => {
    expect(normalizeTimeZone(undefined)).toBe("UTC")
  })

  it("falls back to 'UTC' for a non-string value", () => {
    expect(normalizeTimeZone(123)).toBe("UTC")
  })

  it("falls back to 'UTC' for an over-long string (never handed to Intl)", () => {
    expect(normalizeTimeZone("A".repeat(500))).toBe("UTC")
  })
})

describe("formatTimeZoneLabel", () => {
  it("derives the generic (non-seasonal) long name for a US zone", () => {
    // "Central Time", never the seasonal "Central Daylight Time".
    expect(formatTimeZoneLabel("America/Chicago")).toBe("Central Time")
  })

  it("derives 'Pacific Time' for America/Los_Angeles", () => {
    expect(formatTimeZoneLabel("America/Los_Angeles")).toBe("Pacific Time")
  })

  it("derives 'Eastern Time' for America/New_York", () => {
    expect(formatTimeZoneLabel("America/New_York")).toBe("Eastern Time")
  })

  it("falls back to the raw IANA string for UTC (no generic name; Intl yields a GMT offset)", () => {
    expect(formatTimeZoneLabel("UTC")).toBe("UTC")
  })

  it("falls back to the raw IANA string for an Etc/* zone (Intl yields a GMT offset)", () => {
    expect(formatTimeZoneLabel("Etc/GMT+5")).toBe("Etc/GMT+5")
  })
})
