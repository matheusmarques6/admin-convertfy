/**
 * POST /api/crm/deals/[id]/toque
 *
 * Executa UM toque da cadência de prospecção ativa (T1/T2/T3). Devolve
 * o link do WhatsApp já com o texto; quem abre é o CLIENTE, porque
 * `window.open` depois de um `await` é bloqueado pelo navegador.
 *
 * A ordem aqui é deliberada: tudo que pode RECUSAR o toque roda antes
 * de qualquer escrita. Bloqueio de abordagem (`nao-contatar`, etapa de
 * negociação com o parceiro, sem telefone) e script ausente devolvem
 * 422 sem tocar no banco — abrir o WhatsApp primeiro e perguntar
 * depois mandaria mensagem pra quem pediu pra parar.
 *
 * Depois disso, e só depois, registra: atividade `wa_message`, +1 em
 * `tentativas_contato`, move de etapa e agenda a tarefa de checagem no
 * SLA da etapa de destino. As escritas são independentes e nenhuma
 * derruba a resposta — a mensagem vai sair de qualquer jeito, e perder
 * o link por causa de um log falho é o pior desfecho possível.
 *
 * Body: { toque: "T1" | "T2" | "T3" }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  EXPLICACAO_DA_MONTAGEM,
  ETAPA_DO_TOQUE,
  TOQUES,
  linkDoWhatsApp,
  montarToque,
  type Toque,
} from "@/lib/crm/cadencia"
import {
  EXPLICACAO_DO_BLOQUEIO,
  contarTentativas,
  motivoDeBloqueio,
} from "@/lib/crm/prospeccao"

const log = logger.child("CrmDealToque")

export const dynamic = "force-dynamic"

const schema = z.object({
  toque: z.enum(TOQUES),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { toque } = schema.parse(await request.json())

    // ── Leitura ────────────────────────────────────────────────────
    const { data: deal, error: dErr } = await admin
      .from("deals")
      .select(
        `id, title, org_id, pipeline_id, stage_id, client_id, lead_id, tags, status,
         custom_fields,
         client:clients (id, name, phone),
         lead:crm_leads (id, name, phone)`,
      )
      .eq("id", id)
      .maybeSingle()

    if (dErr) throw dErr
    if (!deal) throw new AppError("Negócio não encontrado", 404, "not-found")

    const contato = (Array.isArray(deal.client) ? deal.client[0] : deal.client) as
      | { id: string; name: string | null; phone: string | null }
      | null
    const lead = (Array.isArray(deal.lead) ? deal.lead[0] : deal.lead) as
      | { id: string; name: string | null; phone: string | null }
      | null

    const nome = contato?.name ?? lead?.name ?? deal.title
    const telefone = contato?.phone ?? lead?.phone ?? null

    const { data: etapaAtual } = await admin
      .from("pipeline_stages")
      .select("id, name")
      .eq("id", deal.stage_id)
      .maybeSingle()

    // ── Recusas (antes de QUALQUER escrita) ────────────────────────
    const bloqueio = motivoDeBloqueio({
      etapa: etapaAtual?.name ?? null,
      tags: deal.tags,
      telefone,
      status: deal.status,
    })
    if (bloqueio) {
      throw new AppError(EXPLICACAO_DO_BLOQUEIO[bloqueio], 422, bloqueio)
    }

    const custom = (deal.custom_fields ?? {}) as Record<string, unknown>
    const segmento =
      typeof custom.segmento_parceiro === "string" ? custom.segmento_parceiro : null

    const { data: respostas } = await admin
      .from("crm_quick_replies")
      .select("shortcut, body")
      .eq("org_id", deal.org_id)

    const scripts: Record<string, string | undefined> = {}
    for (const r of respostas ?? []) scripts[r.shortcut] = r.body

    const montagem = montarToque(toque as Toque, segmento, scripts, { nome })
    if (!montagem.ok) {
      throw new AppError(
        `${EXPLICACAO_DA_MONTAGEM[montagem.motivo]} (atalho ${montagem.atalho})`,
        422,
        montagem.motivo,
      )
    }

    const url = linkDoWhatsApp(telefone ?? "", montagem.texto)
    if (!url) {
      throw new AppError(
        EXPLICACAO_DO_BLOQUEIO.sem_telefone,
        422,
        "sem_telefone",
      )
    }

    // Etapa de destino: pode não existir se a pipeline foi montada à
    // mão. Sem ela o toque ainda sai — só não move o card.
    const nomeEtapaDestino = ETAPA_DO_TOQUE[toque as Toque]
    const { data: etapaDestino } = await admin
      .from("pipeline_stages")
      .select("id, name, sla_hours")
      .eq("pipeline_id", deal.pipeline_id)
      .eq("name", nomeEtapaDestino)
      .maybeSingle()

    // ── Escritas (nenhuma derruba a resposta) ──────────────────────
    const agora = new Date().toISOString()
    const tentativas = contarTentativas(custom.tentativas_contato) + 1
    const avisos: string[] = []

    const { error: aErr } = await admin.from("crm_deal_activities").insert({
      deal_id: deal.id,
      lead_id: deal.lead_id,
      type: "wa_message",
      content: montagem.texto,
      created_by: user.id,
      completed_at: agora,
      metadata: {
        toque,
        canal: "whatsapp_manual",
        atalho: montagem.atalho,
        segmento,
      },
    })
    if (aErr) {
      log.error("atividade do toque não gravou", { deal: deal.id, toque, aErr })
      avisos.push("A atividade não foi registrada na timeline.")
    }

    // `custom_fields` é lido-e-escrito: dois cliques simultâneos no
    // mesmo card podem contar uma tentativa só. Aceitável — errar pra
    // menos aqui só faz o toque seguinte repetir o script, e o
    // histórico real está na timeline.
    const { error: cErr } = await admin
      .from("deals")
      .update({
        custom_fields: {
          ...custom,
          tentativas_contato: tentativas,
          // O toque novo zera o vencido: o job de SLA remarca sozinho
          // quando este também estourar.
          followup_vencido: false,
        },
      })
      .eq("id", deal.id)
    if (cErr) {
      log.error("tentativas não incrementou", { deal: deal.id, cErr })
      avisos.push("A contagem de tentativas não foi atualizada.")
    }

    let moveu = false
    if (etapaDestino && etapaDestino.id !== deal.stage_id) {
      const { error: mErr } = await admin
        .from("deals")
        .update({ stage_id: etapaDestino.id, last_stage_changed_at: agora })
        .eq("id", deal.id)
      if (mErr) {
        log.error("move do toque falhou", { deal: deal.id, mErr })
        avisos.push(`O card não foi movido para "${nomeEtapaDestino}".`)
      } else {
        moveu = true
        await admin.from("crm_deal_activities").insert({
          deal_id: deal.id,
          type: "stage_change",
          content: `${etapaAtual?.name ?? "—"} → ${etapaDestino.name}`,
          created_by: user.id,
          completed_at: agora,
          metadata: { toque, automatico: true },
        })
      }
    } else if (!etapaDestino) {
      avisos.push(`A etapa "${nomeEtapaDestino}" não existe nesta pipeline.`)
    }

    // Tarefa de checagem no SLA da etapa de destino. Sem SLA não há
    // prazo pra checar — inventar um faria a fila do dia mentir.
    let tarefaEm: string | null = null
    if (etapaDestino?.sla_hours) {
      tarefaEm = new Date(
        Date.now() + etapaDestino.sla_hours * 3600_000,
      ).toISOString()
      const { error: tErr } = await admin.from("crm_deal_activities").insert({
        deal_id: deal.id,
        type: "task",
        content: `Checar resposta do ${toque}`,
        created_by: user.id,
        due_at: tarefaEm,
        metadata: { toque, origem: "cadencia" },
      })
      if (tErr) {
        log.error("tarefa do toque não gravou", { deal: deal.id, tErr })
        avisos.push("A tarefa de checagem não foi agendada.")
        tarefaEm = null
      }
    }

    return successResponse(request, {
      url,
      texto: montagem.texto,
      atalho: montagem.atalho,
      toque,
      tentativas,
      etapa: moveu ? etapaDestino?.name ?? null : etapaAtual?.name ?? null,
      moveu,
      tarefa_em: tarefaEm,
      avisos,
    })
  } catch (error) {
    return errorResponse(request, error, "crm-deal-toque")
  }
}
