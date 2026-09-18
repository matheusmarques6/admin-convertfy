/**
 * POST /api/crm/deals/[id]/move
 *
 * Move deal entre etapas (drag-and-drop do kanban) E entre pipelines.
 * Quando a etapa de destino e `won` ou `lost`, transiciona o status do
 * deal e exige `won_reason` ou `lost_reason` se ainda nao informados.
 *
 * O pipeline do deal e SEMPRE derivado da etapa de destino — nao ha
 * constraint no banco ligando deals.pipeline_id ao pipeline da etapa
 * (so o indice idx_deals_pipeline_stage), entao gravar stage_id de
 * outra pipeline sem ajustar pipeline_id deixaria o deal orfao: sumido
 * de um board sem aparecer no outro.
 *
 * Transferencia entre pipelines exige mesmo `scope` (sales/cs/internal)
 * e NAO dispara automacoes de deal_stage_change — reorganizar pipeline
 * e ato administrativo, nao avanco comercial; disparar mandaria
 * WhatsApp ao cliente durante uma arrumacao interna.
 *
 * Body:
 *   { stage_id: uuid, position?: number, lost_reason?: string, won_reason?: string }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { dispatchTrigger } from "@/lib/services/crm-trigger-dispatcher.service"
import { syncCadenceMove } from "@/lib/services/cs-pipelines-sync.service"
import {
  missingRequiredFields,
  parseRequiredFields,
  requiredFieldsMessage,
} from "@/lib/services/crm-required-fields"
import { ensureClientForDeal } from "@/lib/services/crm-client-link.service"
import {
  registrarGanhoDeParceiro,
  type ResultadoDoGanho,
} from "@/lib/services/crm-ganho-parceiro.service"
import { orgDoPerfil } from "@/lib/crm/org-do-negocio"
import {
  impedimentosDaMudanca,
  perguntasDeSaida,
  sugestoes,
  tagsAoMudar,
} from "@/lib/crm/regras-de-coluna"

const log = logger.child("CrmDealMove")

export const dynamic = "force-dynamic"

const moveSchema = z.object({
  stage_id: uuid(),
  position: z.number().int().optional(),
  lost_reason: z.string().nullable().optional(),
  won_reason: z.string().nullable().optional(),
  /**
   * Respostas às perguntas de saída da etapa atual (ex: "O Luan
   * liberou este lead?"). Chave = código da pergunta.
   */
  confirmacoes: z.record(z.string(), z.string()).optional(),
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

    const body = await request.json()
    const parsed = moveSchema.parse(body)

    // Le a etapa destino pra saber se e terminal. required_fields pode
    // nao existir (migration 20261068 pendente) — retry sem a coluna.
    let targetStage: {
      id: string
      name: string
      stage_type: string | null
      pipeline_id: string
      required_fields?: unknown
    } | null = null
    {
      const first = await admin
        .from("pipeline_stages")
        .select("id, name, stage_type, pipeline_id, required_fields")
        .eq("id", parsed.stage_id)
        .maybeSingle()
      if (first.error && /required_fields|42703/i.test(`${first.error.code} ${first.error.message}`)) {
        const retry = await admin
          .from("pipeline_stages")
          .select("id, name, stage_type, pipeline_id")
          .eq("id", parsed.stage_id)
          .maybeSingle()
        targetStage = retry.data
      } else {
        targetStage = first.data
      }
    }

    if (!targetStage) {
      throw new AppError("Etapa nao encontrada", 404, "not-found")
    }

    // Campos obrigatorios da etapa destino: valida ANTES do update e
    // devolve 422 com a lista do que falta (o board mostra no toast).
    const required = parseRequiredFields(targetStage.required_fields)
    if (required.length > 0) {
      const { data: snap } = await admin
        .from("deals")
        .select(`
          id, value, expected_close_date, client_id, custom_fields,
          client:clients (phone),
          lead:crm_leads!deals_lead_id_fkey (phone)
        `)
        .eq("id", id)
        .maybeSingle()

      let productsCount = 0
      if (required.includes("products")) {
        const { count } = await admin
          .from("crm_deal_products")
          .select("id", { count: "exact", head: true })
          .eq("deal_id", id)
        productsCount = count ?? 0
      }

      if (snap) {
        const client = Array.isArray(snap.client) ? snap.client[0] : snap.client
        const lead = Array.isArray(snap.lead) ? snap.lead[0] : snap.lead
        const custom = (snap.custom_fields ?? {}) as Record<string, unknown> & {
          contact_phone?: string
        }
        const missing = missingRequiredFields(required, {
          value: snap.value == null ? null : Number(snap.value),
          expected_close_date: snap.expected_close_date,
          client_id: snap.client_id,
          phone: client?.phone ?? lead?.phone ?? custom.contact_phone ?? null,
          products_count: productsCount,
          custom_fields: custom,
        })
        if (missing.length > 0) {
          // Rótulo do campo personalizado vem de `crm_custom_fields`:
          // sem ele o vendedor leria "preencha: maturidade_loja".
          const labels: Record<string, string> = {}
          const chavesCustom = missing
            .filter((k) => k.startsWith("custom:"))
            .map((k) => k.slice("custom:".length))
          if (chavesCustom.length > 0) {
            const { data: cfs } = await admin
              .from("crm_custom_fields")
              .select("key, label")
              .eq("entity_type", "deal")
              .in("key", chavesCustom)
            for (const cf of cfs ?? []) labels[cf.key] = cf.label
          }
          throw new AppError(
            requiredFieldsMessage(targetStage.name, missing, labels),
            422,
            "required-fields",
          )
        }
      }
    }

    // Estado atual do deal — precisa vir ANTES do update pra saber se
    // isto e uma transferencia entre pipelines.
    //
    // O `error` e conferido junto com o `data`: o supabase-js devolve o
    // erro do Postgres em `error`, nao como throw, entao desestruturar
    // so `{ data }` transforma um 42703 (coluna que nao existe) em
    // `null` — e a linha de baixo o anuncia como "Deal nao encontrado".
    // Foi exatamente assim que todo arrasto do kanban passou a falhar
    // quando este select ganhou um `org_id` que `deals` nao tem.
    const { data: currentDeal, error: dealErr } = await admin
      .from("deals")
      .select("id, pipeline_id, stage_id, tags, custom_fields")
      .eq("id", id)
      .maybeSingle()

    if (dealErr) throw dealErr
    if (!currentDeal) {
      throw new AppError("Deal nao encontrado", 404, "not-found")
    }

    // ── Regras de coluna (saida + terminal) ──────────────────────────
    // Rodam ANTES do update: o que a coluna exige pra SAIR nao cabe em
    // `required_fields`, que e sobre entrar. Bloqueio aqui devolve 422 e
    // nao toca no banco — mover primeiro e cobrar depois deixaria o card
    // na coluna nova com o campo em branco.
    const { data: etapaAtual } = currentDeal.stage_id
      ? await admin
          .from("pipeline_stages")
          .select("id, name, stage_type")
          .eq("id", currentDeal.stage_id)
          .maybeSingle()
      : { data: null }

    // Motivos da org so sao lidos quando a etapa destino e de perda —
    // uma consulta a mais em todo drag do kanban nao se paga.
    //
    // A org e a do OPERADOR, nao a cascata do negocio: a lista que o
    // vendedor acabou de ver no dialogo veio de `GET /api/crm/lost-reasons`,
    // que resolve assim. Validar contra outra lista recusaria o motivo
    // que a propria tela ofereceu.
    let motivosValidos: string[] = []
    if (targetStage.stage_type === "lost") {
      const orgDoOperador = await orgDoPerfil(admin, user.id)
      if (orgDoOperador) {
        const { data: motivos, error: mErr } = await admin
          .from("crm_lost_reasons")
          .select("label")
          .eq("org_id", orgDoOperador)
        // Lista que nao carregou nao pode virar "nenhum motivo e valido":
        // a regra so cobra quando ha lista, e uma falha de leitura aqui
        // travaria toda perda do funil.
        if (mErr) log.error("[Deals] motivos de perda nao carregaram", { id, mErr })
        motivosValidos = (motivos ?? []).map((m) => m.label)
      }
    }

    const contextoDaRegra = {
      etapaAtual: etapaAtual
        ? { name: etapaAtual.name, stage_type: etapaAtual.stage_type }
        : null,
      etapaDestino: { name: targetStage.name, stage_type: targetStage.stage_type },
      custom_fields: (currentDeal.custom_fields ?? {}) as Record<string, unknown>,
      lostReason: parsed.lost_reason,
      motivosValidos,
      confirmacoes: parsed.confirmacoes,
    }

    const impedimentos = impedimentosDaMudanca(contextoDaRegra)
    if (impedimentos.length > 0) {
      throw new AppError(
        impedimentos.map((i) => i.mensagem).join(" "),
        422,
        impedimentos[0].codigo,
      )
    }

    const isTransfer = currentDeal.pipeline_id !== targetStage.pipeline_id

    // Transferencia so entre pipelines do mesmo escopo: um deal de
    // `sales` num board de `cs` cai em etapas com outro significado, e
    // a pipeline "Cadencias CS" e sincronizada por
    // cs-pipelines-sync.service (que abandona quando o pipeline_id do
    // deal nao bate) — deal comercial ali quebra a sincronia.
    if (isTransfer) {
      const { data: scopes } = await admin
        .from("pipelines")
        .select("id, name, scope")
        .in("id", [currentDeal.pipeline_id, targetStage.pipeline_id])

      const from = scopes?.find((p) => p.id === currentDeal.pipeline_id)
      const to = scopes?.find((p) => p.id === targetStage.pipeline_id)

      if (!to) {
        throw new AppError("Pipeline de destino nao encontrada", 404, "not-found")
      }
      if (from && from.scope !== to.scope) {
        throw new AppError(
          `Nao e possivel transferir entre escopos diferentes (${from.scope} -> ${to.scope}).`,
          400,
          "scope-mismatch",
        )
      }
    }

    // Calcula nova position se nao foi informada
    let position: number
    if (parsed.position !== undefined) {
      position = parsed.position
    } else {
      const { data: maxPos } = await admin
        .from("deals")
        .select("position")
        .eq("stage_id", parsed.stage_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle()
      position = (maxPos?.position ?? 0) + 10
    }

    // Determina novo status baseado no stage_type
    type DealStatusUpdate = "open" | "won" | "lost"
    const updates: {
      stage_id: string
      pipeline_id: string
      position: number
      status: DealStatusUpdate
      lost_reason?: string | null
      won_reason?: string | null
      tags?: string[]
    } = {
      stage_id: parsed.stage_id,
      // Sempre derivado da etapa — ver docstring.
      pipeline_id: targetStage.pipeline_id,
      position,
      status: "open",
    }

    // A tag de "nao contatar" entra no MESMO update: num segundo
    // update ela poderia falhar sozinha e o lead seguiria abordavel
    // depois de ter pedido pra parar.
    const tagsNovas = tagsAoMudar(contextoDaRegra)
    if (tagsNovas.length > 0) {
      const atuais = (currentDeal.tags ?? []) as string[]
      const faltando = tagsNovas.filter(
        (t) => !atuais.some((a) => a.trim().toLowerCase() === t),
      )
      if (faltando.length > 0) updates.tags = [...atuais, ...faltando]
    }

    if (targetStage.stage_type === "won") {
      updates.status = "won"
      if (parsed.won_reason !== undefined) updates.won_reason = parsed.won_reason
    } else if (targetStage.stage_type === "lost") {
      updates.status = "lost"
      // lost_reason e fortemente recomendado mas nao bloqueante (UI deve pedir)
      if (parsed.lost_reason !== undefined) updates.lost_reason = parsed.lost_reason
    } else {
      updates.status = "open"
    }

    const { data: deal, error } = await admin
      .from("deals")
      .update(updates)
      .eq("id", id)
      .select("id, pipeline_id, stage_id, status, owner_id")
      .single()

    if (error) throw error

    log.info("[Deals] moved", {
      id,
      to: targetStage.name,
      status: deal?.status,
      transfer: isTransfer
        ? `${currentDeal.pipeline_id} -> ${targetStage.pipeline_id}`
        : undefined,
    })

    // A resposta da pergunta de saída vira NOTA: "o Luan liberou" é
    // informação de negociação, e guardá-la só no corpo do POST a
    // perderia — ninguém saberia por que o card saiu de lá.
    for (const p of perguntasDeSaida(contextoDaRegra)) {
      if (!p.viraNota) continue
      const resposta = parsed.confirmacoes?.[p.codigo]
      if (!resposta?.trim()) continue
      const { error: nErr } = await admin.from("crm_deal_activities").insert({
        deal_id: id,
        type: "note",
        content: `${p.pergunta} ${resposta.trim()}`,
        created_by: user.id,
        completed_at: new Date().toISOString(),
        metadata: { origem: "regra_de_saida", codigo: p.codigo },
      })
      if (nErr) log.error("[Deals] nota da confirmação não gravou", { id, nErr })
    }

    // Venda ganha fecha o ciclo sozinha: lead vira cliente vinculado
    // (base do cash collect e do onboarding). Fail-open — vincular
    // cliente nunca impede o ganho.
    let posVenda: ResultadoDoGanho | null = null
    if (deal?.status === "won") {
      try {
        await ensureClientForDeal(admin, id, {
          fallbackOrgId: await orgDoPerfil(admin, user.id),
        })
      } catch (err) {
        log.error("[Deals] auto link-client falhou (move segue)", { id, err })
      }

      // Indicação de parceiro: abre o pós-venda e recalcula o extrato
      // dele. Fail-open, e roda DEPOIS do link-client porque o negócio
      // novo herda o `client_id` que aquele acabou de vincular.
      try {
        posVenda = await registrarGanhoDeParceiro(admin, id)
      } catch (err) {
        log.error("[Deals] ganho de parceiro falhou (move segue)", { id, err })
      }
    }

    // Dispara trigger de automation (fire-and-forget). Pulado em
    // transferencia de pipeline — ver docstring.
    if (deal?.owner_id && !isTransfer) {
      const { data: fullDeal } = await admin
        .from("deals")
        .select(`
          id, pipeline_id, stage_id, owner_id, value, status, source, tags,
          client_id, store_id, lead_id, title,
          owner:profiles!deals_owner_id_fkey (id, name, email),
          client:clients (id, name, email, phone),
          lead:crm_leads!deals_lead_id_fkey (id, name, phone, email)
        `)
        .eq("id", id)
        .single()

      // org_id via membership do owner do deal
      const resolvedOrgId = await orgDoPerfil(admin, deal.owner_id)

      if (resolvedOrgId) {
        // idempotency_key inclui timestamp pra permitir multiplos
        // disparos quando o deal volta pra mesma stage. Janela de 1
        // minuto pra deduplicar cliques duplos no mesmo move.
        const minuteBucket = Math.floor(Date.now() / 60000)
        dispatchTrigger({
          trigger_type: "deal_stage_change",
          org_id: resolvedOrgId,
          trigger_data: { from_stage_id: undefined, to_stage_id: parsed.stage_id },
          context: {
            trigger_type: "deal_stage_change",
            trigger_data: { to_stage_id: parsed.stage_id },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deal: fullDeal as any,
            org_id: resolvedOrgId,
          },
          idempotency_key: `${id}:${parsed.stage_id}:${minuteBucket}`,
        }).catch((err) => log.error("[Deals] dispatch error", err))
      }
    }

    // Sync cadencias: se deal for do pipeline "Cadencias CS",
    // atualiza store_cadence_overrides (drag entre frequencias).
    // Fire-and-forget — falha nao bloqueia o move.
    syncCadenceMove({
      dealId: id,
      newStageId: parsed.stage_id,
      movedBy: user.id,
    }).catch(() => {
      /* logado no service */
    })

    return successResponse(request, {
      deal,
      // Deixa o board saber que precisa remover o card (o deal saiu
      // desta pipeline), em vez de so reposicionar.
      transferred: isTransfer,
      // Conselho, nunca bloqueio: o move ja aconteceu.
      sugestoes: sugestoes(contextoDaRegra),
      pos_venda: posVenda,
    })
  } catch (error) {
    log.error("Deal move error:", error)
    return errorResponse(request, error, "crm-deal-move")
  }
}
