/**
 * Token HMAC de curta duração para o Chromium headless acessar a página
 * /admin/stores/relatorios/[reportId]/print sem sessão de usuário.
 *
 * Fluxo: a rota POST /api/admin/stores/reports/[reportId]/pdf (autenticada)
 * assina um token amarrado ao reportId com expiração curta; o middleware
 * deixa a URL do print passar quando há `pdf_token` na query e a PRÓPRIA
 * página valida o HMAC (inválido/expirado → notFound). Sem token, o print
 * segue exigindo sessão via middleware, como sempre.
 *
 * Segredo: PDF_TOKEN_SECRET (opcional) com fallback pra
 * SUPABASE_SERVICE_ROLE_KEY — sempre presente no server e nunca exposto.
 */

import crypto from "crypto"

const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutos — só o tempo do render

function secret(): string {
  const s = process.env.PDF_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error("PDF_TOKEN_SECRET/SUPABASE_SERVICE_ROLE_KEY ausentes")
  return s
}

function sign(reportId: string, exp: number): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`${reportId}.${exp}`)
    .digest("base64url")
}

/** Gera `exp.assinatura` — URL-safe, sem estado no banco. */
export function createPrintToken(reportId: string, now = Date.now()): string {
  const exp = now + TOKEN_TTL_MS
  return `${exp}.${sign(reportId, exp)}`
}

/** true se o token é válido para este reportId e ainda não expirou. */
export function verifyPrintToken(
  reportId: string,
  token: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!token) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const exp = Number(token.slice(0, dot))
  if (!Number.isFinite(exp) || exp < now) return false
  const provided = token.slice(dot + 1)
  const expected = sign(reportId, exp)
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
