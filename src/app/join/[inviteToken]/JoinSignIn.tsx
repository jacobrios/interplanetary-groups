"use client"

// src/app/join/[inviteToken]/JoinSignIn.tsx
//
// The second path on the invite screen: "I've been here before". It is the
// whole reason this slice exists. Without it, a member who cleared their
// cookies or moved from phone to laptop taps the link they still have, gets
// made into a brand new person, and every count in the one product whose
// claim is accurate attendance quietly stops being true, with no error
// anywhere. This asks whether they have been here before while there is still
// time to answer, which is before any account is created.
//
// It is deliberately NOT the default. Most taps really are new people and this
// screen is the product's activation point, so "I'm new here" stays one step
// and the common case pays nothing for the rare one.
//
// Why this is not EmailAttachFlow, which looks like the same two steps: that
// component is bound to the attach pair (requestEmailAttach / confirmEmailAttach)
// and to AttachRequestResult, and its error map is deliberately keyed off that
// union so a new variant is a compile error at every call site. Sign-in is a
// different pair with a non-overlapping union (it has unknown_email and no
// email_taken), and it ends by leaving the page rather than in the "done"
// message that is EmailAttachFlow's terminal state. Bending it to cover both
// would mean injecting the two service calls, making the error map generic,
// and replacing the done state with an escape hatch: four new seams on a
// component with two working callers, to save a field-state hook. The one
// thing genuinely shared IS shared, out of src/lib/auth/email-code-flow.ts:
// the sentence about a code that did not work, which must never drift into
// claiming it expired, and the resend countdown.

import { useId, useState, useTransition } from "react"
import {
  requestJoinSignInCodeAction,
  confirmJoinSignInAction,
  type ConfirmJoinSignInResult,
} from "@/app/actions/join-signin"
import type { SignInRequestResult } from "@/lib/auth/email"
import { DEFAULT_BAD_CODE_MESSAGE, useResendCountdown } from "@/lib/auth/email-code-flow"
import { inputStyle, buttonStyle } from "@/components/pill-controls"
import { visuallyHiddenStyle } from "@/components/visually-hidden"

const PROMPT_MESSAGE = "Welcome back. What's the email you saved with me? I'll send you a code."
const CODE_SENT_MESSAGE = (address: string) =>
  `I sent a code to ${address}. Enter it here and I'll get you in.`

/**
 * Keyed off the seam's own union, so a result variant added later is a compile
 * error here rather than a member staring at a blank line.
 *
 * unknown_email is answered plainly rather than vaguely. A typo answered with
 * "check your inbox" leaves somebody waiting forever for mail that is never
 * coming, and knowing whether an address is on an account buys an attacker
 * nothing without the inbox. The soft way out is named in the same breath, so
 * nobody who is genuinely new is left at a dead end.
 */
const REQUEST_ERROR: Record<Exclude<SignInRequestResult, "ok">, string> = {
  invalid_email: "That address doesn't look right. Mind checking it?",
  unknown_email:
    "I don't have an account with that email. Check it, or head back and join as someone new.",
  rate_limited: "That was quick. You can ask for a new code once a minute.",
  service_error: "Something went wrong on my end. Give it another try in a bit.",
}

const CONFIRM_ERROR: Record<ConfirmJoinSignInResult, string> = {
  // Shared rather than retyped. The service returns the identical error for a
  // wrong code and an expired one, so one message has to cover both, and copy
  // naming expiry alone would be a lie the code cannot back up. That rule is
  // easy to break by accident in a fresh copy of the sentence, so there is one.
  bad_code: DEFAULT_BAD_CODE_MESSAGE,
  no_user:
    "I couldn't find your account. Head back and join as someone new and I'll get you set up.",
  service_error: "Something went wrong on my end. Give it another try in a bit.",
  // Worth its own line rather than folding into service_error: they ARE signed
  // back in as themselves at this point, and only getting them into this group
  // failed, so trying again costs them nothing and usually works.
  join_failed: "Something went wrong getting you into the group. Give it another try in a bit.",
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
// this choice wrong has to stay cheap to undo. 44px is the tap-target floor
// the card-region-height slice set.
//
// Deliberately no alignSelf, unlike the same kind of link on the group info
// page, and the difference is the parent rather than a preference. That one
// sits in a flex COLUMN, where the default stretch would run a bare button
// across the full width and centre its text, so it has to opt out. These two
// sit in the row at the bottom of this panel, which already sets alignItems
// "center". Nothing there can stretch, so an alignSelf would not be doing the
// job that comment claimed; it would be overriding the row's own centring and
// top-aligning the link against the countdown sentence beside it, which is a
// visible inconsistency bought for nothing.
const linkStyle = {
  background: "none",
  border: "none",
  padding: "4px 2px",
  minHeight: 44,
  color: "var(--text-secondary)",
  fontSize: "var(--type-meta)",
  textDecoration: "underline",
  cursor: "pointer",
} as const

interface Props {
  inviteToken: string
  /** Back to "I'm new here", which is the join form this panel replaced. */
  onCancel: () => void
}

export default function JoinSignIn({ inviteToken, onCancel }: Props) {
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
      const { result } = await requestJoinSignInCodeAction(target)
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
      // There is no success branch to write, and this guard is what makes that
      // true rather than a crash. On success the action redirects into the
      // group, and a redirecting server action resolves its promise with no
      // value at all for a direct caller, so the only thing that ever comes
      // back here is a reason it did not. Destructuring unguarded throws a
      // TypeError on the one path this whole slice exists for; the same guard
      // is why LeaveGroupButton, the codebase's only other client caller of a
      // redirecting action, reads its result optionally.
      const outcome = await confirmJoinSignInAction(address, typedCode, inviteToken)
      if (!outcome) return
      setErrorMsg(CONFIRM_ERROR[outcome.result])
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
          {/* The design shows no visible label on this screen, only
              placeholder text, and a placeholder is not an accessible name. */}
          <label htmlFor={fieldId} style={visuallyHiddenStyle}>
            {isCodeStep ? "The code from your email" : "Your email address"}
          </label>
          <input
            id={fieldId}
            key={step}
            // type="text" rather than type="email", the same call the attach
            // flow made and for the same reason: the browser's own validation
            // refuses to fire submit at all for an address it dislikes, which
            // puts a second opinion in a second voice in front of the member
            // and never reaches the seam that actually decides. One arbiter,
            // and it is the normalized result from src/lib/auth/email.ts.
            // inputMode still brings up the right keyboard.
            type="text"
            // No maxLength and no length rule anywhere on this input. The
            // service sends eight digits today and the plan said six; the auth
            // seam's only length rule is that an empty string cannot be a code.
            inputMode={isCodeStep ? "numeric" : "email"}
            autoComplete={isCodeStep ? "one-time-code" : "email"}
            placeholder={isCodeStep ? "Enter your code" : "you@example.com"}
            value={value}
            onChange={(e) => {
              ;(isCodeStep ? setCode : setEmail)(e.target.value)
              // The complaint is about what was typed, so it stops being true
              // the moment they start fixing it.
              if (errorMsg) setErrorMsg(null)
            }}
            disabled={isPending}
            style={inputStyle}
          />
        </div>

        {/* The screen's one teal action while this panel is open, because the
            join button is not on screen at all: teal is a weight, and nothing
            here competes with it. */}
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
        {/* Stays available on the code step too: somebody who realises halfway
            through that they are actually new should not have to finish
            signing in first. */}
        <button type="button" onClick={onCancel} style={linkStyle}>
          I&apos;m new here
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
              style={{ ...linkStyle, cursor: isPending ? "default" : "pointer" }}
            >
              Send a new code
            </button>
          ))}
      </div>
    </div>
  )
}
