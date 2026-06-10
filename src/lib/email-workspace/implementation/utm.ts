/**
 * UTM determinístico por flow + e-mail, para o handoff de implementação.
 *
 * DISPLAY-ONLY e DERIVADO (`flow_type` + número do e-mail). A Convertfy ainda
 * não modela UTM por flow no schema (`utm_templates` existe mas sem FK pra
 * `email_flows`), então o handoff gera um padrão consistente que o time cola
 * nos links dentro do ESP. Função pura — testável.
 */

import type { FlowType } from "@/types/email-workspace"

/** Slug estável de cada flow para `utm_campaign`. */
export const FLOW_UTM_SLUG: Record<FlowType, string> = {
  welcome: "welcome-flow",
  site_abandoned: "site-abandoned",
  abandoned_cart: "abandoned-cart",
  browse_abandonment: "browse-abandoned",
  upsell: "upsell",
  win_back: "winback",
  shipping_stages: "shipping-stages",
  post_purchase: "post-purchase",
  custom: "custom-flow",
}

/** Defaults de UTM (editáveis em Configurações). */
export const UTM_SOURCE_DEFAULT = "email"
export const UTM_MEDIUM_DEFAULT = "automation"

export interface EmailUtm {
  source: string
  medium: string
  campaign: string
  content: string
  /** Querystring pronta (sem `?`), ex: `utm_source=email&...`. */
  query: string
}

/**
 * Gera os parâmetros UTM de um e-mail específico de um flow.
 * `utm_content` usa o número do e-mail com 2 dígitos (email-01, email-02…).
 * `overrides` permite usar valores configurados (source/medium/campaign).
 */
export function emailUtm(
  flowType: FlowType,
  emailNumber: number,
  overrides?: { source?: string; medium?: string; campaign?: string },
): EmailUtm {
  const source = overrides?.source?.trim() || UTM_SOURCE_DEFAULT
  const medium = overrides?.medium?.trim() || UTM_MEDIUM_DEFAULT
  const campaign =
    overrides?.campaign?.trim() || FLOW_UTM_SLUG[flowType] || FLOW_UTM_SLUG.custom
  const content = `email-${String(emailNumber).padStart(2, "0")}`
  const query = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content,
  }).toString()
  return { source, medium, campaign, content, query }
}

/**
 * Aplica os UTMs a uma URL de destino. Se a URL for inválida/vazia, retorna a
 * própria querystring prefixada com `?` (útil pra exibir o padrão sem destino).
 */
export function applyUtm(
  url: string | null | undefined,
  utm: EmailUtm,
): string {
  const trimmed = (url ?? "").trim()
  if (!trimmed) return `?${utm.query}`
  try {
    const u = new URL(trimmed)
    u.searchParams.set("utm_source", utm.source)
    u.searchParams.set("utm_medium", utm.medium)
    u.searchParams.set("utm_campaign", utm.campaign)
    u.searchParams.set("utm_content", utm.content)
    return u.toString()
  } catch {
    const sep = trimmed.includes("?") ? "&" : "?"
    return `${trimmed}${sep}${utm.query}`
  }
}
