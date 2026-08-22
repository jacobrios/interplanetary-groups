# Pre-launch whole-codebase audit

**Run 22 Aug 2026, from `main` at `18acf40`. Branch `audit/pre-launch-codebase`.**
Item 5 of the pre-MVP triage order, registered in `docs/build-notes.md` §8
("Pre-launch whole-codebase audit," added 11 Aug 2026, triage round two follow-on).

---

## The charter

**Settled before the sweep, do not relitigate.** This is a read-only pass: nothing in
`src/`, `prisma/`, `scripts/`, `evals/`, or config is edited, and every finding becomes
its own decision afterwards rather than an in-audit fix. It exists as its own step because
per-slice review only ever sees a diff, and this is the one pass that reads the repo whole,
the way an engineer evaluating the work will. Seven lanes cover it, findings are verified
adversarially before they reach the owner, and everything found is written down while only
findings that can name a product consequence ask for the owner's attention.

**Not in this audit.** No fixes (each becomes its own decision, or its own micro-PR).
No eval-bench runs, `eval:detect` and `eval:onboarding` cost money and hit the network, and
their numbers are current in the record; a bench run becomes a post-audit decision if lane 3
finds a prompt disagreeing with the code. No dev server, no migrations, no seeds. No design
re-litigation: `docs/design/design-polish-rd-2/` remains the build source and recorded
decisions win over the walkthrough screens.

**How it is verified.** Test baseline recorded before anything: **92 files / 935 tests
green, 73.5s**, matching the finishing number of the polish-slice-three entry, with no
pre-existing failure to carry. `npm run db:which` printed the dev-test ref
(`pxbewardwvoyqqcvogel`) on all three sources before the suite ran, its only database touch.
Every finding is anchored to `file:line` and refuted by an independent verifier before it is
reported; `fix-now` findings face three verifiers with different lenses. A file-coverage
ledger names anything nobody opened.

**Debt this audit is expected to open.** A findings list is not a fix list: the audit's own
output is a queue the owner has to triage, and the register grows before it shrinks.

---

## The seven lanes

Ordered by what a finding in that lane costs, not by execution order.

1. **Can the product be wrong about who is in?** The counting and state machines: RSVP rows,
   gauge tallies, proposal consensus arithmetic, promotion paths, the hourly cron sweep,
   transaction boundaries, concurrent-write races. First because CLAUDE.md states RSVP
   accuracy is the entire value of the product.
2. **Can someone see or do what they shouldn't?** Every read and write path against the
   membership wall, invite-token lifecycle, the cron secret, id-guessing across group
   boundaries, whether an email can leave the server in any payload, what a removed
   member's stale tab can still fire.
3. **Does Orbit do what we have written down that it does?** The "where Orbit decides to
   speak or stay quiet" register checked against actual code, prompt prose versus code
   rules (the 29 July bug class), whether every consumer reads through `normalize.ts`, and
   every path that fails toward silence.
4. **Does the code still obey the product's own rules?** The invariant sweep in the shared
   brief. Structurally the thing per-slice review cannot do.
5. **Would the tests catch a regression?** 935 tests read for tests that cannot fail,
   reliance on ambient rows, and coverage holes measured against claimed behaviors.
6. **What breaks or costs money the day it is live?** Model-call failure handling,
   connection behavior under Vercel, unbounded and N+1 queries, `vercel.json`, build and
   env config, and the §11 pre-deploy checklist checked against the repo.
7. **What does an engineer think reading this cold?** Dead code, duplicated logic, the
   slice-specific QA-stage scripts, docs-versus-reality drift, README and AGENTS.md accuracy.

## Shape of the sweep

Prep (suppression list, invariant list, file ledger) → seven lane readers in parallel →
a second finder round on lanes 1, 2 and 3 told to find what round one missed, repeating
until a round returns nothing new → per-finding adversarial verification, three lenses for
anything rated `fix-now` → dedup against the suppression list → synthesis → a completeness
critic asking what was never read and which claim went unchecked.

Each lane writes its findings to `docs/audits/findings/` as it goes rather than at the end,
so a run that dies partway leaves its work behind.

---

## Findings

*Appended when the sweep completes.*
