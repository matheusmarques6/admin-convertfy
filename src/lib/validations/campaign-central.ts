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
  type: z.enum(["image", "heading", "text", "offer", "button", "divider", "footer", "products"]),
  headline: z.string().optional(),
  sub: z.string().optional(),
  value: z.string().optional(),
  caption: z.string().optional(),
  columns: z.union([z.literal(2), z.literal(3)]).optional(),
  items: z
    .array(
      z.object({
        name: z.string().optional(),
        price: z.string().optional(),
        image_caption: z.string().optional(),
      }),
    )
    .optional(),
})

export const emailDraftSchema = z.object({
  subject: z.string(),
  preheader: z.string(),
  strategy: z.string(),
  blocks: z.array(emailDraftBlockSchema),
})

/**
 * Briefing de estrutura & tom da copy (campo `brief` em campaign_suggestions).
 * Todos os campos são opcionais. Espelha CampaignBrief em
 * src/types/campaign-central.ts. `null` apaga o briefing salvo.
 */
export const briefSchema = z.object({
  structure: z.string().max(20_000).optional(),
  tone: z.string().max(4_000).optional(),
  constraints: z.string().max(4_000).optional(),
  must_include: z.string().max(4_000).optional(),
})

export const suggestionPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), email_draft: emailDraftSchema.optional() }),
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("undo") }),
  z.object({
    action: z.literal("update_draft"),
    email_draft: emailDraftSchema.optional(),
    angle: z.string().optional(),
    send_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    // Briefing de estrutura & tom (COO). `null` apaga; objeto persiste.
    brief: briefSchema.nullable().optional(),
    // Lojas-alvo editáveis (aba Lojas do modal de detalhe). Revalidadas
    // contra client_stores na rota; min 1. Bloqueado após aprovação.
    targets: z.array(suggestionTargetSchema).min(1).optional(),
    // Canal (Email / Email + SMS / SMS / Push) — aba Agendamento.
    channel: z.string().max(60).optional(),
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

// ── Master generation (F1) ───────────────────────────────────────────

export const generateMasterSchema = z.object({
  /** Override opcional do público-alvo. Senão, usa o já persistido. */
  audience_label: z.string().max(200).optional(),
})

export const parseMasterSchema = z.object({
  raw_text: z.string().min(20).max(20_000),
})

// ── Copy results (F2) ────────────────────────────────────────────────

/** Subset usado quando a IA adapta a master pra uma loja: subject +
 * preheader + strategy + blocks completos. Vai pra copy_results[mode]
 * sob o store_id. */
export const copyResultEntrySchema = z.object({
  subject: z.string().min(1),
  preheader: z.string().default(""),
  strategy: z.string().optional(),
  blocks: z.array(emailDraftBlockSchema).min(1),
})

export const markQualitySchema = z.object({
  store_id: z.string().uuid(),
  mode: z.enum(["test", "production"]),
  quality: z.union([z.literal("good"), z.null()]),
})

export const setPilotSchema = z.object({
  store_ids: z.array(z.string().uuid()).max(10),
})

// ── Callback n8n (campaign-copy) ─────────────────────────────────────

/**
 * Bloco vindo do n8n: `id` é OPCIONAL. O handler regenera todo id no persist
 * (route.ts: `id: b.id ?? newBlockId()`), e a doc do n8n instrui o flow a
 * omitir o id (docs/n8n/campaign-copy-flow.md). Como o `emailDraftBlockSchema`
 * global exige `id`, o callback precisa desta variante — senão a validação
 * rejeita (HTTP 400) o payload do n8n e a copy nunca é gravada.
 */
const callbackBlockSchema = emailDraftBlockSchema.extend({ id: z.string().optional() })

/** Copy do callback: igual a copyResultEntrySchema, mas com blocks de id opcional. */
const callbackCopySchema = copyResultEntrySchema.extend({
  blocks: z.array(callbackBlockSchema).min(1),
})

/** Payload que o n8n posta em /api/webhooks/n8n/campaign-copy por loja. */
export const campaignCopyCallbackSchema = z.object({
  job_id: z.string().uuid(),
  suggestion_id: z.string().uuid(),
  store_id: z.string().uuid(),
  mode: z.enum(["test", "production"]),
  status: z.enum(["success", "error"]),
  copy: callbackCopySchema.optional(),
  error_message: z.string().optional(),
  meta: z
    .object({
      model: z.string().optional(),
      tokens_input: z.number().int().nonnegative().optional(),
      tokens_output: z.number().int().nonnegative().optional(),
      duration_ms: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

// ── Produção (aba "Em produção") ─────────────────────────────────────

/** Atualiza estágio (0..4) e/ou designer de UMA loja de uma campanha. */
export const productionStorePatchSchema = z
  .object({
    store_id: z.string().uuid(),
    prod_stage: z.number().int().min(0).max(4).optional(),
    designer_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.prod_stage !== undefined || v.designer_id !== undefined, {
    message: "Informe prod_stage ou designer_id",
  })

// ── Board unificado de 7 colunas (Fase 2) ────────────────────────────

/** As 7 colunas do board (espelha BOARD_COLUMNS de board-mapping.ts). */
export const boardColumnSchema = z.enum([
  "sugestao",
  "aprovada",
  "copy",
  "design",
  "revisao",
  "agendada",
  "enviada",
])

/** Move um card do board pra coluna `to`. A validação de adjacência +
 *  guard-rails é feita no service (board-move.service.ts), que conhece a
 *  coluna atual autoritativa derivada do banco. */
export const boardMoveSchema = z.object({
  to: boardColumnSchema,
})
