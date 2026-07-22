/**
 * Extrai e interpreta cupons dos blocos de um e-mail, para a seção "Cupons a
 * criar" do handoff de implementação.
 *
 * TEMOS no schema: `code`, `hint`, `cta_url`, `expires_at` (em `email_blocks`
 * do tipo `coupon`). DERIVAMOS o `%` a partir do sufixo numérico do código
 * (ex: `BEMVINDO10` → "10% OFF") como fallback determinístico — a Convertfy
 * ainda não modela a regra estruturada do cupom (%/mínimo/uso). Função pura.
 */

import type { EmailBlock, CouponBlockContent } from "@/types/email-workspace"

export interface CouponInfo {
  /** Código do cupom (ex: BEMVINDO10). */
  code: string
  /** Texto de desconto derivado do código, ex: "10% OFF". `null` se indefinível. */
  discountLabel: string | null
  /** Dica/validade textual gravada no bloco (`hint`). */
  hint: string | null
  /** Validade ISO, se houver (`expires_at`). */
  expiresAt: string | null
  /** Destino do CTA, se houver (`cta_url`). */
  ctaUrl: string | null
}

/**
 * Escolhe o código de cupom literal para o idioma efetivo de uma loja, a
 * partir do mapa `{ idioma: código }` guardado na Estrutura geral
 * (`email_outline_templates.coupon_codes`).
 *
 * Match, em ordem: idioma exato (`pt-BR`) → mesma língua-base ignorando região
 * (`pt` casa `pt-BR`/`pt-PT`). SEM fallback entre idiomas diferentes: se o
 * idioma da loja não tiver código, retorna `null` — injetar o código de outra
 * língua (ex.: BEMVINDO10 num email em francês) resultaria num cupom inválido.
 */
export function resolveCouponCodeForLang(
  couponCodes: Record<string, string> | null | undefined,
  lang: string | null | undefined,
): string | null {
  if (!couponCodes || typeof couponCodes !== "object") return null
  const entries = Object.entries(couponCodes)
    .map(([k, v]) => [k.trim(), (typeof v === "string" ? v : "").trim()] as const)
    .filter(([k, v]) => k.length > 0 && v.length > 0)
  if (entries.length === 0) return null

  const target = (lang ?? "").trim()
  if (!target) return null

  // 1. Match exato (case-insensitive).
  const exact = entries.find(([k]) => k.toLowerCase() === target.toLowerCase())
  if (exact) return exact[1]

  // 2. Mesma língua-base (pt-BR ~ pt ~ pt-PT).
  const base = target.split("-")[0]?.toLowerCase()
  if (base) {
    const sameBase = entries.find(([k]) => k.split("-")[0]?.toLowerCase() === base)
    if (sameBase) return sameBase[1]
  }

  return null
}

/**
 * Deriva o rótulo de desconto a partir do código. Heurística: pega o último
 * grupo de dígitos do código (ex: BEMVINDO10 → 10, FRETE15OFF → 15). Acima de
 * 90 assume valor em R$ em vez de %, pra evitar "100% OFF" falso.
 */
export function discountLabelFromCode(code: string): string | null {
  const match = code.match(/(\d{1,3})(?!.*\d)/)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > 90) return `R$ ${n} OFF`
  return `${n}% OFF`
}

/** Interpreta um único bloco de cupom. Retorna `null` se não tiver código. */
export function couponInfo(content: CouponBlockContent): CouponInfo | null {
  const code = (content.code ?? "").trim()
  if (!code) return null
  const hint = (content.hint ?? "").trim() || null
  return {
    code,
    discountLabel: discountLabelFromCode(code),
    hint,
    expiresAt: (content.expires_at ?? "").trim() || null,
    ctaUrl: (content.cta_url ?? "").trim() || null,
  }
}

/**
 * Lê todos os cupons presentes nos blocos de um e-mail (blocos `coupon` com
 * código). Deduplica por código (mantém a primeira ocorrência).
 */
export function emailCoupons(blocks: EmailBlock[]): CouponInfo[] {
  const out: CouponInfo[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    if (block.block_type !== "coupon") continue
    const info = couponInfo(block.content as CouponBlockContent)
    if (!info) continue
    const key = info.code.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(info)
  }
  return out
}
