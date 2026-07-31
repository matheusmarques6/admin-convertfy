/**
 * Atribuição Meta Ads ↔ CRM por NOME de entidade.
 *
 * O padrão de UTM da casa carrega os nomes das entidades da Meta na
 * própria URL do anúncio:
 *
 *   utm_source=meta-ads
 *   utm_medium={{adset.name}}
 *   utm_campaign={{campaign.name}}
 *   utm_content={{ad.name}} - {{placement}}
 *
 * Então o gasto sincronizado (crm_ad_insights) e os leads/deals do CRM
 * casam por nome, sem precisar de click-id nem redirect próprio. Como
 * nome é digitado por humano e passa por URL-encoding, toda comparação
 * é normalizada: minúsculas, "+" vira espaço, espaços colapsados,
 * acentos removidos.
 *
 * O utm_content vem com o placement concatenado ("Criativo X - facebook_
 * feed"), por isso o match do anúncio é por PREFIXO do nome, não igualdade.
 */

/** Minúsculas, sem acento, "+"→espaço, espaços colapsados. */
export function normalizeAdName(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Separador entre nome do anúncio e placement no utm_content. */
const CONTENT_SEPARATOR = " - "

/**
 * Extrai o nome do anúncio de um utm_content no formato
 * "{{ad.name}} - {{placement}}". Sem separador, o valor inteiro é o nome.
 */
export function adNameFromUtmContent(utmContent: unknown): string {
  const normalized = normalizeAdName(utmContent)
  if (!normalized) return ""
  const idx = normalized.lastIndexOf(CONTENT_SEPARATOR)
  return idx > 0 ? normalized.slice(0, idx).trim() : normalized
}

/** Placement (o que vem depois do último " - "), quando presente. */
export function placementFromUtmContent(utmContent: unknown): string {
  const normalized = normalizeAdName(utmContent)
  const idx = normalized.lastIndexOf(CONTENT_SEPARATOR)
  return idx > 0 ? normalized.slice(idx + CONTENT_SEPARATOR.length).trim() : ""
}

export interface UtmShape {
  source?: unknown
  medium?: unknown
  campaign?: unknown
  content?: unknown
}

/** Chaves normalizadas de atribuição de um lead/deal. */
export interface AttributionKeys {
  source: string
  campaign: string
  adset: string
  ad: string
  placement: string
}

export function attributionKeysFromUtm(utm: UtmShape | null | undefined): AttributionKeys {
  return {
    source: normalizeAdName(utm?.source),
    campaign: normalizeAdName(utm?.campaign),
    adset: normalizeAdName(utm?.medium),
    ad: adNameFromUtmContent(utm?.content),
    placement: placementFromUtmContent(utm?.content),
  }
}

/** True se a UTM veio de tráfego Meta (aceita variações de grafia). */
export function isMetaSource(source: unknown): boolean {
  const s = normalizeAdName(source).replace(/[\s_]/g, "-")
  return s === "meta-ads" || s === "meta" || s === "facebook" || s === "facebook-ads" || s === "fb-ads"
}

/**
 * Chave de agrupamento por criativo. Usa o nome do anúncio quando
 * existe (é o que o time reconhece); cai pro adset e depois pra
 * campanha quando o anúncio não foi identificado.
 */
export function creativeKey(keys: AttributionKeys): string {
  return keys.ad || keys.adset || keys.campaign || ""
}
