/**
 * Lacunas propostas por telemetria — o I/O em volta de `lacuna-draft.ts`.
 *
 * Lê as runs `assembler_chooser` da janela, agrega por chave e faz upsert em
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

const MISSING = new Set(["42P01", "PGRST205", "PGRST204", "42703"])

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
    .eq("agent", "assembler_chooser")
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
    const { data: lojas } = await admin.from("client_stores").select("id, name").in("id", storeIds)
    for (const l of (lojas ?? []) as Array<{ id: string; name: string | null }>) if (l.name) nomes.set(l.id, l.name)
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
