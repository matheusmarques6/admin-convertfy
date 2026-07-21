import crypto from "crypto"

/**
 * Hashing de PII para plataformas de ads (Meta Conversions API).
 *
 * A CAPI exige que dados pessoais (email, telefone, nome) sejam
 * enviados como SHA-256 (hex, lowercase) de um valor NORMALIZADO.
 * Ver: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *
 * Regra geral: trim + lowercase antes de hashear. Telefone precisa de
 * codigo de pais, so digitos, sem '+' nem zeros a esquerda.
 */

/** SHA-256 hex de um valor ja normalizado. */
function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex")
}

/**
 * Hash generico de PII: trim + lowercase + sha256.
 * Retorna null pra valores vazios (nao envia campo vazio pro Meta).
 */
export function hashPII(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  return sha256Hex(normalized)
}

/** Email normalizado (trim + lowercase) e hasheado. */
export function hashEmail(email: string | null | undefined): string | null {
  return hashPII(email)
}

/**
 * Nome (first/last) normalizado e hasheado. Remove espacos das pontas
 * e coloca em minusculas — o Meta faz o mesmo do lado dele.
 */
export function hashName(name: string | null | undefined): string | null {
  return hashPII(name)
}

/**
 * Normaliza um telefone para o formato esperado pelo Meta antes do
 * hash: apenas digitos, com codigo de pais, sem '+' nem zeros a
 * esquerda. Assume Brasil (55) quando o numero vem sem codigo de pais.
 *
 * - "+55 (11) 99999-9999" → "5511999999999"
 * - "5511999999999"       → "5511999999999"
 * - "11999999999"         → "5511999999999" (prepend 55)
 * - "1133334444"          → "551133334444"  (fixo local BR)
 */
export function normalizePhoneDigits(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, "")
  if (!digits) return null

  // Remove zeros a esquerda (ex. discagem "011...").
  digits = digits.replace(/^0+/, "")
  if (!digits) return null

  // Numero local BR (10 fixo / 11 movel) sem codigo de pais → prepend 55.
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }

  return digits
}

/** Telefone normalizado (E.164 sem '+') e hasheado. */
export function hashPhone(phone: string | null | undefined): string | null {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return null
  return sha256Hex(digits)
}
