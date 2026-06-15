import {
  PRODUCTION_STEP_COUNT,
  type ProductionBucketKey,
  type ProductionCampaign,
  type ProductionStore,
} from "@/types/campaign-production"
import type { CampaignSuggestionType } from "@/types/campaign-central"

/** Bucket agregado de um estágio por loja (0..4). */
export function bucketOf(stage: number): ProductionBucketKey {
  if (stage >= 4) return "enviado"
  if (stage === 3) return "agendado"
  if (stage === 2) return "revisao"
  return "design"
}

export function bucketCounts(stores: ProductionStore[]): Record<ProductionBucketKey, number> {
  const c: Record<ProductionBucketKey, number> = { design: 0, revisao: 0, agendado: 0, enviado: 0 }
  for (const s of stores) c[bucketOf(s.prod_stage)]++
  return c
}

/** Progresso (0..100) de uma campanha = soma dos passos concluídos / total. */
export function campaignProgress(c: ProductionCampaign): number {
  if (c.stores.length === 0) return 0
  const total = c.stores.length * PRODUCTION_STEP_COUNT
  const done = c.stores.reduce((a, s) => a + Math.min(s.prod_stage, PRODUCTION_STEP_COUNT), 0)
  return Math.round((done / total) * 100)
}

/** "Envia em 2 dias", "Envia hoje", "Atrasada 1 dia", "Sem data". */
export function sendLabel(sendIn: number | null, sendDate: string | null): string {
  if (sendIn == null) return "Sem data de envio"
  if (sendIn < 0) {
    const n = Math.abs(sendIn)
    return `Atrasada ${n} dia${n !== 1 ? "s" : ""}`
  }
  if (sendIn === 0) return "Envia hoje"
  const tail = sendDate ? ` · ${formatSendDate(sendDate)}` : ""
  return `Envia em ${sendIn} dia${sendIn !== 1 ? "s" : ""}${tail}`
}

function formatSendDate(iso: string): string {
  const [, m, d] = iso.split("-")
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  const mi = Number(m) - 1
  return `${d}/${months[mi] ?? m}`
}

export const LANG_LABEL: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
}

export interface ProductionTypeMeta {
  label: string
  tone: "info" | "positive" | "warning" | "neutral"
}

export const PRODUCTION_TYPE_META: Record<CampaignSuggestionType, ProductionTypeMeta> = {
  data: { label: "Data sazonal", tone: "info" },
  tema: { label: "Tema em alta", tone: "neutral" },
  email: { label: "Email campeão", tone: "positive" },
  performance: { label: "Performance", tone: "warning" },
  avulsa: { label: "Avulsa", tone: "neutral" },
}

/**
 * Kit de marca determinístico por loja (fallback visual enquanto não há
 * dados estruturados de marca). Mesma intenção do mockup: cor estável por
 * nome pra dar identidade à peça no preview/glyph.
 */
const BRAND_PALETTE: Array<{ primary: string; accent: string }> = [
  { primary: "#1F2937", accent: "#4E62D8" },
  { primary: "#111827", accent: "#E11D48" },
  { primary: "#14532D", accent: "#65A30D" },
  { primary: "#0F172A", accent: "#F97316" },
  { primary: "#18181B", accent: "#DC2626" },
  { primary: "#1C1917", accent: "#9A8C98" },
  { primary: "#0C4A6E", accent: "#0EA5E9" },
  { primary: "#3B0764", accent: "#A855F7" },
]

export interface StoreBrand {
  primary: string
  accent: string
  font: string
  voice: string
}

export function storeBrand(name: string): StoreBrand {
  const h = (name || "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const p = BRAND_PALETTE[h % BRAND_PALETTE.length]
  return { primary: p.primary, accent: p.accent, font: "Inter", voice: "Equilibrado, claro" }
}

/** Iniciais (até 2) pra glyph da loja. */
export function storeInitials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function designerInitials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
