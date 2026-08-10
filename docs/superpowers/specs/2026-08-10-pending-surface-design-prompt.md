# Claude Design prompt: pending surface (10 August 2026)

The prompt below is what the owner pastes into Claude Design. The deliverable to bring back is the "Send to local coding agent" handoff (real CSS, components, assets), which is the only thing visual code gets built from.

---

I need a new screen region designed for Interplanetary Groups, the group coordination app with the AI coordinator named Orbit. This is the first new region since the original walkthrough, and it lives on the group home screen.

**What it is.** A "pending" surface: a collapsible strip that sits between the pinned event card and the chat feed, where a member sees the group decisions still waiting on their answer and answers them in place. Two states to design: the collapsed strip and the expanded panel.

**The collapsed strip.** One quiet line, for example "2 waiting on you · 1 you're in on" (the second part only when they have standing yeses). It must read as tappable without shouting; it never animates for attention. When the member has nothing waiting and no standing yes, the strip does not exist at all, so don't design an empty state for the collapsed strip itself.

**The expanded panel.** Opens over the chat feed (covers it, never squeezes it); one obvious way to collapse back. Inside, rows in two groups, soonest first:

1. "Waiting on you" leads. Two row types, both answerable with the same tap-chips the chat feed already uses:
   - An idea row: the activity in the member's own words, proposed day and time (three-letter weekdays, e.g. "Fri 7pm"), a live tally line, and the three chips (I'm in / soft decline / can't that day).
   - A time-change row: which plan, current time versus proposed new time, tally, and the keep-or-switch chips.
2. "You're in on" below, visually quieter: items the member already said yes to, their answer shown, still tappable to change it. This group is a memory aid, not a call to action, and the hierarchy should say so.

Also design the moment the member answers their last waiting item with a decline: a brief caught-up note in the panel (warm, short, Orbit's voice), after which the strip disappears on collapse.

**Constraints that are firm product rules, not suggestions:**
- Dark-first, matching the existing group home.
- Teal is the single primary action per element; the chips follow the existing chip treatment exactly (there is an existing chip spec; reuse it, don't redesign the chips).
- Lime is Orbit's brand color only, never an action, never a plain button.
- Status is conveyed by brightness plus icon or label, never hue alone, and never red/green as the only signal.
- The locked type scale applies; nothing below the 13px eyebrow floor. Layout grows with content, never clips; rows stack, buttons wrap.
- Orbit's copy voice: plain and warm, roughly 7th-8th grade, soft declines ("Next time," never "Pass" or bare "No"), no em-dashes in anything Orbit says.
- The strip must not compete with the pinned event card above it; the card's job (the confirmed next plan) stays visually senior to the strip's job (the maybes).

**What I need back:** both states at mobile width, the two row types plus the standing-yes row and the caught-up note, and the handoff via "Send to local coding agent" so the build works from real CSS and assets rather than screenshots.
