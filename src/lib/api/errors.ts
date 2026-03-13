import { NextRequest, NextResponse } from "next/server"
import { ZodError, ZodType } from "zod"
import { SupabaseClient } from "@supabase/supabase-js"
import { corsHeaders } from "@/lib/cors"
import { logger } from "@/lib/logger"

// --- Error Classes ---

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autorizado") {
    super(message, 401, "UNAUTHORIZED")
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super(message, 403, "FORBIDDEN")
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Recurso", message?: string) {
    super(message || `${resource} não encontrado`, 404, "NOT_FOUND")
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR")
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT")
  }
}

export class EmailConfigError extends AppError {
  constructor(message = "Serviço de email não configurado") {
    super(message, 500, "EMAIL_CONFIG_ERROR")
  }
}

export class EmailRateLimitError extends AppError {
  constructor(message = "Rate limit de email excedido") {
    super(message, 429, "EMAIL_RATE_LIMIT")
  }
}

export class EmailDeliveryError extends AppError {
  constructor(message = "Falha ao entregar email") {
    super(message, 502, "EMAIL_DELIVERY_ERROR")
  }
}

// --- Response Helpers ---

interface ApiErrorResponse {
  error: string
  code?: string
  details?: Record<string, string[]>
}

interface ApiSuccessResponse<T> {
  success: true
  data?: T
  message?: string
}

export function errorResponse(
  request: NextRequest,
  error: unknown,
  context?: string
): NextResponse<ApiErrorResponse> {
  const origin = request.headers.get("origin")

  // Known application errors
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error(`[${context || "API"}] ${error.message}`, { code: error.code })
    }
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode, headers: corsHeaders(origin) }
    )
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {}
    for (const issue of error.issues) {
      const path = issue.path.join(".") || "_root"
      if (!details[path]) details[path] = []
      details[path].push(issue.message)
    }
    return NextResponse.json(
      { error: "Dados inválidos", code: "VALIDATION_ERROR", details },
      { status: 400, headers: corsHeaders(origin) }
    )
  }

  // Supabase PostgrestError (plain object with message/code, not instanceof Error)
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    "code" in error &&
    !(error instanceof Error)
  ) {
    const pgError = error as { message: string; code: string; details?: string; hint?: string }
    logger.error(`[${context || "API"}] Database error: ${pgError.message}`, {
      code: pgError.code,
      details: pgError.details,
      hint: pgError.hint,
    })

    // Map common Postgres error codes to user-friendly messages and HTTP status
    const pgErrorMap: Record<string, { status: number; message: string }> = {
      "42501": { status: 403, message: "Permissão negada" },        // insufficient_privilege (RLS)
      "23503": { status: 400, message: "Registro referenciado não encontrado" }, // foreign_key_violation
      "23505": { status: 409, message: "Registro duplicado" },      // unique_violation
    }
    const mapped = pgErrorMap[pgError.code] || { status: 500, message: "Erro interno" }

    return NextResponse.json(
      { error: mapped.message, code: "DATABASE_ERROR" },
      { status: mapped.status, headers: corsHeaders(origin) }
    )
  }

  // Unknown errors
  const message = error instanceof Error ? error.message : "Erro interno"
  logger.error(`[${context || "API"}] Unexpected error: ${message}`, {
    stack: error instanceof Error ? error.stack : undefined,
  })

  return NextResponse.json(
    { error: "Erro interno", code: "INTERNAL_ERROR" },
    { status: 500, headers: corsHeaders(origin) }
  )
}

export function successResponse<T>(
  request: NextRequest,
  data?: T,
  options?: { status?: number; message?: string }
): NextResponse<ApiSuccessResponse<T> & T> {
  const origin = request.headers.get("origin")
  const body = {
    success: true as const,
    ...data,
    ...(options?.message ? { message: options.message } : {}),
  } as ApiSuccessResponse<T> & T

  return NextResponse.json(body, {
    status: options?.status || 200,
    headers: corsHeaders(origin),
  })
}

// --- Validation Helper ---

export function validateBody<T>(body: unknown, schema: ZodType<T>): T {
  return schema.parse(body)
}

export async function parseAndValidate<T>(
  request: NextRequest,
  schema: ZodType<T>
): Promise<T> {
  const body = await request.json()
  return schema.parse(body)
}

// --- Auth Helper ---

export interface AuthUser {
  id: string
  email?: string
}

export async function requireAuth(
  supabase: SupabaseClient
): Promise<AuthUser> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw new UnauthorizedError()
  }
  return user
}

export async function requireRole(
  supabase: SupabaseClient,
  allowedRoles: string[]
): Promise<AuthUser & { role: string }> {
  const user = await requireAuth(supabase)

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || !allowedRoles.includes(profile.role)) {
    throw new ForbiddenError()
  }

  return { ...user, role: profile.role }
}
