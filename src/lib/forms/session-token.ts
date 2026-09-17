/**
 * Token de escrita da sessão: prova que quem grava é quem abriu.
 *
 * O id da sessão viaja para o browser (o autosave precisa dele). Sem
 * assinatura, conhecer um id — que aparece na rede, no devtools, no
 * histórico de quem compartilha a tela — bastaria para reescrever as
 * respostas de outra pessoa ou marcar a sessão dela como concluída.
 *
 * `sessionId.expiraEm.hmac`, HMAC-SHA256 com segredo do servidor. Não é
 * JWT de propósito: não há claim para carregar, não há biblioteca para
 * manter, e a verificação cabe em dez linhas auditáveis.
 *
 * ## O segredo tem cascata, e o último degrau é intencional
 *
 * `FORM_SESSION_SECRET` → `ENCRYPTION_KEY` → `SUPABASE_SERVICE_ROLE_KEY`.
 * O último sempre existe em produção (sem ele o admin inteiro não sobe),
 * então nunca há o caso "sem segredo, assina com string vazia" — que
 * seria pior que não assinar, porque pareceria assinado. O que deriva do
 * service role é uma CHAVE SEPARADA (`hkdf` por rótulo), não a chave em
 * si: vazar um token não pode aproximar ninguém do service role.
 */

import crypto from "crypto"

const SEPARADOR = "."
const ROTULO = "convertfy:form-session:v1"

/** Validade do token. Uma sessão de formulário não dura um dia. */
export const VALIDADE_PADRAO_MS = 12 * 60 * 60 * 1000

function segredo(): Buffer {
  const bruto =
    process.env.FORM_SESSION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  if (!bruto) {
    throw new Error(
      "Nenhum segredo disponível para assinar a sessão do formulário " +
        "(FORM_SESSION_SECRET, ENCRYPTION_KEY ou SUPABASE_SERVICE_ROLE_KEY).",
    )
  }
  // Chave derivada: o token nunca é assinado com a chave original.
  // `hkdfSync` devolve ArrayBuffer; o HMAC quer uma view de bytes.
  const derivada = crypto.hkdfSync("sha256", bruto, "", ROTULO, 32)
  return Buffer.from(derivada as ArrayBuffer)
}

function assinar(payload: string): string {
  return crypto
    .createHmac("sha256", new Uint8Array(segredo()))
    .update(payload)
    .digest("base64url")
}

export function assinarTokenSessao(sessionId: string, validadeMs = VALIDADE_PADRAO_MS): string {
  const expira = Date.now() + validadeMs
  const payload = `${sessionId}${SEPARADOR}${expira}`
  return `${payload}${SEPARADOR}${assinar(payload)}`
}

export interface TokenVerificado {
  valido: boolean
  sessionId: string | null
  motivo?: "formato" | "assinatura" | "expirado"
}

export function verificarTokenSessao(token: string | null | undefined): TokenVerificado {
  if (!token) return { valido: false, sessionId: null, motivo: "formato" }
  const partes = token.split(SEPARADOR)
  if (partes.length !== 3) return { valido: false, sessionId: null, motivo: "formato" }

  const [sessionId, expiraTxt, assinatura] = partes
  const expira = Number(expiraTxt)
  if (!sessionId || !Number.isFinite(expira)) {
    return { valido: false, sessionId: null, motivo: "formato" }
  }

  const esperada = assinar(`${sessionId}${SEPARADOR}${expiraTxt}`)
  // `timingSafeEqual` exige mesmo comprimento — comparar antes evita que
  // ele lance, e o comprimento de um HMAC base64url é fixo mesmo.
  const a = Buffer.from(assinatura)
  const b = Buffer.from(esperada)
  const confere =
    a.length === b.length && crypto.timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
  if (!confere) return { valido: false, sessionId: null, motivo: "assinatura" }

  // A expiração é verificada DEPOIS da assinatura: verificar antes
  // responderia "expirado" para um token forjado, contando ao atacante
  // que o formato dele estava certo.
  if (Date.now() > expira) return { valido: false, sessionId, motivo: "expirado" }

  return { valido: true, sessionId }
}

/**
 * Hash do token de RETOMADA (o do link do email), que é outra coisa: ele
 * é guardado no banco, então vai hasheado — vazamento do banco não pode
 * virar acesso às sessões.
 */
export function hashDeRetomada(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/** Gera um token de retomada novo e o hash a guardar. */
export function novoTokenDeRetomada(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString("base64url")
  return { token, hash: hashDeRetomada(token) }
}
