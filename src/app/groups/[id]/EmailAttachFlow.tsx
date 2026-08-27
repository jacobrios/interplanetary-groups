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
import type { AttachRequestResult, ConfirmAttachResult } from "@/lib/auth/email"

const REQUEST_ERROR: Record<Exclude<AttachRequestResult, "ok">, string> = {
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
const BAD_CODE_MESSAGE =
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
}

export default function EmailAttachFlow({
  promptMessage,
  cancelLabel,
  onCancel,
  onAttached,
  codeSentMessage = DEFAULT_CODE_SENT_MESSAGE,
  doneMessage = DEFAULT_DONE_MESSAGE,
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
      setErrorMsg(REQUEST_ERROR[result])
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
      setErrorMsg(result === "bad_code" ? BAD_CODE_MESSAGE : REQUEST_ERROR.service_error)
    })
  }

  const isCodeStep = step === "code"
  const value = isCodeStep ? code : email
  const hasValue = (isCodeStep ? typedCode : address).length > 0

  const message =
    step === "done" ? doneMessage : isCodeStep ? codeSentMessage(address) : promptMessage

  return (
    <>
      <p
        style={{
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
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
            lineHeight: "var(--leading-normal)",
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
              marginTop: 8,
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
                onChange={(e) => (isCodeStep ? setCode : setEmail)(e.target.value)}
                disabled={isPending}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 0,
                  backgroundColor: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: "var(--type-meta)",
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
          </form>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            {/* A quiet text link, never a button: soft declines everywhere,
                because honest tallies depend on socially comfortable exits.
                It stays available on the code step too, since a member who
                changes their mind halfway should not have to finish first. */}
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: "none",
                border: "none",
                padding: "4px 2px",
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
                    padding: "4px 2px",
                    color: "var(--text-secondary)",
                    fontSize: "var(--type-meta)",
                    textDecoration: "underline",
                    cursor: isPending ? "default" : "pointer",
                  }}
                >
                  Send a new code
                </button>
              ))}
          </div>
        </>
      )}
    </>
  )
}
