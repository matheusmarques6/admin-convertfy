/**
 * Montagem das URLs publicas do onboarding a partir do token.
 *
 * Isomorfico de proposito: e o MESMO modulo no servidor (WhatsApp, jobs)
 * e no browser (botoes de copiar). Antes disso a URL era remontada a mao
 * em 5 lugares — o servidor usava `NEXT_PUBLIC_APP_URL` e o browser
 * `window.location.origin`, entao o link copiado no admin podia apontar
 * pra um host diferente do que o cliente recebia no WhatsApp.
 *
 * Sem dependencia de Node/Supabase: pode ser importado de client
 * components.
 */

/** Host de producao — ultimo recurso quando nao ha env nem window. */
const FALLBACK_BASE_URL = "https://admin.convertfy.com"

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/**
 * Base para links publicos.
 *
 * `NEXT_PUBLIC_APP_URL` vem primeiro e vale nos dois lados (e uma var
 * `NEXT_PUBLIC_`, entao o bundle do browser tambem enxerga) — e ela que
 * mantem servidor e client alinhados. Sem ela, o browser cai no proprio
 * origin, que ao menos e coerente com a aba aberta.
 */
export function resolveAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return stripTrailingSlash(fromEnv)
  if (typeof window !== "undefined" && window.location?.origin) {
    return stripTrailingSlash(window.location.origin)
  }
  return FALLBACK_BASE_URL
}

/** `{base}/form/{token}` — formulario do onboarding. */
export function buildFormUrl(token: string, baseUrl?: string): string {
  const base = baseUrl ? stripTrailingSlash(baseUrl) : resolveAppBaseUrl()
  return `${base}/form/${token}`
}

/** `{base}/form/{token}/briefing` — revisao inline do briefing. */
export function buildBriefingUrl(token: string, baseUrl?: string): string {
  return `${buildFormUrl(token, baseUrl)}/briefing`
}
