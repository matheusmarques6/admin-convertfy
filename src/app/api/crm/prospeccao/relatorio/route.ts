/**
 * GET /api/crm/prospeccao/relatorio?pipeline_id=…
 *
 * Relatório da campanha por segmento: quem responde, quem tem loja
 * vendendo, quem fecha — e quanto disso virou dinheiro.
 *
 * O degrau alcançado vem de `crm_deal_history` + a etapa atual, o mesmo
 * eixo do dashboard de funil. Usar só a etapa ATUAL contaria o lead
 * perdido por silêncio como "respondeu", porque a coluna de perda vem
 * depois no board — seria inflar a taxa com exatamente quem não
 * respondeu.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  contagemRegressiva,
  evolucaoDiaria,
  extratoDoParceiro,
  montarRelatorio,
  type NegocioDoRelatorio,
} from "@/lib/crm/relatorio-prospeccao"

const log = logger.child("CrmProspeccaoRelatorio")

export const dynamic = "force-dynamic"

const querySchema = z.object({ pipeline_id: uuid() })

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const parsed = querySchema.safeParse({
      pipeline_id: request.nextUrl.searchParams.get("pipeline_id"),
    })
    if (!parsed.success) {
      throw new AppError("Informe a pipeline do relatório.", 400, "bad-request")
    }
    const { pipeline_id } = parsed.data

    const { data: etapas, error: eErr } = await admin
      .from("pipeline_stages")
      .select("id, name")
      .eq("pipeline_id", pipeline_id)
    if (eErr) throw eErr
    const nomePorEtapa = new Map((etapas ?? []).map((s) => [s.id, s.name]))

    const { data: deals, error: dErr } = await admin
      .from("deals")
      .select(
        "id, stage_id, status, value, lost_reason, won_at, custom_fields, referrer_partner_id",
      )
      .eq("pipeline_id", pipeline_id)
    if (dErr) throw dErr

    const ids = (deals ?? []).map((d) => d.id)

    // Histórico de etapa por negócio. Sem ele o degrau alcançado seria
    // a etapa de AGORA, e quem foi perdido contaria como quem avançou.
    const visitadasPorDeal = new Map<string, Set<string>>()
    const primeiroToquePorDeal = new Map<string, string>()
    let historicoLido = true
    if (ids.length > 0) {
      const { data: historico, error: hErr } = await admin
        .from("crm_deal_history")
        .select("deal_id, new_value, changed_at")
        .in("deal_id", ids)
        .eq("field", "stage_id")
        .order("changed_at", { ascending: true })
      if (hErr) {
        // O relatório degrada em vez de sumir: sem histórico, o degrau
        // sai da etapa atual e a tela DIZ que a leitura é parcial.
        historicoLido = false
        log.error("histórico de etapas não lido", { hErr })
      }
      for (const h of historico ?? []) {
        if (!h.deal_id) continue
        // `new_value` é JSONB: um valor que não seja string de uuid não
        // endereça etapa nenhuma, e `String(...)` viraria "[object
        // Object]" casando com nada — melhor descartar declaradamente.
        const id = typeof h.new_value === "string" ? h.new_value : null
        const nome = id ? nomePorEtapa.get(id) : undefined
        if (!nome) continue
        const set = visitadasPorDeal.get(h.deal_id) ?? new Set<string>()
        set.add(nome)
        visitadasPorDeal.set(h.deal_id, set)
        // Primeira entrada numa coluna de toque = data da abordagem.
        if (nome.startsWith("T1 ") && !primeiroToquePorDeal.has(h.deal_id)) {
          primeiroToquePorDeal.set(h.deal_id, h.changed_at)
        }
      }
    }

    const negocios: NegocioDoRelatorio[] = (deals ?? []).map((d) => {
      const custom = (d.custom_fields ?? {}) as Record<string, unknown>
      const visitadas = visitadasPorDeal.get(d.id) ?? new Set<string>()
      const atual = nomePorEtapa.get(d.stage_id)
      if (atual) visitadas.add(atual)
      return {
        id: d.id,
        segmento:
          typeof custom.segmento_parceiro === "string" ? custom.segmento_parceiro : null,
        maturidade:
          typeof custom.maturidade_loja === "string" ? custom.maturidade_loja : null,
        status: d.status,
        value: d.value == null ? null : Number(d.value),
        lost_reason: d.lost_reason,
        won_at: d.won_at,
        abordado_em: primeiroToquePorDeal.get(d.id) ?? null,
        etapasVisitadas: [...visitadas],
      }
    })

    const relatorio = montarRelatorio(negocios)

    // Extrato do parceiro indicador desta pipeline, quando há um só.
    const parceiros = new Set(
      (deals ?? [])
        .map((d) => d.referrer_partner_id)
        .filter((v): v is string => typeof v === "string"),
    )
    let parceiro: { nome: string; percentual: number | null } | null = null
    if (parceiros.size === 1) {
      const [pid] = [...parceiros]
      const { data: p } = await admin
        .from("crm_partners")
        .select("name, commission_pct")
        .eq("id", pid)
        .maybeSingle()
      if (p) {
        parceiro = {
          nome: p.name,
          percentual: p.commission_pct == null ? null : Number(p.commission_pct),
        }
      }
    }

    return successResponse(request, {
      ...relatorio,
      evolucao: evolucaoDiaria(negocios.map((n) => n.abordado_em)),
      marcos: contagemRegressiva(new Date()),
      parceiro: parceiro
        ? { ...parceiro, ...extratoDoParceiro(relatorio.total, parceiro.percentual) }
        : null,
      // Diz se a LEITURA funcionou, não se veio linha: histórico vazio
      // é o normal antes de a cadência começar, e chamar isso de
      // "parcial" mandaria procurar defeito onde não há.
      historico_lido: historicoLido,
    })
  } catch (error) {
    return errorResponse(request, error, "crm-prospeccao-relatorio")
  }
}
