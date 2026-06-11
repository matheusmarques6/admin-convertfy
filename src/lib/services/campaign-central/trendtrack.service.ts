/**
 * TrendTrack — coletor primário de tendências de e-commerce.
 *
 * STUB (fase 1): retorna [] quando TRENDTRACK_API_KEY ausente. A
 * implementação real (fase 2) chamará:
 *   - GET /v1/products/winning?niche=X&since=...  → produtos em alta
 *   - POST /v1/ads/query                           → ads vencedores
 * e converterá pra TrendInput.
 *
 * Por que stub agora: a cascata já fica no lugar do callsite (em
 * trends.service:captureTrends). Quando a chave existir e o coletor
 * for entregue, ativa sozinho sem mudar mais nada.
 *
 * Padrão de env var opcional + fallback espelha
 * src/lib/services/email-copy-webhook.service.ts:94.
 */

import { logger } from "@/lib/logger"
import type { TrendInput } from "./trends.service"

const log = logger.child("Trendtrack")

export interface ClusterInput {
  country: string
  niches: string[]
}

export async function captureFromTrendtrack(cluster: ClusterInput): Promise<TrendInput[]> {
  const apiKey = process.env.TRENDTRACK_API_KEY
  if (!apiKey) {
    // Esperado em fase 1. Web search é a fonte ativa.
    return []
  }
  log.info("trendtrack.stub_called", { cluster })
  // TODO fase 2: chamar /v1/products/winning + /v1/ads/query
  return []
}
