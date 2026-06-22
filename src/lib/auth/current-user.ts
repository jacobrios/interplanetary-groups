import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import type { User } from "@prisma/client"

/**
 * Returns the Prisma User row for the currently authenticated Supabase user,
 * or null if there is no active session or no matching User row.
 *
 * Always calls getUser() (not getSession()) — getUser() validates the session
 * against the Supabase auth server, so it cannot be spoofed by a forged cookie.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  return prisma.user.findUnique({
    where: { supabaseAuthId: user.id },
  })
}
