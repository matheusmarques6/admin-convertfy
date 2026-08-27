/**
 * Carrega as revisões humanas de estrutura aplicáveis a um email
 * (migration 20261088). Lado servidor do módulo puro `revisao-humana.ts`.
 *
 * Fail-open de propósito: revisão é correção editorial, não pré-requisito.
 * Query quebrada devolve lista vazia com log — o pior caso é o agente
 * decidir sem a correção, não a geração inteira cair por causa dela.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { aplicaveis, type RevisaoHumana } from "./revisao-humana"

const log = logger.child("RevisaoHumana")

export async function loadRevisoesAplicaveis(
  storeId: string,
  flowType: string,
  emailNumber: number,
): Promise<RevisaoHumana[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("email_structure_reviews")
      .select(
        "alcance, store_id, flow_type, email_number, ordem_anterior, ordem_nova, blocos_removidos, justificativa, created_at, para_estruturador, para_curador, para_montador",
      )
      .eq("is_active", true)
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
    if (error) {
      // Migration não aplicada (42P01) cai aqui junto com erro real: os dois
      // significam "sem revisão", e nenhum dos dois pode derrubar a geração.
      log.warn("revisao_humana.load_failed", {
        storeId,
        flowType,
        emailNumber,
        error: error.message,
      })
      return []
    }
    const todas = (data ?? []) as Array<RevisaoHumana & { store_id?: string | null }>
    return aplicaveis(todas, storeId, flowType, emailNumber)
  } catch (err) {
    log.warn("revisao_humana.load_threw", {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
