"use client"

import { create } from "zustand"
import type { AiChatContext } from "@/types/ai"

interface AiChatState {
  open: boolean
  context: AiChatContext
  activeConversationId: string | null
  setOpen: (open: boolean) => void
  toggle: () => void
  setContext: (ctx: AiChatContext) => void
  setActiveConversationId: (id: string | null) => void
}

export const useAiChatStore = create<AiChatState>((set) => ({
  open: false,
  context: {},
  activeConversationId: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setContext: (context) => set({ context }),
  setActiveConversationId: (activeConversationId) =>
    set({ activeConversationId }),
}))
