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
//
// TWO SHAPES, ONE MECHANISM (27 Aug 2026, sheet redesign). `variant` picks
// between the inline row the group info page renders and the stacked column
// the group home's sheet renders. It replaced the old `compact` boolean rather
// than joining it: compact existed only to squeeze the pinned inline note into
// a region the chat feed had to share, and the sheet retired that note, so the
// pressure it answered no longer exists anywhere.

import { useId, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import {
  requestEmailAttachAction,
  confirmEmailAttachAction,
} from "@/app/actions/email-ask"
import type { AttachRequestResult, ConfirmAttachResult } from "@/lib/auth/email"
import {
  CODE_PLACEHOLDER,
  DEFAULT_BAD_CODE_MESSAGE,
  useResendCountdown,
} from "@/lib/auth/email-code-flow"
import { codeFieldTextStyle } from "@/components/pill-controls"

/**
 * Where the email_taken message points. It lives here rather than in the copy
 * so both callers get it: the group home's sheet and the group info page's row,
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
 * The promise about the address, added 27 Aug 2026 with the sheet redesign.
 *
 * It lives in the shared flow rather than in the sheet because it is about the
 * address rather than about the surface, and it is equally true on the group
 * info page. Round 11's own draft spoke in Orbit's first person ("I use it to
 * sign you in..."); the owner settled these words instead, and they are the
 * ones that ship, partly because this line now also renders on a page where
 * Orbit is not the speaker.
 *
 * MEASURED, and the measurement is the reason for the alignment. At 15px in
 * Geist the line is 331px against the 352px available inside the sheet's
 * padding, so it fits one line with 21px spare. Centred and short are one
 * decision: a centred line that wraps reads worse than a left-aligned one, so
 * lengthening this copy means giving up the centring too. At accessibility
 * text sizes it will wrap, which is correct and expected; do not fight that
 * with truncation or a smaller size, because 15px is already one step above
 * the product's 13px floor and this is a promise, not fine print.
 *
 * Deliberately NOT exported. Two tests on this branch import a copy constant
 * and compare it against itself, which cannot catch a copy change; the guards
 * on this sentence are hardcoded literals in EmailAttachFlow.test.tsx and
 * EmailAskNote.test.tsx, and keeping this unexported removes the temptation to
 * "tidy" them into imports and delete the only real protection.
 */
const ASSURANCE = "For sign-in and reminders. Never shared or sold."

/*
 * CODE_PLACEHOLDER moved to src/lib/auth/email-code-flow.ts on 28 Aug 2026,
 * with its whole rationale, when the two sign-in screens stopped rendering a
 * second string of their own. The one thing that must not get lost in the
 * move: THIS surface, the inline row on the group info page, is the narrow
 * field that sets the nine-character ceiling, because Save sits beside it
 * rather than under it. That measurement is written out beside the constant.
 *
 * Nobody drew the empty state. Round 10's frame E draws the code field filled
 * only ("48261" plus a caret), so this is our own call rather than a departure
 * from a source.
 */

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
  // Shortened again 27 Aug 2026, after the owner met this branch on a real
  // phone: "I missed the sign-in with that email link and didn't click it. I
  // could see that being easy to miss." The sentence carried the instruction
  // AND the control underneath repeated it, so the control read as an echo of
  // prose rather than as the thing to tap, sitting quiet and grey under a long
  // red block. The error states the fact; SIGN_IN_LABEL below carries the
  // instruction, as a control rather than as a sentence. The 27 Aug rewrite's
  // whole intent, to point this person at signing in instead of at typing a
  // different address, is unchanged and is now carried by something tappable.
  email_taken: "That email is already on an account.",
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
   * Fired once, the moment the code is confirmed, carrying the address that
   * was just saved. The flow keeps rendering its own done message after this;
   * a caller that wants to collapse to a quieter state (the info page's row
   * does) acts on this callback rather than waiting on a prop that cannot
   * change without a full page reload.
   *
   * The address is handed over for the same reason: the info page's row now
   * shows it, and after a change the server prop it was rendered from is
   * stale until the next full load. It is the member's own input, verified by
   * the service one call earlier, so it matches what storage holds.
   */
  onAttached?: (address: string) => void
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
   * Which shape to render.
   *
   * "inline" is the group info page's row: a message, then the field and Save
   * side by side, then the way out on its own line. Unchanged from what
   * shipped, and the default, so that page renders exactly as it did.
   *
   * "sheet" is the group home's bottom sheet (round 11, frame A): the caller
   * wraps the message in Orbit's labeled note, then a field group holding the
   * label, a full-width field and the promise, then Save, then one worded exit
   * under it. Reading order: what I want, what you type, what happens to it,
   * the button, the way out.
   */
  variant?: "inline" | "sheet"
  /**
   * The way off the done step, for a caller whose shell does not have one.
   *
   * REQUIRED IN PRACTICE FOR variant="sheet", and the reason is a bug this
   * branch shipped and a review caught by rendering the component rather than
   * reading it. The done step hides the form, Save, the exit and the resend,
   * and nothing here unmounts the caller's shell. Inside an inline row that is
   * fine, and it is how the group info page still behaves: no scrim, no scroll
   * lock, the rest of the page is right there. Inside a modal the identical
   * code left a member who had just SUCCEEDED sitting in a sheet with a scroll
   * lock, a scrim eating taps, focus pinned to the sheet and not one control on
   * it, on the success path of the product's flagship flow. The only way out
   * was a tap on the dimmed strip above the sheet, which is precisely the
   * gesture round 11 called a learned pattern rather than a legible one.
   *
   * Not solved by closing automatically on onAttached: that flashes the sheet
   * away before the thank-you can be read. The member leaves when they have
   * read it.
   *
   * Optional in the type rather than required, because the inline variant must
   * NOT render this control and a required prop would push a meaningless
   * callback onto the caller that does not want it.
   */
  onDone?: () => void
  /**
   * Lets the caller put Orbit's line inside a box of its own while the flow
   * keeps owning WHICH line it is (the prompt, then the code-sent line, then
   * the thank-you). The sheet needs the labeled-note grammar around it; the
   * info page has no Orbit presence and takes the plain paragraph default.
   */
  messageSlot?: (message: string) => ReactNode
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
  variant = "inline",
  onDone,
  messageSlot,
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

  const isSheet = variant === "sheet"
  const address = email.trim()
  const typedCode = code.trim()

  /**
   * The confirm step's two failures, keyed off the seam's own union exactly
   * like DEFAULT_REQUEST_ERROR above, so a variant added to ConfirmAttachResult
   * later is a compile error here rather than both attach surfaces quietly
   * telling a member that something went wrong on our end when it did not.
   * This branch used to be a ternary, which is the one call site of the four
   * that the compile-error guarantee did not actually cover.
   *
   * Built from the props rather than at module scope because both strings are
   * a caller's to override, and it resolves to precisely what the ternary
   * resolved to: bad_code takes badCodeMessage, service_error takes the
   * request map's own service_error, override and all.
   */
  const confirmErrorMessages: Record<Exclude<ConfirmAttachResult, "ok">, string> = {
    bad_code: badCodeMessage,
    service_error: requestErrorMessages.service_error,
  }

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
        onAttached?.(address)
        return
      }
      setErrorMsg(confirmErrorMessages[result])
    })
  }

  const isCodeStep = step === "code"
  const value = isCodeStep ? code : email
  const hasValue = (isCodeStep ? typedCode : address).length > 0

  const message =
    step === "done" ? doneMessage : isCodeStep ? codeSentMessage(address) : promptMessage

  const fieldLabel = isCodeStep ? "The code from your email" : "Your email address"

  /**
   * The way out, plus the resend once a code is in the air.
   *
   * In the sheet these are two stacked full-width rows under Save; inline they
   * keep the row below the field that they shipped with.
   */
  const secondaryControls = (
    <>
      {/* A quiet text link, never a button: soft declines everywhere, because
          honest tallies depend on socially comfortable exits. It stays
          available on the code step too, since a member who changes their mind
          halfway should not have to finish first.

          In the sheet this is `.ea-exit` from round 11: 17px, weight 600,
          underlined, 48px tall, full width, centred under Save. It is the
          ONLY way out with a word on it, because the X was deleted; that
          makes legibility load-bearing rather than a nicety, so it is bigger
          and heavier here than the 15px link the info page renders. Never
          teal and never lime: underline plus position carries it with colour
          switched off. */}
      <button
        type="button"
        onClick={onCancel}
        style={{
          background: "none",
          border: "none",
          padding: isSheet ? "4px 8px" : "4px 2px",
          width: isSheet ? "100%" : undefined,
          minHeight: isSheet ? 48 : undefined,
          display: isSheet ? "flex" : undefined,
          alignItems: isSheet ? "center" : undefined,
          justifyContent: isSheet ? "center" : undefined,
          color: "var(--text-secondary)",
          fontSize: isSheet ? "var(--type-body)" : "var(--type-meta)",
          fontWeight: isSheet ? 600 : undefined,
          textDecoration: "underline",
          textUnderlineOffset: isSheet ? "4px" : undefined,
          textDecorationThickness: isSheet ? "1.5px" : undefined,
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
              width: isSheet ? "100%" : undefined,
              textAlign: isSheet ? "center" : undefined,
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
              padding: isSheet ? "4px 8px" : "4px 2px",
              width: isSheet ? "100%" : undefined,
              minHeight: isSheet ? 44 : undefined,
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

  /**
   * The eyebrow over the field, and the reason it is shared rather than drawn
   * inside the sheet's branch where it started.
   *
   * It is the only thing on either surface that names which of the two steps
   * the member is standing on. The owner met the inline surface, which never
   * had one, and could barely tell the screen had changed after he entered his
   * address: a sentence of prose and a placeholder both swapped, and every
   * structural thing on screen stayed exactly where it was. So this stops
   * being a sheet detail and becomes the flow's own.
   *
   * aria-hidden on purpose, which the sheet's copy already was: the real
   * accessible name is the visually hidden <label htmlFor> inside the field
   * below, which reads "Your email address" / "The code from your email".
   * Announcing both would read the field's name twice.
   *
   * SPACING IS PER SURFACE, judged rather than copied. The sheet's column is
   * loose (a 52px field, 16px between groups) and takes 7px under the label.
   * The inline row is denser (a 40px field in a page that also carries a
   * member list) and takes 5px, so the label still binds down to its field
   * harder than it binds up to the prose above it. That relationship, not
   * either number, is what the test pins.
   */
  const stepEyebrow = (
    <span
      aria-hidden="true"
      style={{
        fontSize: "var(--type-eyebrow)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        // COLOUR IS PER SURFACE for the same reason the spacing below it is:
        // what outranks this label differs between the two, and rank is what
        // the token carries.
        //
        // In the sheet, the note directly above says "A note from Orbit" at
        // --text-secondary. A second eyebrow at that weight would flatten the
        // ordering, so this one stays a step under it.
        //
        // Inline, the eyebrows above it on the group info page ("Group invite
        // link", "Email for sign-in and reminders") are themselves
        // --text-secondary, and that page never renders anything at
        // --text-faint. Leaving this one faint made it the dimmest thing on a
        // screen whose own register is a step brighter, which is half of what
        // the owner was pointing at when he said the box read as disabled.
        color: isSheet ? "var(--text-faint)" : "var(--text-secondary)",
        fontWeight: 700,
        marginBottom: isSheet ? 7 : 5,
      }}
    >
      {isCodeStep ? "Code" : "Email"}
    </span>
  )

  /** The field itself, in whichever shell this variant draws around it. */
  const field = (
    <div
      style={
        isSheet
          ? {
              // Round 10's `.ea-input`: 52px tall, radius 12, a 1.6px hairline
              // on the page ground. Not the chat composer's pill, because in
              // a sheet the field is a full-width form control rather than a
              // thing you talk into.
              display: "flex",
              alignItems: "center",
              width: "100%",
              // The code step is taller because its type is taller: round 10's
              // `.ea-code` is 60px against `.ea-input`'s 52px. Grows with the
              // content rather than clipping it.
              minHeight: isCodeStep ? 60 : 52,
              padding: "12px 14px",
              backgroundColor: "var(--surface-base)",
              border: "1.6px solid var(--hairline)",
              borderRadius: 12,
            }
          : {
              // The chat composer's pill shape, borrowed rather than invented.
              flex: "1 1 11rem",
              display: "flex",
              alignItems: "center",
              // Same reason as the sheet's 60, scaled to this denser row: at
              // 24px the code type alone is taller than the 40px box that
              // holds a 17px address, so the box has to grow with it.
              minHeight: isCodeStep ? 52 : 40,
              backgroundColor: "var(--surface-base)",
              border: "1px solid var(--hairline)",
              borderRadius: 26,
              padding: "6px 14px",
            }
      }
    >
      <label htmlFor={fieldId} style={{ display: "none" }}>
        {fieldLabel}
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
        placeholder={isCodeStep ? CODE_PLACEHOLDER : "you@example.com"}
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
          // THE CODE STEP IS DELIBERATELY NOT THE EMAIL STEP, and if a later
          // pass is tempted to harmonise the two inputs, this is the reason
          // not to. Round 10's handoff drew `.ea-code` with its own treatment
          // and no task ever ported it, so eight digits rendered in the same
          // proportional face as an address; the owner then met the flow on
          // his phone and could barely tell the screen had changed.
          //
          // Spread from pill-controls rather than written out here, 28 Aug
          // 2026: this flow was the only one of the three code screens wearing
          // the treatment, and the fix for that was one source, not a second
          // and third copy. The reasoning for each property lives with it
          // there.
          ...(isCodeStep ? codeFieldTextStyle : null),
        }}
      />
    </div>
  )

  /**
   * Save. Its two-state grammar (quiet until there is something to send, teal
   * the moment there is) is the one already shared by the chat composer and
   * the wizard, and it is kept in the sheet too.
   *
   * DECLARED DEPARTURE from the drawn source: round 11's boards draw Save
   * teal even over an empty field, because they are static frames with no
   * interaction model in them. Following that literally would put a teal
   * button on screen that refuses the tap, which is worse on a phone than a
   * quiet one that lights up. Teal still appears on Save and nowhere else, so
   * the rule the boards were protecting is intact. Reversible in one place if
   * the owner would rather have the drawn version.
   */
  const save = (
    <button
      type="submit"
      disabled={!hasValue || isPending}
      style={{
        width: isSheet ? "100%" : undefined,
        minHeight: isSheet ? 52 : 40,
        padding: isSheet ? "12px 16px" : "0.5rem 1.125rem",
        borderRadius: isSheet ? 12 : 26,
        border: hasValue ? "1px solid var(--action)" : "1px solid var(--hairline)",
        backgroundColor: hasValue ? "var(--action)" : "var(--surface-base)",
        color: hasValue ? "var(--action-ink)" : "var(--text-faint)",
        fontSize: isSheet ? "var(--type-body)" : "var(--type-label)",
        fontWeight: isSheet ? 700 : 600,
        cursor: !hasValue || isPending ? "default" : "pointer",
      }}
    >
      Save
    </button>
  )

  /**
   * The promise, on the email step only.
   *
   * Round 11 is explicit that it does not belong on the code step: by then the
   * address is given and the promise is retrospective, and that step already
   * carries the resend line, so two subordinate lines would stack under one
   * button. Attached to the field rather than to the sheet, so it is read at
   * the moment the decision is being made.
   */
  const assurance = step === "email" && (
    <p
      style={{
        margin: isSheet ? "9px 0 0" : "8px 0 0",
        fontSize: "var(--type-meta)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        textAlign: "center",
        textWrap: "pretty",
      }}
    >
      {ASSURANCE}
    </p>
  )

  return (
    <>
      {messageSlot ? (
        messageSlot(message)
      ) : (
        // THE MAIN TEXT OF ITS SURFACE, so --text-primary, and this is the
        // comment to read before "harmonising" the two variants.
        //
        // In production only the inline surface renders this paragraph: the
        // sheet passes messageSlot and puts the same sentence inside Orbit's
        // labeled note, where it is ALREADY --text-primary at 17px, because it
        // is the sentence the element exists to get read. This paragraph
        // shipped at --text-secondary, which is a rank that only makes sense
        // when something brighter is above it. On the group info page nothing
        // is: there is no Orbit presence anywhere on that page, this is the
        // main text of the row, and the invite-link value and the WHO names on
        // the same screen are both --text-primary. The owner read the
        // difference exactly as it looked, as disabled.
        //
        // Size stays --type-meta (15px), which is the info page's own value
        // register (its InfoRow values are 15px --text-primary). Only the rank
        // was wrong, not the scale.
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {message}
        </p>
      )}

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

      {/* The door behind the sentence above, and since 27 Aug 2026 a control
          rather than a link.
 
          It shipped as a 15px grey underlined link, which is the same register
          as the "Not now" exit, and the owner walked straight past it on his
          phone. That is the failure this whole slice exists to prevent: the
          person most likely to be standing here is the one who attached an
          address, lost their session, and came back as a second copy of
          themselves, and a route they do not notice is the same as no route.
 
          WHAT CARRIES IT, and none of it is hue. A hairline border and a fill
          give it the shape of a thing you press; 17px at weight 600 puts it
          above the surrounding copy; a 48px target makes it a real one on a
          phone. Deliberately NOT teal, which belongs to Save alone on this
          sheet, and not lime, which is Orbit's brand and never an action. It
          stays outlined rather than filled so it reads as a route onward and
          never competes with Save, which is exactly the rung CLAUDE.md already
          assigns to a secondary action.
 
          Full width in the sheet, where everything else in the column is; auto
          width inline, where the row it sits in is not a column. */}
      {offerSignIn && (
        <p style={{ margin: "10px 0 0" }}>
          <Link
            href={SIGN_IN_HREF}
            style={{
              display: isSheet ? "flex" : "inline-flex",
              width: isSheet ? "100%" : undefined,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 48,
              padding: "10px 16px",
              backgroundColor: "var(--surface-base)",
              border: "1.6px solid var(--hairline)",
              borderRadius: 12,
              color: "var(--text-primary)",
              fontSize: "var(--type-body)",
              fontWeight: 600,
              lineHeight: "var(--leading-normal)",
              textDecoration: "none",
            }}
          >
            {SIGN_IN_LABEL}
          </Link>
        </p>
      )}

      {/* The terminal control. Sheet only, and only when the caller supplied a
          way out: see onDone above for the trap this closes. Treated like the
          exit rather than like Save, because it is a word that says where the
          tap goes and teal belongs to Save alone. */}
      {step === "done" && isSheet && onDone && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
          <button
            type="button"
            onClick={onDone}
            style={{
              background: "none",
              border: "none",
              padding: "4px 8px",
              width: "100%",
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              fontSize: "var(--type-body)",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "4px",
              textDecorationThickness: "1.5px",
              cursor: "pointer",
            }}
          >
            Back to the group
          </button>
        </div>
      )}

      {step !== "done" &&
        (isSheet ? (
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}
          >
            {/* `.ea-fieldgroup`: label, field and the promise as one unit, so
                the promise travels with the field instead of drifting under
                Save. */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {stepEyebrow}
              {field}
              {assurance}
            </div>

            {/* `.ea-actions`: Save, then the one worded exit directly under it,
                then the resend line when a code is in the air. Round 10 puts
                the exit immediately below Save, and `secondaryControls` renders
                the exit before the resend, so that is the real DOM order on
                every step. (This comment previously claimed the resend came
                second and the exit last, which the code never did.) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {save}
              {secondaryControls}
            </div>
          </form>
        ) : (
          <>
            {/* A column now, where it used to be a bare row, and the column is
                the whole point: it is what gives the eyebrow somewhere to sit
                above the field it names. The row itself is unchanged and is
                now nested one level in, so its wrapping behaviour is exactly
                what it was.

                12px above the eyebrow against the 8px this form used to take,
                because the thing directly above it is a sentence of prose and
                a 13px uppercase label at 8px reads as that sentence's last
                line rather than as the head of a field group. */}
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", marginTop: 12 }}
            >
              {stepEyebrow}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  // Wraps rather than clips: at an enlarged device text size the
                  // field and the button stack instead of squeezing.
                  flexWrap: "wrap",
                }}
              >
                {field}
                {save}
              </div>
            </form>

            {assurance}

            {/* Centred since 27 Aug 2026, the owner's finding: the sheet's
                exit sits centred under Save and this one was left-justified,
                so the same control appeared in two different places depending
                on which surface you reached it from. Done on this row rather
                than on the button, which is what leaves the sheet untouched:
                the sheet draws its own column and never renders this row. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 4,
              }}
            >
              {secondaryControls}
            </div>
          </>
        ))}
    </>
  )
}
