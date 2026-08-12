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

function dayLabel(date: Date, timeZone: string, now: Date): string {
  const key = dayKey(date, timeZone)
  if (key === dayKey(now, timeZone)) return "Today"
  const dayBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === dayKey(dayBefore, timeZone)) return "Yesterday"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("weekday")}, ${get("month")} ${get("day")}`
}

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
