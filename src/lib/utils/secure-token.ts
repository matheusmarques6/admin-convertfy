import { randomBytes } from "crypto"

/**
 * Geracao de tokens opacos para URLs publicas (form do onboarding,
 * tutorial). Server-only — depende do `crypto` do Node.
 *
 * Esses tokens sao a UNICA protecao das paginas publicas: quem tem o
 * link responde o formulario da loja. Por isso nao podem sair de
 * `Math.random()`, que e um PRNG previsivel — de posse de alguns tokens
 * e possivel reconstruir o estado do gerador e prever os proximos.
 */

/** Alfabeto alfanumerico (62 chars) — mesmo formato dos tokens antigos. */
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

/**
 * Maior multiplo de 62 que cabe em um byte (4 * 62 = 248). Bytes acima
 * disso sao descartados: sem essa rejeicao, `byte % 62` daria peso extra
 * aos 8 primeiros caracteres do alfabeto (vies de modulo).
 */
const REJECT_THRESHOLD = Math.floor(256 / ALPHABET.length) * ALPHABET.length

/**
 * Token aleatorio criptograficamente seguro, alfanumerico e uniforme.
 *
 * Gera em blocos e reamostra os bytes descartados — o loop termina com
 * probabilidade 1 (chance de rejeicao por byte e 8/256 = 3,1%).
 */
export function secureToken(len = 24): string {
  if (len <= 0) return ""

  let out = ""
  while (out.length < len) {
    // Folga de ~15% pra cobrir os bytes rejeitados sem novo round-trip.
    const need = len - out.length
    const bytes = randomBytes(Math.ceil(need * 1.2) + 8)
    for (let i = 0; i < bytes.length && out.length < len; i++) {
      const b = bytes[i]
      if (b >= REJECT_THRESHOLD) continue
      out += ALPHABET.charAt(b % ALPHABET.length)
    }
  }
  return out
}
