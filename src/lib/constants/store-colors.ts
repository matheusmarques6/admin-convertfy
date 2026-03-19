/**
 * Store color system for multi-store breakdown UI.
 * Colors are muted 300-level Tailwind palette, optimized for dark mode.
 * Each store gets a color by index order (sorted by revenue in storeBreakdown).
 */

export interface StoreColor {
  /** Hex color for dots and proportion bar segments */
  dot: string
  /** Translucent background for badges (rgba with 0.08 opacity) */
  bg: string
  /** Hex color for badge text */
  text: string
}

export const STORE_COLORS: StoreColor[] = [
  { dot: "#6ee7b7", bg: "rgba(110,231,183,0.08)", text: "#6ee7b7" }, // emerald-300
  { dot: "#93c5fd", bg: "rgba(147,197,253,0.08)", text: "#93c5fd" }, // blue-300
  { dot: "#fda4af", bg: "rgba(253,164,175,0.08)", text: "#fda4af" }, // rose-300
  { dot: "#fcd34d", bg: "rgba(252,211,77,0.08)", text: "#fcd34d" },  // amber-300
  { dot: "#c4b5fd", bg: "rgba(196,181,253,0.08)", text: "#c4b5fd" }, // violet-300
  { dot: "#67e8f9", bg: "rgba(103,232,249,0.08)", text: "#67e8f9" }, // cyan-300
]

/** Get a store color by index with modular fallback */
export function getStoreColor(index: number): StoreColor {
  return STORE_COLORS[index % STORE_COLORS.length]
}
