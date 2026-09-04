/**
 * Assinatura das URLs PÚBLICAS de assets gerados pela ConvertIA
 * (server-only — usa a ENCRYPTION_KEY).
 *
 * Por que existe: a imagem gerada no chat é servida atrás do login do
 * admin (/api/ai/convertia/imagem/…). Isso é o certo para exibir no
 * chat, mas o Omnisend (`POST /api/images`), o Klaviyo e o Shopify só
 * aceitam URL que ELES consigam baixar — pública, estática, sem
 * redirect. Sem isto a ConvertIA gera a arte da roleta e não tem como
 * colocá-la no popup.
 *
 * Modelo: URL com HMAC-SHA256 do path (256 bits, derivado da chave de
 * criptografia da casa). É "privado por ser impossível de adivinhar" —
 * o mesmo modelo da signed URL do Supabase, sem o token quebrado que
 * assinava outro path. Não expira: o link vai parar em template de
 * email e em formulário, e um asset que some do nada quebra a peça no
 * ar. Revogação = trocar a chave (invalida todas — decisão consciente).
 */

import { createHmac, timingSafeEqual } from "crypto"
import { isConvertiaImagePath } from "./convertia-image-url"

export const CONVERTIA_PUBLIC_ASSET_ROUTE = "/api/public/convertia-asset/"

/** Chave derivada — nunca a ENCRYPTION_KEY crua como segredo de HMAC. */
function signingKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.length !== 64) {
    throw new Error("ENCRYPTION_KEY ausente ou inválida — não dá para assinar assets públicos")
  }
  return createHmac("sha256", Buffer.from(raw, "hex")).update("convertia-public-asset:v1").digest()
}

export function signConvertiaAssetPath(path: string): string {
  return createHmac("sha256", signingKey()).update(path).digest("base64url")
}

/** Compara em tempo constante; qualquer formato estranho é inválido. */
export function verifyConvertiaAssetSignature(path: string, sig: string | null | undefined): boolean {
  if (!sig || !isConvertiaImagePath(path)) return false
  let expected: Buffer
  let given: Buffer
  try {
    expected = Buffer.from(signConvertiaAssetPath(path), "base64url")
    given = Buffer.from(sig, "base64url")
  } catch {
    return false
  }
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/**
 * URL pública absoluta de um asset gerado. `origin` é a origem pública
 * do admin (publicOrigin) — a plataforma externa precisa do host real.
 */
export function publicConvertiaAssetUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "")
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${base}${CONVERTIA_PUBLIC_ASSET_ROUTE}${encoded}?sig=${signConvertiaAssetPath(path)}`
}
