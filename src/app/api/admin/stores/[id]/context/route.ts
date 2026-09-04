/**
 * PATCH /api/admin/stores/[id]/context — atualiza campos de contexto da loja
 *
 * Recebe partial de campos do client_stores relacionados a Contexto:
 * marca, briefing, operacao, lista/engajamento, materiais.
 *
 * Centralizado aqui pra UI nao precisar saber quais campos existem no
 * client_stores — manda qualquer subset e o endpoint valida + persiste.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { marcarVerificadoPorEdicao } from "@/lib/agents/objecoes/catalogo-regras"
import type { CatalogoDeObjecoes } from "@/lib/agents/objecoes/vocabulario"
import { logger } from "@/lib/logger"

const log = logger.child("StoreContextPatch")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  // Marca / persona
  tom_de_voz: z.enum(["formal", "casual", "afetivo", "divertido"]).nullable().optional(),
  posicionamento_preco: z.enum(["popular", "medio", "premium"]).nullable().optional(),
  persona: z.string().nullable().optional(),
  diferencial: z.string().nullable().optional(),
  slogan: z.string().nullable().optional(),
  cores: z.array(z.object({
    name: z.string(),
    hex: z.string(),
    use: z.string().optional(),
  })).nullable().optional(),
  fontes: z.object({
    titulo: z.string().optional(),
    corpo: z.string().optional(),
  }).nullable().optional(),
  hashtags: z.array(z.string()).nullable().optional(),
  niche: z.string().nullable().optional(),
  target_audience: z.string().nullable().optional(),
  additional_notes: z.string().nullable().optional(),
  // Operacao / catalogo
  ticket_medio_cents: z.number().nullable().optional(),
  taxa_conversao: z.number().nullable().optional(),
  faturamento_medio_cents: z.number().nullable().optional(),
  margem_media: z.number().nullable().optional(),
  recorrencia: z.enum(["compra-unica", "assinatura", "mista"]).nullable().optional(),
  sazonalidade: z.array(z.string()).nullable().optional(),
  frete_medio_cents: z.number().nullable().optional(),
  frete_prazo: z.string().nullable().optional(),
  frete_cobertura: z.string().nullable().optional(),
  frete_gratis_acima_cents: z.number().nullable().optional(),
  pagamento_split: z.record(z.string(), z.number()).nullable().optional(),
  devolucao_politica: z.string().nullable().optional(),
  marketplaces: z.array(z.string()).nullable().optional(),
  // Lista / engajamento
  lista_total: z.number().nullable().optional(),
  lista_engajados_30: z.number().nullable().optional(),
  lista_engajados_60: z.number().nullable().optional(),
  lista_engajados_90: z.number().nullable().optional(),
  lista_crescimento_mensal: z.number().nullable().optional(),
  sms_consent_pct: z.number().nullable().optional(),
  // Materiais
  figma_onboarding_url: z.string().nullable().optional(),
  figma_emails_url: z.string().nullable().optional(),
  drive_folder_url: z.string().nullable().optional(),
  brand_manual_url: z.string().nullable().optional(),
  research_doc_url: z.string().nullable().optional(),
  // Pesquisa & Diagnóstico · 1. Perfil da Marca
  brand_thesis: z.string().nullable().optional(),
  brand_about: z.string().nullable().optional(),
  brand_pillars: z.array(z.object({
    number: z.string(),
    label: z.string(),
    text: z.string(),
  })).nullable().optional(),
  brand_presence: z.string().nullable().optional(),
  // 2. Sobre a loja
  store_story: z.string().nullable().optional(),
  store_milestones: z.array(z.object({
    year: z.string(),
    event: z.string(),
    highlight: z.boolean().optional(),
    muted: z.boolean().optional(),
  })).nullable().optional(),
  // 3. Cliente Ideal
  icp_persona: z.object({
    name: z.string(),
    age: z.string(),
    city: z.string(),
    monogram: z.string(),
  }).nullable().optional(),
  icp_demographics: z.object({
    age_range: z.string(),
    income: z.string(),
    education: z.string(),
    occupation: z.string(),
    religion: z.string(),
  }).nullable().optional(),
  icp_day_in_life: z.string().nullable().optional(),
  icp_motivations: z.array(z.string()).nullable().optional(),
  icp_frictions: z.array(z.string()).nullable().optional(),
  // 3b. ICP avançado (blocos analíticos)
  icp_awareness: z.object({
    dominant: z.string(),
    levels: z.array(z.object({
      key: z.string(),
      label: z.string(),
      pct: z.number(),
    })),
    copy_implication: z.string(),
  }).nullable().optional(),
  icp_starving_crowd: z.object({
    verdict: z.string(),
    scores: z.array(z.object({
      key: z.string(),
      label: z.string(),
      value: z.number(),
      note: z.string(),
    })),
    total: z.number(),
  }).nullable().optional(),
  icp_unique_mechanism: z.object({
    headline: z.string(),
    body: z.string(),
  }).nullable().optional(),
  icp_objections: z.array(z.object({
    objection: z.string(),
    treatment: z.string(),
  })).nullable().optional(),
  icp_vocabulary: z.array(z.object({
    type: z.enum(["Dor", "Desejo", "Objeção", "Marca"]),
    channel: z.string(),
    quote: z.string(),
  })).nullable().optional(),
  // 4. Tom de Comunicação
  tone_description: z.string().nullable().optional(),
  tone_do: z.array(z.string()).nullable().optional(),
  tone_dont: z.array(z.string()).nullable().optional(),
  tone_use_words: z.array(z.string()).nullable().optional(),
  tone_avoid_words: z.array(z.string()).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data

    // Strip undefined pra nao escrever null nas colunas que nao vieram
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) update[k] = v
    }
    if (Object.keys(update).length === 0) {
      return successResponse(request, { updated: false })
    }

    // Edição humana das objeções = a única revisão que o catálogo recebe
    // (set/2026): a objeção do catálogo cujo texto casa com a editada ganha
    // `verificado: true` e o tratamento novo; a fonte vira 'manual'.
    // Fail-open: sem catálogo (ou sem a coluna), a projeção é gravada como
    // antes.
    if (Array.isArray(update.icp_objections)) {
      try {
        const { data: row } = await admin
          .from("client_stores")
          .select("objection_catalog")
          .eq("id", storeId)
          .maybeSingle()
        const catalogo = (row as { objection_catalog?: unknown } | null)?.objection_catalog
        if (catalogo && typeof catalogo === "object") {
          const { catalogo: novo, tocadas } = marcarVerificadoPorEdicao(
            catalogo as CatalogoDeObjecoes,
            update.icp_objections as Array<{ objection: string; treatment: string }>,
          )
          if (tocadas > 0) {
            update.objection_catalog = novo
            update.objection_catalog_source = "manual"
            update.objection_catalog_updated_at = new Date().toISOString()
          }
        }
      } catch (err) {
        log.warn("context.objection_catalog_verificado_failed", {
          storeId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const { error } = await admin
      .from("client_stores")
      .update(update)
      .eq("id", storeId)
    if (error) throw error
    return successResponse(request, { updated: true })
  } catch (error) {
    return errorResponse(request, error, "store-context-patch")
  }
}
