"use client"

import { useEffect } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

// ---------------------------------------------------------------------------
// Breakpoints (DS v3.0 Rule 12)
// ---------------------------------------------------------------------------
const BP_MD = 768   // collapsed
const BP_LG = 1040  // expanded

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
interface SidebarState {
  /** Desktop/tablet: expanded (true) vs collapsed (false) */
  isExpanded: boolean
  /** Mobile drawer open/closed */
  isMobileOpen: boolean
  /** User explicitly toggled (overrides auto) */
  userToggled: boolean
  toggle: () => void
  setExpanded: (v: boolean) => void
  openMobile: () => void
  closeMobile: () => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isExpanded: true,
      isMobileOpen: false,
      userToggled: false,
      toggle: () =>
        set((s) => ({ isExpanded: !s.isExpanded, userToggled: true })),
      setExpanded: (v) => set((s) => s.isExpanded === v ? s : { isExpanded: v }),
      openMobile: () => set({ isMobileOpen: true }),
      closeMobile: () => set({ isMobileOpen: false }),
    }),
    {
      name: "convertfy-sidebar",
      partialize: (s) => ({ isExpanded: s.isExpanded, userToggled: s.userToggled }),
    }
  )
)

// ---------------------------------------------------------------------------
// Hook — auto-detects breakpoint and syncs state
// ---------------------------------------------------------------------------
export function useSidebar() {
  const store = useSidebarStore()

  useEffect(() => {
    // Sync on mount — use getState() to avoid dependency on store object
    const w = window.innerWidth
    if (w >= BP_MD && !useSidebarStore.getState().userToggled) {
      useSidebarStore.getState().setExpanded(w >= BP_LG)
    }

    // Listen for viewport changes
    const mq = window.matchMedia(`(min-width: ${BP_LG}px)`)
    const handler = () => {
      if (!useSidebarStore.getState().userToggled) {
        useSidebarStore.getState().setExpanded(window.innerWidth >= BP_LG)
      }
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- runs once on mount, uses getState()

  return store
}
