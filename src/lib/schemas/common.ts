import { z } from "zod"
import { AppError } from "@/lib/api/errors"

// --- Pagination ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})

// --- ID Params ---

export const uuidSchema = z.string().uuid("ID inválido")

export const idParamSchema = z.object({
  id: uuidSchema,
})

// --- Auth ---

export const emailSchema = z.string().trim().toLowerCase().email("Email inválido")

export const passwordSchema = z.string().min(6, "Senha deve ter pelo menos 6 caracteres")

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

// --- Campaign ---

export const campaignCreateSchema = z.object({
  store_id: uuidSchema.optional(),
  client_id: uuidSchema.optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  scheduled_date: z.string().min(1, "Data é obrigatória"),
  scheduled_time: z.string().optional(),
  channel: z.enum(["email", "sms", "push", "whatsapp"]).default("email"),
  campaign_type: z.enum(["promotional", "newsletter", "transactional", "automation", "seasonal", "launch", "other"]).default("promotional"),
  status: z.enum(["draft", "pending_review", "approved", "rejected", "scheduled", "sent", "cancelled"]).default("draft"),
  description: z.string().optional(),
  subject_line: z.string().optional(),
  preview_text: z.string().optional(),
  segment_name: z.string().optional(),
  estimated_recipients: z.coerce.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().default("#3b82f6"),
  notes: z.string().optional(),
})

// --- Organization ---

export const organizationCreateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z.string().min(1, "Slug é obrigatório").regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  description: z.string().optional(),
  logo_url: z.string().url().optional().or(z.literal("")),
})

// --- Org Member ---

export const orgMemberCreateSchema = z.object({
  org_id: uuidSchema,
  profile_id: uuidSchema.optional(),
  email: emailSchema.optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["owner", "manager", "coordinator", "copywriter", "designer", "developer", "support", "analyst"]),
  job_title: z.string().optional(),
  features: z.array(z.string()).optional(),
  store_ids: z.array(uuidSchema).optional(),
}).refine(
  (data) => data.profile_id || (data.email && data.name),
  { message: "Se profile_id não for informado, email e name são obrigatórios" }
)

// --- Task ---

export const taskCreateSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  type: z.enum(["onboarding", "campaign", "request", "general", "meeting", "deadline"]).default("general"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assignee_id: uuidSchema.nullable().optional(),
  client_id: uuidSchema.nullable().optional(),
  store_id: uuidSchema.nullable().optional(),
  due_date: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Permite tarefa manual vinculada a onboarding (Jean cria pra time) */
  onboarding_id: uuidSchema.nullable().optional(),
  operational_column_id: uuidSchema.nullable().optional(),
  source_type: z.string().optional(),
  status: z.enum(["pending", "in_progress", "in_review", "completed", "cancelled"]).optional(),
})

// --- Portal User ---

export const portalUserCreateSchema = z.object({
  client_id: uuidSchema,
  email: emailSchema,
  name: z.string().min(1, "Nome é obrigatório"),
  phone: z.string().optional(),
  is_primary: z.boolean().default(false),
  permissions: z.object({
    view_reports: z.boolean().optional(),
    view_invoices: z.boolean().optional(),
    view_campaigns: z.boolean().optional(),
    edit_profile: z.boolean().optional(),
    manage_stores: z.boolean().optional(),
  }).optional(),
})

// --- Monetary Validation ---

/**
 * Validates a monetary value: must be finite, > 0, and <= 99999999.99.
 * Throws AppError(400) if invalid. Returns the validated number.
 */
export function validateMonetaryValue(value: unknown, fieldName: string = "Valor"): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0 || num > 99999999.99) {
    throw new AppError(
      `${fieldName} invalido. Deve ser positivo e menor que R$ 100.000.000`,
      400
    )
  }
  return num
}

// --- Search/Filter ---

export const dateRangeSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  period: z.enum(["today", "7d", "30d", "90d", "month", "year", "custom"]).optional(),
})
