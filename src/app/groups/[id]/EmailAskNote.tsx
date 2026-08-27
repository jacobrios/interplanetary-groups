"use client"

// src/app/groups/[id]/EmailAskNote.tsx
//
// Orbit asking for a way to remember this member, pinned just above the
// composer. It is the only part of the email slice most members will ever see.
//
// Why it is here at all: without an email, a member who loses their session
// taps the invite link again and joins as a SECOND person. The group holds two
// of them, their earlier answers belong to an identity nobody can reach, and
// every attendance count is quietly wrong, in the one product whose whole
// claim is accurate attendance.
//
// Placement is the owner's, settled 26 Aug 2026 from three options with the
// screen cost of each measured: just above the message composer, in the slot
// OrbitDownNote already uses. The recorded reservation is accepted with it, an
// undecided member has a slightly smaller chat for as long as they stay
// undecided, which is why this stays one line of copy plus the field.
//
// A NOTE, not a chat bubble. The bubble rule would allow one here, since the
// member's next action does answer Orbit, but a bubble only one viewer can see
// sitting at the bottom of a shared feed would read as a message everyone else
// can see. That is worse than the rule it satisfies, so this takes the labeled
// note treatment instead (the same grammar as OrbitNoteScreen).
//
// Nothing here is ever posted to the feed and nothing about it is stored except
// the answer: a dismissal advances the counter, an attach creates the contact
// method, and simply being shown writes nothing at all.

import { useEffect, useId, useState, useTransition } from "react"
import { shouldOfferEmail, type EmailAskState } from "@/lib/auth/email-offer"
import {
  dismissEmailOfferAction,
  requestEmailAttachAction,
  confirmEmailAttachAction,
} from "@/app/actions/email-ask"
import { OrbitMark } from "@/components/OrbitMark"

// The owner settled this copy over four rounds and overruled two objections on
// the record: that "log back in" is system language for someone who never
// knowingly made an account (logging in is universally understood), and that
// "lose access to this group" is inaccurate because a member keeps the invite
// link and loses their identity rather than their access (the two readings are
// the same thing from the member's side). Do not re-voice it.
const FIRST_ASK =
  "I haven't asked for a way to remember you. Add your email so you can log back in if necessary. This way you don't lose access to this group."

/** Appended to the first ask for the founder alone. */
const FOUNDER_EXTRA = "It also means you won't lose the group you started."

/**
 * The second and last ask. It points at the group name at the top of the
 * screen rather than naming a page, so it sends the member somewhere they can
 * already see. No expiry is named anywhere in this copy, deliberately: storage
 * does expire, but what applies to this app's setup was never verified, and a
 * number nobody can stand behind is worse than staying general.
 */
function secondAsk(groupName: string): string {
  return `You're still a temporary member. Without your email, you can't log back in if something happens. If now is not a good time, no worries. Just tap ${groupName} at the top of the screen whenever you're ready. I won't bother you like this again.`
}

const REQUEST_ERROR = {
  invalid_email: "That address doesn't look right. Mind checking it?",
  email_taken: "That email is already saved to someone here. Try another one.",
  rate_limited: "That was quick. You can ask for a new code once a minute.",
  service_error: "Something went wrong on my end. Give it another try in a bit.",
} as const

/**
 * One message covering both, because the service returns the identical error
 * for a wrong code and an expired one and the auth seam collapses them into a
 * single bad_code result. Copy that said "that code expired" would be a lie the
 * code cannot back up.
 */
const BAD_CODE_MESSAGE =
  "That code didn't work. It might be typed wrong, or it might have expired. Ask for a new code and try again."

const DONE_MESSAGE = "Thanks, that's saved. You can get back in with your email any time."

/**
 * The seam's rate limit has a sixty-second floor per user, so the resend names
 * the wait in plain words instead of letting the member walk into an error.
 * The countdown runs on chained timeouts rather than the clock, so a
 * backgrounded tab counts down slower than real time; erring long is the safe
 * direction here, since the only cost is a few extra seconds before a link the
 * member may not need at all.
 */
const RESEND_WAIT_SECONDS = 60

export interface EmailAskNoteProps {
  groupId: string
  groupName: string
  viewerIsFounder: boolean
  askState: EmailAskState
  latestContributionAt: Date | null
  hasVerifiedEmail: boolean
  /** Injected rather than read here, so a test's outcome never depends on the clock. */
  now: Date
}

export default function EmailAskNote({
  groupId,
  groupName,
  viewerIsFounder,
  askState,
  latestContributionAt,
  hasVerifiedEmail,
  now,
}: EmailAskNoteProps) {
  const fieldId = useId()
  const [step, setStep] = useState<"email" | "code" | "done">("email")
  const [answered, setAnswered] = useState(false)
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

  // The gate lives in the component rather than in the page, because this repo
  // can test a component and cannot test a server-rendered screen. The page
  // gathers the facts; the one decision about whether a member is asked is made
  // here, where a test can hold it to it.
  const offer = shouldOfferEmail({ user: askState, latestContributionAt, hasVerifiedEmail, now })

  if (answered || offer === null) return null

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
        return
      }
      setErrorMsg(result === "bad_code" ? BAD_CODE_MESSAGE : REQUEST_ERROR.service_error)
    })
  }

  function handleDismiss() {
    // Off the screen either way. The member said no; refusing to go away
    // because a write failed would be the worst possible reading of that.
    setAnswered(true)
    startTransition(async () => {
      await dismissEmailOfferAction()
    })
  }

  const isCodeStep = step === "code"
  const value = isCodeStep ? code : email
  const hasValue = (isCodeStep ? typedCode : address).length > 0
  const dismissLabel = offer === "first" ? "Not now" : "No thanks"

  const message =
    step === "done"
      ? DONE_MESSAGE
      : isCodeStep
        ? `I sent a code to ${address}. Enter it here and you're set.`
        : offer === "first"
          ? viewerIsFounder
            ? `${FIRST_ASK} ${FOUNDER_EXTRA}`
            : FIRST_ASK
          : secondAsk(groupName)

  return (
    <div style={{ padding: "0 16px 4px", flexShrink: 0 }} data-group-id={groupId}>
      {/* The labeled-note treatment, ported from OrbitNoteScreen: the mark sits
          in the padding inset so the copy runs full width beside it rather than
          stacked under it. No eyebrow here, unlike that screen: this note sits
          under a feed the member has been reading Orbit in all along, and a
          "A NOTE FROM ORBIT" band would cost a line to say what the mark
          already says. */}
      <div
        style={{
          position: "relative",
          border: "1px solid var(--hairline)",
          borderRadius: 12,
          padding: "10px 12px 10px 44px",
          backgroundColor: "var(--surface-raised)",
        }}
      >
        <div style={{ position: "absolute", left: 10, top: 10 }}>
          <OrbitMark size={26} label={null} />
        </div>

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
              {/* The chat composer's pill shape, borrowed rather than invented,
                  with one inversion: the fill is --surface-base here because the
                  note around it is already --surface-raised, and a raised pill
                  on a raised note would have no edge at all. */}
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
                  something to send, teal the moment there is. Teal is on this
                  and nothing else here, because saving is the only action on
                  this note that genuinely matters. */}
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
                onClick={handleDismiss}
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
                {dismissLabel}
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
      </div>
    </div>
  )
}
