// src/app/terms/page.tsx
//
// The terms. Same shape and same rules as the privacy notice next door:
// reachable by anyone signed in or not, no session read, no database read,
// no redirect, no teal, and a way back at the top and the bottom.
//
// Short on purpose. The point of this page is that somebody can actually
// read it before they hand anything over, and a wall of boilerplate is
// functionally the same as no page at all. Everything here is true of this
// product today: it really is one person, it really does have no support
// desk, and it really can go away.
//
// Deliberately not tested: the wording, for the same reason as the privacy
// notice. See that file's header.

import type { Metadata } from "next"
import Link from "next/link"
import LegalPage, {
  LegalList,
  LegalSection,
  LegalStrong,
  LegalText,
} from "@/components/LegalPage"

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Interplanetary Groups is a personal project, offered as is. What that means for you.",
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms" lastUpdated="1 September 2026">
      <LegalText>
        The short version: this is a personal project, made by one person, and
        it is offered exactly as it is. Please be kind to the people in your
        group.
      </LegalText>

      <LegalSection heading="What this is">
        <LegalText>
          I built Interplanetary Groups on my own. It is not a company. There
          is no support desk, no service agreement, and no team behind it. By
          using it you are agreeing to everything on this page.
        </LegalText>
      </LegalSection>

      <LegalSection heading="No promises that it works">
        <LegalText>
          The app is offered as is, with no warranty of any kind. It might
          break. It might lose a plan, send a reminder at the wrong time, or
          not send one at all. To the extent the law allows it, I am not liable
          for anything that goes wrong or for anything it costs you.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Do not rely on it for anything that matters">
        <LegalText>
          This app helps a group pick a night for climbing or beers. Please do
          not use it for medical appointments, legal deadlines, travel you
          cannot miss, or anything else where a missed reminder does real harm.
        </LegalText>
      </LegalSection>

      <LegalSection heading="It can go away">
        <LegalText>
          I might change it, take parts of it out, or shut it down, with or
          without warning. If that day comes I will try to give you notice, but
          I am not promising it.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Do not abuse it">
        <LegalList>
          <li>No harassment, threats, or bullying the people in your group.</li>
          <li>No spam.</li>
          <li>Nothing illegal.</li>
          <li>
            No trying to reach a group you were not invited to, and no digging
            around in other people&apos;s information.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="Content and accounts can be removed">
        <LegalText>
          If something posted here is abusive or illegal, I can remove it, and
          I can remove an account from the product entirely. Inside a group,
          the founder can also remove a member.
        </LegalText>
      </LegalSection>

      <LegalSection heading="What you write is yours">
        <LegalText>
          <LegalStrong>You own what you write.</LegalStrong> By posting it here
          you give permission to store it and to show it to the people in your
          group, which is the only thing the app does with it. Nothing you
          write is sold, published, or shown to anybody outside your group.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Your information">
        <LegalText>
          What the app keeps, who can see it, and how to have it deleted is on
          the{" "}
          <Link
            href="/privacy"
            style={{ color: "var(--text-secondary)", textDecoration: "underline" }}
          >
            privacy notice
          </Link>
          . It is worth the two minutes.
        </LegalText>
      </LegalSection>
    </LegalPage>
  )
}
