export function getSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url) {
    throw new Error(
      "Missing env var: NEXT_PUBLIC_SUPABASE_URL. " +
        "Add it to .env (Supabase dashboard → Settings → API → Project URL)."
    )
  }
  if (!publishableKey) {
    throw new Error(
      "Missing env var: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Add it to .env (Supabase dashboard → Settings → API → Publishable key)."
    )
  }
  return { url, publishableKey }
}
