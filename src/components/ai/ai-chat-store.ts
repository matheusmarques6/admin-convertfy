"use client"

import { create } from "zustand"
import type { AiChatContext } from "@/types/ai"

interface AiChatState {
  open: boolean
  context: AiChatContext
  setOpen: (open: boolean) => void
  toggle: () => void
  setContext: (ctx: AiChatContext) => void
}

export const useAiChatStore = create<AiChatState>((set) => ({
  open: false,
  context: {},
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setContext: (context) => set({ context }),
}))
