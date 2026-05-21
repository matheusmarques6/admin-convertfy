/**
 * Lookup helpers pros pipelines CS canonicos (Acompanhamento, Calls,
 * Cadencias). Criados via seed 20260615_consolidate_cs_pipelines.sql.
 *
 * Usado pelos redirects das paginas legadas (/acompanhamento, /calls,
 * /cadences) e tambem por services que precisam inserir deals nesses
 * pipelines (flagging, cadence overrides, etc.).
 *
 * Resolve por NAME+scope porque o ID e gerado no DB.
 */

import { createAdminClient } from "@/lib/supabase/server"

export type CsPipelineKey =
  | "acompanhamento"
  | "calls"
  | "cadencias"
  | "carteira"

const WELL_KNOWN_NAMES: Record<CsPipelineKey, string> = {
  acompanhamento: "Acompanhamento Semanal",
  calls: "Calls Mensais",
  cadencias: "Cadencias CS",
  carteira: "Gestao de Carteira",
}

interface CsPipelineInfo {
  id: string
  name: string
  stages: Array<{
    id: string
    name: string
    order: number
    stage_type: string | null
  }>
}

let cache: Partial<Record<CsPipelineKey, CsPipelineInfo>> = {}
let cacheExpiresAt = 0

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

/**
 * Resolve pipeline_id (+ stages) de um pipeline CS canonico.
 * Retorna null se nao foi seedado ainda. Cache em memoria de 5min.
 */
export async function getCsPipeline(
  key: CsPipelineKey,
): Promise<CsPipelineInfo | null> {
  const now = Date.now()
  if (now < cacheExpiresAt && cache[key]) return cache[key] ?? null

  const admin = createAdminClient()
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id, name")
    .eq("name", WELL_KNOWN_NAMES[key])
    .eq("scope", "cs")
    .maybeSingle()

  if (!pipeline) return null

  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("id, name, order, stage_type")
    .eq("pipeline_id", pipeline.id)
    .order("order", { ascending: true })

  const info: CsPipelineInfo = {
    id: pipeline.id,
    name: pipeline.name,
    stages: (stages ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      order: s.order as number,
      stage_type: (s.stage_type as string | null) ?? null,
    })),
  }

  cache[key] = info
  cacheExpiresAt = now + CACHE_TTL_MS
  return info
}

export function clearCsPipelineCache(): void {
  cache = {}
  cacheExpiresAt = 0
}
