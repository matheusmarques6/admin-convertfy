/**
 * Botão "Parar" da ConvertIA — lado do servidor.
 *
 * O cliente NÃO aborta o fetch (o turno tem de fechar direito: gravar
 * o que saiu, contabilizar custo, mandar o `done`). Ele marca
 * `meta.cancel_requested=true` na linha da resposta (rota cancel) e o
 * loop, que roda numa OUTRA função serverless, descobre por polling:
 * a cada ~1,5 s lê a flag; quando vê, aborta a chamada em voo ao
 * modelo (só leitura — abortar não deixa nada pela metade) e o loop
 * para entre rodadas/antes da próxima tool.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface CancelWatcher {
  isCancelled: () => boolean
  signal: AbortSignal
  stop: () => void
}

export function createCancelWatcher(opts: {
  admin: SupabaseClient
  messageId: string | null
  intervalMs?: number
}): CancelWatcher {
  const controller = new AbortController()
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const tick = async () => {
    if (stopped || cancelled || !opts.messageId) return
    try {
      const { data } = await opts.admin
        .from("ai_chat_messages")
        .select("meta->>cancel_requested")
        .eq("id", opts.messageId)
        .maybeSingle()
      const flag = (data as { cancel_requested?: string | null } | null)?.cancel_requested
      if (flag === "true") {
        cancelled = true
        controller.abort()
        return
      }
    } catch {
      /* leitura falhou — tenta no próximo tick */
    }
    if (!stopped) timer = setTimeout(tick, opts.intervalMs ?? 1_500)
  }

  if (opts.messageId) timer = setTimeout(tick, opts.intervalMs ?? 1_500)

  return {
    isCancelled: () => cancelled,
    signal: controller.signal,
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}
