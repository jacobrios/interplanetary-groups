# Prisma Data Layer Implementation Plan

> **This is a pre-build plan, preserved as written.** It records intent before implementation; build-notes §11 (data-foundation slice) records what actually landed, and the drift between the two is part of the record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Prisma 7 against the existing Supabase Postgres database, define the seven-model schema, run the first migration, and verify with a smoke test.

**Architecture:** Prisma 7 centralizes CLI config (DB URL, migrations path) in a `prisma.config.ts` at the project root — separate from `schema.prisma`. At runtime, `PrismaClient` is instantiated with a `PrismaPg` driver adapter that receives the pooled connection string. A singleton in `src/lib/prisma.ts` holds the client. Tests use Vitest with `dotenv` to load `.env` before any module is imported.

**Tech Stack:** Prisma 7.8.0, @prisma/adapter-pg, pg, Vitest, Next.js 16.2.9, Supabase Postgres

## Deviations from spec (current Prisma 7 behavior)

Four things the current Prisma 7 docs require that weren't in the original spec:

1. **`prisma.config.ts` is required.** The `url` and `directUrl` fields no longer live in `schema.prisma`'s `datasource` block. Instead, the CLI database URL lives in `prisma.config.ts` at the project root. `DIRECT_URL` (the non-pooled connection you described) goes there for migrations; `DATABASE_URL` (pooled) is used at runtime via the driver adapter.

2. **Driver adapters are required.** Prisma 7 no longer bundles a query engine — all databases need an explicit driver adapter. For PostgreSQL/Supabase, this means `@prisma/adapter-pg` + `pg`. `PrismaClient` is instantiated as `new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })` instead of bare `new PrismaClient()`.

3. **Generator provider is `prisma-client-js` (not `prisma-client`).** The new `prisma-client` provider in Prisma 7 has a known module resolution issue with Next.js 16 + Turbopack. Using `prisma-client-js` (the previous default, still functional in Prisma 7) avoids this until the upstream issue is fixed. **This is flagged tech debt** — migrate to `prisma-client` when the Next.js 16 Turbopack compatibility is resolved.

4. **`next.config.ts` needs `serverExternalPackages`.** Both `@prisma/client` and `pg` must be listed in `serverExternalPackages` so Next.js does not attempt to bundle them, which would break Prisma's runtime module resolution under Turbopack.

## Global Constraints

- Stack: Next.js 16.2.9, Supabase (db + auth), Prisma 7.8.0, Vitest, TypeScript 5, Vercel.
- `.env` must never be committed; `.env*` is already in `.gitignore` — do not change this.
- `DATABASE_URL`: pooled Supabase connection (Supavisor, port 6543, pgbouncer=true param), used by the driver adapter at runtime.
- `DIRECT_URL`: non-pooled direct connection (port 5432), used by the Prisma CLI for migrations via `prisma.config.ts`.
- Both variables go in `.env` at the project root (not `.env.local`) — the Prisma CLI reads `.env` by default and Next.js does too.
- No auth flows, no UI in this slice.
- RSVP statuses are `IN` and `OUT` only. "Pending/not-yet-responded" is derived from a missing row — never stored.
- `recurringActivities` on Group: stored as `Json?`, not a first-class table. Deliberate tech debt.
- Smoke test runs against the real dev database. A dedicated test database is recommended before CI.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Create | All 7 models, 2 enums, relations, cascade rules, indexes |
| `prisma.config.ts` | Create | Prisma CLI config: points to `DIRECT_URL` for migrations |
| `src/lib/prisma.ts` | Create | PrismaClient singleton with PrismaPg driver adapter |
| `vitest.config.ts` | Create | Vitest config; loads `.env` before any test module imports |
| `src/lib/__tests__/prisma.smoke.test.ts` | Create | Smoke test: creates connected graph, asserts relations, asserts uniqueness, cleans up |
| `.env` | Create | Placeholder env vars; user replaces with real Supabase values |
| `next.config.ts` | Modify | Add `serverExternalPackages` for Prisma + Turbopack compatibility |
| `package.json` | Modify | Add `test` and `test:watch` scripts; packages installed via npm |

---

## Task 1: Install packages, protect secrets, create .env placeholder

**Files:**
- Modify: `package.json` (test scripts)
- Create: `.env`

**Interfaces:**
- Produces: `@prisma/client`, `@prisma/adapter-pg`, `pg`, `prisma`, `vitest`, `dotenv`, `tsx`, `@types/pg` available in `node_modules`

- [ ] **Step 1: Verify .gitignore covers .env**

  Run:
  ```bash
  grep "env" .gitignore
  ```
  Expected: a line matching `.env*`

  If missing, add `.env*` to `.gitignore` before any other step.

- [ ] **Step 2: Install runtime dependencies**

  Run:
  ```bash
  npm install @prisma/client @prisma/adapter-pg pg
  ```

- [ ] **Step 3: Install dev dependencies**

  Run:
  ```bash
  npm install -D prisma tsx dotenv @types/pg vitest
  ```

- [ ] **Step 4: Add test scripts to package.json**

  Open `package.json` and add `test` and `test:watch` to the `"scripts"` block:

  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
  ```

- [ ] **Step 5: Create .env with placeholder values**

  Create `.env` at the project root:

  ```
  # Supabase pooled connection (Supavisor transaction mode).
  # Used by PrismaClient at runtime via the PrismaPg driver adapter.
  # Get from: Supabase dashboard > Settings > Database > Connection string > Transaction
  # Format: postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
  DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true"

  # Supabase session pooler connection.
  # Used only by the Prisma CLI for running migrations (prisma migrate dev).
  # Use the session pooler (not the direct db.[ref].supabase.co host, which is IPv6-only
  # and will fail on IPv4-only networks). The session pooler host contains pooler.supabase.com.
  # Get from: Supabase dashboard > Settings > Database > Connection string > Session
  # Format: postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
  DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
  ```

- [ ] **Step 6: Verify Prisma CLI is available**

  Run: `npx prisma --version`
  Expected: version output containing `7.`

- [ ] **⛔ CHECKPOINT — stop here**

  Confirm that `.env` is not tracked by git:
  ```bash
  git status
  ```
  Expected: `.env` does NOT appear in the output.

  Then ask the user to open `.env` and replace both placeholder values with the real Supabase connection strings. They should open the file directly — do not ask them to paste the values in chat.

  **Do not run the migration (Task 5) until the user confirms .env is populated.** Tasks 2–4 only write files and do not connect to the database; they may proceed while the user is filling in the values.

---

## Task 2: Define the Prisma schema and CLI config

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma.config.ts`

**Interfaces:**
- Produces: 7 models (`User`, `ContactMethod`, `Group`, `Membership`, `Event`, `Venue`, `Rsvp`) and 2 enums (`ContactMethodType`, `RsvpStatus`) for all subsequent tasks

**Design decisions encoded in the schema:**
- IDs: `cuid()` — URL-safe, sortable, distributed-safe.
- `Rsvp.respondedAt`: uses `@updatedAt` (auto-set to `now()` on create, updated on every change — "last responded at").
- `Group.inviteToken`: `@default(cuid()) @unique`. Resetting it is done at the call site by passing a new `cuid()` in an update.
- `Group.founderId`: no explicit `onDelete` — defaults to `Restrict`, preventing deletion of a user who founded groups.
- `Venue.rsvps` → `onDelete: SetNull` — RSVP persists with no venue preference if a venue is deleted.
- Column names: Prisma camelCase defaults, no `@map` annotations. DB columns will be camelCase. Acceptable for a project queried entirely through Prisma.

- [ ] **Step 1: Create prisma/schema.prisma**

  Create `prisma/schema.prisma`:

  ```prisma
  // prisma-client-js is used instead of the Prisma 7 default (prisma-client) due to a
  // known module resolution issue with Next.js 16 + Turbopack. Migrate when fixed upstream.
  generator client {
    provider = "prisma-client-js"
  }

  datasource db {
    provider = "postgresql"
    // No url field: Prisma 7 reads the connection URL from prisma.config.ts, not here.
  }

  model User {
    id             String          @id @default(cuid())
    name           String
    supabaseAuthId String?         @unique
    createdAt      DateTime        @default(now())
    updatedAt      DateTime        @updatedAt
    contactMethods ContactMethod[]
    memberships    Membership[]
    rsvps          Rsvp[]
    foundedGroups  Group[]
  }

  model ContactMethod {
    id          String            @id @default(cuid())
    userId      String
    type        ContactMethodType
    value       String
    isVerified  Boolean           @default(false)
    isPreferred Boolean           @default(false)
    createdAt   DateTime          @default(now())
    updatedAt   DateTime          @updatedAt
    user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([userId])
  }

  enum ContactMethodType {
    EMAIL
  }

  model Group {
    id                  String       @id @default(cuid())
    name                String
    founderId           String
    inviteToken         String       @unique @default(cuid())
    recurringActivities Json?
    createdAt           DateTime     @default(now())
    updatedAt           DateTime     @updatedAt
    founder             User         @relation(fields: [founderId], references: [id])
    memberships         Membership[]
    events              Event[]
  }

  model Membership {
    id       String   @id @default(cuid())
    userId   String
    groupId  String
    joinedAt DateTime @default(now())
    user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    group    Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)

    @@unique([userId, groupId])
    @@index([groupId])
  }

  model Event {
    id            String    @id @default(cuid())
    groupId       String
    title         String
    startsAt      DateTime
    endsAt        DateTime?
    activityLabel String?
    createdAt     DateTime  @default(now())
    updatedAt     DateTime  @updatedAt
    group         Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
    venues        Venue[]
    rsvps         Rsvp[]

    @@index([groupId])
  }

  model Venue {
    id           String   @id @default(cuid())
    eventId      String
    name         String
    address      String?
    url          String?
    displayLabel String?
    createdAt    DateTime @default(now())
    updatedAt    DateTime @updatedAt
    event        Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
    rsvps        Rsvp[]

    @@index([eventId])
  }

  model Rsvp {
    id          String     @id @default(cuid())
    eventId     String
    userId      String
    status      RsvpStatus
    venueId     String?
    respondedAt DateTime   @updatedAt
    event       Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
    user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
    venue       Venue?     @relation(fields: [venueId], references: [id], onDelete: SetNull)

    @@unique([eventId, userId])
    @@index([userId])
  }

  enum RsvpStatus {
    IN
    OUT
  }
  ```

- [ ] **Step 2: Create prisma.config.ts at the project root**

  Create `prisma.config.ts`:

  ```ts
  import "dotenv/config"
  import { defineConfig, env } from "prisma/config"

  export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
      path: "prisma/migrations",
    },
    datasource: {
      // DIRECT_URL is the non-pooled direct connection used by the Prisma CLI.
      // The pooled DATABASE_URL is used at runtime via the driver adapter in src/lib/prisma.ts.
      url: env("DIRECT_URL"),
    },
  })
  ```

- [ ] **Step 3: Validate the schema syntax**

  Run: `npx prisma validate`
  Expected: `✔ The schema at prisma/schema.prisma is valid 🚀`

  Note: if `.env` still has placeholder values at this point, that is fine — `prisma validate` checks schema syntax only and does not connect to the database.

  If it fails, the error output will point to the line. Fix before proceeding.

---

## Task 3: Configure Next.js and create PrismaClient singleton

**Files:**
- Modify: `next.config.ts`
- Create: `src/lib/prisma.ts`

**Interfaces:**
- Consumes: `@prisma/client`, `@prisma/adapter-pg` (from Task 1)
- Produces: `prisma` singleton exported from `src/lib/prisma.ts`; Next.js build configured to not bundle Prisma

- [ ] **Step 1: Update next.config.ts**

  Replace the contents of `next.config.ts`:

  ```ts
  import type { NextConfig } from "next"

  const nextConfig: NextConfig = {
    // Prevents Next.js/Turbopack from bundling Prisma and pg, which would break
    // Prisma's runtime module resolution. These are loaded from node_modules at runtime.
    serverExternalPackages: ["@prisma/client", "pg"],
  }

  export default nextConfig
  ```

- [ ] **Step 2: Create src/lib/prisma.ts**

  Create `src/lib/prisma.ts`:

  ```ts
  import { PrismaClient } from "@prisma/client"
  import { PrismaPg } from "@prisma/adapter-pg"

  declare global {
    // eslint-disable-next-line no-var
    var prismaGlobal: PrismaClient | undefined
  }

  function createPrismaClient(): PrismaClient {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    return new PrismaClient({ adapter })
  }

  // Reuse the existing client across hot reloads in development to avoid exhausting
  // the Supabase connection pool (Supavisor has per-project connection limits).
  export const prisma = global.prismaGlobal ?? createPrismaClient()

  if (process.env.NODE_ENV !== "production") {
    global.prismaGlobal = prisma
  }
  ```

---

## Task 4: Configure Vitest

**Files:**
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: `dotenv` (from Task 1)
- Produces: `npm test` running in Node environment with `.env` variables loaded before any test module imports

- [ ] **Step 1: Create vitest.config.ts**

  Create `vitest.config.ts` at the project root:

  ```ts
  import { defineConfig } from "vitest/config"
  import { config } from "dotenv"

  // Load .env synchronously at config time so DATABASE_URL is in process.env
  // before any test file imports src/lib/prisma.ts (which reads it at module load).
  config()

  export default defineConfig({
    test: {
      environment: "node",
    },
  })
  ```

- [ ] **Step 2: Confirm vitest starts without errors**

  Run: `npm test`
  Expected: something like `No test files found` or `Test Files 0 passed`. No crashes, no import errors.

---

## Task 5: Run the first migration

> **Prerequisite:** The user must have confirmed that `.env` is populated with real Supabase connection strings before this task. Do not proceed until confirmed.

**Files:**
- Creates: `prisma/migrations/<timestamp>_init/migration.sql` (auto-generated by Prisma)

**Interfaces:**
- Consumes: `DIRECT_URL` from `.env` (read by `prisma.config.ts`)
- Produces: tables in the Supabase database; generated TypeScript types in `node_modules/.prisma/client`

- [ ] **Step 1: Run the migration**

  Run:
  ```bash
  npx prisma migrate dev --name init
  ```

  Expected output (abridged):
  ```
  Prisma schema loaded from prisma/schema.prisma
  Datasource "db": PostgreSQL database ...

  Applying migration `<timestamp>_init`

  The following migration(s) have been applied:

  migrations/
    └─ <timestamp>_init/
      └─ migration.sql

  ✔ Generated Prisma Client (v7.x.x)
  ```

  If the migration fails with a connection error: verify that `DIRECT_URL` in `.env` is the session pooler connection (port 5432, host containing `pooler.supabase.com`). The Supabase dashboard labels it "Session" under Settings > Database > Connection string. Do NOT use the "Direct" connection string — that host (`db.[ref].supabase.co`) is IPv6-only and will fail on IPv4-only networks.

  If it fails with a schema validation error: re-run `npx prisma validate` and fix the reported issue.

- [ ] **Step 2: Confirm the tables exist (read-only validation)**

  Run:
  ```bash
  npx prisma db pull --print 2>&1 | grep "model " | sort
  ```
  Expected: 7 lines, one per model:
  ```
  model ContactMethod {
  model Event {
  model Group {
  model Membership {
  model Rsvp {
  model User {
  model Venue {
  ```

- [ ] **Step 3: TypeScript check now that types are generated**

  Run: `npx tsc --noEmit`
  Expected: no errors

---

## Task 6: Write and run smoke test

**Files:**
- Create: `src/lib/__tests__/prisma.smoke.test.ts`

**Interfaces:**
- Consumes: `prisma` singleton from `../prisma`; `Prisma` namespace from `@prisma/client`
- Produces: 3 passing tests confirming the data layer works end-to-end

- [ ] **Step 1: Create src/lib/__tests__/prisma.smoke.test.ts**

  Create `src/lib/__tests__/prisma.smoke.test.ts`:

  ```ts
  import { describe, it, expect, afterAll } from "vitest"
  import { prisma } from "../prisma"

  describe("data layer smoke test", () => {
    let userId: string
    let groupId: string
    let eventId: string

    // Tests in this suite are sequentially dependent: each test uses IDs
    // set by prior tests. Vitest runs them in declaration order by default.
    // Do NOT reorder or mark them concurrent.

    afterAll(async () => {
      // Delete in cascade-safe order:
      //   event delete cascades → venues, rsvps
      //   group delete cascades → memberships
      //   user  delete cascades → contactMethods
      if (eventId) await prisma.event.delete({ where: { id: eventId } })
      if (groupId) await prisma.group.delete({ where: { id: groupId } })
      if (userId) await prisma.user.delete({ where: { id: userId } })
      await prisma.$disconnect()
    })

    it("creates a connected graph and reads relationships back", async () => {
      const user = await prisma.user.create({
        data: {
          name: "[TEST] Smoke User",
          contactMethods: {
            create: {
              type: "EMAIL",
              value: `smoke-${Date.now()}@test.invalid`,
              isPreferred: true,
            },
          },
        },
        include: { contactMethods: true },
      })
      userId = user.id

      expect(user.contactMethods).toHaveLength(1)
      expect(user.contactMethods[0].type).toBe("EMAIL")

      const group = await prisma.group.create({
        data: {
          name: "[TEST] Smoke Group",
          founderId: userId,
          memberships: { create: { userId } },
        },
        include: { memberships: true },
      })
      groupId = group.id

      expect(group.founderId).toBe(userId)
      expect(group.memberships).toHaveLength(1)
      expect(group.memberships[0].userId).toBe(userId)

      const event = await prisma.event.create({
        data: {
          groupId,
          title: "[TEST] Smoke Event",
          startsAt: new Date("2026-07-01T08:00:00Z"),
          venues: {
            create: { name: "[TEST] Smoke Venue", displayLabel: "Smoke" },
          },
        },
        include: { venues: true },
      })
      eventId = event.id
      const venueId = event.venues[0].id

      const rsvp = await prisma.rsvp.create({
        data: { eventId, userId, status: "IN", venueId },
      })

      expect(event.venues).toHaveLength(1)
      expect(rsvp.status).toBe("IN")
      expect(rsvp.venueId).toBe(venueId)
    })

    it("rejects a duplicate RSVP for the same user and event", async () => {
      // P2002 is Prisma's error code for unique constraint violations.
      await expect(
        prisma.rsvp.create({ data: { eventId, userId, status: "OUT" } })
      ).rejects.toMatchObject({ code: "P2002" })
    })

    it("rejects a duplicate membership for the same user and group", async () => {
      await expect(
        prisma.membership.create({ data: { userId, groupId } })
      ).rejects.toMatchObject({ code: "P2002" })
    })
  })
  ```

- [ ] **Step 2: Run the tests**

  Run: `npm test`

  Expected output:
  ```
  ✓ src/lib/__tests__/prisma.smoke.test.ts (3)
    ✓ data layer smoke test
      ✓ creates a connected graph and reads relationships back
      ✓ rejects a duplicate RSVP for the same user and event
      ✓ rejects a duplicate membership for the same user and group

  Test Files  1 passed (1)
  Tests       3 passed (3)
  ```

  If tests fail with a connection error: verify `DATABASE_URL` in `.env` is the pooled Supabase connection (port 6543, includes `?pgbouncer=true`).

  If the uniqueness tests fail with an unexpected error code: the IDs from test 1 were not set, meaning test 1 failed — fix the creation test first.

---

## Task 7: Commit

- [ ] **Step 1: Stage all new and modified files**

  ```bash
  git add prisma/ prisma.config.ts src/lib/prisma.ts "src/lib/__tests__/" vitest.config.ts next.config.ts package.json package-lock.json
  ```

- [ ] **Step 2: Verify nothing sensitive is staged**

  Run: `git diff --cached --name-only`
  Confirm `.env` does NOT appear in the list. If it does, run `git restore --staged .env` before committing.

- [ ] **Step 3: Commit**

  Run:
  ```bash
  git commit -m "$(cat <<'EOF'
  feat: add Prisma 7 data layer with seven-model schema

  Installs Prisma 7 against Supabase Postgres. Defines User, ContactMethod,
  Group, Membership, Event, Venue, and Rsvp — the full product schema per
  docs/build-notes.md §2. First migration creates all tables. Smoke test
  confirms the graph resolves and uniqueness constraints hold.

  Prisma 7 configuration differs from older versions in three ways: all DB
  connection URLs move from schema.prisma to prisma.config.ts; PrismaClient
  now requires a driver adapter (PrismaPg with the pooled DATABASE_URL); and
  next.config.ts needs serverExternalPackages to prevent Turbopack from
  bundling Prisma.

  Using prisma-client-js generator (deprecated in Prisma 7) rather than
  prisma-client due to a known Turbopack + Next.js 16 module resolution
  issue with the new provider. This is intentional tech debt.

  Tech debt (all flagged below for engineers):
  - prisma-client-js: migrate to prisma-client once Next.js 16 Turbopack
    module resolution is fixed upstream.
  - recurringActivities: stored as Json on Group, not a table. Promote if
    Orbit needs to query or notify per-activity.
  - Smoke test against dev DB: add a dedicated test database before CI.
  - Vercel deploy: add prisma generate to build step or postinstall script.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Technical debt register

| Item | Severity | When to address |
|---|---|---|
| `prisma-client-js` provider is deprecated in Prisma 7; using it to avoid a known Next.js 16 Turbopack module resolution issue with the new `prisma-client` provider | Low | When the upstream fix lands; migration is a one-line generator change + updated import paths |
| `recurringActivities` stored as `Json?` on `Group`, not a first-class table | Low | If Orbit needs to query, filter, or notify per-activity (fast-follow at earliest) |
| Smoke test runs against the real dev database — no isolation from live data, won't work safely in CI | Medium | Before enabling CI; create a separate Supabase project for tests (Supabase free tier supports multiple projects) |
| No `prisma generate` in the Vercel build step — a deploy without regenerating the client will break | High | Before first Vercel deploy; add to `package.json` as a `postinstall` script or update the Vercel build command |
