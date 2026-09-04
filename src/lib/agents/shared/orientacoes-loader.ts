/**
 * Carrega as orientações do COO de UM agente (server-only).
 *
 * Existe como módulo próprio porque `orientacoes.ts` é puro e client-safe
 * (a tela importa o teto e o rótulo de escopo dali): pôr a query lá levaria
 * o cliente Supabase de servidor para dentro do bundle do navegador.
 *
 * Fail-open: erro de query (inclusive coluna `agente` ausente — migration
 * 20261111 não aplicada) devolve vazio e a geração segue. Perder uma
 * diretriz é ruim; derrubar a geração por causa dela é pior.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { Orientacao } from "@/lib/agents/estruturador/orientacoes"
import type { AgenteCalibravel } from "./agente-calibravel"

const log = logger.child("OrientacoesLoader")

export async function loadOrientacoes(
  agente: AgenteCalibravel,
): Promise<Orientacao[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("estruturador_orientacoes")
      // `kind` faz parte da chave: sem ele toda linha cairia em 'geral' e,
      // das duas do escopo flow (intenção e progressão), só a primeira
      // seria servida — a outra sumia do prompt sem nenhum aviso.
      .select("escopo, kind, flow_type, email_number, texto")
      .eq("is_active", true)
      .eq("agente", agente)
    if (error) {
      log.warn("orientacoes_load_failed", { agente, error: error.message })
      return []
    }
    return (data ?? []) as Orientacao[]
  } catch (err) {
    log.warn("orientacoes_load_threw", {
      agente,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
