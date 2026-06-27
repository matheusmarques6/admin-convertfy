/**
 * Fase 3 do pipeline de DESIGN de campanha — orquestrador de handoff.
 *
 * Avanca uma `campaign_suggestion` pelas 4 etapas do pipeline `campaign_design`
 * (estrutura -> aprovacao -> producao -> finalizacao), espelhando o padrao do
 * onboarding (`attemptOnboardingHandoff` + `advanceColumn`):
 *   - "todas as tasks da etapa concluidas (+ deliverables required) -> avanca";
 *   - avanco com Compare-And-Swap (CAS) anti-concorrencia: o UPDATE so casa
 *     quando `design_column_id` ainda aponta pra etapa esperada;
 *   - a proxima etapa e materializada via `instantiateCampaignStage` (idempotente).
 *
 * A etapa `aprovacao` pertence ao COO: `attemptCampaignDesignHandoff` NUNCA a
 * auto-avanca (retorna "awaiting_decision"). A decisao e explicita via
 * `approveCampaignDesign` (-> producao) ou `requestCampaignDesignChanges`
 * (-> estrutura numa nova `design_version`).
 *
 * Referencias espelhadas:
 *   - `onboarding-task-completion.service.ts` -> `attemptOnboardingHandoff`
 *   - `onboarding-pipeline.service.ts` -> `advanceColumn` (padrao CAS)
 *   - `./campaign-design-instantiate.service` -> `instantiateCampaignStage`
 *   - `./campaign-design-bootstrap.service` -> `CAMPAIGN_DESIGN_COLUMNS`
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  CAMPAIGN_DESIGN_COLUMNS,
  type CampaignDesignStageSlug,
} from "./campaign-design-bootstrap.service"
import { instantiateCampaignStage } from "./campaign-design-instantiate.service"
import { notifyCampaignDesignStage } from "./campaign-design-notify.service"
import { syncCampaignDesignToPipelineItem } from "./campaign-design-sync.service"

const log = logger.child("CampaignDesignHandoff")

/**
 * Fase 6: espelha o sub-estagio de design no card do Campaign Central
 * (`campaign_pipeline_items`). NUNCA pode quebrar o handoff — qualquer erro e
 * engolido e logado. Inerte quando a campanha nao tem card/design ativo.
 */
async function syncSafe(params: {
  suggestionId: string
  orgId: string
}): Promise<void> {
  try {
    await syncCampaignDesignToPipelineItem(params)
  } catch (e) {
    log.error("syncCampaignDesignToPipelineItem", e)
  }
}

/**
 * Notifica a funcao responsavel da etapa (fire-and-forget). NUNCA pode quebrar
 * o handoff — qualquer erro e engolido e logado.
 */
async function notifyStageSafe(params: {
  suggestionId: string
  orgId: string
  stageSlug: CampaignDesignStageSlug
  event: "entered" | "changes_requested"
}): Promise<void> {
  try {
    await notifyCampaignDesignStage(params)
  } catch (e) {
    log.error("notifyCampaignDesignStage", e)
  }
}

export type CampaignDesignHandoffResult =
  | "advanced"
  | "not_ready"
  | "awaiting_decision"
  | "completed"
  | "no_design"

export type CampaignDesignDecisionResult = "advanced" | "not_applicable"
export type CampaignDesignReworkResult = "reworked" | "not_applicable"

interface HandoffParams {
  suggestionId: string
  orgId: string
  actorId: string | null
}

interface DeliverableTemplateField {
  slug: string
  label?: string
  type?: string
  required?: boolean
}

interface TaskRow {
  id: string
  status: string
}

interface DeliverableRow {
  field_slug: string
  required: boolean | null
  value: string | null
  file_url?: string | null
  filled_at: string | null
}

/** Ordem canonica das etapas (slug -> proxima/posicao). */
const STAGE_ORDER: CampaignDesignStageSlug[] = CAMPAIGN_DESIGN_COLUMNS.slice()
  .sort((a, b) => a.position - b.position)
  .map((c) => c.slug)

function nextStage(
  slug: CampaignDesignStageSlug,
): CampaignDesignStageSlug | null {
  const idx = STAGE_ORDER.indexOf(slug)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1]
}

function deliverableHasValue(row: DeliverableRow): boolean {
  return Boolean(row.value || row.file_url || row.filled_at)
}

interface DesignContext {
  campaign: {
    id: string
    org_id: string
    design_pipeline_id: string | null
    design_column_id: string | null
    design_version: number
    design_pilot_store_id: string | null
  }
  stageSlug: CampaignDesignStageSlug | null
  currentColumnId: string | null
  /** slug -> column id, dentro do pipeline da campanha. */
  columnIdBySlug: Record<string, string>
  requiredDeliverableSlugs: string[]
}

/** Le a campanha + resolve a etapa atual (via design_column_id -> coluna). */
async function loadDesignContext(
  suggestionId: string,
  orgId: string,
): Promise<DesignContext | null> {
  const admin = createAdminClient()
  const { data: campaign } = await admin
    .from("campaign_suggestions")
    .select(
      "id, org_id, design_pipeline_id, design_column_id, design_version, design_pilot_store_id, targets",
    )
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!campaign) return null

  const designColumnId = (campaign.design_column_id as string | null) ?? null
  const ctx: DesignContext = {
    campaign: {
      id: campaign.id as string,
      org_id: campaign.org_id as string,
      design_pipeline_id: (campaign.design_pipeline_id as string | null) ?? null,
      design_column_id: designColumnId,
      design_version: (campaign.design_version as number | null) ?? 1,
      design_pilot_store_id:
        (campaign.design_pilot_store_id as string | null) ?? null,
    },
    stageSlug: null,
    currentColumnId: designColumnId,
    columnIdBySlug: {},
    requiredDeliverableSlugs: [],
  }
  if (!designColumnId) return ctx

  // Coluna atual: slug + pipeline + deliverables required.
  const { data: currentCol } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug, pipeline_id, deliverables_template")
    .eq("id", designColumnId)
    .maybeSingle()
  if (!currentCol) return ctx

  ctx.stageSlug = (currentCol.slug as CampaignDesignStageSlug) ?? null
  ctx.requiredDeliverableSlugs = (
    (currentCol.deliverables_template ?? []) as DeliverableTemplateField[]
  )
    .filter((d) => d.required)
    .map((d) => d.slug)

  const pipelineId =
    ctx.campaign.design_pipeline_id ??
    ((currentCol.pipeline_id as string | null) ?? null)
  if (pipelineId) {
    const { data: cols } = await admin
      .from("operational_pipeline_columns")
      .select("id, slug")
      .eq("pipeline_id", pipelineId)
    for (const c of cols ?? []) {
      ctx.columnIdBySlug[c.slug as string] = c.id as string
    }
  }
  return ctx
}

/** Tasks (nao-canceladas) da etapa atual: source_id + coluna + versao. */
async function loadStageTasks(
  suggestionId: string,
  columnId: string,
  version: number,
): Promise<TaskRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("tasks")
    .select("id, status")
    .eq("source_id", suggestionId)
    .eq("operational_column_id", columnId)
    .eq("version", version)
    .neq("status", "cancelled")
  return (data ?? []) as TaskRow[]
}

function allCompleted(tasks: TaskRow[]): boolean {
  return tasks.length > 0 && tasks.every((t) => t.status === "completed")
}

/** Deliverables required preenchidos nas tasks da etapa? */
async function requiredDeliverablesFilled(
  taskIds: string[],
  requiredSlugs: string[],
): Promise<boolean> {
  if (requiredSlugs.length === 0) return true
  if (taskIds.length === 0) return false
  const admin = createAdminClient()
  const { data } = await admin
    .from("task_deliverables")
    .select("field_slug, required, value, file_url, filled_at")
    .in("task_id", taskIds)
  const rows = (data ?? []) as DeliverableRow[]
  return requiredSlugs.every((slug) => {
    const row = rows.find((r) => r.field_slug === slug)
    return Boolean(row && deliverableHasValue(row))
  })
}

/**
 * Move a campanha da coluna esperada -> destino com CAS. Retorna true se ESTA
 * chamada efetuou a transicao; false se outra ja havia movido (idempotente).
 */
async function casMove(params: {
  suggestionId: string
  fromColumnId: string
  patch: Record<string, unknown>
}): Promise<boolean> {
  const admin = createAdminClient()
  const { data: moved } = await admin
    .from("campaign_suggestions")
    .update(params.patch)
    .eq("id", params.suggestionId)
    .eq("design_column_id", params.fromColumnId)
    .select("id")
    .maybeSingle()
  return Boolean(moved)
}

/**
 * Tenta avancar o design automaticamente a partir da etapa atual.
 * `aprovacao` nunca auto-avanca (decisao do COO).
 */
export async function attemptCampaignDesignHandoff(
  params: HandoffParams,
): Promise<CampaignDesignHandoffResult> {
  const ctx = await loadDesignContext(params.suggestionId, params.orgId)
  if (!ctx || !ctx.currentColumnId || !ctx.stageSlug) return "no_design"

  const { stageSlug, currentColumnId } = ctx
  const version = ctx.campaign.design_version

  // aprovacao pertence ao COO -> nunca auto-avanca.
  if (stageSlug === "aprovacao") return "awaiting_decision"

  const tasks = await loadStageTasks(
    params.suggestionId,
    currentColumnId,
    version,
  )

  // finalizacao: terminal. Todas as tasks por loja concluidas -> completed.
  if (stageSlug === "finalizacao") {
    if (!allCompleted(tasks)) return "not_ready"
    return "completed"
  }

  // estrutura / producao: avancam quando as tasks (e deliverables required)
  // da etapa estao concluidos.
  if (!allCompleted(tasks)) return "not_ready"

  if (stageSlug === "estrutura") {
    const filled = await requiredDeliverablesFilled(
      tasks.map((t) => t.id),
      ctx.requiredDeliverableSlugs,
    )
    if (!filled) return "not_ready"
  }

  const next = nextStage(stageSlug)
  if (!next) return "not_ready"
  const nextColumnId = ctx.columnIdBySlug[next]
  if (!nextColumnId) {
    log.warn("Coluna destino nao encontrada no pipeline", {
      suggestionId: params.suggestionId,
      next,
    })
    return "not_ready"
  }

  // CAS: so a requisicao que ainda ve a coluna atual efetua a transicao.
  const moved = await casMove({
    suggestionId: params.suggestionId,
    fromColumnId: currentColumnId,
    patch: { design_column_id: nextColumnId },
  })

  // CAS perdeu (0 linhas) => outra chamada concorrente ja moveu a campanha.
  // NAO instanciar (evita sobrescrever a coluna via syncCampaignDesignState):
  // reavalia o estado pos-corrida e retorna o status coerente da etapa atual.
  if (!moved) {
    return attemptCampaignDesignHandoff(params)
  }

  // Instancia a proxima etapa (idempotente; tambem re-sincroniza design_column_id).
  await instantiateCampaignStage({
    suggestionId: params.suggestionId,
    orgId: params.orgId,
    stageSlug: next,
    pilotStoreId: ctx.campaign.design_pilot_store_id,
    createdBy: params.actorId,
  })

  // Fase 5: notifica a funcao responsavel da nova etapa (ex: aprovacao -> COO
  // avalia o Figma; finalizacao -> designer). Non-blocking.
  await notifyStageSafe({
    suggestionId: params.suggestionId,
    orgId: params.orgId,
    stageSlug: next,
    event: "entered",
  })

  // Fase 6: espelha o sub-estagio no card do Campaign Central (non-blocking).
  await syncSafe({ suggestionId: params.suggestionId, orgId: params.orgId })

  return "advanced"
}

/** Decisao do COO: aprova a estrutura -> producao. */
export async function approveCampaignDesign(
  params: HandoffParams,
): Promise<CampaignDesignDecisionResult> {
  const ctx = await loadDesignContext(params.suggestionId, params.orgId)
  if (!ctx || !ctx.currentColumnId || ctx.stageSlug !== "aprovacao") {
    return "not_applicable"
  }
  const producaoColumnId = ctx.columnIdBySlug["producao"]
  if (!producaoColumnId) return "not_applicable"

  const moved = await casMove({
    suggestionId: params.suggestionId,
    fromColumnId: ctx.currentColumnId,
    patch: { design_column_id: producaoColumnId },
  })

  // CAS perdeu => outra decisao concorrente (approve/requestChanges) ja saiu de
  // aprovacao. NAO instanciar producao (evita sobrescrever a coluna corrida).
  if (!moved) return "not_applicable"

  await instantiateCampaignStage({
    suggestionId: params.suggestionId,
    orgId: params.orgId,
    stageSlug: "producao",
    pilotStoreId: ctx.campaign.design_pilot_store_id,
    createdBy: params.actorId,
  })

  // Fase 5: producao -> notifica os designers (Figma aprovado, mao na massa).
  await notifyStageSafe({
    suggestionId: params.suggestionId,
    orgId: params.orgId,
    stageSlug: "producao",
    event: "entered",
  })

  // Fase 6: espelha o sub-estagio no card do Campaign Central (non-blocking).
  await syncSafe({ suggestionId: params.suggestionId, orgId: params.orgId })

  return "advanced"
}

/**
 * Decisao do COO: pede mudancas -> volta pra estrutura numa NOVA design_version.
 */
export async function requestCampaignDesignChanges(
  params: HandoffParams,
): Promise<CampaignDesignReworkResult> {
  const ctx = await loadDesignContext(params.suggestionId, params.orgId)
  if (!ctx || !ctx.currentColumnId || ctx.stageSlug !== "aprovacao") {
    return "not_applicable"
  }
  const estruturaColumnId = ctx.columnIdBySlug["estrutura"]
  if (!estruturaColumnId) return "not_applicable"

  const nextVersion = ctx.campaign.design_version + 1

  // CAS: incrementa a versao e volta pra estrutura em uma unica transicao.
  const moved = await casMove({
    suggestionId: params.suggestionId,
    fromColumnId: ctx.currentColumnId,
    patch: {
      design_column_id: estruturaColumnId,
      design_version: nextVersion,
    },
  })

  // CAS perdeu => outra decisao concorrente (approve/requestChanges) ja saiu de
  // aprovacao. NAO instanciar estrutura (evita sobrescrever a coluna corrida e
  // criar tasks numa versao orfa).
  if (!moved) return "not_applicable"

  // Instancia a estrutura na NOVA versao (le design_version ja incrementada).
  await instantiateCampaignStage({
    suggestionId: params.suggestionId,
    orgId: params.orgId,
    stageSlug: "estrutura",
    pilotStoreId: ctx.campaign.design_pilot_store_id,
    createdBy: params.actorId,
  })

  // Fase 5: estrutura volta pros designers com o pedido de mudancas do COO.
  await notifyStageSafe({
    suggestionId: params.suggestionId,
    orgId: params.orgId,
    stageSlug: "estrutura",
    event: "changes_requested",
  })

  // Fase 6: espelha o sub-estagio no card do Campaign Central (non-blocking).
  await syncSafe({ suggestionId: params.suggestionId, orgId: params.orgId })

  return "reworked"
}
