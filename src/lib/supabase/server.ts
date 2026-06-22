import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseEnv } from "./env"

export async function createClient() {
  const { url, publishableKey } = getSupabaseEnv()
  const cookieStore = await cookies()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        // setAll is called during server component render (where cookies cannot
        // be written) as well as during server actions (where they can).
        // Wrap in try/catch so render-time calls are a no-op; the proxy handles
        // session refresh for those cases.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Render-time: ignore. The proxy will refresh the session cookie.
        }
      },
    },
  })
}
