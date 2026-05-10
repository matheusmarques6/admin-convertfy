"use client"

/**
 * AiContextWatcher — observa a rota atual e injeta automaticamente
 * o contexto correto (store_id ou client_id) no useAiChatStore.
 *
 * Quando o usuario abre o chat numa pagina de loja, o assistente ja
 * sabe quais metricas reais consultar — sem precisar perguntar de
 * qual loja se trata.
 */

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useAiChatStore } from "./ai-chat-store"

const STORE_RE = /^\/admin\/stores\/([0-9a-f-]{36})/i
const CLIENT_RE = /^\/admin\/clients\/([0-9a-f-]{36})/i

export function AiContextWatcher() {
  const pathname = usePathname()
  const setContext = useAiChatStore((s) => s.setContext)

  useEffect(() => {
    if (!pathname) return
    const storeMatch = pathname.match(STORE_RE)
    if (storeMatch) {
      setContext({ store_id: storeMatch[1] })
      return
    }
    const clientMatch = pathname.match(CLIENT_RE)
    if (clientMatch) {
      setContext({ client_id: clientMatch[1] })
      return
    }
    setContext({})
  }, [pathname, setContext])

  return null
}
