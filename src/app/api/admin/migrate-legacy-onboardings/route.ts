/**
 * POST /api/admin/migrate-legacy-onboardings
 * Migra client_onboardings -> onboardings. Owner/manager only. Idempotente.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
} from "@/lib/api/errors"
import { migrateLegacyOnboardings } from "@/lib/services/legacy-onboarding-migration.service"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "admin")
    const result = await migrateLegacyOnboardings()
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "migrate-legacy-onboardings")
  }
}
