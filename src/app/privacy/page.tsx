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
// that matter.
//
// FOUR OF THEM WERE STILL WRONG IN THE FIRST ROUND, and recording that is
// worth more here than a clean-looking header, because all four failed the
// same way: the sentence was KINDER than the software. The privacy notice's
// characteristic bug is not a lie, it is a rounded-off reassurance, so the
// check to run on any edit here is "is this sentence more generous than the
// code?" rather than "is this sentence false?".
//
//   - "The only person who can see your address is you" was contradicted
//     twice by this same page, two sections down. It is the only MEMBER.
//   - "If you have already seen everything, nothing is sent" is not true of
//     the digest: lastSeenAt gates the you-missed block ONLY
//     (src/lib/digest/run.ts, and schedule.ts's own header says so), so a
//     member who has read every message still gets mail about an idea they
//     have not voted on.
//   - The Anthropic bullet named the message window and stopped. Every
//     member message also sends up to three upcoming plans with their
//     times, every live gauge, the open day-ask, and any open time-change
//     proposal INCLUDING THE ASKER'S NAME (src/app/actions/detect-intent.ts,
//     lines assembled through src/lib/orbit/spark-copy.ts). On the page's
//     own "most people would not guess" item, an understatement was the
//     worst-placed error on the page.
//   - The join-line deletion promise was unconditional. The mechanism is a
//     body-text name match over SYSTEM rows with a null authorId, sorted
//     into three evidence classes, and only the operator-confirmed subset
//     is deleted (deletion-plan.ts, delete-person.ts). It can miss somebody
//     who joined, never posted, and left, and the page now says so.
//
// The rest, checked and unchanged:
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
//
// OWNER QA, 2 SEPTEMBER 2026, and both changes are worth naming because a
// later brevity pass could undo either without noticing:
//
//   - The page blurred two different things about the operator: that he CAN
//     read the database, and WHEN he looks. A reader could land on "ask to
//     be deleted" and infer that asking invites somebody to go and read
//     their chat. It does not: deletion is a script plus a dashboard step,
//     and the page now says so twice, once where the reading is admitted
//     and once where the deletion is requested, because those are two
//     different readers arriving from two different worries.
//   - Words were cut; caveats were not. The four claims listed above were
//     re-checked against the code AFTER the trim, not before it, precisely
//     because the shortest version of a caveat is always to drop it. If you
//     are shortening this page again, that is the check, and "is this
//     sentence more generous than the code?" is still the question.
//
// AND A FIFTH WAY TO GET THIS WRONG, found by review the same day, which is
// worth more than the four above because it is the one nobody was watching
// for. This page was not edited into being wrong. THE TERMS PAGE WAS EDITED,
// and that made this page's list of occasions the narrower of the two.
//
// The terms gained "if somebody crosses a line, tell me and I will look at
// it", which is a second occasion on which the operator reads a member's
// chat, and this page listed only "when something is broken". So the notice
// under-disclosed a real reason he would read your messages, without a
// single word of it changing. The occasion is named here now.
//
// THE RULE THAT FALLS OUT OF IT: these two pages make overlapping promises
// about the same person, so a claim added to one can falsify the other at a
// distance. Read both when you touch either.
//
// SECOND PHONE QA, 2 September 2026: the "Why" section was deleted at the
// owner's ask, on the reading that most of its bullets restated the list
// above rather than disclosing anything. Two of its three bullets were
// folded into "What the app keeps" at his instruction (what the email
// address does, onto the email bullet; the never-sold line, onto the end of
// that list).
//
// THE THIRD ONE MOVED WITHOUT BEING ASKED FOR, AND THAT IS DELIBERATE. Its
// last bullet carried the reminders caveat, which is one of the four
// protected claims at the top of this file: an earlier round ADDED it
// because "if you have already seen everything, nothing is sent" was false
// of the code. Deleting the section would have silently deleted a
// correction, so the caveat now lives on the "when you last opened the
// group" bullet, which is the fact it is about. Re-verified against the code
// at the time of the move rather than carried across on trust:
// isNeedsYouGateOpen (src/lib/digest/schedule.ts:113) takes only now,
// timeZone, ideas, timeChangeAsks and events, with no read position of any
// kind, and run.ts:376 applies gateOpen to the needs-you block alone while
// deriveYouMissed (run.ts:388) is the only consumer of lastSeenAt. So a
// member who has read every message can still be mailed about something
// waiting on their answer, exactly as the sentence says.
//
// DO NOT "TIDY" THAT CAVEAT BACK OUT as a long tail on a short bullet. Its
// length is the disclosure.

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
    <LegalPage title="Privacy notice" lastUpdated="2 September 2026">
      <LegalText>
        I built Interplanetary Groups on my own, and I run it on my own. This
        page says what the app keeps about you, who can see it, and how to
        have it deleted.
      </LegalText>

      <LegalSection heading="What the app keeps">
        <LegalList>
          <li>
            <LegalStrong>Your name,</LegalStrong> so the group knows who said
            what.
          </li>
          <li>
            <LegalStrong>Your email address, if you give one.</LegalStrong> It
            is always optional, and it does two things and nothing else. It
            signs you back in on a new phone or a cleared browser, so you come
            back as yourself instead of as a second copy of yourself, and it
            sends you reminders about your own group.
          </li>
          <li>
            <LegalStrong>What you write in the group chat,</LegalStrong> kept
            for as long as the group exists.
          </li>
          <li>
            <LegalStrong>Your answers to plans:</LegalStrong> whether you are
            in or out, and how you voted on an idea or on a change to a time.
          </li>
          <li>
            <LegalStrong>Your group&apos;s details:</LegalStrong> its name, the
            description the founder first wrote about it, the days and times it
            meets, its time zone, and its meeting spot, including the street
            address if the founder gave one.
          </li>
          <li>
            <LegalStrong>When you last opened the group,</LegalStrong> and when
            you joined it. Where you got to is what stops a reminder telling
            you about chat you have already read. It does not stop every
            email: if something is still waiting on your answer, like an idea
            you have not voted on, a reminder can still arrive.
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
            your messages, and your answers to plans.
          </li>
          <li>
            <LegalStrong>
              Your email address is never shown to your group.
            </LegalStrong>{" "}
            You are the only member who can see the address the app holds for
            you, on your group&apos;s info page. The two exceptions are not
            members: I can read it, and the service that sends the email has to
            be handed it.
          </li>
          <li>
            <LegalStrong>I can read the database.</LegalStrong> That is true of
            every app you have ever used, and I would rather say it than let
            you assume otherwise. There is no technical wall between me and
            your group&apos;s messages, so this rests on a promise rather than
            on software: I look when something is broken, or when somebody
            reports a problem in their group and I have to work out what
            happened, and not for entertainment.
          </li>
          <li>
            <LegalStrong>
              Asking to be deleted is not one of those times.
            </LegalStrong>{" "}
            Deleting somebody is mechanical: a script, then a dashboard, and
            none of it involves reading what you wrote. Asking does not invite
            me into your conversation.
          </li>
          <li>
            <LegalStrong>Nobody else,</LegalStrong> apart from the services
            below.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="Outside services">
        <LegalList>
          <li>
            <LegalStrong>Anthropic</LegalStrong> runs the model behind Orbit,
            the assistant in your group. Every message sends a picture of your
            group to Anthropic so Orbit can work out what was meant: the last
            twenty messages with the names attached, the
            next few plans with their days and times, any idea the group is
            voting on right now, any open question about moving a plan,
            including the name of whoever asked, and any day Orbit is still
            waiting to hear back about. Your group&apos;s description goes too:
            once when you first describe your group while starting one, before
            the group itself exists, and again with every answer you give to
            Orbit&apos;s follow-up questions, since each answer is sent
            alongside the description it is clarifying. This is the one most
            people would not guess, which is why it is first.
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
            its logs record the ordinary details of a request, including your IP
            address.
          </li>
          <li>
            <LegalStrong>Better Stack</LegalStrong> watches whether the site is
            broken. What it gets is the error, not your information. I will not
            promise it never sees a scrap of one, because an error sometimes
            repeats back the thing that broke it, and that could be yours.
            Nothing I wrote sends your information there.
          </li>
        </LegalList>
      </LegalSection>

      {/* Rewritten 8 Sept 2026. The previous version said cookies "keep you
          signed in, and that is all they do", which three shipped changes had
          already falsified: the email-ask snooze cookie
          (src/lib/auth/email-ask-cooldown.ts:134, 3 Sept), the composer's
          parked draft (GroupHome.tsx:204, 4 Sept), and the deploy watcher's
          version note (DeployWatch.tsx:207, 4 Sept). Found by Jacob reading the
          page, which is the second time in eight days this page has been found
          stale by a human rather than by any check.

          Two accuracy constraints that shaped this wording, so a future copy
          pass does not undo them. It deliberately does NOT say the stored
          things never leave the device: the sign-in cookie is sent to our own
          server on every request, which is how sessions work, so that
          comforting sentence would be a new false claim inside a fix for a
          false claim. And "until you close the tab" is load-bearing and
          correct, because the draft is in sessionStorage rather than
          localStorage; GroupHome.tsx's own header explains that choice.

          The first pass at this rewrite was itself incomplete: it named the
          snooze cookie and the parked draft but missed the deploy watcher's
          version note, caught in review on 8 Sept 2026. A grep of every
          device-storage writer in src/ is what settled the real list, four
          writers rather than the three this comment first assumed, and that
          is worth recording because this section has now been found
          incomplete twice.

          The old body counted 29 words. This one counts 64, on a page
          shortened by about 90 words on 2 Sept. Jacob approved the growth
          explicitly as the price of accuracy. */}
      <LegalSection heading="Cookies and your device">
        <LegalText>
          The app stores a few things on your device: what keeps you signed in,
          a note that you closed the box asking for your email so it waits a
          day before asking again, which version of the app this tab loaded,
          and an unsent message until you close the tab. No analytics, no
          tracking, no advertising, and nothing that follows you around other
          websites.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Getting deleted">
        <LegalText>
          Email{" "}
          <a href={`mailto:${CONTACT_ADDRESS}`} style={contactLinkStyle}>
            {CONTACT_ADDRESS}
          </a>{" "}
          and ask. I do it within seven days, with a script and then a
          dashboard, and it is not a read of your messages. There is no button
          for it yet, and I would rather say so than pretend there is.
        </LegalText>

        <LegalText>What goes:</LegalText>
        <LegalList>
          <li>your account and your name;</li>
          <li>your email address;</li>
          <li>
            every answer you ever gave: in or out of a plan, and every vote on
            an idea or on a change to a time, on past plans as well as upcoming
            ones;
          </li>
          <li>
            the line the group saw when you joined, in every group, including
            ones you have already left. This one is a judgement call rather than
            a lookup, and you should know that: the app never recorded who those
            lines were about, so they are found by matching your name and I
            confirm each by hand. One in a group you joined, never posted in,
            and then left can be missed;
          </li>
          <li>any group you started that nobody else is left in.</li>
        </LegalList>

        <LegalText>
          What stays, which is the part most notices leave out:
        </LegalText>
        <LegalList>
          <li>
            <LegalStrong>Your chat messages stay in the group,</LegalStrong>{" "}
            and they stop carrying your name. Where your name used to be, the
            group sees &ldquo;Former member&rdquo; instead. Taking one half of
            a conversation away leaves everybody else&apos;s messages making no
            sense.
          </li>
          <li>
            <LegalStrong>
              Your name stays wherever somebody wrote it into a sentence.
            </LegalStrong>{" "}
            If another member typed your name in a message, or Orbit said
            &ldquo;Sam and Jordan are in so far,&rdquo; those words belong to
            the conversation and they stay. Nothing goes hunting through
            everybody&apos;s messages for your name, and I would rather say so
            than promise a clean sweep I cannot deliver.
          </li>
        </LegalList>

        <LegalText>
          One thing first. If you started a group other people are still in, it
          has to be handed to one of them before your account can go, so their
          group does not disappear with you. Email the address above and we will
          sort it out.
        </LegalText>
      </LegalSection>

      <LegalSection heading="Children">
        <LegalText>
          This is not built for children under 13, and is not meant for them to
          use.
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
