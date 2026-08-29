// src/lib/email/send.ts
//
// The one place the app talks to Resend, and the deliberate sibling of
// src/lib/auth/email.ts. Same discipline, for the same reason: a service reply
// is a claim about what happened, and the product decides what that claim
// means exactly once, here. No caller anywhere branches on Resend's own shape.
//
// Login codes do NOT come through this file. They leave through Supabase Auth,
// which relays via Resend's SMTP on the `account.` subdomain. This file is the
// `updates.` channel and carries nothing transactional, which is the whole
// point of the split: a digest that collects spam complaints can never drag
// login-code deliverability down with it.
//
// Every service_error branch logs the underlying error before returning. That
// is not defensive habit: the production deploy cost two hours because
// create-group.ts:73 threw Supabase's error away. The address itself is never
// logged; it is the member's, given to Orbit rather than to the group.

import { Resend } from "resend"

/**
 * A product decision, not a deployment one, which is why it is a constant and
 * not an env var: an env var would let the two environments silently disagree
 * about who this mail is from.
 */
const FROM = "Orbit <orbit@updates.interplanetarygroups.com>"

export interface SendEmailInput {
  to: string
  subject: string
  text: string
  html: string
  /** Absolute URL of the recipient's unsubscribe page. Sets the List-Unsubscribe headers. */
  unsubscribeUrl?: string
}

export type SendResult =
  | "ok"
  | "invalid_address"
  | "rate_limited"
  | "service_error"
  /** The guard below refused to send outside production. A success, never an error. */
  | "suppressed_dev"

/**
 * Whether this address may be mailed from this environment.
 *
 * The dev-test database holds QA rows carrying real addresses, so a local run
 * is one command away from mailing a real person from a half-built feature.
 * Outside production, only an address named in EMAIL_DEV_ALLOWLIST is sent to;
 * an unset allowlist means nothing sends at all. This runs before the API key
 * is even read, so a misconfigured local environment fails closed.
 */
function allowedInThisEnvironment(to: string): boolean {
  if (process.env.VERCEL_ENV === "production") return true
  const allowlist = (process.env.EMAIL_DEV_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return allowlist.includes(to.trim().toLowerCase())
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!allowedInThisEnvironment(input.to)) {
    console.warn(
      "[email-send] suppressed outside production: recipient is not on EMAIL_DEV_ALLOWLIST"
    )
    return "suppressed_dev"
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("[email-send] RESEND_API_KEY is not set")
    return "service_error"
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.unsubscribeUrl
        ? {
            // Lets a mail client offer its own unsubscribe control, so a member
            // who wants out reaches for that instead of the spam button. Costs
            // nothing and is most of what protects `updates.`'s reputation.
            "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    })

    if (!error) return "ok"

    // Resend's error names are the claim; these three are the only ones the
    // product distinguishes, and everything else is honestly a service error
    // rather than something guessed at.
    if (error.name === "validation_error") {
      console.error("[email-send] the service rejected the request as invalid:", error.message)
      return "invalid_address"
    }
    if (error.name === "rate_limit_exceeded" || error.name === "daily_quota_exceeded") {
      console.error("[email-send] the service refused on a limit:", error.name)
      return "rate_limited"
    }
    console.error("[email-send] the service failed:", error.name, error.message)
    return "service_error"
  } catch (err) {
    console.error("[email-send] the request to the service threw:", err)
    return "service_error"
  }
}
