// src/lib/auth/email-code-flow.ts
//
// The pieces the three "type an email, get a code, type the code back" screens
// genuinely share: EmailAttachFlow (the group home's ask and the group info
// row), JoinSignIn (the invite screen), SignInPanel (/signin).
//
// Both of them are facts about the auth seam next door in email.ts that the
// member has to be told about, which is why they live beside the seam rather
// than inside whichever screen happened to be built first. That mattered
// practically as well as tidily: the bad-code sentence used to be exported out
// of EmailAttachFlow and imported by two other routes, so an isolated test run
// of the sign-in screens dragged a group route's server actions, and prisma
// behind them, into a render that never touches a database.
//
// What belongs in this file: something the seam's own behaviour forces on
// every screen running the code flow, of which there are now three.
//
// What deliberately does not, so this never becomes the drawer everything
// vaguely auth-shaped gets swept into. Each screen keeps its own error map,
// because the three are keyed off three different result unions on purpose,
// which is what turns a new result variant into a compile error at every call
// site instead of a member staring at a blank line. Each keeps its own JSX and
// its own copy. And each keeps its terminal state, which genuinely differs:
// attach stays on the page with a done message, the two sign-ins leave it.

import { useCallback, useEffect, useState } from "react"

/**
 * One message covering both, because the service returns the identical error
 * for a wrong code and an expired one and the auth seam collapses them into a
 * single bad_code result. Copy that said "that code expired" would be a lie the
 * code cannot back up.
 */
export const DEFAULT_BAD_CODE_MESSAGE =
  "That code didn't work. It might be typed wrong, or it might have expired. Ask for a new code and try again."

/**
 * The code field's placeholder, for every screen that draws the field.
 *
 * WHY IT NAMES THE COUNT INSTEAD OF INSTRUCTING. The eyebrow above the field
 * already says CODE and the sentence above that already says a code was sent,
 * so "enter your code" was the third telling. What a member actually does not
 * know is how much of it there is, and eight is an unusual length. A row of
 * digits would carry the count too, and would read as a value already in the
 * field; words cannot be mistaken for one.
 *
 * ONE STRING ON EVERY SURFACE, and the narrowest one sets the budget. The
 * mono treatment costs 20.64px a character (24px Geist Mono, 0.26em tracking),
 * and the tightest field is the group info page's inline row, where Save sits
 * BESIDE the field rather than under it: about 204px of input at a 390px
 * viewport, so nine characters is the ceiling. Every other surface is wider
 * and could afford more, which is exactly why the ceiling lives with the
 * string rather than with any one screen. Measured widths, at 375px: the sheet
 * about 307px, /signin and the invite screen 289px each.
 *
 * Moved here 28 Aug 2026, from EmailAttachFlow, when the two sign-in screens
 * stopped rendering a second string of their own.
 * EmailAttachFlow.test.tsx, SignInPanel.test.tsx and JoinSignIn.test.tsx each
 * hold the nine-character ceiling.
 */
export const CODE_PLACEHOLDER = "8 digits"

/**
 * The seam's rate limit has a sixty-second floor per user, so every resend
 * names the wait in plain words instead of letting somebody walk into an error.
 *
 * Deliberately not exported, and that is the whole reason this hook exists.
 * The number was written out in all three screens; reading Supabase's actual
 * rate-limit setting is an open recommendation, and that is exactly the change
 * that would otherwise have to land correctly in three places at once.
 */
const RESEND_WAIT_SECONDS = 60

/**
 * The resend wait, as state a screen can render.
 *
 * The countdown runs on chained timeouts rather than the clock, so a
 * backgrounded tab counts down slower than real time. Erring long is the safe
 * direction: the only cost is a few extra seconds before a code the member may
 * not need at all, whereas erring short walks them into the seam's refusal.
 *
 * No duration argument, which is a deliberate narrowing of the shape this was
 * asked for. There is one correct value, it is the seam's, and a parameter
 * would invite a caller to pass a different one, which is precisely the drift
 * being closed here. Give it an argument the day a caller has an honest reason
 * to disagree with the seam.
 */
export function useResendCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  // Stable across renders, so a caller can put it in a dependency array
  // without the countdown restarting itself.
  const start = useCallback(() => setSecondsLeft(RESEND_WAIT_SECONDS), [])

  return { secondsLeft, start }
}
