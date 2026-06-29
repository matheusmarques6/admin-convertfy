/**
 * Fase 2 do pipeline de DESIGN de campanha — instanciacao de tasks por etapa.
 *
 * A partir de uma `campaign_suggestion` aprovada, materializa as tasks de uma
 * etapa (estrutura/aprovacao/producao/finalizacao) do pipeline `campaign_design`
 * espelhando as convencoes do onboarding:
 *   - 1 task por item do `checklist_template` da coluna;
 *   - deliverables na task ANCORA (primeira);
 *   - idempotencia por `source_id` + `operational_column_id` + `version`.
 *
 * Excecao: a etapa `finalizacao` nao usa checklist (template vazio) — cria 1
 * task POR LOJA listada em `campaign_suggestions.targets`, ligando cada loja
 * ao seu fechamento (prod_stage/Omnisend existente).
 *
 * Referencia: `onboarding-pipeline.service.ts` -> `instantiateTaskForColumn`.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { ensureCampaignDesignPipeline } from "./campaign-design-bootstrap.service"
import type { CampaignDesignStageSlug } from "./campaign-design-bootstrap.service"

interface ChecklistItemRow {
  id: string
  label: string
  order?: number
  slug?: string
  assignee_role?: string | null
}

interface DeliverableRow {
  slug: string
  label: string
  type: string
  required: boolean
}

interface CampaignTarget {
  store_id: string
  store_name?: string | null
}

export async function instantiateCampaignStage(params: {
  suggestionId: string
  orgId: string
  stageSlug: CampaignDesignStageSlug
  pilotStoreId?: string | null
  createdBy?: string | null
}): Promise<{ taskIds: string[]; columnId: string }> {
  const { suggestionId, orgId, stageSlug, pilotStoreId = null, createdBy = null } =
    params
  const admin = createAdminClient()

  // 1. Garante pipeline + colunas (idempotente).
  const { pipelineId, columnsBySlug } = await ensureCampaignDesignPipeline(
    orgId,
    createdBy,
  )
  const columnId = columnsBySlug[stageSlug]
  if (!columnId) {
    throw new Error(`Coluna campaign_design nao encontrada para etapa: ${stageSlug}`)
  }

  // 2. Le a campanha (design_version + targets).
  const { data: campaign } = await admin
    .from("campaign_suggestions")
    .select("id, org_id, design_version, design_started_at, targets")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!campaign) {
    throw new Error(`Campanha nao encontrada: ${suggestionId}`)
  }
  const version = (campaign.design_version as number) ?? 1

  // 3. Idempotencia: ja existem tasks pra essa campanha+coluna+versao?
  const { data: existingTasks } = await admin
    .from("tasks")
    .select("id")
    .eq("source_id", suggestionId)
    .eq("operational_column_id", columnId)
    .eq("version", version)
  const existing = (existingTasks ?? []) as Array<{ id: string }>
  if (existing.length > 0) {
    await syncCampaignDesignState({
      admin,
      suggestionId,
      pipelineId,
      columnId,
      stageSlug,
      pilotStoreId,
      designStartedAt: campaign.design_started_at as string | null,
    })
    return { taskIds: existing.map((t) => t.id), columnId }
  }

  // 4. Resolve a coluna (template + role default).
  const { data: col } = await admin
    .from("operational_pipeline_columns")
    .select("name, slug, default_assignee_role, checklist_template, deliverables_template")
    .eq("id", columnId)
    .maybeSingle()
  if (!col) {
    throw new Error(`Coluna inexistente: ${columnId}`)
  }
  const defaultRole = (col.default_assignee_role as string | null) ?? null
  const columnName = (col.name as string) ?? stageSlug

  // 5. Monta as linhas de task.
  //    - finalizacao: 1 task por loja-alvo (template vazio).
  //    - demais: 1 task por item do checklist_template.
  let taskRows: Array<Record<string, unknown>>

  if (stageSlug === "finalizacao") {
    const targets = (campaign.targets ?? []) as CampaignTarget[]
    taskRows = targets.map((store, idx) => ({
      org_id: orgId,
      title: store.store_name
        ? `Finalizacao — ${store.store_name}`
        : `Finalizacao da loja ${store.store_id}`,
      status: "pending" as const,
      priority: "medium" as const,
      source_type: "campaign_suggestion",
      source_id: suggestionId,
      operational_column_id: columnId,
      version,
      assignee_role: defaultRole,
      created_by: createdBy,
      metadata: {
        column_slug: stageSlug,
        column_name: columnName,
        is_column_anchor: idx === 0,
        store_id: store.store_id,
        store_name: store.store_name ?? null,
      },
    }))
  } else {
    const checklist = ((col.checklist_template ?? []) as ChecklistItemRow[])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const items: ChecklistItemRow[] =
      checklist.length > 0
        ? checklist
        : [{ id: "_default", label: columnName, order: 0 }]

    taskRows = items.map((item, idx) => ({
      org_id: orgId,
      title: item.label,
      status: "pending" as const,
      priority: "medium" as const,
      source_type: "campaign_suggestion",
      source_id: suggestionId,
      operational_column_id: columnId,
      version,
      assignee_role: item.assignee_role ?? defaultRole,
      created_by: createdBy,
      slug: item.slug ?? null,
      metadata: {
        column_slug: stageSlug,
        column_name: columnName,
        item_position: item.order ?? idx,
        is_column_anchor: idx === 0,
        ...(stageSlug === "estrutura" ? { pilot_store_id: pilotStoreId } : {}),
      },
    }))
  }

  const { data: insertedTasks, error: insertErr } = await admin
    .from("tasks")
    .insert(taskRows)
    .select("id")
  if (insertErr) {
    // Falha de schema/permissão NÃO pode passar silenciosa: era a razão do bug
    // "card em Design sem tasks". Lançar faz o chamador logar (approve /
    // webhook campaign-copy-complete) em vez de retornar taskIds vazio.
    throw new Error(
      `Falha ao inserir tasks da etapa "${stageSlug}": ${insertErr.message}`,
    )
  }
  const inserted = (insertedTasks ?? []) as Array<{ id: string }>

  // 6. Deliverables na task ANCORA (primeira).
  const deliverables = (col.deliverables_template ?? []) as DeliverableRow[]
  if (inserted.length > 0 && deliverables.length > 0) {
    const anchorTaskId = inserted[0].id
    const delivRows = deliverables.map((d) => ({
      task_id: anchorTaskId,
      field_slug: d.slug,
      field_label: d.label,
      field_type: d.type,
      required: d.required,
    }))
    await admin.from("task_deliverables").insert(delivRows)
  }

  // 7. Atualiza estado de design na campanha.
  await syncCampaignDesignState({
    admin,
    suggestionId,
    pipelineId,
    columnId,
    stageSlug,
    pilotStoreId,
    designStartedAt: campaign.design_started_at as string | null,
  })

  return { taskIds: inserted.map((t) => t.id), columnId }
}

async function syncCampaignDesignState(args: {
  admin: ReturnType<typeof createAdminClient>
  suggestionId: string
  pipelineId: string
  columnId: string
  stageSlug: CampaignDesignStageSlug
  pilotStoreId: string | null
  designStartedAt: string | null
}): Promise<void> {
  const patch: Record<string, unknown> = {
    design_pipeline_id: args.pipelineId,
    design_column_id: args.columnId,
  }
  if (!args.designStartedAt) {
    patch.design_started_at = new Date().toISOString()
  }
  if (args.stageSlug === "estrutura") {
    patch.design_pilot_store_id = args.pilotStoreId
  }
  await args.admin
    .from("campaign_suggestions")
    .update(patch)
    .eq("id", args.suggestionId)
}
