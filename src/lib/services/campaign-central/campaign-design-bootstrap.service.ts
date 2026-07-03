/**
 * Bootstrap idempotente do pipeline de DESIGN de campanha por org.
 *
 * Cria 1 pipeline `campaign_design` + 5 colunas (estrutura, aprovacao,
 * producao, finalizacao, implementacao) com templates inline. Espelha o padrao
 * do onboarding-bootstrap, reusando o mesmo mecanismo de operational pipeline +
 * tasks + deliverables + gate de visibilidade por funcao.
 *
 * Etapas e responsaveis:
 *   1. estrutura     (designer)       -> 1 task; entregavel = link Figma (1 loja piloto)
 *   2. aprovacao     (coo)            -> COO aprova ou pede mudancas (nova versao)
 *   3. producao      (designer)       -> 3 tasks: imagens, textos, identidade visual
 *   4. finalizacao   (designer)       -> instanciada por loja (liga no prod_stage)
 *   5. implementacao (implementacao)  -> 4 tasks: corte modelo + subir por idioma
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  ChecklistItem,
  DeliverableField,
} from "@/types/onboarding-pipeline"

const log = logger.child("CampaignDesignBootstrap")

export const CAMPAIGN_DESIGN_PIPELINE_SLUG = "campaign_design"

export type CampaignDesignStageSlug =
  | "estrutura"
  | "aprovacao"
  | "producao"
  | "finalizacao"
  | "implementacao"

interface CampaignColumnSeed {
  name: string
  slug: CampaignDesignStageSlug
  position: number
  color: string
  is_initial?: boolean
  is_final?: boolean
  default_assignee_role: string
  sla_hours: number
  checklist_template: ChecklistItem[]
  deliverables_template: DeliverableField[]
}

function chk(id: string, label: string, order: number, slug: string): ChecklistItem {
  return { id, label, order, slug }
}

export const CAMPAIGN_DESIGN_COLUMNS: CampaignColumnSeed[] = [
  {
    name: "Estrutura de design",
    slug: "estrutura",
    position: 1,
    color: "#A855F7",
    is_initial: true,
    default_assignee_role: "designer",
    sla_hours: 24,
    checklist_template: [
      chk(
        "estrutura_figma",
        "Criar a estrutura do email no Figma (1 loja piloto, pro COO visualizar)",
        1,
        "estrutura_figma",
      ),
    ],
    deliverables_template: [
      {
        slug: "figma_structure_link",
        label: "Link do Figma com a estrutura",
        type: "url",
        required: true,
      },
    ],
  },
  {
    name: "Aprovacao da estrutura",
    slug: "aprovacao",
    position: 2,
    color: "#F59E0B",
    // Responsavel = COO (bypass). A etapa pertence ao COO, que aprova ou
    // pede mudancas (gerando nova versao de design).
    default_assignee_role: "coo",
    sla_hours: 24,
    checklist_template: [
      chk(
        "aprovacao_avaliar",
        "Avaliar a estrutura e aprovar ou pedir mudancas",
        1,
        "aprovacao_avaliar",
      ),
    ],
    deliverables_template: [],
  },
  {
    name: "Producao",
    slug: "producao",
    position: 3,
    color: "#0EA5E9",
    default_assignee_role: "designer",
    sla_hours: 48,
    checklist_template: [
      chk("producao_imagens", "Criacao das imagens", 1, "producao_imagens"),
      chk("producao_textos", "Mudanca e formatacao dos textos", 2, "producao_textos"),
      chk(
        "producao_identidade",
        "Mudanca da identidade visual do email",
        3,
        "producao_identidade",
      ),
    ],
    deliverables_template: [],
  },
  {
    name: "Finalizacao por loja",
    slug: "finalizacao",
    position: 4,
    color: "#10B981",
    default_assignee_role: "designer",
    sla_hours: 36,
    // Tasks desta etapa sao instanciadas POR LOJA (nao via template), ligando
    // no prod_stage/Omnisend existente.
    checklist_template: [],
    deliverables_template: [],
  },
  {
    name: "Implementacao",
    slug: "implementacao",
    position: 5,
    color: "#059669",
    is_final: true,
    default_assignee_role: "implementacao",
    sla_hours: 36,
    checklist_template: [
      chk("impl_corte_modelo", "Corte modelo", 1, "impl_corte_modelo"),
      chk(
        "impl_subir_ptbr",
        "Subir e-mails - Portugues (Brasil)",
        2,
        "impl_subir_ptbr",
      ),
      chk("impl_subir_en", "Subir e-mails - Ingles", 3, "impl_subir_en"),
      chk(
        "impl_subir_outras",
        "Subir e-mails - Outras linguas",
        4,
        "impl_subir_outras",
      ),
    ],
    deliverables_template: [],
  },
]

export interface CampaignDesignBootstrapResult {
  pipelineId: string
  columnsBySlug: Record<CampaignDesignStageSlug, string>
}

/** Cria/garante o pipeline campaign_design + colunas. Idempotente por org. */
export async function ensureCampaignDesignPipeline(
  orgId: string,
  userId: string | null = null,
): Promise<CampaignDesignBootstrapResult> {
  const admin = createAdminClient()

  // 1. Pipeline
  let pipelineId: string
  const { data: existingPipe } = await admin
    .from("operational_pipelines")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "campaign_design")
    .eq("is_active", true)
    .maybeSingle()

  if (existingPipe?.id) {
    pipelineId = existingPipe.id as string
  } else {
    const { data: newPipe, error: pipeErr } = await admin
      .from("operational_pipelines")
      .insert({
        org_id: orgId,
        type: "campaign_design",
        name: "Design de Campanhas",
        slug: CAMPAIGN_DESIGN_PIPELINE_SLUG,
        description: "Pipeline de design pos-aprovacao de campanha",
        is_active: true,
        created_by: userId,
      })
      .select("id")
      .single()
    if (pipeErr || !newPipe) {
      throw new Error(`Falha bootstrap campaign_design pipeline: ${pipeErr?.message}`)
    }
    pipelineId = newPipe.id as string
  }

  // 2. Colunas (idempotente por slug + re-sync de template)
  const { data: existingCols } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug")
    .eq("pipeline_id", pipelineId)
  const existingSlugs = new Set((existingCols ?? []).map((c) => c.slug as string))

  const colsToInsert = CAMPAIGN_DESIGN_COLUMNS.filter(
    (c) => !existingSlugs.has(c.slug),
  ).map((c) => ({
    pipeline_id: pipelineId,
    name: c.name,
    slug: c.slug,
    position: c.position,
    color: c.color,
    is_initial: c.is_initial ?? false,
    is_final: c.is_final ?? false,
    checklist_template: c.checklist_template,
    deliverables_template: c.deliverables_template,
    whatsapp_template: null,
    default_assignee_role: c.default_assignee_role,
    sla_hours: c.sla_hours,
    automation_rules: [],
  }))

  if (colsToInsert.length > 0) {
    const { error: colsErr } = await admin
      .from("operational_pipeline_columns")
      .insert(colsToInsert)
    if (colsErr) {
      log.warn("Insert colunas campaign_design falhou", {
        code: colsErr.code,
        msg: colsErr.message,
      })
    }
  }

  // Re-sync de templates pras colunas que ja existiam (propaga mudancas no SEED)
  for (const seed of CAMPAIGN_DESIGN_COLUMNS) {
    if (!existingSlugs.has(seed.slug)) continue
    await admin
      .from("operational_pipeline_columns")
      .update({
        name: seed.name,
        position: seed.position,
        color: seed.color,
        is_initial: seed.is_initial ?? false,
        is_final: seed.is_final ?? false,
        checklist_template: seed.checklist_template,
        deliverables_template: seed.deliverables_template,
        default_assignee_role: seed.default_assignee_role,
        sla_hours: seed.sla_hours,
      })
      .eq("pipeline_id", pipelineId)
      .eq("slug", seed.slug)
  }

  // 3. Resolve os ids das colunas por slug
  const { data: cols } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug")
    .eq("pipeline_id", pipelineId)
  const columnsBySlug = {} as Record<CampaignDesignStageSlug, string>
  for (const c of cols ?? []) {
    columnsBySlug[c.slug as CampaignDesignStageSlug] = c.id as string
  }

  return { pipelineId, columnsBySlug }
}
