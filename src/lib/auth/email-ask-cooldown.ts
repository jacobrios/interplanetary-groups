// src/lib/auth/email-ask-cooldown.ts
//
// The only place in the app that knows the email-ask cooldown cookie exists:
// its name, its format, how to read it, how to write it. Nothing outside this
// file should ever touch document.cookie for this purpose or assume anything
// about the string stored under EMAIL_ASK_SHOWN_COOKIE.
//
// Why a cookie and not a User column: the sheet is modal, and tapping outside
// it (the ordinary "not now" gesture) is deliberately free, it must not count
// toward emailAskCount. That leaves nothing server-side recording "we just
// showed this," so a member would meet the sheet again on every return to the
// group home, forever. A cookie is the device-local memory that fills the
// gap without turning a free dismissal into a counted one.
//
// The value is a forgeable, single-purpose timestamp: epoch milliseconds as a
// decimal string, nothing else, no JSON, no group id, no user id. A member
// editing or deleting this cookie can only ever silence, or un-silence, an
// optional nudge on their own device for at most a day. Nothing it protects
// is worth encoding, signing, or hiding.

import { ASK_COOLDOWN_MS } from "./email-offer"

export const EMAIL_ASK_SHOWN_COOKIE = "ipg_email_ask_shown"

/**
 * Client-only mount check: was the sheet shown recently enough that showing
 * it again right now would read as pestering? Presence-based, not
 * clock-based, and that is deliberate. The cookie's own max-age IS the
 * cooldown, so a cookie that still exists was necessarily written inside the
 * window; there is nothing left to compare. This keeps the client out of the
 * business of comparing timestamps, which it cannot do reliably anyway: the
 * value in the cookie carries the SERVER's clock (see markEmailAskShown),
 * while the client only ever has its own, and the two can disagree.
 *
 * Returns false when `document` is undefined, so this is safe to call from
 * code that also runs on the server (a `typeof` check rather than a direct
 * reference, since referencing an undeclared global by name would throw
 * before the check ever ran).
 *
 * The asymmetry with parseEmailAskShown below, named rather than left
 * implicit: that parser fails toward SHOWING on anything it cannot read
 * (see its own doc comment), because it looks at the value. This function
 * never looks at the value, only presence, so it cannot apply that same
 * repair. A cookie whose value is present but unparseable (hand-edited to
 * "" or "abc" or a negative number, never produced by markEmailAskShown
 * itself) reads as fresh here and reads as not-snoozed on the server, and
 * nothing then rewrites it to something valid, so the two disagree for as
 * long as that cookie exists. Not reachable from any path this product
 * writes; recorded because the failure direction is the opposite of the
 * parser's and a future change to either should not assume they match.
 */
export function emailAskCookieIsFresh(): boolean {
  if (typeof document === "undefined") return false
  return document.cookie
    .split("; ")
    .some((pair) => pair.startsWith(`${EMAIL_ASK_SHOWN_COOKIE}=`))
}

/**
 * Parses the cookie's raw value into the instant it was written, or null.
 * Pure: no cookie read here, so it can be tested against arbitrary strings
 * without a DOM.
 *
 * Every unreadable case (undefined, empty, non-numeric, NaN, a non-finite
 * number, or a value at or below zero) resolves to null, which means "not
 * snoozed," which means the sheet shows. That direction is deliberate: a
 * parser that failed the OTHER way, treating a corrupted or unrecognized
 * value as "recently shown," would silence the ask permanently on a
 * corrupted cookie, and nobody would ever see it happen or know to fix it.
 * Failing toward showing costs at most one redundant ask; failing toward
 * hiding costs it forever, silently.
 *
 * emailAskCookieIsFresh above does not share this repair, and cannot: it
 * never reads the value, so a present-but-unparseable cookie reads as fresh
 * there while this function reads it as null (not snoozed) here. See that
 * function's own doc comment for what that disagreement can produce.
 */
export function parseEmailAskShown(raw: string | undefined): Date | null {
  if (raw === undefined || raw === "") return null
  const ms = Number(raw)
  if (!Number.isFinite(ms) || ms <= 0) return null
  return new Date(ms)
}

/**
 * Client-only writer. Records that the sheet was just shown, so the mount
 * check above suppresses it for the next ASK_COOLDOWN_MS.
 *
 * `now` is passed in and never read here. Every other decision in this
 * codebase takes its clock as an argument for the usual reason (a pure
 * function a test can hold still), and there is a second, specific reason
 * for this one: the caller passes the SERVER's render clock, which the
 * component already receives as a prop, so the stored value never depends on
 * the device's own clock. A phone with a clock set wrong still gets a
 * cooldown measured against the server's idea of "now."
 *
 * max-age is derived from ASK_COOLDOWN_MS (imported from email-offer.ts,
 * never re-declared here as a second literal), and which of the two readers
 * treats it as authoritative depends on which reader it is, not on some
 * single answer for the cookie as a whole. The server never sees max-age at
 * all (a browser's Cookie header carries only name and value), so
 * parseEmailAskShown has nothing to consult but the timestamp, and that
 * timestamp, being the server's own render clock at write time, is what the
 * server-side comparison in emailAskIsSnoozed relies on. The client mount
 * check is the opposite: emailAskCookieIsFresh never reads the value, only
 * whether the cookie still exists, so for that reader max-age is the entire
 * mechanism, the browser's own enforcement of it is what makes presence mean
 * "written within the last day." max-age is a backstop that happens to
 * mirror the same window for the server reader, and the load-bearing
 * mechanism for the client one.
 *
 * A constant offset between the device's clock and the server's has no
 * effect on max-age, which the browser counts down as a duration from the
 * moment the cookie was received, not by comparing two clocks. What can move
 * it is a clock JUMP on the device after the cookie is already stored: jump
 * the device clock forward and the browser's countdown reads more time as
 * having elapsed than actually has, expiring the cookie early, so the sheet
 * shows again sooner than a full day (redundant, not silent); jump it
 * backward and elapsed time reads as smaller, so the cookie lingers past the
 * true window and the sheet is suppressed a little longer than intended.
 * Neither direction can make the ask disappear for good, because the
 * server-side check is keyed to the server's own clock via the stored
 * timestamp and is untouched by anything happening to the device's clock.
 *
 * Secure is set only when the page itself is served over https. This is
 * load-bearing, not polish: phone QA runs against the Mac's LAN address over
 * plain http (see `allowedDevOrigins` in next.config.ts), and an
 * unconditional Secure attribute means the browser silently refuses to store
 * the cookie there at all, so the fix would appear broken on the exact
 * device it is being tested on.
 */
export function markEmailAskShown(now: Date): void {
  const secure = location.protocol === "https:" ? "; Secure" : ""
  document.cookie =
    `${EMAIL_ASK_SHOWN_COOKIE}=${now.getTime()}` +
    `; path=/` +
    `; max-age=${ASK_COOLDOWN_MS / 1000}` +
    `; SameSite=Lax` +
    secure
}
