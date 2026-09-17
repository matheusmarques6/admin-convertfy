/**
 * Decisão × entregue — o I/O (B6). Lê a RPC `email_decisao_vs_entrega`
 * (migration 20261148), a decisão persistida, os contratos das variantes
 * envolvidas (para a validação retroativa) e as runs (custo), e delega o
 * julgamento ao módulo puro `shared/conformidade.ts`.
 *
 * Montador ÚNICO: a rota do e-mail e a métrica dos logs chamam daqui.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { lerDecisao } from "@/lib/agents/shared/decisao-do-email"
import { resumirContrato, type ContratoResumo } from "@/lib/agents/shared/field-roles"
import { custoAteDivergencia, montarConformidade, type PosicaoCrua, type ViolacaoComOrigem } from "@/lib/agents/shared/conformidade"
import type { ConformidadeAgregada, ConformidadeDoEmail } from "@/types/conformidade"

const log = logger.child("Conformidade")

interface LinhaRpc {
  email_id: string
  batch_id: string | null
  store_id: string
  flow_type: string
  email_number: number
  block_index: number
  section: string | null
  dispositivo_pedido: string | null
  papel: string | null
  requisitos: unknown
  decisao_presente: boolean
  variante_curador: string | null
  variante_blueprint: string | null
  variante_montada: string | null
  variante_entregue: string | null
  violacoes: ViolacaoComOrigem[] | null
  regra_pendente: string[] | null
  contrato_presente: boolean
}

/** Teto de e-mails por chamada — a RPC faz UNION por batch e não é grátis. */
export const CONFORMIDADE_MAX_EMAILS = 150

async function linhasRpc(emailIds: string[]): Promise<LinhaRpc[]> {
  if (emailIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("email_decisao_vs_entrega", { p_email_ids: emailIds })
  if (error) {
    log.warn("conformidade.rpc_failed", { error: error.message, hint: "aplicar a migration 20261148" })
    return []
  }
  return (data ?? []) as LinhaRpc[]
}

async function contratosDasVariantes(ids: string[]): Promise<Map<string, ContratoResumo>> {
  const out = new Map<string, ContratoResumo>()
  const unicos = Array.from(new Set(ids.filter(Boolean)))
  if (unicos.length === 0) return out
  const admin = createAdminClient()
  const { data } = await admin.from("email_component_variants").select("id, output_schema").in("id", unicos)
  for (const v of (data ?? []) as Array<{ id: string; output_schema: unknown }>) out.set(v.id, resumirContrato(v.output_schema))
  return out
}

async function decisaoDoEmail(l: LinhaRpc | undefined): Promise<ReturnType<typeof lerDecisao>> {
  if (!l || !l.decisao_presente) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("store_email_blueprints")
    .select("decisao")
    .eq("store_id", l.store_id)
    .eq("flow_type", l.flow_type)
    .eq("email_number", l.email_number)
    .maybeSingle()
  return lerDecisao((data as { decisao?: unknown } | null)?.decisao)
}

function paraCruas(linhas: LinhaRpc[]): PosicaoCrua[] {
  return linhas.map((l) => ({
    block_index: l.block_index,
    section: l.section,
    dispositivo_pedido: l.dispositivo_pedido,
    papel: l.papel,
    requisitos: l.requisitos,
    variante_curador: l.variante_curador,
    variante_blueprint: l.variante_blueprint,
    variante_montada: l.variante_montada,
    variante_entregue: l.variante_entregue,
    violacoes: Array.isArray(l.violacoes) ? l.violacoes : [],
    regra_pendente: Array.isArray(l.regra_pendente) ? l.regra_pendente : [],
    contrato_presente: l.contrato_presente,
  }))
}

export async function conformidadeDoEmail(emailId: string): Promise<ConformidadeDoEmail> {
  const admin = createAdminClient()
  const linhas = await linhasRpc([emailId])
  const [decisao, contratos, runsRes] = await Promise.all([
    decisaoDoEmail(linhas[0]),
    contratosDasVariantes(linhas.map((l) => l.variante_entregue ?? "")),
    admin.rpc("agent_studio_latest_runs", { p_email_ids: [emailId] }),
  ])
  const runs = ((runsRes.data ?? []) as Array<{ agent: string; cost_cents: number | string | null; created_at: string }>).map((r) => ({
    agent: r.agent,
    cost_cents: r.cost_cents != null ? Number(r.cost_cents) : null,
    created_at: r.created_at,
  }))
  const r = montarConformidade({ posicoes: paraCruas(linhas), decisao, contratoPorId: contratos })
  return {
    email_id: emailId,
    batch_id: linhas[0]?.batch_id ?? null,
    decisao_presente: Boolean(decisao),
    linhas: r.linhas,
    resumo: r.resumo,
    custo_ate_divergencia_cents: custoAteDivergencia(r.linhas, runs),
    custo_total_cents: runs.reduce((s, x) => s + (x.cost_cents ?? 0), 0),
  }
}

/**
 * Agregado para a página de logs: e-mails da janela (teto declarado). Não
 * faz validação retroativa por variante aqui — a métrica é do que os
 * validadores GRAVARAM; o retroativo é auxílio de leitura por e-mail.
 */
export async function conformidadeAgregada(emailIds: string[]): Promise<ConformidadeAgregada> {
  const amostra = Array.from(new Set(emailIds)).slice(0, CONFORMIDADE_MAX_EMAILS)
  const out: ConformidadeAgregada = { emails: 0, posicoes: 0, conformes: 0, divergentes: 0, nao_avaliadas: 0, por_no: {}, amostra: amostra.length, truncada: emailIds.length > amostra.length }
  const linhas = await linhasRpc(amostra)
  const porEmail = new Map<string, LinhaRpc[]>()
  for (const l of linhas) porEmail.set(l.email_id, [...(porEmail.get(l.email_id) ?? []), l])
  for (const [, ls] of porEmail) {
    // `decisao_presente` basta para a régua sem retroativo: as violações já
    // estão nas linhas. Decisão sintética só marca presença.
    const decisao = ls[0]?.decisao_presente ? ({ posicoes: [] } as unknown as NonNullable<ReturnType<typeof lerDecisao>>) : null
    const r = montarConformidade({ posicoes: paraCruas(ls), decisao })
    out.emails++
    out.posicoes += r.resumo.posicoes
    out.conformes += r.resumo.conformes
    out.divergentes += r.resumo.divergentes
    out.nao_avaliadas += r.resumo.nao_avaliadas
    for (const [no, n] of Object.entries(r.resumo.por_no)) out.por_no[no as keyof typeof out.por_no] = (out.por_no[no as keyof typeof out.por_no] ?? 0) + (n ?? 0)
  }
  return out
}
