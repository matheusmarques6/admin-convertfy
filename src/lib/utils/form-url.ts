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

import { origemVigente } from "@/lib/forms/dominio"

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

/**
 * `{base}/forms/{slug}` — formulário público do CRM.
 *
 * Existe porque o `event_source_url` da Meta não é opcional quando o
 * evento declara `action_source: "website"`, e nem todo envio tem de onde
 * tirá-lo: o cadastro embutido em iframe pode chegar sem referrer, e o
 * botão "testar evento" do admin não tem nenhum. Mandar a URL do próprio
 * formulário é a resposta CERTA para os dois — é literalmente a página em
 * que o evento aconteceria.
 */
export function buildCrmFormUrl(slug: string, baseUrl?: string): string {
  // O domínio próprio dos formulários vence a base do app: é para lá que
  // anúncio, embed e `event_source_url` da Meta apontam — o host do admin
  // nem responde a página quando ele existe. A origem é a pinada em
  // `NEXT_PUBLIC_FORMS_ORIGIN` ou, sem ela, a derivada do host atual pela
  // convenção `forms.<apex>` (no browser, o host da aba; no servidor, o de
  // `NEXT_PUBLIC_APP_URL`). Ver `lib/forms/dominio.ts`.
  const base = baseUrl
    ? stripTrailingSlash(baseUrl)
    : (origemVigente(hostAtual()) ?? resolveAppBaseUrl())
  return `${base}/forms/${slug}`
}

/** O host de onde este código roda: a aba no browser, a base do app no servidor. */
function hostAtual(): string | null {
  if (typeof window !== "undefined" && window.location?.host) return window.location.host
  try {
    return new URL(resolveAppBaseUrl()).host
  } catch {
    return null
  }
}
