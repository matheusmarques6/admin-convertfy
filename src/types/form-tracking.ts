/**
 * Tipos da config de rastreamento (pixels de conversao) de um formulario.
 *
 * Vive no JSONB `crm_forms.tracking_config` (parte nao-secreta). O token
 * da CAPI fica cifrado em `crm_forms.meta_capi_token`, fora daqui.
 *
 * Compartilhado entre a rota admin, a rota publica, o submit, o serviço
 * de dispatch e a UI do editor de formularios.
 */

/** Operadores do rule builder do evento "Lead qualificado". */
export type QualifiedOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_set"

export const QUALIFIED_OPERATORS: Array<{ value: QualifiedOperator; label: string }> = [
  { value: "equals", label: "é igual a" },
  { value: "not_equals", label: "é diferente de" },
  { value: "in", label: "está entre" },
  { value: "not_in", label: "não está entre" },
  { value: "contains", label: "contém" },
  { value: "gt", label: "maior que" },
  { value: "gte", label: "maior ou igual a" },
  { value: "lt", label: "menor que" },
  { value: "lte", label: "menor ou igual a" },
  { value: "is_set", label: "está preenchido" },
]

/** Uma condição do evento qualificado. `field_id` = crm_form_fields.id. */
export interface QualifiedRule {
  field_id: string
  /**
   * Label do campo no momento em que a regra foi montada. Backup estável
   * para resolver o campo quando o `field_id` não bate (ex.: histórico de
   * ids regenerados). Avaliação tenta id primeiro, depois label.
   */
  field_label?: string
  operator: QualifiedOperator
  /** Valor de comparação. Array para `in`/`not_in`; ignorado em `is_set`. */
  value?: string | string[] | number | null
}

export interface QualifiedLeadConfig {
  enabled: boolean
  event_name: string
  logic: "and" | "or"
  rules: QualifiedRule[]
}

/**
 * Advanced matching do pixel de browser — o objeto passado em
 * `fbq('init', pixelId, {...})`.
 *
 * Valores em TEXTO PURO, ja normalizados como o Meta espera (email/nome
 * em lowercase, telefone so digitos com DDI). Quem hasheia (SHA-256) e o
 * proprio fbevents.js dentro do navegador — por isso nao mandamos hash
 * daqui. Sao dados que o visitante acabou de digitar no proprio form, e
 * so trafegam de volta pro browser dele.
 *
 * Espelha o `user_data` que a CAPI envia server-side (ver
 * `buildMetaUserData` em `@/lib/integrations/meta-capi`), pra que os dois
 * lados do mesmo `event_id` cheguem ao Meta com o mesmo matching.
 */
export interface MetaAdvancedMatching {
  /** Email normalizado (trim + lowercase). */
  em?: string
  /** Telefone E.164 sem '+' (so digitos, com codigo de pais). */
  ph?: string
  /** Primeiro nome (trim + lowercase). */
  fn?: string
  /** Sobrenome (trim + lowercase). */
  ln?: string
  /** Id estavel do lead (crm_leads.id). */
  external_id?: string
}

export interface FormTrackingConfig {
  meta: { enabled: boolean; browser_pixel: boolean }
  google: { enabled: boolean }
  qualified_lead: QualifiedLeadConfig
}

export const DEFAULT_TRACKING_CONFIG: FormTrackingConfig = {
  meta: { enabled: false, browser_pixel: true },
  google: { enabled: false },
  qualified_lead: {
    enabled: false,
    event_name: "Lead qualificado",
    logic: "and",
    rules: [],
  },
}

/**
 * Coage o JSONB cru do banco (que pode ser `{}` ou parcial) para um
 * `FormTrackingConfig` completo, preenchendo defaults. Nunca lança.
 */
export function normalizeTrackingConfig(raw: unknown): FormTrackingConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const meta = (src.meta && typeof src.meta === "object" ? src.meta : {}) as Record<string, unknown>
  const google = (src.google && typeof src.google === "object" ? src.google : {}) as Record<string, unknown>
  const ql = (src.qualified_lead && typeof src.qualified_lead === "object"
    ? src.qualified_lead
    : {}) as Record<string, unknown>

  const rules = Array.isArray(ql.rules)
    ? (ql.rules as unknown[]).filter(
        (r): r is QualifiedRule =>
          !!r && typeof r === "object" && typeof (r as QualifiedRule).field_id === "string",
      )
    : []

  return {
    meta: {
      enabled: Boolean(meta.enabled),
      browser_pixel: meta.browser_pixel === undefined ? true : Boolean(meta.browser_pixel),
    },
    google: {
      enabled: Boolean(google.enabled),
    },
    qualified_lead: {
      enabled: Boolean(ql.enabled),
      event_name:
        typeof ql.event_name === "string" && ql.event_name.trim()
          ? ql.event_name
          : "Lead qualificado",
      logic: ql.logic === "or" ? "or" : "and",
      rules,
    },
  }
}
