/**
 * Orquestrador do Component Assembler (Epic AE).
 *
 * Para um (loja × email): carrega o contexto, gera o blueprint detalhado
 * (passo A) e monta o reference HTML escolhendo componentes (passo B).
 * Auto-suficiente — pode ser chamado do onboarding, de um endpoint de
 * regeneração ou de um cron.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { EmailOutlineTemplate } from "@/types/email-generation"

import { pesquisaToFullText, type PesquisaFields } from "@/lib/briefing/briefing-text"
import { mapTomVozToMood } from "../image/mood-mapping"
import { loadGlobalReferenceTemplate } from "../reference-template"
import { resolveStructure } from "./outline-sections"
import { generateStoreBlueprint } from "./blueprint-generator.service"
import {
  assembleStoreReference,
  type ReferenceSource,
} from "./component-assembler.service"

const log = logger.child("ArchitectGenerate")

interface BriefingMarca {
  nicho?: string
  posicionamento?: string
  persona?: string
  tom_voz?: string
}

export interface GenerateArchitectInput {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
}

/**
 * true se a feature está configurada (há ao menos um outline ou uma
 * variante de componente). Evita pagar latência de LLM em lojas/ambientes
 * onde a biblioteca ainda não foi populada (comportamento idêntico ao atual).
 */
export async function isArchitectConfigured(): Promise<boolean> {
  const admin = createAdminClient()
  const [outlines, variants] = await Promise.all([
    admin
      .from("email_outline_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    admin
      .from("email_component_variants")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ])
  return (outlines.count ?? 0) > 0 || (variants.count ?? 0) > 0
}

export async function generateBlueprintAndReference(
  input: GenerateArchitectInput,
): Promise<{ referenceSource: ReferenceSource }> {
  const admin = createAdminClient()
  const [storeRes, briefingRes, productsRes, outlineRes, refTemplateHtml] = await Promise.all([
    admin
      .from("client_stores")
      .select("*")
      .eq("id", input.storeId)
      .maybeSingle(),
    admin
      .from("store_briefings")
      .select("marca")
      .eq("store_id", input.storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("store_top_products")
      .select("title")
      .eq("store_id", input.storeId)
      .order("rank", { ascending: true })
      .limit(5),
    admin
      .from("email_outline_templates")
      .select("*")
      .eq("flow_type", input.flowType)
      .eq("email_number", input.emailNumber)
      .eq("is_active", true)
      .maybeSingle(),
    // Referência curada global (mesmo flow×email): input/inspiração do
    // Montador. A MESMA fonte segue como fallback no build-vars (consumidor).
    loadGlobalReferenceTemplate(admin, input.flowType, input.emailNumber),
  ])

  const store = (storeRes.data ?? {}) as Record<string, unknown>
  const marca =
    ((briefingRes.data as { marca?: BriefingMarca } | null)?.marca ??
      {}) as BriefingMarca
  const products = (productsRes.data as Array<{ title: string }> | null) ?? []
  const outline = (outlineRes.data as EmailOutlineTemplate | null) ?? null

  const brandName = (store.store_name as string) || "Loja"
  const nicho = marca.nicho || (store.niche as string) || ""
  const posicionamento =
    marca.posicionamento || (store.posicionamento_preco as string) || ""
  const persona =
    marca.persona ||
    (store.icp_persona as string) ||
    (store.persona as string) ||
    ""
  const tomVoz =
    marca.tom_voz ||
    (store.tone_description as string) ||
    (store.tom_de_voz as string) ||
    ""
  const topProductNames = products.map((p) => p.title).filter(Boolean)
  const mood = mapTomVozToMood(tomVoz)
  // Pesquisa & Diagnóstico (5 pilares) serializada — fonte rica p/ os agentes.
  const pesquisa = pesquisaToFullText(store as PesquisaFields)

  // Passo 1 — Montador: gera o HTML seguindo a estrutura geral do outline
  // (categoria + rótulo original de cada bloco, na ordem).
  const structure = resolveStructure(outline)
  const { html, source } = await assembleStoreReference({
    storeId: input.storeId,
    flowType: input.flowType,
    emailNumber: input.emailNumber,
    batchId: input.batchId,
    triggeredBy: input.triggeredBy,
    brandName,
    nicho,
    posicionamento,
    tomVoz,
    mood,
    persona,
    briefingJson: JSON.stringify(marca),
    pesquisa,
    outlineObjective: outline?.objective ?? "",
    outlineGuidance: outline?.guidance ?? "",
    outlineToneHint: outline?.tone_hint ?? "",
    referenceTemplateHtml: refTemplateHtml ?? "",
    structure,
  })

  // Passo 2 — Blueprint: extrai a estrutura do HTML montado.
  await generateStoreBlueprint({
    storeId: input.storeId,
    flowType: input.flowType,
    emailNumber: input.emailNumber,
    batchId: input.batchId,
    triggeredBy: input.triggeredBy,
    brandName,
    nicho,
    posicionamento,
    persona,
    tomVoz,
    topProductNames,
    outline,
    pesquisa,
    referenceHtml: html ?? "",
  })

  return { referenceSource: source }
}

/**
 * Roda o agente para vários emails (loja inteira) em paralelo. Falha de um
 * email não derruba os demais.
 */
export async function generateForEmails(
  storeId: string,
  batchId: string,
  emails: Array<{ flowType: string; emailNumber: number }>,
  triggeredBy?: string,
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  await Promise.all(
    emails.map(async (e) => {
      try {
        await generateBlueprintAndReference({
          storeId,
          flowType: e.flowType,
          emailNumber: e.emailNumber,
          batchId,
          triggeredBy,
        })
        ok++
      } catch (err) {
        failed++
        log.error("architect.email_failed", {
          storeId,
          flowType: e.flowType,
          emailNumber: e.emailNumber,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )
  log.info("architect.batch_done", { storeId, ok, failed })
  return { ok, failed }
}
