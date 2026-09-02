/**
 * coupon-tokens — o cupom que o n8n escreveu como PLACEHOLDER.
 *
 * Innova Bay, Welcome 1, 02/09: o payload levou `coupon_code: "BEMVINDO10"`
 * e a copy voltou com `"Use code [DISCOUNT_CODE] at checkout."` na hero e
 * `"Apply [DISCOUNT_CODE] at checkout…"` na oferta. O callback resolvia
 * `{{BRAND_NAME}}` (`resolveBrandTokens`) e não conhecia token de cupom; o
 * colchete atravessou merge, hero e QA até o cliente — duas vezes no mesmo
 * email.
 *
 * Mesma forma do `resolveBrandTokens`: deep-walk no content e troca pelo
 * código REAL. Puro, sem I/O.
 *
 * `{{coupon_code}}` minúsculo NÃO entra: é token de personalização do ESP
 * (ver brand-guards, "tokens aprovados") e o próprio `render-html` o
 * escreve no bloco de cupom. Aqui só caem as formas que ninguém resolve:
 * colchetes, e as chaves em MAIÚSCULAS que o ESP não conhece.
 */

const COUPON_TOKEN_RE =
  /\[\s*(?:DISCOUNT[_ -]?CODE|COUPON[_ -]?CODE|COUPON|PROMO[_ -]?CODE|CODE|DYNAMIC)\s*\]|\{\{\s*(?:DISCOUNT[_ -]?CODE|COUPON[_ -]?CODE|PROMO[_ -]?CODE|COUPON)\s*\}\}/g

/** Há token de cupom no texto? (case-sensitive de propósito: `[code]` minúsculo é prosa). */
export function hasCouponToken(value: string): boolean {
  COUPON_TOKEN_RE.lastIndex = 0
  return COUPON_TOKEN_RE.test(value)
}

/** Chaves do content (deep) que carregam token de cupom. */
export function couponTokenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return hasCouponToken(value) ? [prefix || "(raiz)"] : []
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => couponTokenKeys(v, prefix ? `${prefix}[${i}]` : `[${i}]`))
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      couponTokenKeys(v, prefix ? `${prefix}.${k}` : k),
    )
  }
  return []
}

/**
 * Troca todo token de cupom pelo código. Sem código (null/vazio) devolve o
 * valor INTACTO — trocar por string vazia deixaria "Use code  at checkout",
 * que é pior que o colchete, porque some sem deixar rastro.
 */
export function resolveCouponTokens(value: unknown, code: string | null | undefined): unknown {
  const c = (code ?? "").trim()
  if (!c) return value
  if (typeof value === "string") return value.replace(COUPON_TOKEN_RE, c)
  if (Array.isArray(value)) return value.map((v) => resolveCouponTokens(v, c))
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        resolveCouponTokens(v, c),
      ]),
    )
  }
  return value
}
