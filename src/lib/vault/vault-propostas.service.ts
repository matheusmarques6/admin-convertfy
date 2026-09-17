/**
 * Lacunas propostas por telemetria — o I/O em volta de `lacuna-draft.ts`.
 *
 * Lê as runs `assembler_chooser` e `assembler` da janela, agrega por chave e faz upsert em
 * `vault_propostas`. Proposta `descartada` NÃO volta a `proposta` quando a
 * violação se repete: descartar é dizer "isto não é lacuna", e o cron
 * ressuscitá-la todo dia ensinaria a ignorar a lista. `copiada` mantém o
 * status e só atualiza a contagem. Fail-open: tabela ausente (migration
 * 20261135 não aplicada) devolve `schema_missing` em vez de derrubar o cron.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { agregarLacunas, buildLacunaDraft, type RunParaLacuna } from "@/lib/agents/architect/lacuna-draft"

const log = logger.child("VaultPropostas")

/**
 * Tabela/cache ausentes — a migration 20261135 não rodou. `42703` (coluna
 * inexistente) saiu daqui em 14/09: ali ele traduzia "escrevi a coluna
 * errada" em `schema_missing: true`, e a resposta acusava uma migration que
 * está aplicada enquanto o defeito era nosso. Erro de nome de coluna tem de
 * aparecer como erro.
 */
const MISSING = new Set(["42P01", "PGRST205", "PGRST204"])

export interface ProporLacunasResult {
  runs: number
  agregadas: number
  gravadas: number
  mantidas_descartadas: number
  schema_missing: boolean
  error?: string
}

export async function proporLacunas(
  admin: SupabaseClient,
  opts: { dias?: number; minimo?: number; agora?: Date } = {},
): Promise<ProporLacunasResult> {
  const dias = opts.dias ?? 14
  const agora = opts.agora ?? new Date()
  const desde = new Date(agora.getTime() - dias * 86_400_000).toISOString()
  const vazio: ProporLacunasResult = { runs: 0, agregadas: 0, gravadas: 0, mantidas_descartadas: 0, schema_missing: false }

  const { data: runs, error } = await admin
    .from("email_generation_runs")
    .select("id, store_id, created_at, parsed_output")
    // `assembler` entra pelo Passo 11: é a run que grava
    // `posicoes_sem_variante` com dispositivo pedido e motivo.
    .in("agent", ["assembler_chooser", "assembler"])
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    log.warn("runs_load_failed", { error: error.message })
    return { ...vazio, error: error.message }
  }

  const storeIds = Array.from(new Set((runs ?? []).map((r) => r.store_id).filter((v): v is string => Boolean(v))))
  const nomes = new Map<string, string>()
  if (storeIds.length > 0) {
    // `store_name`, não `name` (14/09): a coluna errada devolvia 400 do
    // PostgREST em TODA rodada e o `error` não era lido — `nomes` ficava
    // vazio e cada exemplo entrava com `storeName: null`, então o "Onde
    // apareceu" de toda proposta saía "(loja não identificada)". Medido
    // antes do conserto: 7 propostas, 35 exemplos, zero com nome.
    const { data: lojas, error: errLojas } = await admin
      .from("client_stores")
      .select("id, store_name")
      .in("id", storeIds)
    // Fail-open de propósito — o nome DECORA a proposta, não a habilita —,
    // mas nunca em silêncio: foi a falha calada que fez isto durar.
    if (errLojas) log.warn("lojas_load_failed", { error: errLojas.message, code: errLojas.code })
    for (const l of (lojas ?? []) as Array<{ id: string; store_name: string | null }>) {
      if (l.store_name) nomes.set(l.id, l.store_name)
    }
  }

  const entrada: RunParaLacuna[] = (runs ?? []).map((r) => {
    const po = (r.parsed_output ?? {}) as Record<string, unknown>
    return {
      id: r.id as string,
      createdAt: r.created_at as string,
      storeName: r.store_id ? nomes.get(r.store_id as string) ?? null : null,
      violations: Array.isArray(po.protocol_violations) ? (po.protocol_violations as RunParaLacuna["violations"]) : [],
      posicoesSemVariante: Array.isArray(po.posicoes_sem_variante)
        ? (po.posicoes_sem_variante as RunParaLacuna["posicoesSemVariante"])
        : [],
      // Fase 3 (16/09): seções em que a janela de repetição precisou ser
      // afrouxada por escassez. O `flow_type` vem DENTRO do payload — a
      // chave da pauta é (flow, seção) e a tabela de runs não tem coluna
      // de flow.
      janelaAfrouxada: Array.isArray((po.janela as { afrouxadas?: unknown } | undefined)?.afrouxadas)
        ? ((po.janela as { afrouxadas: RunParaLacuna["janelaAfrouxada"] }).afrouxadas ?? [])
        : [],
    }
  })
  const agregadas = agregarLacunas(entrada, { minimo: opts.minimo ?? 3 })
  const result: ProporLacunasResult = { ...vazio, runs: entrada.length, agregadas: agregadas.length }
  if (agregadas.length === 0) return result

  const { data: existentes, error: errExist } = await admin
    .from("vault_propostas")
    .select("chave, status")
    .in("chave", agregadas.map((a) => a.chave))
  if (errExist) {
    if (MISSING.has(errExist.code ?? "")) {
      log.warn("schema_missing", { error: errExist.message })
      return { ...result, schema_missing: true }
    }
    return { ...result, error: errExist.message }
  }
  const statusPorChave = new Map((existentes ?? []).map((e) => [e.chave as string, e.status as string]))

  for (const agg of agregadas) {
    const atual = statusPorChave.get(agg.chave)
    if (atual === "descartada") {
      result.mantidas_descartadas++
      continue
    }
    const draft = buildLacunaDraft(agg, agora.toISOString())
    const { error: errUp } = await admin.from("vault_propostas").upsert(
      {
        chave: agg.chave,
        tipo: "lacuna",
        violacao: agg.tipo,
        secao: agg.secao,
        path_sugerido: draft.path,
        markdown: draft.markdown,
        ocorrencias: agg.ocorrencias,
        primeira_vez: agg.primeiraVez,
        ultima_vez: agg.ultimaVez,
        exemplos: agg.exemplos,
        // Nova nasce `proposta`; existente mantém o que tinha.
        status: atual ?? "proposta",
        updated_at: agora.toISOString(),
      },
      { onConflict: "chave" },
    )
    if (errUp) {
      if (MISSING.has(errUp.code ?? "")) return { ...result, schema_missing: true }
      log.warn("upsert_failed", { chave: agg.chave, error: errUp.message })
      continue
    }
    result.gravadas++
  }
  return result
}
