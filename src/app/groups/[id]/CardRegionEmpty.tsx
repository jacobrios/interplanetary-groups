// src/app/groups/[id]/CardRegionEmpty.tsx
//
// What the card region shows when there is no confirmed plan and no idea being
// gauged. Drawn for the first time in the round-7 handoff; before that it was
// an inline --surface-raised box in page.tsx, which made it as bright as a
// confirmed card while saying the least of anything on the screen.
//
// It is the bottom rung of the ladder: confirmed card, idea card, then this.
// No fill and a dashed edge, the roster's own "not yet" grammar, so it reads
// as an absence with a border rather than a card with nothing in it.
//
// Lifted out of page.tsx so its copy can be tested at all: the page is
// server-rendered and this repo cannot unit test it.

export default function CardRegionEmpty() {
  return (
    <div
      style={{
        border: "1px dashed var(--hairline)",
        borderRadius: "14px",
        backgroundColor: "transparent",
        minHeight: "92px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "18px 22px",
      }}
    >
      <p
        style={{
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          // --text-secondary, not --text-faint, which the round-7 board drew.
          // Faint on the page ground measures ~3.8:1, under the 4.5:1 floor for
          // text this size; secondary is ~9:1, the value the copy this replaced
          // already used. Quiet is the intent here, unreadable is not.
          color: "var(--text-secondary)",
          fontWeight: 500,
          textWrap: "balance",
        }}
      >
        Nothing planned yet, float an idea in chat
      </p>
    </div>
  )
}
