/**
 * Component Tagger Service — orquestra o Taguedor de Variantes.
 *
 * tagComponentVariant: roda o taguedor em UMA variante e persiste a
 * proposta (html_tagged + tagging_status='pending' + tagging_meta). NUNCA
 * aprova sozinho — a revisão/edição/aprovação é humana (aba Componentes).
 *
 * tagPendingBatch: processa até `limit` variantes ativas que nunca
 * passaram pelo taguedor (tagging_status IS NULL) — inclui as que JÁ têm
 * {{TAGS}} no HTML (modo sync: o relatório acusa keys sem tag / tags
 * órfãs). Chamado em loop pela UI (cada chamada cabe no maxDuration).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors"
import type {
  EmailComponentVariant,
  TaggingMeta,
} from "@/types/email-generation"
import { loadActiveAgentConfig } from "@/lib/agents/architect/llm-invoke"
import type { FormatChainConfig } from "@/lib/agents/chains/format-invoke"
import {
  invokeComponentTagger,
  placeholderForKey,
  validateTaggedHtml,
} from "@/lib/agents/chains/component-tagger.chain"

const log = logger.child("ComponentTagger")

const DEFAULT_CONFIG: FormatChainConfig = {
  model: "z-ai/glm-5.2",
  temperature: 0.1,
  max_tokens: 32768,
  system_prompt: "",
  user_template: "",
}

const TAG_IN_HTML = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

async function loadTaggerConfig(): Promise<{
  config: FormatChainConfig
  configId?: string
}> {
  const row = await loadActiveAgentConfig("component_tagger")
  if (!row) return { config: DEFAULT_CONFIG }
  return {
    config: {
      model: row.model || DEFAULT_CONFIG.model,
      temperature: row.temperature ?? DEFAULT_CONFIG.temperature,
      max_tokens: row.max_tokens ?? DEFAULT_CONFIG.max_tokens,
      system_prompt: row.system_prompt ?? "",
      user_template: row.user_template ?? "",
    },
    configId: row.id,
  }
}

export interface TagVariantResult {
  variantId: string
  name: string
  status: "pending"
  fields: TaggingMeta["fields"]
  issues: string[]
  model: string
  duration_ms: number
}

export async function tagComponentVariant(
  variantId: string,
): Promise<TagVariantResult> {
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from("email_component_variants")
    .select("*")
    .eq("id", variantId)
    .maybeSingle()
  if (error) throw error
  if (!row) throw new NotFoundError("Variante")
  const variant = row as EmailComponentVariant

  const schema = Array.isArray(variant.output_schema)
    ? variant.output_schema
    : []
  if (schema.length === 0) {
    throw new ValidationError(
      "A variante não tem schema de output — o taguedor precisa dele pra ancorar os placeholders.",
    )
  }

  const { config } = await loadTaggerConfig()

  // Schema enxuto pro prompt, com o placeholder resolvido e a natureza
  // (explícita ou derivada: image → imagem_gerada; senão copy).
  const schemaForPrompt = schema.map((f) => ({
    key: f.key,
    placeholder: placeholderForKey(f.key),
    type: f.type,
    nature: f.nature ?? (f.type === "image" ? "imagem_gerada" : "copy"),
    example: f.example ?? "",
    guidance: f.guidance ?? "",
    image_spec: f.image_spec ?? null,
    max_len: f.max_len,
  }))

  const existingTags = Array.from(
    new Set(
      Array.from((variant.html ?? "").matchAll(TAG_IN_HTML), (m) => m[1]),
    ),
  )

  const t0 = Date.now()
  const res = await invokeComponentTagger({
    config,
    vars: {
      variant_name: variant.name,
      block_type: variant.block_type,
      schema_json: JSON.stringify(schemaForPrompt, null, 2),
      existing_tags: existingTags.length > 0 ? existingTags.join(", ") : "(nenhum)",
      html: variant.html ?? "",
    },
  })

  const check = validateTaggedHtml(
    variant.html ?? "",
    res.htmlTagged,
    schema,
    res.report,
  )
  if (!check.ok) {
    throw new ValidationError(
      `Taguedor reprovado no guard estrutural (${check.reason}) — nada foi salvo. Re-rode ou ajuste a variante.`,
    )
  }

  const meta: TaggingMeta = {
    model: config.model,
    generated_at: new Date().toISOString(),
    fields: res.report,
    issues: check.issues,
  }

  const { error: upErr } = await admin
    .from("email_component_variants")
    .update({
      html_tagged: res.htmlTagged,
      tagging_status: "pending",
      tagging_meta: meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId)
  if (upErr) throw upErr

  log.info("tagger.variant_tagged", {
    variantId,
    name: variant.name,
    fields: res.report.length,
    inference: res.report.filter((r) => r.anchored_by === "inference").length,
    issues: check.issues.length,
    durationMs: Date.now() - t0,
  })

  return {
    variantId,
    name: variant.name,
    status: "pending",
    fields: res.report,
    issues: check.issues,
    model: config.model,
    duration_ms: Date.now() - t0,
  }
}

export interface TagBatchResult {
  processed: Array<{ id: string; name: string; issues: number }>
  failed: Array<{ id: string; name: string; error: string }>
  remaining: number
}

export async function tagPendingBatch(
  limit = 3,
  excludeIds: string[] = [],
): Promise<TagBatchResult> {
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from("email_component_variants")
    .select("id, name, output_schema")
    .eq("is_active", true)
    .is("tagging_status", null)
    .order("created_at", { ascending: true })
  if (error) throw error

  // Só variantes com schema (sem schema o taguedor não tem o que ancorar —
  // ficam de fora da fila e aparecem como pendência de curadoria na UI).
  // excludeIds: a UI passa os ids que já falharam no loop — sem isso uma
  // variante quebrada no topo da fila (created_at asc) seria re-tentada
  // pra sempre e bloquearia o resto.
  const excluded = new Set(excludeIds)
  const eligible = (rows ?? []).filter(
    (r) =>
      Array.isArray(r.output_schema) &&
      r.output_schema.length > 0 &&
      !excluded.has(r.id as string),
  )
  const batch = eligible.slice(0, Math.max(1, Math.min(limit, 5)))

  const processed: TagBatchResult["processed"] = []
  const failed: TagBatchResult["failed"] = []
  for (const r of batch) {
    try {
      const res = await tagComponentVariant(r.id as string)
      processed.push({
        id: r.id as string,
        name: res.name,
        issues: res.issues.length,
      })
    } catch (err) {
      failed.push({
        id: r.id as string,
        name: (r.name as string) ?? "",
        error: err instanceof Error ? err.message : String(err),
      })
      log.warn("tagger.batch_item_failed", {
        variantId: r.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    processed,
    failed,
    remaining: Math.max(0, eligible.length - batch.length),
  }
}
