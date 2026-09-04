/**
 * Origem PÚBLICA do admin (o endereço que o navegador do usuário vê).
 *
 * Existe por causa do OAuth: o `redirect_uri` mandado no início do
 * fluxo e o usado na troca do código precisam ser BYTE A BYTE iguais,
 * senão o authorization server recusa com redirect_uri_mismatch. Duas
 * rotas diferentes derivando isso de `request.nextUrl.origin` é um
 * convite ao erro — atrás do proxy da Vercel esse valor pode aparecer
 * como o host interno, ou como um alias de preview numa ponta e o
 * domínio final na outra.
 *
 * Ordem: variável de ambiente (a verdade declarada) → cabeçalhos de
 * proxy → origin da requisição.
 */

const strip = (u: string): string => u.trim().replace(/\/+$/, "")

export function publicOrigin(request: {
  headers: { get(name: string): string | null }
  nextUrl: { origin: string }
}): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (env) {
    const withProto = /^https?:\/\//.test(env) ? env : `https://${env}`
    return strip(withProto)
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  if (host) {
    // x-forwarded-* pode vir com a cadeia inteira ("a, b") — vale o 1º.
    const first = host.split(",")[0].trim()
    const proto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim()
    if (first) return strip(`${proto}://${first}`)
  }

  return strip(request.nextUrl.origin)
}

/** O redirect_uri do OAuth de MCP — um lugar só, as duas pontas iguais. */
export function mcpOAuthRedirectUri(request: {
  headers: { get(name: string): string | null }
  nextUrl: { origin: string }
}): string {
  return `${publicOrigin(request)}/api/ai/mcp-oauth/callback`
}
