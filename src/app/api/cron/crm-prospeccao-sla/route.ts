/**
 * GET /api/cron/crm-prospeccao-sla
 *
 * Job diário da cadência de prospecção ativa: marca follow-up vencido,
 * cobra a qualificação parada, perde quem esgotou os três toques e
 * lembra de revisar os leads travados com o parceiro.
 *
 * **NASCE EM DRY-RUN.** `CRM_PROSPECCAO_SLA_MODE` decide:
 * `dry_run` (padrão) calcula, loga e NÃO escreve nada; `on` executa. É
 * o mesmo desenho dos outros gates da casa (`qa_mode`, `seletor_mode`):
 * um cron que move card e marca lead como perdido não estreia sozinho,
 * e sair do ar tem de ser uma variável, não um deploy de emergência.
 *
 * `?dry_run=1` força o modo seguro em qualquer configuração — é como se
 * confere o plano à mão. `?forcar=1` NÃO existe de propósito: ligar é
 * decisão de quem opera, não de quem tem o link.
 *
 * Idempotência por `crm_automation_runs.idempotency_key` (negócio +
 * regra + DIA em São Paulo): duas rodadas no mesmo dia não duplicam
 * tarefa nem perdem o lead duas vezes. O índice que a garante é
 * PARCIAL (`where automation_id is null`, migration 20261165) — o
 * UNIQUE original é (automation_id, idempotency_key), e com
 * `automation_id` NULL o Postgres nunca acusaria conflito.
 */

import { NextRequest } from "next/server"
import { errorResponse, successResponse } from "@/lib/api/errors"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { orgsDosNegocios } from "@/lib/crm/org-do-negocio"
import {
  ETAPA_AGUARDANDO,
  ETAPA_PERDIDO_SEM_RESPOSTA,
  ETAPA_QUALIFICAR,
  planejarSla,
  tarefaSemanalDoParceiro,
  type AcaoDeSla,
  type NegocioParaSla,
} from "@/lib/crm/sla-prospeccao"

const log = logger.child("CrmProspeccaoSla")

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Só pipelines que têm a cadência. Outras não são tocadas. */
const ETAPAS_DA_CADENCIA = [
  "T1 · Abordado",
  "T2 · Follow-up com valor",
  "T3 · Último toque",
  ETAPA_QUALIFICAR,
]

export async function GET(request: NextRequest) {
  try {
    const authError = requireCronAuth(request)
    if (authError) return authError

    // Modo seguro por padrão: só `on` explícito escreve. Valor
    // desconhecido também cai em dry-run — errar pro lado de não mexer
    // no funil é barato; o contrário move card de gente.
    const modo = (process.env.CRM_PROSPECCAO_SLA_MODE ?? "dry_run").trim().toLowerCase()
    const dryRun = modo !== "on" || request.nextUrl.searchParams.get("dry_run") === "1"
    const admin = createAdminClient()
    const agora = new Date()

    // ── Pipelines que têm a cadência ────────────────────────────────
    const { data: etapas, error: eErr } = await admin
      .from("pipeline_stages")
      .select("id, name, sla_hours, pipeline_id, stage_type")
      .in("name", [...ETAPAS_DA_CADENCIA, ETAPA_AGUARDANDO, ETAPA_PERDIDO_SEM_RESPOSTA])
    if (eErr) throw eErr

    const daCadencia = (etapas ?? []).filter((s) => ETAPAS_DA_CADENCIA.includes(s.name))
    if (daCadencia.length === 0) {
      // Zero não é sucesso mudo: sem etapa da cadência não há o que
      // medir, e isso tem de aparecer no painel da plataforma.
      return successResponse(request, {
        dry_run: dryRun,
        modo,
        mensagem: "Nenhuma pipeline com as etapas da cadência.",
        acoes: [],
        resumo: null,
      })
    }

    const porEtapa = new Map(daCadencia.map((s) => [s.id, s]))

    const { data: deals, error: dErr } = await admin
      .from("deals")
      .select(
        "id, title, stage_id, pipeline_id, client_id, store_id, owner_id, lead_id, tags, custom_fields, last_stage_changed_at",
      )
      .in("stage_id", [...porEtapa.keys()])
      .eq("status", "open")
    if (dErr) throw dErr

    // Tarefa aberta deste job hoje: evita a segunda tarefa igual quando
    // o operador ainda não fechou a de ontem.
    const idsDeals = (deals ?? []).map((d) => d.id)
    const abertas = new Set<string>()
    if (idsDeals.length > 0) {
      const { data: tarefas } = await admin
        .from("crm_deal_activities")
        .select("deal_id")
        .in("deal_id", idsDeals)
        .eq("type", "task")
        .is("completed_at", null)
      for (const t of tarefas ?? []) if (t.deal_id) abertas.add(t.deal_id)
    }

    const negocios: NegocioParaSla[] = (deals ?? []).map((d) => {
      const etapa = porEtapa.get(d.stage_id)!
      return {
        id: d.id,
        title: d.title,
        stage_name: etapa.name,
        stage_sla_hours: etapa.sla_hours,
        last_stage_changed_at: d.last_stage_changed_at,
        custom_fields: d.custom_fields as Record<string, unknown> | null,
        tags: d.tags,
        tem_tarefa_aberta: abertas.has(d.id),
      }
    })

    const { acoes, resumo } = planejarSla(negocios, agora)

    // ── Lembrete semanal por org ────────────────────────────────────
    const idsAguardando = (etapas ?? [])
      .filter((s) => s.name === ETAPA_AGUARDANDO)
      .map((s) => s.id)
    const semanais: Array<{ orgId: string; conteudo: string; chave: string }> = []
    if (idsAguardando.length > 0) {
      // `deals` não tem `org_id`: a org sai dos vínculos do negócio
      // (cliente, loja, dono, lead), em quatro consultas no total — ver
      // `lib/crm/org-do-negocio`. Aqui não há operador pra fechar a
      // conta, então negócio sem nenhuma ponta fica de fora do lembrete
      // em vez de entrar numa org chutada.
      const { data: travados, error: tErr } = await admin
        .from("deals")
        .select("id, client_id, store_id, owner_id, lead_id")
        .in("stage_id", idsAguardando)
        .eq("status", "open")
      if (tErr) throw tErr
      const orgs = await orgsDosNegocios(admin, travados ?? [])
      const porOrg = new Map<string, number>()
      for (const t of travados ?? []) {
        const org = orgs.get(t.id)
        if (!org) continue
        porOrg.set(org.orgId, (porOrg.get(org.orgId) ?? 0) + 1)
      }
      for (const [orgId, n] of porOrg) {
        const t = tarefaSemanalDoParceiro(orgId, n, agora)
        if (t) semanais.push({ orgId, ...t })
      }
    }

    if (dryRun) {
      log.info("SLA da prospecção (dry-run)", {
        modo,
        avaliados: resumo.avaliados,
        acoes: acoes.length,
        semanais: semanais.length,
      })
      return successResponse(request, {
        dry_run: true,
        modo,
        resumo,
        acoes,
        tarefas_semanais: semanais,
        // O que o dry-run NÃO consegue prever: quais chaves já foram
        // gastas hoje. A rodada real pula essas.
        observacao:
          "Nada foi escrito. A rodada real pula as ações cuja chave de idempotência já existir.",
      })
    }

    // ── Execução ────────────────────────────────────────────────────
    const etapaPerdido = (etapas ?? []).find(
      (s) => s.name === ETAPA_PERDIDO_SEM_RESPOSTA,
    )
    const executadas: string[] = []
    const puladas: string[] = []
    const falhas: Array<{ chave: string; erro: string }> = []

    // `crm_automation_runs.org_id` é NOT NULL e `deals` não tem a
    // coluna: a org vem dos vínculos, resolvida em lote para a fila
    // inteira. Negócio sem nenhuma ponta é PULADO — sem org não há
    // chave de idempotência possível, e escolher uma org no chute
    // gravaria a ação sob a organização errada.
    const orgsDaFila = await orgsDosNegocios(admin, deals ?? [])

    for (const acao of acoes) {
      const deal = (deals ?? []).find((d) => d.id === acao.dealId)
      const orgDoDeal = deal ? orgsDaFila.get(deal.id) : null
      if (!deal || !orgDoDeal) {
        puladas.push(acao.chave)
        continue
      }
      // A chave é reservada ANTES do efeito: reservar depois deixaria a
      // rodada seguinte repetir a ação quando o processo morresse no
      // meio (o serverless congela depois do `return`).
      const { error: kErr } = await admin.from("crm_automation_runs").insert({
        org_id: orgDoDeal.orgId,
        deal_id: deal.id,
        trigger_type: "sla_prospeccao",
        idempotency_key: acao.chave,
        status: "running",
        started_at: new Date().toISOString(),
      })
      if (kErr) {
        // 23505 = já rodou hoje. Não é falha.
        if (kErr.code === "23505") puladas.push(acao.chave)
        else falhas.push({ chave: acao.chave, erro: kErr.message })
        continue
      }

      try {
        await executar(admin, acao, deal, etapaPerdido ?? null)
        executadas.push(acao.chave)
        await admin
          .from("crm_automation_runs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("idempotency_key", acao.chave)
          .is("automation_id", null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        falhas.push({ chave: acao.chave, erro: msg })
        log.error("ação de SLA falhou", { chave: acao.chave, err })
        await admin
          .from("crm_automation_runs")
          .update({
            status: "failed",
            error_message: msg,
            completed_at: new Date().toISOString(),
          })
          .eq("idempotency_key", acao.chave)
          .is("automation_id", null)
      }
    }

    for (const s of semanais) {
      const { error: kErr } = await admin.from("crm_automation_runs").insert({
        org_id: s.orgId,
        trigger_type: "sla_prospeccao",
        idempotency_key: s.chave,
        status: "completed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      if (kErr) {
        if (kErr.code === "23505") puladas.push(s.chave)
        else falhas.push({ chave: s.chave, erro: kErr.message })
        continue
      }
      const { error } = await admin.from("crm_deal_activities").insert({
        type: "task",
        content: s.conteudo,
        due_at: agora.toISOString(),
        metadata: { origem: "sla_prospeccao", regra: "revisar_parceiro" },
      })
      if (error) falhas.push({ chave: s.chave, erro: error.message })
      else executadas.push(s.chave)
    }

    log.info("SLA da prospecção", {
      avaliados: resumo.avaliados,
      executadas: executadas.length,
      puladas: puladas.length,
      falhas: falhas.length,
    })

    return successResponse(request, {
      dry_run: false,
      modo,
      resumo,
      executadas: executadas.length,
      puladas: puladas.length,
      falhas,
    })
  } catch (error) {
    return errorResponse(request, error, "crm-prospeccao-sla")
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = ReturnType<typeof createAdminClient>
type DealRow = {
  id: string
  tags: string[] | null
  custom_fields: unknown
  pipeline_id: string
}

async function executar(
  admin: Admin,
  acao: AcaoDeSla,
  deal: DealRow,
  etapaPerdido: { id: string; name: string; pipeline_id: string } | null,
): Promise<void> {
  const agora = new Date().toISOString()
  const custom = (deal.custom_fields ?? {}) as Record<string, unknown>

  if (acao.tipo === "marcar_vencido") {
    const { error: cErr } = await admin
      .from("deals")
      .update({ custom_fields: { ...custom, followup_vencido: true } })
      .eq("id", deal.id)
    if (cErr) throw cErr

    const { error: tErr } = await admin.from("crm_deal_activities").insert({
      deal_id: deal.id,
      type: "task",
      content: `Enviar ${acao.proximo}`,
      due_at: agora,
      metadata: {
        origem: "sla_prospeccao",
        regra: "followup_vencido",
        toque_atual: acao.toqueAtual,
        proximo: acao.proximo,
        horas_parado: acao.horasParado,
      },
    })
    if (tErr) throw tErr
    return
  }

  if (acao.tipo === "cobrar_qualificacao") {
    const { error } = await admin.from("crm_deal_activities").insert({
      deal_id: deal.id,
      type: "task",
      content: "Qualificar: preencher a maturidade da loja",
      due_at: agora,
      metadata: {
        origem: "sla_prospeccao",
        regra: "qualificacao_parada",
        horas_parado: acao.horasParado,
      },
    })
    if (error) throw error
    return
  }

  // acao.tipo === "perder"
  if (!etapaPerdido || etapaPerdido.pipeline_id !== deal.pipeline_id) {
    // Nomeia a etapa que falta: perder sem ter pra onde mover deixaria
    // o card na coluna do T3 com status `lost`, invisível na fila.
    throw new Error(
      `A etapa "${ETAPA_PERDIDO_SEM_RESPOSTA}" não existe nesta pipeline — o negócio não foi movido.`,
    )
  }

  const { error: mErr } = await admin
    .from("deals")
    .update({
      stage_id: etapaPerdido.id,
      status: "lost",
      lost_reason: acao.motivo,
      last_stage_changed_at: agora,
      // A tag NÃO entra aqui: não responder não é o mesmo que pedir pra
      // não ser contatado, e marcar `nao-contatar` bloquearia pra sempre
      // quem só estava de férias.
      tags: deal.tags ?? [],
    })
    .eq("id", deal.id)
  if (mErr) throw mErr

  const { error: aErr } = await admin.from("crm_deal_activities").insert({
    deal_id: deal.id,
    type: "system",
    content: `Movido para "${ETAPA_PERDIDO_SEM_RESPOSTA}" — ${acao.motivo} (${acao.horasParado}h sem resposta).`,
    completed_at: agora,
    metadata: { origem: "sla_prospeccao", regra: "sem_resposta" },
  })
  if (aErr) throw aErr
}
