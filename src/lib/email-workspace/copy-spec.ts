/**
 * copy-spec — orçamento de caracteres (min/max) por campo de copy de cada
 * bloco de email, para o gerador de copy (n8n) produzir texto que CABE no
 * layout (headline nunca vira parágrafo; CTA nunca quebra em 2 linhas).
 *
 * A fonte primária do budget é o Blueprint agent, que lê o HTML montado e
 * deriva os números da geometria real via fórmula:
 *
 *   chars_por_linha ≈ largura_útil_px ÷ (font_size_px × 0.55)
 *   (colunas estreitas < 300px: usar × 0.75 — a quebra de palavra
 *    desperdiça ~30% da linha; validado em render real no Chromium)
 *   max_chars = chars_por_linha × nº de linhas elegantes
 *   min_chars ≈ 40–60% do max
 *
 * Este módulo fornece (a) o DEFAULT canônico por block_type — usado quando
 * o blueprint não tem copy_spec (fallback global/legado) — e (b) o clamp
 * dos specs emitidos pelo LLM aos guarda-corpos absolutos, e (c) o
 * verificador de desvios usado no callback do n8n.
 *
 * Funções puras (sem deps de server/client) — testáveis e reusáveis.
 */

import type { CopySpecField } from "@/types/email-generation"

export type { CopySpecField }

// Guarda-corpos ABSOLUTOS por chave de copy: o LLM pode ajustar o budget à
// geometria do template, mas nunca sair dessas faixas (um "max_chars: 900"
// de headline é erro, não criatividade). Chaves espelham as reais do banco
// (ver block-copy-fields.ts).
const ABSOLUTE_BOUNDS: Record<string, { min: number; max: number }> = {
  eyebrow: { min: 6, max: 50 },
  headline: { min: 12, max: 60 },
  heading: { min: 10, max: 60 },
  title: { min: 8, max: 50 },
  subhead: { min: 30, max: 140 },
  body: { min: 40, max: 400 },
  text: { min: 30, max: 400 },
  cta: { min: 6, max: 24 },
  cta_text: { min: 6, max: 24 },
  code: { min: 4, max: 16 },
  hint: { min: 15, max: 120 },
  greeting: { min: 4, max: 50 },
  signoff: { min: 4, max: 50 },
  author: { min: 4, max: 40 },
  tagline: { min: 10, max: 90 },
  label: { min: 4, max: 40 },
}

// Fallback para chaves fora da lista (custom do LLM): faixa genérica larga.
const GENERIC_BOUNDS = { min: 3, max: 600 }

/**
 * Budget DEFAULT por block_type — números validados em render real (600px,
 * tipografia dos templates da biblioteca). Usado quando o blueprint não
 * emitiu copy_spec (global curado, DEFAULT_BLUEPRINTS, rows legadas).
 */
const DEFAULT_SPEC_BY_TYPE: Record<string, CopySpecField[]> = {
  hero: [
    // Kicker do hero: 1 linha, 1-3 palavras. Teto 24 (espelha a instrução do
    // Blueprint agent, que envia o copy_spec ao n8n — ver migration 20260923).
    { key: "eyebrow", min_chars: 8, max_chars: 24 },
    { key: "headline", min_chars: 18, max_chars: 40 },
    { key: "body", min_chars: 120, max_chars: 210 },
    { key: "cta", min_chars: 8, max_chars: 16 },
  ],
  headline: [{ key: "headline", min_chars: 18, max_chars: 45 }],
  text: [
    { key: "title", min_chars: 20, max_chars: 50 },
    { key: "body", min_chars: 120, max_chars: 280 },
  ],
  coupon: [
    { key: "headline", min_chars: 15, max_chars: 40 },
    { key: "code", min_chars: 4, max_chars: 15 },
    { key: "hint", min_chars: 20, max_chars: 90 },
    { key: "cta", min_chars: 8, max_chars: 20 },
  ],
  products: [
    { key: "heading", min_chars: 15, max_chars: 40 },
    { key: "cta", min_chars: 8, max_chars: 20 },
  ],
  features: [
    { key: "title", min_chars: 12, max_chars: 30 },
    { key: "text", min_chars: 60, max_chars: 120 },
  ],
  testimonials: [
    { key: "title", min_chars: 15, max_chars: 40 },
    { key: "text", min_chars: 55, max_chars: 85 },
    { key: "author", min_chars: 5, max_chars: 30 },
  ],
  social_proof: [
    { key: "headline", min_chars: 20, max_chars: 45 },
    { key: "text", min_chars: 60, max_chars: 140 },
  ],
  urgency: [
    { key: "headline", min_chars: 20, max_chars: 45 },
    { key: "text", min_chars: 60, max_chars: 140 },
    { key: "cta", min_chars: 8, max_chars: 20 },
  ],
  story: [
    { key: "headline", min_chars: 20, max_chars: 50 },
    { key: "text", min_chars: 150, max_chars: 350 },
  ],
  letter: [
    { key: "greeting", min_chars: 5, max_chars: 40 },
    { key: "text", min_chars: 200, max_chars: 450 },
    { key: "signoff", min_chars: 5, max_chars: 40 },
    { key: "author", min_chars: 5, max_chars: 40 },
  ],
  cta: [
    { key: "text", min_chars: 40, max_chars: 120 },
    { key: "cta", min_chars: 8, max_chars: 20 },
  ],
  comparison: [
    { key: "headline", min_chars: 20, max_chars: 45 },
    { key: "text", min_chars: 60, max_chars: 200 },
  ],
  header: [{ key: "text", min_chars: 15, max_chars: 60 }],
  // Blocos sem copy gerada (visuais/estruturais): spec vazio.
  footer: [],
  image: [],
  divider: [],
  spacer: [],
  social: [],
}

/** Budget default canônico do tipo. Tipo desconhecido → spec vazio. */
export function defaultCopySpec(blockType: string): CopySpecField[] {
  return DEFAULT_SPEC_BY_TYPE[blockType] ?? []
}

function boundsFor(key: string): { min: number; max: number } {
  return ABSOLUTE_BOUNDS[key] ?? GENERIC_BOUNDS
}

const clampInt = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(v)))

/**
 * Valida/clampa UM campo de spec cru (vindo do LLM). Retorna null se a
 * shape é irrecuperável (sem key ou sem números).
 */
export function clampCopySpecField(raw: unknown): CopySpecField | null {
  if (!raw || typeof raw !== "object") return null
  const f = raw as Record<string, unknown>
  const key =
    typeof f.key === "string" ? f.key.trim().toLowerCase().slice(0, 32) : ""
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return null
  const minRaw = Number(f.min_chars)
  const maxRaw = Number(f.max_chars)
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null
  const b = boundsFor(key)
  let min = clampInt(minRaw, b.min, b.max)
  let max = clampInt(maxRaw, b.min, b.max)
  if (min > max) [min, max] = [max, min]
  return { key, min_chars: min, max_chars: max }
}

/**
 * Normaliza o copy_spec de um bloco: clampa o que o LLM emitiu (dedup por
 * key, primeira ocorrência ganha); se vazio/ausente/inválido, cai no
 * default canônico do tipo.
 */
export function normalizeCopySpec(
  raw: unknown,
  blockType: string,
): CopySpecField[] {
  if (Array.isArray(raw)) {
    const seen = new Set<string>()
    const fields: CopySpecField[] = []
    for (const item of raw) {
      const f = clampCopySpecField(item)
      if (f && !seen.has(f.key)) {
        seen.add(f.key)
        fields.push(f)
      }
    }
    if (fields.length > 0) return fields
  }
  return defaultCopySpec(blockType)
}

export interface CopyDeviation {
  key: string
  length: number
  min_chars: number
  max_chars: number
}

/**
 * Compara o content gravado com o spec: retorna os campos PRESENTES no
 * content (string não-vazia) cujo tamanho está fora do budget. Campos que
 * o gerador não preencheu não contam como desvio.
 */
export function findCopyDeviations(
  content: Record<string, unknown> | null | undefined,
  spec: CopySpecField[],
): CopyDeviation[] {
  if (!content || spec.length === 0) return []
  const deviations: CopyDeviation[] = []
  for (const field of spec) {
    const value = content[field.key]
    if (typeof value !== "string") continue
    const length = value.trim().length
    if (length === 0) continue
    if (length < field.min_chars || length > field.max_chars) {
      deviations.push({
        key: field.key,
        length,
        min_chars: field.min_chars,
        max_chars: field.max_chars,
      })
    }
  }
  return deviations
}
