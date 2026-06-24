// src/lib/messages/create.ts
//
// Data-layer write for creating a single message in a group's feed.
// Mirrors the established pattern: thin lib function, transaction where
// appropriate, reusable by the server action.

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import type { Message } from "@prisma/client"

export interface CreateMessageInput {
  groupId: string
  authorType: MessageAuthor
  /** The Prisma User.id of the member author.  Must be null for ORBIT messages. */
  authorId: string | null
  body: string
}

/**
 * Persists a new message to the group's feed.
 *
 * Guards:
 * - Rejects blank bodies (trimmed empty string) with "EMPTY_BODY".
 * - For MEMBER messages, authorId must be provided (non-null).
 * - For ORBIT messages, authorId must be null.
 *
 * The server action re-validates the viewer's session before calling this;
 * this function trusts that the authorId is already resolved server-side.
 */
export async function createMessage({
  groupId,
  authorType,
  authorId,
  body,
}: CreateMessageInput): Promise<Message> {
  if (!body.trim()) {
    throw new Error("EMPTY_BODY")
  }

  return prisma.message.create({
    data: {
      groupId,
      authorType,
      authorId,
      body: body.trim(),
    },
  })
}
