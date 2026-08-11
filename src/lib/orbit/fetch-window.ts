// Fetches the conversational window's prior messages for intent detection.
// Extracted from detect-intent so the query is pinned by a test; window.ts
// stays pure (rendering only) and this file owns the fetch.
//
// SYSTEM rows are excluded on purpose (joining-arc spec): a join
// announcement has a null author and is not Orbit, so window.ts's
// "A former member" fallback would mislabel it in the model's prompt.
// Orbit deliberately does not know who joined; whether it should is a
// recorded open question, not an accident of this query.

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { WINDOW_MESSAGES, type WindowMessage } from "./window"

export async function fetchPriorWindow(
  groupId: string,
  trigger: { id: string; createdAt: Date }
): Promise<WindowMessage[]> {
  const prior = await prisma.message.findMany({
    where: {
      groupId,
      id: { not: trigger.id },
      createdAt: { lte: trigger.createdAt },
      authorType: { in: [MessageAuthor.MEMBER, MessageAuthor.ORBIT] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: WINDOW_MESSAGES - 1,
    include: { author: true },
  })
  return prior.reverse().map((m) => ({
    authorName: m.author?.name ?? null,
    isOrbit: m.authorType === MessageAuthor.ORBIT,
    body: m.body,
    createdAt: m.createdAt,
  }))
}
