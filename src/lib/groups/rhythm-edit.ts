// src/lib/groups/rhythm-edit.ts
//
// One activity's editable shape, shared by RhythmFields (the client
// component both the group-details editor and onboarding step 2 render)
// and the lib code that validates and writes it (Task 3's details-edit.ts).
// Declared here rather than in RhythmFields.tsx because lib code must never
// import a client component.

export interface RhythmEdit {
  activity: string
  daysOfWeek: number[] | null
  timeLocal: string | null
  venueName: string | null
}
