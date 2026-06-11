import { z } from "zod"

/**
 * Schemas Zod da Central de Campanhas.
 *
 * suggestionOutputSchema valida o output da IA (além do JSON Schema do
 * structured output) antes de persistir em campaign_suggestions.
 */

export const suggestionTriggerSchema = z.object({
  label: z.string().min(1),
  detail: z.string(),
  source: z.string().min(1),
})

export const suggestionTargetSchema = z.object({
  store_id: z.string().uuid(),
  store_name: z.string().optional().default(""),
  country: z.string().optional().default(""),
})

export const aiSuggestionSchema = z.object({
  type: z.enum(["data", "tema", "email", "performance"]),
  title: z.string().min(3),
  confidence: z.number().min(0).max(100),
  trigger: suggestionTriggerSchema,
  angle: z.string().min(10),
  subject: z.string().min(3),
  channel: z.string().default("Email"),
  targets: z.array(suggestionTargetSchema).min(1),
  target_summary: z.string().optional(),
  est_revenue: z.string().optional(),
  low_perf: z.boolean().optional().default(false),
  send_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  commemorative_date_name: z.string().optional(),
  trend_title: z.string().optional(),
})

export const aiSuggestionsOutputSchema = z.object({
  suggestions: z.array(aiSuggestionSchema),
})

export type AiSuggestion = z.infer<typeof aiSuggestionSchema>

export const aiTrendSchema = z.object({
  title: z.string().min(3),
  category: z
    .enum(["consumo", "cultural", "esportivo", "social", "viral", "outros"])
    .optional()
    .default("outros"),
  source: z.string().optional(),
  delta_label: z.string().optional(),
  tag: z.string().optional(),
  niche: z.string().optional(),
  country: z.string().optional(),
  commercial_potential: z.number().int().min(0).max(100).optional(),
  urgency: z.enum(["week", "month", "quarter"]).optional(),
  campaign_angle: z.string().optional(),
  evidence: z
    .array(
      z.object({
        url: z.string().optional(),
        title: z.string().optional(),
        quote: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
})

export const aiTrendsOutputSchema = z.object({
  trends: z.array(aiTrendSchema),
})

export type AiTrend = z.infer<typeof aiTrendSchema>

// ── Schemas das rotas (F2+) ──────────────────────────────────────────

export const emailDraftBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["image", "heading", "text", "offer", "button", "divider", "footer"]),
  headline: z.string().optional(),
  sub: z.string().optional(),
  value: z.string().optional(),
  caption: z.string().optional(),
})

export const emailDraftSchema = z.object({
  subject: z.string(),
  preheader: z.string(),
  strategy: z.string(),
  blocks: z.array(emailDraftBlockSchema),
})

export const suggestionPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), email_draft: emailDraftSchema.optional() }),
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("undo") }),
  z.object({
    action: z.literal("update_draft"),
    email_draft: emailDraftSchema.optional(),
    angle: z.string().optional(),
  }),
])

export const manualSuggestionSchema = z.object({
  title: z.string().min(3),
  type: z.enum(["data", "tema", "performance", "avulsa"]).default("avulsa"),
  channel: z.string().default("Email"),
  send_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  country: z.string().optional(),
  briefing: z.string().optional(),
  targets: z.array(suggestionTargetSchema).min(1),
})

export const generateCopySchema = z.object({
  mode: z.enum(["test", "production"]),
  store_ids: z.array(z.string().uuid()).min(1).max(30),
})
