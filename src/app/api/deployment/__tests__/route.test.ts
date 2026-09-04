// src/app/api/deployment/__tests__/route.test.ts
//
// No database, no mocks: the whole route is one environment read and one
// response, so the test exercises the real handler and reads the real
// headers off the real Response object.
//
// The environment variable is set and deleted per test rather than read from
// the machine, because the absent case IS the local-development case and a
// test that only ever runs where the variable is absent would prove nothing
// about the present one.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET } from "../route"

const ORIGINAL = process.env.VERCEL_DEPLOYMENT_ID

beforeEach(() => {
  delete process.env.VERCEL_DEPLOYMENT_ID
})

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VERCEL_DEPLOYMENT_ID
  else process.env.VERCEL_DEPLOYMENT_ID = ORIGINAL
})

describe("GET /api/deployment", () => {
  it("reports the deployment id Vercel supplied", async () => {
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_currentbuild"

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: "dpl_currentbuild" })
  })

  // The local-development case, and the one that must never be misread as
  // "a new deployment exists": absent is 200 with a null id, not an error
  // and not an empty body the client would have to guess about.
  it("answers 200 with a null id when the variable is absent", async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: null })
  })

  // The single most important line in the route, per the slice document: a
  // cached answer here means either a missed deploy or, far worse, a reload
  // loop. Asserted on the header's VALUE, never merely on its presence,
  // because "a cache-control header exists" is true of a response that caches
  // for a year.
  it("forbids caching the answer, by value and not merely by presence", async () => {
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_currentbuild"

    const response = await GET()

    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})
