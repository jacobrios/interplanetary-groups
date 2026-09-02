// src/lib/people/former-member-label.ts
//
// The one name a reader (or Orbit) sees in place of a deleted person's own
// name, wherever their author row is gone. Deletion never removes a
// person's own chat messages, it nulls the pointer to who sent them
// (prisma/schema.prisma's SetNull on Message.authorId), so three separate
// places each need a word for "nobody left to name here": a chat bubble's
// name label, Orbit's own conversation-window prompt, and the digest's
// "you missed" quoted line. Those three used to disagree ("Member", "A
// former member", "Someone"), which is exactly the shape of bug this
// project has already shipped once: a rule living in code and in prompt
// prose separately, free to drift apart with no test able to catch it. One
// exported constant closes that gap structurally rather than by convention;
// do not re-inline this as a string literal at a new call site.
//
// The word itself is the owner's own call: "former" describes what
// happened to the group (this person is no longer in it), not "deleted",
// which describes what happened to a database row and tells a reader
// nothing about what they're looking at.
//
// Deliberately dependency-free: src/app/groups/[id]/MessageFeed.tsx is a
// client component ("use client"), so this module must never import Prisma
// or anything else server-only, directly or transitively.

export const FORMER_MEMBER_LABEL = "Former member"
