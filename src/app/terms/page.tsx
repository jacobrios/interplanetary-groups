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
//
// OWNER QA, 2 SEPTEMBER 2026: the opening paragraph's "Please be kind to the
// people in your group" was cut at his ask, and a liability section was added
// because he noticed the page had none. See the comment above that section
// for why it is written the way it is.

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
    <LegalPage title="Terms" lastUpdated="2 September 2026">
      <LegalText>
        The short version: this is a personal project, made by one person, and
        it is offered exactly as it is.
      </LegalText>

      <LegalSection heading="What this is">
        <LegalText>
          I built Interplanetary Groups on my own. It is not a company. There
          is no support desk, nothing I have promised to keep running, and no
          team behind it. By using it you are agreeing to everything on this
          page.
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

      {/* Added 2 September 2026 at the owner's ask, after his phone pass
          found the page had no liability section at all. Written as an
          honest statement of what he can and cannot stand behind, NOT as a
          legal shield: he is one person, this is a small project, and a
          paragraph of boilerplate indemnity language would read as a lie in
          the voice the rest of the page speaks in. The three things he named
          are here in his order: what members do to each other, a breach
          being possible, and the whole thing being at your own risk. */}
      <LegalSection heading="What I am not responsible for">
        <LegalText>
          <LegalStrong>What people do in a group is between them.</LegalStrong>{" "}
          I did not write it, I am not watching your chat as it happens, and I
          cannot be responsible for how the people in your group treat you or
          for what anybody does after a plan is made. If somebody crosses a
          line, tell me and I will look at it.
        </LegalText>
        <LegalText>
          <LegalStrong>A break-in is possible.</LegalStrong> I take reasonable
          care with what the app keeps, and the privacy notice says exactly
          where it goes and who handles it. Nobody can honestly promise that a
          small project will never be broken into, so I am not going to. Using
          this app means accepting that risk, and it is a good reason not to
          write anything here you would be badly hurt by seeing elsewhere.
        </LegalText>
        <LegalText>
          All of it is offered as is, and you use it at your own risk.
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
          group. Nothing you write is ever sold or published. It does leave
          your group in two ways: a few outside services handle it so the app
          can work at all, and I can read it myself. The{" "}
          <Link
            href="/privacy"
            style={{ color: "var(--text-secondary)", textDecoration: "underline" }}
          >
            privacy notice
          </Link>{" "}
          says exactly who, and why.
        </LegalText>
      </LegalSection>

      {/* Deliberately does NOT repeat the privacy-notice link from the
          section directly above it. That link was added in fix round 1, and
          two underlined "privacy notice" links two paragraphs apart read as
          a stutter on a phone (seen rendered at 375x812, which is how it was
          caught). The signpost keeps its heading, because it is the thing a
          reader scanning the headings should find; the link lives once, at
          the sentence that actually needs it. */}
      <LegalSection heading="Your information">
        <LegalText>
          What else the app keeps, who can see it, and how to have it deleted
          is all on the privacy notice, linked just above.
        </LegalText>
      </LegalSection>
    </LegalPage>
  )
}
