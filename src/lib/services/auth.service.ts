import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"

/**
 * Creates a stateless Supabase client for password verification only.
 * This avoids the side-effect of signInWithPassword overwriting the
 * user's current session cookies on the main client.
 */
function createVerificationClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

/**
 * Shared password change logic.
 * Verifies the current password via a stateless client, then updates
 * via the user's session client.
 * Used by both admin and portal password change endpoints.
 */
export async function changePassword(
  supabase: SupabaseClient,
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // Verify current password using isolated client (no session side-effect)
  const verifier = createVerificationClient()
  const { error: signInError } = await verifier.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (signInError) {
    throw new AppError("Senha atual incorreta", 400)
  }

  // Update to new password using the user's session client
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    throw new AppError("Erro ao alterar senha", 500)
  }
}

/** Minimum password length enforced across all endpoints */
export const MIN_PASSWORD_LENGTH = 8
