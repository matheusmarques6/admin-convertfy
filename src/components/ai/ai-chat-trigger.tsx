"use client"

import { Sparkles } from "lucide-react"
import { useAiChatStore } from "./ai-chat-store"

export function AiChatTrigger() {
  const { open, toggle } = useAiChatStore()
  if (open) return null
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Abrir assistente IA"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 h-12 px-4 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-[0_8px_32px_rgba(249,115,22,0.40)] hover:shadow-[0_12px_40px_rgba(249,115,22,0.55)] transition-all"
    >
      <Sparkles className="h-4 w-4 animate-pulse" />
      <span className="text-[13px] font-semibold">IA</span>
    </button>
  )
}
