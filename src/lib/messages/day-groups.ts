// Day dividers render in the group's timezone, never the viewer's — the
// feed is a shared surface and "Today" must mean the same day to everyone
// in the group's own terms (CLAUDE.md, time rules).
export type DayGroup<T> = { key: string; label: string; messages: T[] }

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

// Steps a "YYYY-MM-DD" key back one calendar day. Pure integer arithmetic on
// the date components via Date.UTC (never a wall-clock subtraction), so it is
// correct across every DST transition in every zone: a flat 24h subtraction
// on the underlying instant overshoots or undershoots the true prior
// calendar day whenever those 24 hours straddle a spring-forward or
// fall-back boundary (fix-round-1 Finding 1). Formatting through the "UTC"
// zone here is just how we read the y/m/d back off the arithmetic result;
// this function never looks at a wall-clock offset at all.
function previousDayKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number)
  const prev = new Date(Date.UTC(year, month - 1, day - 1))
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(prev)
}

function dayLabel(date: Date, timeZone: string, now: Date): string {
  const key = dayKey(date, timeZone)
  const todayKey = dayKey(now, timeZone)
  if (key === todayKey) return "Today"
  if (key === previousDayKey(todayKey)) return "Yesterday"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("weekday")}, ${get("month")} ${get("day")}`
}

// Precondition: `messages` must already be in ascending createdAt order.
// Grouping only checks the immediately preceding group, so out-of-order
// input (e.g. a future paginated "load older messages" merge) can produce
// two separate groups for the same calendar day (fix-round-1 Finding 3,
// minor, not restructured this round).
export function groupMessagesByDay<T extends { createdAt: Date | string }>(
  messages: T[],
  timeZone: string,
  now: Date
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const message of messages) {
    const created = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt)
    const key = dayKey(created, timeZone)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.messages.push(message)
    } else {
      groups.push({ key, label: dayLabel(created, timeZone, now), messages: [message] })
    }
  }
  return groups
}
