"use client"

// src/app/signin/SignInPanel.tsx
//
// The /signin form: email, then code. The way back in for a member who no
// longer has an invite link to hand, and the door the attach flow's "that
// email is already on an account" message points at.
//
// Why this is neither EmailAttachFlow nor JoinSignIn, both of which look like
// the same two steps:
//
// EmailAttachFlow is bound to the attach pair (requestEmailAttach /
// confirmEmailAttach) and its error map is deliberately keyed off
// AttachRequestResult so a new variant is a compile error at every call site.
// Sign-in is a different pair with a non-overlapping union (it has
// unknown_email and no email_taken) and it ends by leaving the page rather
// than in the "done" message that is EmailAttachFlow's terminal state. That
// reasoning is task 7's and it applies here unchanged.
//
// JoinSignIn is the same two steps for the same purpose, but it takes an
// invite token, calls a different server action that joins a group on the way
// through, and its way out is "I'm new here" back to a form that is not on
// this screen. What the three genuinely share IS shared: the control shapes
// (src/components/pill-controls.ts), and out of src/lib/auth/email-code-flow.ts
// the sentence about a code that did not work, which must never drift into
// claiming it expired, plus the resend countdown. That countdown was a third
// copy of about fifteen lines until the consolidation pass; it is one hook now,
// so reading the seam's real rate-limit setting is one change rather than
// three that have to agree.

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import {
  requestSignInCodeAction,
  confirmSignInAction,
  type ConfirmSignInActionResult,
} from "@/app/actions/signin"
import type { SignInRequestResult } from "@/lib/auth/email"
import {
  CODE_PLACEHOLDER,
  DEFAULT_BAD_CODE_MESSAGE,
  useResendCountdown,
} from "@/lib/auth/email-code-flow"
import { inputStyle, codeInputStyle, buttonStyle } from "@/components/pill-controls"
import { visuallyHiddenStyle } from "@/components/visually-hidden"

// "Welcome back" is the screen's own heading, so this does not say it again.
const PROMPT_MESSAGE = "What's the email you saved with me? I'll send you a code."
const CODE_SENT_MESSAGE = (address: string) =>
  `I sent a code to ${address}. Enter it here and I'll get you in.`

/** Back to wherever this person belongs: the front door works that out. */
const WAY_OUT_LABEL = "Never mind, take me back"

/**
 * Keyed off the seam's own union, so a result variant added later is a compile
 * error here rather than a person staring at a blank line.
 *
 * unknown_email is answered plainly rather than vaguely. A typo answered with
 * "check your inbox" leaves somebody waiting forever for mail that is never
 * coming, and knowing whether an address is on an account buys an attacker
 * nothing without the inbox. The way onward is named in the same breath, and
 * on this screen that is the invite link rather than "join as someone new":
 * there is no group in front of this person to join.
 */
const REQUEST_ERROR: Record<Exclude<SignInRequestResult, "ok">, string> = {
  invalid_email: "That address doesn't look right. Mind checking it?",
  unknown_email:
    "I don't have an account with that email. Give it another look, or open the invite link your group sent you.",
  rate_limited: "That was quick. You can ask for a new code once a minute.",
  service_error: "Something went wrong on my end. Give it another try in a bit.",
}

const CONFIRM_ERROR: Record<ConfirmSignInActionResult, string> = {
  // Shared rather than retyped. The service returns the identical error for a
  // wrong code and an expired one, so one message has to cover both, and copy
  // naming expiry alone would be a lie the code cannot back up.
  bad_code: DEFAULT_BAD_CODE_MESSAGE,
  no_user:
    "I couldn't find your account. Open the invite link your group sent you and I'll get you set up.",
  service_error: "Something went wrong on my end. Give it another try in a bit.",
}

const messageStyle = {
  margin: 0,
  fontSize: "var(--type-meta)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-secondary)",
} as const

const errorStyle = {
  margin: "8px 0 0",
  fontSize: "var(--type-meta)",
  lineHeight: "var(--leading-normal)",
  color: "var(--danger)",
} as const

// A quiet text link, never a button: soft declines everywhere, because getting
// this choice wrong has to stay cheap to undo. alignSelf keeps it from
// stretching across the flex column, the same thing every other bare control
// in this codebase has to set.
const linkStyle = {
  background: "none",
  border: "none",
  padding: "4px 2px",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  color: "var(--text-secondary)",
  fontSize: "var(--type-meta)",
  textDecoration: "underline",
  cursor: "pointer",
} as const

export default function SignInPanel() {
  const fieldId = useId()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { secondsLeft, start: startResendCountdown } = useResendCountdown()

  const address = email.trim()
  const typedCode = code.trim()
  const isCodeStep = step === "code"

  function sendCode(target: string, { resending }: { resending: boolean }) {
    startTransition(async () => {
      setErrorMsg(null)
      const { result } = await requestSignInCodeAction(target)
      if (result === "ok") {
        setStep("code")
        startResendCountdown()
        return
      }
      // A failed resend leaves them on the code step: the first code may still
      // be sitting in their inbox and still work.
      if (!resending) setStep("email")
      setErrorMsg(REQUEST_ERROR[result])
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return

    if (!isCodeStep) {
      if (!address) return
      sendCode(address, { resending: false })
      return
    }

    if (!typedCode) return
    startTransition(async () => {
      setErrorMsg(null)
      // There is no success branch to write. On success this action redirects
      // to the front door, so the only thing that ever comes back is a reason
      // it did not.
      const { result } = await confirmSignInAction(address, typedCode)
      setErrorMsg(CONFIRM_ERROR[result])
    })
  }

  const value = isCodeStep ? code : email
  const hasValue = (isCodeStep ? typedCode : address).length > 0

  const submitLabel = isCodeStep
    ? isPending
      ? "Signing you in…"
      : "Sign me in"
    : isPending
      ? "Sending…"
      : "Send me a code"

  return (
    <div style={{ marginTop: "22px", display: "flex", flexDirection: "column" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" }}>
        <p style={messageStyle}>{isCodeStep ? CODE_SENT_MESSAGE(address) : PROMPT_MESSAGE}</p>

        {errorMsg && <p style={errorStyle}>{errorMsg}</p>}

        <div style={{ marginTop: "12px" }}>
          {/* No visible label, matching the join screen this borrows its
              control shapes from, and a placeholder is not an accessible
              name. */}
          <label htmlFor={fieldId} style={visuallyHiddenStyle}>
            {isCodeStep ? "The code from your email" : "Your email address"}
          </label>
          <input
            id={fieldId}
            key={step}
            // type="text" rather than type="email", the same call both sibling
            // flows made and for the same reason: the browser's own validation
            // refuses to fire submit at all for an address it dislikes, which
            // puts a second opinion in a second voice in front of the person
            // and never reaches the seam that actually decides. One arbiter,
            // and it is the normalized result from src/lib/auth/email.ts.
            // inputMode still brings up the right keyboard.
            type="text"
            // No maxLength and no length rule anywhere on this input. The
            // service sends eight digits today and the plan said six; the auth
            // seam's only length rule is that an empty string cannot be a code.
            inputMode={isCodeStep ? "numeric" : "email"}
            autoComplete={isCodeStep ? "one-time-code" : "email"}
            // The shared string, imported rather than retyped. It names the
            // code's length instead of instructing, because the sentence above
            // has already said a code was sent; the reasoning and the character
            // budget live with the constant.
            placeholder={isCodeStep ? CODE_PLACEHOLDER : "you@example.com"}
            value={value}
            onChange={(e) => {
              ;(isCodeStep ? setCode : setEmail)(e.target.value)
              // The complaint is about what was typed, so it stops being true
              // the moment they start fixing it.
              if (errorMsg) setErrorMsg(null)
            }}
            disabled={isPending}
            // The code step is deliberately not the email step. Round 10 drew
            // the code field with its own mono treatment; EmailAttachFlow got
            // it and this screen did not, so the same eight digits read three
            // different ways depending on which door somebody came through.
            // One shared source now, in pill-controls.
            style={isCodeStep ? codeInputStyle : inputStyle}
          />
        </div>

        {/* The screen's one teal action: signing in is the only thing anybody
            came here to do, and the way out below is a quiet link. */}
        <button type="submit" disabled={!hasValue || isPending} style={buttonStyle(isPending)}>
          {submitLabel}
        </button>
      </form>

      {/* Wraps rather than squeezing: at an enlarged device text size the way
          out and the resend stack instead of sharing a cramped row. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 4,
        }}
      >
        {/* Points at the front door rather than at history, so it is right for
            somebody who arrived here from a link in the attach flow as well as
            for somebody who typed the address. A signed-in person is routed on
            to their group from there; a signed-out one gets the pitch. Stays
            available on the code step too: somebody who changes their mind
            halfway should not have to finish signing in first. */}
        <Link href="/" style={linkStyle}>
          {WAY_OUT_LABEL}
        </Link>

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
              style={{ ...linkStyle, cursor: isPending ? "default" : "pointer" }}
            >
              Send a new code
            </button>
          ))}
      </div>
    </div>
  )
}
