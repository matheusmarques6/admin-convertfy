import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("Users")

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url, role")
      .order("name")

    if (error) {
      log.error("Error fetching users", { error: error.message })
      throw new AppError("Erro ao buscar usuários", 500)
    }

    return successResponse(request, { users: users || [] })
  } catch (error) {
    return errorResponse(request, error, "Users GET")
  }
}
