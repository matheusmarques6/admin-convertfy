/**
 * Validação (zod) dos campos de cupom do outline — compartilhada pelo POST
 * e pelo PATCH de `/api/admin/outlines`.
 *
 * `coupon_codes`: chave = código de idioma da lista canônica
 * (`STORE_LANGUAGE_CODES`); valor = código em maiúsculas. Entrada vazia
 * apaga a tradução daquele idioma. Chave fora da lista → 422, porque um
 * `"english"` digitado à mão nunca casaria com o idioma resolvido da loja e
 * a tradução ficaria gravada e inútil.
 */

import { z } from "zod"

import { STORE_LANGUAGE_CODES } from "@/lib/i18n/store-language"

const CODIGOS = new Set<string>(STORE_LANGUAGE_CODES)

export const couponCodesSchema = z
  .record(z.string(), z.string().nullable())
  .superRefine((obj, ctx) => {
    for (const k of Object.keys(obj)) {
      if (!CODIGOS.has(k)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `idioma desconhecido em coupon_codes: ${k}` })
      }
    }
  })
  .transform((obj) => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) {
      const code = (v ?? "").trim().toUpperCase()
      if (code) out[k] = code
    }
    return out
  })

export const couponValueSchema = z
  .string()
  .max(20)
  .nullable()
  .transform((v) => (v ?? "").trim() || null)
