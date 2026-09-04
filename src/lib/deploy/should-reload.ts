// src/lib/deploy/should-reload.ts
//
// Whether an open tab should reload itself onto a newer deployment.
//
// A pure function with no browser in it, on purpose: DeployWatch.tsx owns the
// timer, the fetch and the storage, and this owns the decision, so the
// decision can be tested honestly rather than through a component that can
// only be poked at through fake timers and a mocked network.
//
// Every rule below returns a reason as well as a verdict. Nothing branches on
// the reason today; it exists so that a member's tab sitting stubbornly on an
// old build can be explained rather than guessed at, which is the exact
// failure this whole slice is repairing (a mechanism nobody could see).

/**
 * The most reloads one tab will ever perform, however many new deployments it
 * is told about.
 *
 * Rule 3 below already stops the common loop; this stops the one rule 3
 * cannot see, where the id genuinely changes every time because something
 * upstream is misconfigured. Reaching it is registered debt, not an error to
 * surface: a member who hits this cap is exactly where they were before this
 * slice existed, which is a screen that goes stale until they reload by hand.
 */
export const MAX_RELOADS_PER_TAB = 3

export interface ReloadInputs {
  /** The deployment that server-rendered this document, or null off Vercel. */
  bootedId: string | null
  /** What /api/deployment just said is live, or null if it could not be read. */
  currentId: string | null
  /** True while there is anything in the chat composer. */
  composerHasText: boolean
  /** True while at least one send has not settled. */
  sendInFlight: boolean
  /**
   * True while a modal or sheet is open over the screen.
   *
   * The most expensive thing a reload can destroy in this product, and the
   * reason "busy" cannot mean the chat composer alone: EmailAskNote is a
   * multi-step sheet holding a step, an address and a one-time code in React
   * state, and the moment a member comes back from their mail app with that
   * code is exactly the moment this check runs.
   */
  modalOpen: boolean
  /**
   * True while the caret is in a text input, a textarea, or a
   * contenteditable — anywhere on the screen, not only the chat composer.
   *
   * Catches the code field inside that sheet, and it also means an open
   * keyboard is treated as busy even before a single character is typed,
   * which is what the "protects the keyboard" claim below actually rests on.
   */
  focusInTextField: boolean
  /** The deployment id this tab has already reloaded FOR, from sessionStorage. */
  alreadyReloadedFor: string | null
  /** How many times this tab has reloaded itself, from sessionStorage. */
  reloadCount: number
}

/**
 * Why a tab is or is not reloading. A union rather than a bare string so a
 * typo in a call site or a test is a compile error rather than an assertion
 * that quietly compares two different spellings of the same idea.
 */
export type ReloadReason =
  /** No comparison is possible: not on Vercel, or the check did not answer. */
  | "detection-off"
  /** The tab is already running the live build. The ordinary case, every minute. */
  | "same-deployment"
  /** A newer build is live and it is safe to go there now. */
  | "new-deployment"
  /** Mid-message or mid-send. A wait, not a refusal: it clears by itself. */
  | "member-busy"
  /** A sheet or dialog is open over the screen. A wait, like member-busy. */
  | "modal-open"
  /** The caret is in some text field on the screen. A wait, like member-busy. */
  | "typing-elsewhere"
  /** This tab has already reloaded for this exact id. Permanent, per tab. */
  | "already-reloaded"
  /** This tab has spent its whole allowance. Permanent, per tab. */
  | "reload-cap-reached"

export interface ReloadDecision {
  reload: boolean
  reason: ReloadReason
}

/**
 * The whole decision, in the order the rules are checked.
 *
 * ORDERING NOTE, because the order is deliberate and reads as arbitrary
 * otherwise. Every non-reloading rule returns the same verdict, so ordering
 * changes only the REASON reported, never the behaviour. The permanent
 * refusals (rules 3 and 4) are checked before the transient wait (rule 2) so
 * that a tab which will never reload again is never described as "waiting for
 * the member to stop typing", which would send whoever is debugging it off
 * looking at the composer. It also puts the safety-critical guard where a
 * reader meets it first, and where no later condition can be added in front
 * of it by accident.
 */
export function decideReload({
  bootedId,
  currentId,
  composerHasText,
  sendInFlight,
  modalOpen,
  focusInTextField,
  alreadyReloadedFor,
  reloadCount,
}: ReloadInputs): ReloadDecision {
  // Rule 1. Either side missing, or the two agreeing, means there is nothing
  // to do. This is the branch that covers local development (no deployment id
  // exists at all), a failed fetch, and a malformed response, and it is why
  // every one of those has to arrive here as null rather than as anything
  // else: absent must mean "detection is off", never "something changed".
  if (bootedId === null || currentId === null) {
    return { reload: false, reason: "detection-off" }
  }
  if (bootedId === currentId) {
    return { reload: false, reason: "same-deployment" }
  }

  // Rule 3. THE critical guard. A reload that lands on a build still
  // reporting a different id would otherwise fire again on the next check,
  // and again, every minute, for the life of the tab — worse than the stale
  // screen this slice exists to fix, and unrecoverable from inside the app.
  // Keyed on the id we reloaded FOR rather than on a plain "have reloaded"
  // flag, so a tab that has already taken one deployment still takes the
  // next one.
  if (alreadyReloadedFor !== null && alreadyReloadedFor === currentId) {
    return { reload: false, reason: "already-reloaded" }
  }

  // Rule 4, and it is written as "anything that is not a real allowance left"
  // rather than as `>= MAX`, which is the correction this rule needed.
  //
  // The old form was `reloadCount >= MAX_RELOADS_PER_TAB`, with a comment
  // claiming `>=` meant "a corrupted or hand-edited count reads as spent
  // instead of wrapping past the guard". It did not. The count arrives as a
  // string out of sessionStorage, and two shapes walk straight past a `>=`:
  // a negative (-100 >= 3 is false, so the tab reloads and writes -99 back,
  // and every later check does the same — an unbounded loop bought with one
  // hand-edited value), and NaN, which fails every numeric comparison there
  // is. Both can only come from a corrupted or edited store, and both now
  // fail toward silence, which is the only safe direction here: a tab that
  // wrongly goes stale is where it was before this slice, and a tab that
  // wrongly reloads forever cannot be recovered from inside the app.
  if (!Number.isFinite(reloadCount) || reloadCount < 0 || reloadCount >= MAX_RELOADS_PER_TAB) {
    return { reload: false, reason: "reload-cap-reached" }
  }

  // Rule 2, and it is a WAIT rather than a refusal: nothing is recorded, so
  // the very next check after the member stops reloads them.
  //
  // WHAT IT PROTECTS, corrected 4 Sept 2026 after review, because the earlier
  // wording named things this function could not see. The chat draft itself
  // survives a reload either way (GroupHome parks it in sessionStorage). What
  // actually needs protecting is the rest of the screen's state, and the two
  // checks below cover only the chat composer, so the two above them exist:
  // an open sheet (EmailAskNote holds a step, an address and a one-time code
  // in React state that a reload destroys outright) and a caret sitting in
  // any text field (which is also what stands behind the "keyboard" claim,
  // since an open keyboard means focus, not necessarily text).
  //
  // KNOWN AND DELIBERATELY NOT COVERED, so the limit is honest: GaugeChips,
  // ProposalChips and GroupProposalChips each dispatch a server action that
  // this decision cannot see, so a reload can land mid-tap. Left alone
  // because the loss is small and self-correcting — the vote either reached
  // the server or it did not, and the reloaded screen shows which.
  if (modalOpen) {
    return { reload: false, reason: "modal-open" }
  }
  if (focusInTextField) {
    return { reload: false, reason: "typing-elsewhere" }
  }
  if (composerHasText || sendInFlight) {
    return { reload: false, reason: "member-busy" }
  }

  return { reload: true, reason: "new-deployment" }
}
