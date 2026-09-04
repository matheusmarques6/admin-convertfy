/**
 * Verificação da assinatura dos webhooks do Fathom (padrão Svix).
 *
 * O segredo entregue pelo Fathom vem como `whsec_<base64>`; o que se
 * assina é a string `${webhook-id}.${webhook-timestamp}.${corpo cru}`
 * com HMAC-SHA256, e o header `webhook-signature` carrega uma ou mais
 * assinaturas no formato `v1,<base64> v1,<outra>` (rotação de chave).
 *
 * Duas defesas obrigatórias:
 *  - comparação em tempo constante (timingSafeEqual);
 *  - janela de 5 minutos no timestamp — sem ela, um POST capturado
 *    pode ser reenviado para sempre.
 *
 * Puro: recebe o corpo CRU (nunca o JSON já parseado — reserializar
 * muda bytes e invalida a assinatura).
 */

import crypto from "crypto"

export const FATHOM_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000

export interface FathomWebhookHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "bad_timestamp" | "expired" | "mismatch" | "bad_secret" }

function secretToKey(secret: string): Buffer | null {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret
  try {
    const key = Buffer.from(raw, "base64")
    return key.length > 0 ? key : null
  } catch {
    return null
  }
}

export function verifyFathomSignature(input: {
  rawBody: string
  headers: FathomWebhookHeaders
  secret: string
  now?: number
}): VerifyResult {
  const { rawBody, headers, secret } = input
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing_headers" }
  }
  const key = secretToKey(secret)
  if (!key) return { ok: false, reason: "bad_secret" }

  // timestamp em segundos (padrão Svix)
  const ts = Number(headers.timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" }
  const now = input.now ?? Date.now()
  if (Math.abs(now - ts * 1000) > FATHOM_SIGNATURE_TOLERANCE_MS) {
    return { ok: false, reason: "expired" }
  }

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`, "utf8")
    .digest("base64")
  const expectedBuf = Buffer.from(expected, "utf8")

  // O header pode trazer várias assinaturas separadas por espaço
  for (const part of headers.signature.split(" ")) {
    const value = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part
    if (!value) continue
    const candidate = Buffer.from(value, "utf8")
    if (
      candidate.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidate, expectedBuf)
    ) {
      return { ok: true }
    }
  }
  return { ok: false, reason: "mismatch" }
}
