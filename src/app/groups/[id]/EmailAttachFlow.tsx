"use client"

// src/app/groups/[id]/EmailAttachFlow.tsx
//
// The "type an email, get a code, type the code back" mechanism, lifted out of
// EmailAskNote (task 5) so task 6's permanent row on the group info page runs
// through the exact same request/confirm/error handling rather than a second
// copy that could quietly drift from it. What moved here: the field state,
// the two service calls, and the error copy. What stays with each caller: the
// box the flow sits in, the message shown before the member starts typing, and
// what "back out" means (EmailAskNote's cancel answers Orbit's ask and counts
// against it; the info page's cancel just closes the row and counts nothing).
//
// Two things this file used to own now sit in src/lib/auth/email-code-flow.ts,
// because the invite screen and /signin grew the same code flow and were
// reaching into this route to get them: the bad-code sentence and the resend
// countdown. Look for them there, not here.
//
// The code-sent and done messages default to task 5's settled, tested copy,
// so lifting this code out cannot change what a member already sees there. A
// caller with no Orbit presence on screen can override both: "I sent a code
// to you" reads as Orbit speaking, and the group info page never says Orbit
// is the one talking.

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import {
  requestEmailAttachAction,
  confirmEmailAttachAction,
} from "@/app/actions/email-ask"
import type { AttachRequestResult } from "@/lib/auth/email"
import { DEFAULT_BAD_CODE_MESSAGE, useResendCountdown } from "@/lib/auth/email-code-flow"

/**
 * Where the email_taken message points. It lives here rather than in the copy
 * so both callers get it: the group home's note and the group info page's row,
 * which overrides every word of the error strings but not the structure around
 * them. A sentence telling somebody to sign in has to have a door behind it,
 * or it is worse than the wording it replaced.
 *
 * No return path on it, deliberately. Signing in changes who the viewer is,
 * and a link carrying "come back to this group afterwards" would be sending a
 * newly resolved identity at a group it may not be a member of, which lands on
 * the members-only wall. The front door already works out where a signed-in
 * person belongs, and /signin hands them to it.
 */
const SIGN_IN_HREF = "/signin"
const SIGN_IN_LABEL = "Sign in with that email"

/**
 * Exported so a caller reusing the default map (or writing its own) has the
 * exact key set to satisfy, and so a test can assert against it rather than
 * retyping every string.
 */
export const DEFAULT_REQUEST_ERROR: Record<Exclude<AttachRequestResult, "ok">, string> = {
  invalid_email: "That address doesn't look right. Mind checking it?",
  // Rewritten by the owner, 27 Aug 2026, and the reasoning is worth keeping
  // because the old wording read fine. Think about who actually reaches this
  // branch: overwhelmingly a member who attached their email, lost their
  // session, came back through the invite link as a second copy of themselves,
  // and is now typing their own real address. The old copy ("already saved to
  // someone here. Try another one.") told that person the address belonged to
  // somebody else and invited them to use a different one, which cements the
  // duplicate permanently and makes it signed-in-able. "Here" was also a claim
  // the code cannot back up: Supabase identities are project-global, not
  // per group. The sentence now points at signing in, and SIGN_IN_HREF below
  // is what keeps it from being a promise the product cannot keep.
  email_taken:
    "That email is already on an account. If it's yours, sign in with it instead of adding another.",
  rate_limited: "That was quick. You can ask for a new code once a minute.",
  service_error: "Something went wrong on my end. Give it another try in a bit.",
}

const DEFAULT_CODE_SENT_MESSAGE = (address: string) =>
  `I sent a code to ${address}. Enter it here and you're set.`

/** Exported so a caller reusing the default can assert against it rather than retyping it. */
export const DEFAULT_DONE_MESSAGE =
  "Thanks, that's saved. You can get back in with your email any time."

export interface EmailAttachFlowProps {
  /** Shown above the field while the member is still typing an address. */
  promptMessage: string
  /** Label for the way out that leaves without saving anything. */
  cancelLabel: string
  onCancel: () => void
  /**
   * Fired once, the moment the code is confirmed. The flow keeps rendering
   * its own done message after this; a caller that wants to collapse to a
   * quieter state (the info page's row does) acts on this callback rather
   * than waiting on a prop that cannot change without a full page reload.
   */
  onAttached?: () => void
  /**
   * Override the two lines that read as Orbit speaking in the first person.
   * Both default to task 5's settled copy; pass these only when the caller
   * has no Orbit presence on screen to attribute "I" to.
   */
  codeSentMessage?: (address: string) => string
  doneMessage?: string
  /**
   * Override the five error strings. Two are unambiguously Orbit's first
   * person ("on my end", the "Mind checking it?" aside); the other three
   * carry no pronoun but would read as an odd tonal mismatch if they were
   * the only Orbit-voiced lines left on a page that overrides everything
   * else. Same rule as codeSentMessage/doneMessage above: default to task
   * 5's settled copy, override only where there is no Orbit presence on
   * screen to attribute the voice to.
   */
  requestErrorMessages?: Record<Exclude<AttachRequestResult, "ok">, string>
  badCodeMessage?: string
  /**
   * Tighten the vertical rhythm: tighter leading on the message, less air
   * above the field, and the way out riding on the field's own row instead of
   * a row of its own.
   *
   * A prop rather than a redesign of the default, because only one of the two
   * callers is under vertical pressure. The group home's note is pinned in a
   * fixed region that the chat feed has to share, and an undecided member
   * keeps it there permanently; the group info page is an ordinary scrolling
   * page where none of that applies and where compressing the copy would buy
   * nothing. Off by default, so the info row renders exactly as it shipped.
   */
  compact?: boolean
}

export default function EmailAttachFlow({
  promptMessage,
  cancelLabel,
  onCancel,
  onAttached,
  codeSentMessage = DEFAULT_CODE_SENT_MESSAGE,
  doneMessage = DEFAULT_DONE_MESSAGE,
  requestErrorMessages = DEFAULT_REQUEST_ERROR,
  badCodeMessage = DEFAULT_BAD_CODE_MESSAGE,
  compact = false,
}: EmailAttachFlowProps) {
  const fieldId = useId()
  const [step, setStep] = useState<"email" | "code" | "done">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Rides alongside errorMsg rather than being derived from it, because the
  // caller may have replaced the copy with words of its own (the group info
  // page does replace all five), and matching on a string the caller controls
  // would be a route that silently disappears the day somebody rewords it.
  const [offerSignIn, setOfferSignIn] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { secondsLeft, start: startResendCountdown } = useResendCountdown()

  const address = email.trim()
  const typedCode = code.trim()

  function sendCode(target: string, { resending }: { resending: boolean }) {
    startTransition(async () => {
      setErrorMsg(null)
      setOfferSignIn(false)
      const { result } = await requestEmailAttachAction(target)
      if (result === "ok") {
        setStep("code")
        startResendCountdown()
        return
      }
      // A failed resend leaves the member on the code step: the first code may
      // still be sitting in their inbox and still work.
      if (!resending) setStep("email")
      setErrorMsg(requestErrorMessages[result])
      // The one refusal with somewhere else to go. Everything else is a thing
      // to fix in place.
      setOfferSignIn(result === "email_taken")
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return

    if (step === "email") {
      if (!address) return
      sendCode(address, { resending: false })
      return
    }

    if (!typedCode) return
    startTransition(async () => {
      setErrorMsg(null)
      const { result } = await confirmEmailAttachAction(address, typedCode)
      if (result === "ok") {
        setStep("done")
        onAttached?.()
        return
      }
      setErrorMsg(result === "bad_code" ? badCodeMessage : requestErrorMessages.service_error)
    })
  }

  const isCodeStep = step === "code"
  const value = isCodeStep ? code : email
  const hasValue = (isCodeStep ? typedCode : address).length > 0

  const message =
    step === "done" ? doneMessage : isCodeStep ? codeSentMessage(address) : promptMessage

  // The compact caller's copy runs to six lines at its longest, so leading is
  // the biggest single lever it has. Both values are the scale's own tokens;
  // there is nothing between them to reach for.
  const leading = compact ? "var(--leading-tight)" : "var(--leading-normal)"

  /**
   * The way out, plus the resend once a code is in the air. In compact they
   * ride on the field's own row; otherwise they keep the row below it that
   * they shipped with.
   */
  const secondaryControls = (
    <>
      {/* A quiet text link, never a button: soft declines everywhere, because
          honest tallies depend on socially comfortable exits. It stays
          available on the code step too, since a member who changes their mind
          halfway should not have to finish first. In compact it also takes the
          44px tap-target floor, which it can afford there because the row it
          now shares is already 40px tall. */}
      <button
        type="button"
        onClick={onCancel}
        style={{
          background: "none",
          border: "none",
          padding: compact ? "4px 6px" : "4px 2px",
          minHeight: compact ? 44 : undefined,
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        {cancelLabel}
      </button>

      {isCodeStep &&
        (secondsLeft > 0 ? (
          <p
            style={{
              margin: 0,
              color: "var(--text-faint)",
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
            }}
          >
            {`You can ask for a new code in ${secondsLeft} second${secondsLeft === 1 ? "" : "s"}.`}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => sendCode(address, { resending: true })}
            disabled={isPending}
            style={{
              background: "none",
              border: "none",
              padding: compact ? "4px 6px" : "4px 2px",
              minHeight: compact ? 44 : undefined,
              color: "var(--text-secondary)",
              fontSize: "var(--type-meta)",
              textDecoration: "underline",
              cursor: isPending ? "default" : "pointer",
            }}
          >
            Send a new code
          </button>
        ))}
    </>
  )

  return (
    <>
      <p
        style={{
          fontSize: "var(--type-meta)",
          lineHeight: leading,
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        {message}
      </p>

      {errorMsg && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: leading,
            color: "var(--danger)",
            margin: "6px 0 0",
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* The door behind the sentence above. A quiet link rather than a
          button: the member came here to add an email, and this is the
          product admitting they may already have done that, which is not a
          moment to compete with the screen's real action. 44px tall so it is
          a real tap target on a phone. */}
      {offerSignIn && (
        <p style={{ margin: "2px 0 0" }}>
          <Link
            href={SIGN_IN_HREF}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              color: "var(--text-secondary)",
              fontSize: "var(--type-meta)",
              lineHeight: leading,
              textDecoration: "underline",
            }}
          >
            {SIGN_IN_LABEL}
          </Link>
        </p>
      )}

      {step !== "done" && (
        <>
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              // Wraps rather than clips: at an enlarged device text size the
              // field and the button stack instead of squeezing.
              flexWrap: "wrap",
              marginTop: compact ? 4 : 8,
            }}
          >
            {/* The chat composer's pill shape, borrowed rather than invented. */}
            <div
              style={{
                flex: "1 1 11rem",
                display: "flex",
                alignItems: "center",
                minHeight: 40,
                backgroundColor: "var(--surface-base)",
                border: "1px solid var(--hairline)",
                borderRadius: 26,
                padding: "6px 14px",
              }}
            >
              <label htmlFor={fieldId} style={{ display: "none" }}>
                {isCodeStep ? "The code from your email" : "Your email address"}
              </label>
              <input
                id={fieldId}
                key={step}
                // type="text" rather than type="email", found by a test that
                // could not submit: the browser's own validation refuses to
                // fire submit at all for an address it dislikes, which puts a
                // second opinion in a second voice in front of the member and
                // never reaches the seam that actually decides. One arbiter,
                // and it is the normalized result from src/lib/auth/email.ts.
                // inputMode still brings up the right keyboard.
                type="text"
                // No maxLength and no length rule anywhere on this input. The
                // service sends eight digits today and the plan said six; the
                // auth seam's only length rule is that an empty string cannot
                // be a code, and this matches it.
                inputMode={isCodeStep ? "numeric" : "email"}
                autoComplete={isCodeStep ? "one-time-code" : "email"}
                placeholder={isCodeStep ? "Enter your code" : "you@example.com"}
                value={value}
                onChange={(e) => {
                  ;(isCodeStep ? setCode : setEmail)(e.target.value)
                  // The complaint is about what was typed, so it stops being
                  // true the moment they start fixing it. Leaving it under the
                  // field while they retype reads as the product still saying
                  // no to something they have already changed. The sign-in
                  // route goes with it: it was an answer to that address.
                  if (errorMsg) {
                    setErrorMsg(null)
                    setOfferSignIn(false)
                  }
                }}
                disabled={isPending}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 0,
                  backgroundColor: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  // --type-body (17px), not the --type-meta the note copy
                  // around it uses, and this one is not a style choice: iOS
                  // Safari and iOS Chrome zoom the whole page when a focused
                  // input computes under 16px, and nothing in layout.tsx
                  // suppresses that. At 15px, tapping this field zoomed the
                  // page while tapping the message composer 40px below it (17px)
                  // did not. Applies to both surfaces this flow renders on,
                  // because the info page's field had the same problem.
                  fontSize: "var(--type-body)",
                  outline: "none",
                  caretColor: "var(--text-primary)",
                }}
              />
            </div>

            {/* The send button's own two-state grammar, the one already
                shared by the chat and the wizard: quiet until there is
                something to send, teal the moment there is. */}
            <button
              type="submit"
              disabled={!hasValue || isPending}
              style={{
                minHeight: 40,
                padding: "0.5rem 1.125rem",
                borderRadius: 26,
                border: hasValue ? "1px solid var(--action)" : "1px solid var(--hairline)",
                backgroundColor: hasValue ? "var(--action)" : "var(--surface-base)",
                color: hasValue ? "var(--action-ink)" : "var(--text-faint)",
                fontSize: "var(--type-label)",
                fontWeight: 600,
                cursor: !hasValue || isPending ? "default" : "pointer",
              }}
            >
              Save
            </button>

            {/* In compact these ride here, on the field's own row, which is
                the single biggest height saving available without touching a
                word of the copy: it removes a whole row plus its margin. The
                row already wraps, so they drop below the field rather than
                squeezing it at an enlarged text size. */}
            {compact && secondaryControls}
          </form>

          {!compact && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 4,
              }}
            >
              {secondaryControls}
            </div>
          )}
        </>
      )}
    </>
  )
}
