// src/app/privacy/page.tsx
//
// The privacy notice. Reachable by anyone, signed in or not: no session
// read, no database read, no redirect. That is deliberate and it is the one
// structural thing about this file worth protecting. The front door
// redirects a visitor who already has a group; this page must never inherit
// anything like that, because the person most likely to need it is a
// stranger deciding whether to hand anything over at all.
//
// EVERY FACTUAL CLAIM BELOW WAS CHECKED AGAINST THE CODE, not against a
// summary of it, and the ones that were tempting to round off are the ones
// that matter:
//
//   - Cookies. Supabase chunks its auth session across more than one cookie
//     (src/lib/supabase/server.ts, proxy-session.ts), so "one cookie" would
//     be a small confident falsehood. Nothing else sets one: package.json
//     carries no analytics, tracking or advertising dependency.
//   - Deletion. What goes and what stays is read off
//     src/lib/people/deletion-plan.ts and delete-person.ts, not off an
//     intention. Messages survive with their author pointer nulled
//     (schema.prisma, Message.author onDelete: SetNull) and render as
//     FORMER_MEMBER_LABEL; nothing scans anybody's prose, so a name written
//     into a sentence survives. Saying otherwise would be the single most
//     damaging sentence this page could carry.
//   - Better Stack. src/lib/health/check.ts's describeError is an explicit
//     privacy boundary carrying an error's class, code and message only,
//     with a stated residual: a database driver's own error text can echo
//     the value that tripped it. So the page claims "error messages rather
//     than your information" and does not claim "never".
//   - The operator can read the database. Stated plainly at the owner's
//     instruction. It is true of every app and saying it is the honest
//     version.
//
// Written in the first person singular, unlike everything else in the
// product, which speaks as Orbit. A privacy notice is the one page where a
// corporate "we" would be a lie: there is one person, and the promises here
// are his rather than an organisation's.
//
// Deliberately not tested: the wording. A test asserting a sentence here is
// a copy-lock rather than a behaviour check, and this copy is expected to be
// reworded. The one exception is the contact address, which IS pinned by a
// test, because a notice promising deletion at an address that is wrong or
// missing makes the whole page a lie.

import type { Metadata } from "next"
import LegalPage, {
  LegalList,
  LegalSection,
  LegalStrong,
  LegalText,
} from "@/components/LegalPage"

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What Interplanetary Groups keeps about you, who can see it, and how to have it deleted.",
}

/**
 * The address a deletion request goes to. Declared once and used for both
 * the link and its text, so the two can never say different things, and
 * pinned by src/app/__tests__/legal-pages.test.tsx.
 */
const CONTACT_ADDRESS = "privacy@interplanetarygroups.com"

const contactLinkStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  textDecoration: "underline",
  overflowWrap: "break-word",
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" lastUpdated="1 September 2026">
      <LegalText>
        Interplanetary Groups is a small personal project. I built it and I
        run it, on my own. This page says what the app keeps about you, who
        can see it, and how to have it deleted. It is meant to be read, so I
        have kept it short and skipped the legal padding.
      </LegalText>

      <LegalSection heading="What the app keeps">
        <LegalList>
          <li>
            <LegalStrong>Your name.</LegalStrong> You type it when you join a
            group or start one. It is how the group knows who said what.
          </li>
          <li>
            <LegalStrong>Your email address, if you give one.</LegalStrong>{" "}
            Giving it is optional, always.
          </li>
          <li>
            <LegalStrong>What you write in the group chat.</LegalStrong> Every
            message you send, kept for as long as the group exists.
          </li>
          <li>
            <LegalStrong>Your answers to plans.</LegalStrong> Whether you are
            in or out, and how you voted on an idea or on a change to a time.
          </li>
          <li>
            <LegalStrong>Your group&apos;s details.</LegalStrong> Its name, the
            description the founder first wrote about it, the days and times
            it meets, its time zone, and its meeting spot, including the
            street address if the founder gave one.
          </li>
          <li>
            <LegalStrong>When you last opened the group,</LegalStrong> and when
            you joined it.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="Why">
        <LegalList>
          <li>
            Your name, your messages and your answers are what running a group
            means. Take them away and there is no group.
          </li>
          <li>
            Your email address does two things and nothing else. It signs you
            back in when you get a new phone or clear your browser, so you come
            back as yourself instead of as a second copy of yourself. And it
            sends you reminders about your own group.
          </li>
          <li>
            When you last opened the group is how the app keeps those reminders
            quiet. If you have already seen everything, nothing is sent.
          </li>
        </LegalList>
        <LegalText>
          Your information is never sold, never rented, and never used to
          advertise anything to you.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Who can see it">
        <LegalList>
          <li>
            <LegalStrong>The people in your group</LegalStrong> see your name,
            your messages, and your answers to plans. That is the whole point
            of a group.
          </li>
          <li>
            <LegalStrong>
              Your email address is never shown to your group.
            </LegalStrong>{" "}
            The only person who can see the address the app holds for you is
            you, on your group&apos;s info page.
          </li>
          <li>
            <LegalStrong>I can read the database.</LegalStrong> That is true of
            every app you have ever used, and I would rather say it than let
            you assume otherwise. There is no technical wall between me and
            your group&apos;s messages, so this part rests on a promise rather
            than on the software: I look when something is broken and I need
            to fix it, and not for entertainment.
          </li>
          <li>
            <LegalStrong>Nobody else,</LegalStrong> apart from the services
            below, which handle it so the app can work at all.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="Outside services">
        <LegalList>
          <li>
            <LegalStrong>Anthropic</LegalStrong> runs the model behind Orbit,
            the assistant in your group. When somebody sends a message, the
            last twenty messages in that group, and the names attached to them,
            are sent to Anthropic so Orbit can work out what was meant. The
            founder&apos;s description of the group is sent when the group is
            first created. This is the one on this list most people would not
            guess, which is why it is first.
          </li>
          <li>
            <LegalStrong>Resend</LegalStrong> sends the email. It handles your
            email address, and a reminder email quotes recent lines from your
            group chat, so those go through it too.
          </li>
          <li>
            <LegalStrong>Supabase</LegalStrong> stores the database and handles
            signing in.
          </li>
          <li>
            <LegalStrong>Vercel</LegalStrong> runs the site. Like any web host,
            its server logs record the ordinary details of a request, including
            your IP address.
          </li>
          <li>
            <LegalStrong>Better Stack</LegalStrong> watches whether the site is
            broken. It receives error messages rather than your information. I
            will not claim it can never see a scrap of data: an error message
            written by the database itself can quote the value that caused it.
            Nothing in my own code puts your information into one.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="Cookies">
        <LegalText>
          The app sets cookies to keep you signed in, and that is all they do.
          There are no analytics, no tracking, no advertising, and nothing that
          follows you around other websites.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Getting deleted">
        <LegalText>
          Email{" "}
          <a href={`mailto:${CONTACT_ADDRESS}`} style={contactLinkStyle}>
            {CONTACT_ADDRESS}
          </a>{" "}
          and ask. It is done by hand, by me, within seven days. There is no
          button for it yet, and I would rather tell you that than pretend
          there is.
        </LegalText>

        <LegalText>What goes:</LegalText>
        <LegalList>
          <li>your account and your name;</li>
          <li>your email address;</li>
          <li>
            every answer you ever gave: whether you were in or out of a plan,
            and every vote on an idea or on a change to a time, on past plans
            as well as upcoming ones;
          </li>
          <li>
            the line the group saw when you joined, in every group, including
            ones you have already left;
          </li>
          <li>
            any group you started that nobody else is left in. It goes with
            you.
          </li>
        </LegalList>

        <LegalText>
          What stays, which is the part most notices leave out:
        </LegalText>
        <LegalList>
          <li>
            <LegalStrong>Your chat messages stay in the group,</LegalStrong>{" "}
            and they stop carrying your name. Where your name used to be, the
            group sees &ldquo;Former member&rdquo; instead. They are not
            removed, because taking one half of a conversation away leaves
            everybody else&apos;s messages making no sense.
          </li>
          <li>
            <LegalStrong>
              Your name stays wherever somebody wrote it into a sentence.
            </LegalStrong>{" "}
            If another member typed your name in a message, or Orbit said
            &ldquo;Sam and Jordan are in so far,&rdquo; those words belong to
            the conversation and they stay. Nothing goes hunting through
            everybody&apos;s messages for your name, and I would rather be
            honest about that than promise a clean sweep I cannot deliver.
          </li>
        </LegalList>

        <LegalText>
          One thing has to be sorted out first. If you started a group that
          other people are still in, the group needs to be handed to one of
          them before your account can go, so their group does not disappear
          with you. Email the address above and we will work it out.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Children">
        <LegalText>
          This is not built for children under 13, and it is not meant for
          them to use.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Changes to this notice">
        <LegalText>
          This notice can change. When it does, the date at the top changes
          with it. I will not email you about it, so if this matters to you,
          have a look back here now and then.
        </LegalText>
      </LegalSection>
    </LegalPage>
  )
}
