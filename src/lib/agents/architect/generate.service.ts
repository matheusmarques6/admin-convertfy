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
import { isTextOnlyEmail } from "./blueprint-loader"
import { loadGlobalReferenceTemplate } from "../reference-template"
import { reconcileEmailStructure } from "@/lib/services/reconcile-blocks.service"
import { resolveStructure, clampStructure } from "./outline-sections"
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
  /**
   * Reescreve a estrutura de blocos mesmo em emails ready/approved/live.
   * Propaga ao `reconcileEmailStructure`. Default false (preserva finalizados,
   * comportamento histórico). Quando true, a copy existente continua sendo
   * preservada por tipo (carry-over); blocos novos vêm vazios e precisam de
   * regeração de copy depois.
   */
  force?: boolean
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

  // Email "somente texto" (email_blueprints.text_only): NUNCA gera arquitetura
  // por loja — sem LLM, sem upsert em store_email_*. Retornar "global" settla
  // como 'done' na fila e conta como ok no generateForEmails; o consumidor
  // (dispatch/build-vars) usa a estrutura global. Cobre também jobs já
  // enfileirados antes da flag e os caminhos manuais (Testar/Regenerar).
  if (await isTextOnlyEmail(admin, input.flowType, input.emailNumber)) {
    log.info("architect.skip_text_only", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
    })
    return { referenceSource: "global" }
  }

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

  // Parâmetros globais do pipeline (aba Configurações): clamp de blocos por
  // email e modelo default usado como fallback quando o agente não tem
  // config ativa em email_agent_configs.
  const orgId = (store.org_id as string | undefined) ?? null
  let maxBlocksPerEmail: number | null = null
  let defaultModel: string | null = null
  let blueprintMode: "auto" | "llm" | "deterministic" = "auto"
  if (orgId) {
    const { data: settingsRow } = await admin
      .from("email_generation_settings")
      .select("max_blocks_per_email, default_model, blueprint_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    maxBlocksPerEmail =
      (settingsRow?.max_blocks_per_email as number | undefined) ?? null
    defaultModel = (settingsRow?.default_model as string | undefined) ?? null
    const rawMode = settingsRow?.blueprint_mode as string | undefined
    if (rawMode === "llm" || rawMode === "deterministic") blueprintMode = rawMode
  }

  // Passo 1 — Montador: gera o HTML seguindo a estrutura geral do outline
  // (categoria + rótulo original de cada bloco, na ordem).
  let structure = resolveStructure(outline)
  if (maxBlocksPerEmail != null && structure.length > maxBlocksPerEmail) {
    log.info("architect.structure_clamped", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      from: structure.length,
      to: maxBlocksPerEmail,
    })
    // Apara o MIOLO preservando abertura + footer (não corta a cauda direto).
    structure = clampStructure(structure, maxBlocksPerEmail)
  }
  const { html, source, slots } = await assembleStoreReference({
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
    defaultModel,
  })

  // Passo 2 — Blueprint: extrai a estrutura do HTML montado.
  const { source: blueprintSource } = await generateStoreBlueprint({
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
    defaultModel,
    slots,
    blueprintMode,
  })

  // Passo 3 — Propaga a estrutura recém-gerada para os `email_blocks`.
  // Só quando o Blueprint foi REALMENTE gerado pelo LLM (source='ai' →
  // `store_email_blueprints` atualizado): aí os blocks precisam acompanhar a
  // nova estrutura (na ordem do reference do Montador), senão o email fica
  // preso na composição antiga e o reference é ignorado pelo HTML agent. No
  // fallback (source='manual') o store_bp não muda — nada a propagar.
  // Reconciliação aditiva (carry-over de copy) e não-destrutiva p/ finalizados;
  // falha aqui não derruba o Architect (o dispatch reconcilia de novo depois).
  if (blueprintSource === "ai") {
    try {
      const r = await reconcileEmailStructure(
        input.storeId,
        input.flowType,
        input.emailNumber,
        { force: input.force === true },
      )
      if (r.reconciled) {
        log.info("architect.blocks_reconciled", {
          storeId: input.storeId,
          flowType: input.flowType,
          emailNumber: input.emailNumber,
          added: r.added,
          total: r.total,
          forced_through_finalized: r.forced_through_finalized === true,
        })
      }
    } catch (err) {
      log.warn("architect.reconcile_blocks_failed", {
        storeId: input.storeId,
        flowType: input.flowType,
        emailNumber: input.emailNumber,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

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
  options: { force?: boolean } = {},
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
          force: options.force === true,
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
