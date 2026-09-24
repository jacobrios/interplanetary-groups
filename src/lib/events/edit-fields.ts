// src/lib/events/edit-fields.ts
//
// Limits shared by the plan's Edit form (a client component) and the write
// path behind it. Deliberately imports nothing: edit-details.ts pulls in the
// database client, and a client component importing a constant from there
// drags pg (and Node's `fs`) into the browser bundle, which fails the build.
// Keep this file free of server imports.

export const EDIT_TITLE_MAX = 50
