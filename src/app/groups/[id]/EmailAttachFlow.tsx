"use client"

// src/app/groups/[id]/EmailAttachFlow.tsx
//
// The "type an email, get a code, type the code back" mechanism, lifted out of
// EmailAskNote (task 5) so task 6's permanent row on the group info page runs
// through the exact same request/confirm/error handling rather than a second
// copy that could quietly drift from it. What moved here: the field state,
// the two service calls, the error copy, and the resend countdown. What stays
// with each caller: the box the flow sits in, the message shown before the
// member starts typing, and what "back out" means (EmailAskNote's cancel
// answers Orbit's ask and counts against it; the info page's cancel just
// closes the row and counts nothing).
//
// The code-sent and done messages default to task 5's settled, tested copy,
// so lifting this code out cannot change what a member already sees there. A
// caller with no Orbit presence on screen can override both: "I sent a code
// to you" reads as Orbit speaking, and the group info page never says Orbit
// is the one talking.

import { useEffect, useId, useState, useTransition } from "react"
import {
  requestEmailAttachAction,
  confirmEmailAttachAction,
} from "@/app/actions/email-ask"
import type { AttachRequestResult } from "@/lib/auth/email"

/**
 * Exported so a caller reusing the default map (or writing its own) has the
 * exact key set to satisfy, and so a test can assert against it rather than
 * retyping every string.
 */
export const DEFAULT_REQUEST_ERROR: Record<Exclude<AttachRequestResult, "ok">, string> = {
  invalid_email: "That address doesn't look right. Mind checking it?",
  email_taken: "That email is already saved to someone here. Try another one.",
  rate_limited: "That was quick. You can ask for a new code once a minute.",
  service_error: "Something went wrong on my end. Give it another try in a bit.",
}

/**
 * One message covering both, because the service returns the identical error
 * for a wrong code and an expired one and the auth seam collapses them into a
 * single bad_code result. Copy that said "that code expired" would be a lie the
 * code cannot back up.
 */
export const DEFAULT_BAD_CODE_MESSAGE =
  "That code didn't work. It might be typed wrong, or it might have expired. Ask for a new code and try again."

const DEFAULT_CODE_SENT_MESSAGE = (address: string) =>
  `I sent a code to ${address}. Enter it here and you're set.`

/** Exported so a caller reusing the default can assert against it rather than retyping it. */
export const DEFAULT_DONE_MESSAGE =
  "Thanks, that's saved. You can get back in with your email any time."

/**
 * The seam's rate limit has a sixty-second floor per user, so the resend names
 * the wait in plain words instead of letting the member walk into an error.
 * The countdown runs on chained timeouts rather than the clock, so a
 * backgrounded tab counts down slower than real time; erring long is the safe
 * direction here, since the only cost is a few extra seconds before a link the
 * member may not need at all.
 */
const RESEND_WAIT_SECONDS = 60

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
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  const address = email.trim()
  const typedCode = code.trim()

  function sendCode(target: string, { resending }: { resending: boolean }) {
    startTransition(async () => {
      setErrorMsg(null)
      const { result } = await requestEmailAttachAction(target)
      if (result === "ok") {
        setStep("code")
        setSecondsLeft(RESEND_WAIT_SECONDS)
        return
      }
      // A failed resend leaves the member on the code step: the first code may
      // still be sitting in their inbox and still work.
      if (!resending) setStep("email")
      setErrorMsg(requestErrorMessages[result])
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
                  // no to something they have already changed.
                  if (errorMsg) setErrorMsg(null)
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
