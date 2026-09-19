/**
 * I/O fino da pendência da ficha (S3, 19/09): o Seletor escreve o que lhe
 * faltou em `client_stores.ficha_operacional.pendencias`.
 *
 * Regras: fail-open (falhar aqui nunca custa a run), UPDATE só quando a
 * fusão diz que mudou (a tabela está sob realtime em várias telas —
 * escrita evitada é evento evitado), e a ficha que já existe é preservada
 * byte a byte fora de `pendencias`. Coluna ausente (migration 20261134)
 * é dita no log, não engolida.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

import { normalizarFicha, type FichaOperacional } from "./ficha-operacional"
import { mesclarPendencias, normalizarPendencias, type PendenciaDaFicha } from "./pendencia-da-contradicao"

const log = logger.child("PendenciasDaFicha")

export async function gravarPendenciasDaFicha(input: {
  storeId: string
  textos: readonly string[]
  runId: string | null
  flow: string
}): Promise<{ gravado: boolean; pendencias: PendenciaDaFicha[] }> {
  if (input.textos.length === 0) return { gravado: false, pendencias: [] }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("client_stores").select("ficha_operacional").eq("id", input.storeId).maybeSingle()
    if (error) {
      log.warn("ler_falhou", { storeId: input.storeId, code: error.code, error: error.message })
      return { gravado: false, pendencias: [] }
    }
    const bruto = (data as { ficha_operacional?: unknown } | null)?.ficha_operacional
    const ficha: FichaOperacional = normalizarFicha(bruto) ?? {}
    const existentes = normalizarPendencias((bruto as { pendencias?: unknown } | null)?.pendencias)
    const { pendencias, mudou } = mesclarPendencias(existentes, input.textos.map((texto) => ({ texto })), {
      runId: input.runId,
      flow: input.flow,
      agora: new Date().toISOString(),
    })
    if (!mudou) return { gravado: false, pendencias }
    const { error: upErr } = await admin
      .from("client_stores")
      .update({ ficha_operacional: { ...ficha, pendencias } })
      .eq("id", input.storeId)
    if (upErr) {
      log.warn("gravar_falhou", { storeId: input.storeId, code: upErr.code, error: upErr.message, hint: /ficha_operacional/.test(upErr.message) ? "aplicar a migration 20261134" : undefined })
      return { gravado: false, pendencias }
    }
    log.info("gravado", { storeId: input.storeId, campos: pendencias.map((p) => `${p.campo}×${p.frequencia}`) })
    return { gravado: true, pendencias }
  } catch (err) {
    log.warn("lancou", { storeId: input.storeId, error: err instanceof Error ? err.message : String(err) })
    return { gravado: false, pendencias: [] }
  }
}
