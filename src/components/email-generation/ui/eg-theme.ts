/**
 * Tokens da maquete "Geração de Emails" (Convertfy DS v3).
 *
 * Replicados inline pra fidelidade visual com o protótipo aprovado — mesmo
 * trade-off da página de Logs (`logs-workspace.tsx`): light-only, sem
 * Tailwind nos elementos da maquete.
 */

export const C = {
  brand: "#4E62D8",
  brandHover: "#2137B6",
  brandDark: "#041366",
  blue50: "#EEF0FB",
  blue100: "#C7CDEF",
  blue200: "#A8B2EE",
  white: "#FFFFFF",
  g25: "#FCFCFD",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g800: "#1F2937",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
  neut: "#374151",
  neutBg: "#F3F4F6",
  neutBorder: "#E5E7EB",
  border: "rgba(0,0,0,0.08)",
  gradient: "linear-gradient(90deg, #4E62D8, #2137B6, #041366)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.05)",
} as const

export const F = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const

export const TNUM = {
  fontVariantNumeric: "tabular-nums lining-nums" as const,
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
}

/** Estilo base de input/select/textarea da maquete. */
export const egInputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 11px",
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  background: C.white,
  fontSize: 13,
  color: C.g800,
  fontFamily: F.sans,
  outline: "none",
}

/** Fundo listrado do placeholder de resultado (aba Testar). */
export const egStripeBg =
  "repeating-linear-gradient(45deg, #F8FAFC, #F8FAFC 10px, #F3F4F6 10px, #F3F4F6 20px)"
