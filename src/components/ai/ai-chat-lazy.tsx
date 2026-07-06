"use client"

import { useRef } from "react"
import dynamic from "next/dynamic"
import { useAiChatStore } from "./ai-chat-store"

const AiChatDrawer = dynamic(
  () => import("./ai-chat-drawer").then((m) => ({ default: m.AiChatDrawer })),
  { ssr: false }
)

/**
 * Carrega o AiChatDrawer (e o react-markdown que ele arrasta) somente na
 * primeira abertura do chat — tira ~150 kB do First Load JS de todas as
 * páginas admin. Depois de aberto uma vez, permanece montado para preservar
 * a animação de saída do Sheet e o estado da conversa entre aberturas.
 */
export function AiChatLazy() {
  const open = useAiChatStore((s) => s.open)
  // Latch em render (não useState+useEffect): o drawer monta no MESMO render
  // em que open vira true — sem frame extra de Sheet vazio na 1ª abertura.
  const everOpenedRef = useRef(false)
  if (open) everOpenedRef.current = true

  if (!everOpenedRef.current) return null
  return <AiChatDrawer />
}
