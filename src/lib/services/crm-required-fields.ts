/**
 * Campos obrigatórios por etapa da pipeline.
 *
 * `pipeline_stages.required_fields` guarda um array de chaves; ao MOVER
 * um negócio para a etapa, a API valida e devolve 422 com a lista do
 * que falta (o board mostra no toast). Puro e testado porque é regra de
 * bloqueio: mensagem errada aqui trava vendedor sem explicação.
 */

export const REQUIRED_FIELD_KEYS = [
  "value",
  "expected_close_date",
  "client",
  "phone",
  "products",
] as const

/**
 * Chave de campo PERSONALIZADO, no formato `custom:<key>` — a key é a
 * de `crm_custom_fields`. Existe porque cobrar "URL da loja" e
 * "Próximo contato" ao entrar numa etapa é regra de operação, não de
 * código: fixá-la num `if` por nome de etapa a tornaria invisível e
 * intocável por quem opera o funil.
 */
export const PREFIXO_CUSTOM = "custom:"

export type CustomFieldKey = `${typeof PREFIXO_CUSTOM}${string}`
export type RequiredFieldKey = (typeof REQUIRED_FIELD_KEYS)[number] | CustomFieldKey

export function ehCampoPersonalizado(k: string): k is CustomFieldKey {
  return k.startsWith(PREFIXO_CUSTOM) && k.length > PREFIXO_CUSTOM.length
}

/** A key dentro de `custom_fields`, sem o prefixo. */
export function keyDoCampoPersonalizado(k: CustomFieldKey): string {
  return k.slice(PREFIXO_CUSTOM.length)
}

export const REQUIRED_FIELD_LABELS: Record<
  (typeof REQUIRED_FIELD_KEYS)[number],
  string
> = {
  value: "Valor do negócio",
  expected_close_date: "Data prevista de fechamento",
  client: "Cliente vinculado",
  phone: "Telefone de contato",
  products: "Ao menos um produto",
}

export interface DealRequirementSnapshot {
  value: number | null
  expected_close_date: string | null
  client_id: string | null
  /** Telefone efetivo: client.phone ?? lead.phone ?? custom_fields.contact_phone */
  phone: string | null
  products_count: number
  /** Campos personalizados do negócio, pra cobrar `custom:<key>`. */
  custom_fields?: Record<string, unknown> | null
}

/**
 * Normaliza o JSONB do banco para chaves conhecidas (ignora lixo).
 * `custom:<key>` passa sem validar a existência do campo — quem valida
 * é o editor; aqui, recusar silenciosamente uma chave cadastrada faria
 * a etapa parar de cobrar sem nada avisar.
 */
export function parseRequiredFields(raw: unknown): RequiredFieldKey[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((k) => String(k))
    .filter(
      (k): k is RequiredFieldKey =>
        (REQUIRED_FIELD_KEYS as readonly string[]).includes(k) ||
        ehCampoPersonalizado(k),
    )
}

/**
 * Um valor de `custom_fields` conta como preenchido? Vazio, só espaço e
 * array vazio NÃO contam — o select do campo grava "" quando o operador
 * abre e fecha sem escolher, e aceitar isso deixaria a etapa passar com
 * o campo em branco.
 */
export function valorPreenchido(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "number") return Number.isFinite(v)
  if (typeof v === "boolean") return true
  if (typeof v === "object") return Object.keys(v as object).length > 0
  return true
}

/** Chaves que o negócio ainda NÃO cumpre. */
export function missingRequiredFields(
  required: RequiredFieldKey[],
  deal: DealRequirementSnapshot,
): RequiredFieldKey[] {
  return required.filter((key) => {
    if (ehCampoPersonalizado(key)) {
      const k = keyDoCampoPersonalizado(key)
      return !valorPreenchido((deal.custom_fields ?? {})[k])
    }
    switch (key) {
      case "value":
        return !(Number(deal.value) > 0)
      case "expected_close_date":
        return !deal.expected_close_date
      case "client":
        return !deal.client_id
      case "phone":
        return !deal.phone?.trim()
      case "products":
        return deal.products_count <= 0
      default:
        return false
    }
  })
}

/**
 * Rótulo legível de uma chave. Campo personalizado usa o label de
 * `crm_custom_fields`; sem ele, a key crua — melhor mostrar
 * `maturidade_loja` do que "undefined" na cara do vendedor.
 */
export function requiredFieldLabel(
  key: RequiredFieldKey,
  customLabels?: Record<string, string>,
): string {
  if (ehCampoPersonalizado(key)) {
    const k = keyDoCampoPersonalizado(key)
    return customLabels?.[k] ?? k
  }
  return REQUIRED_FIELD_LABELS[key]
}

/** Mensagem de bloqueio pronta pro toast. */
export function requiredFieldsMessage(
  stageName: string,
  missing: RequiredFieldKey[],
  customLabels?: Record<string, string>,
): string {
  const labels = missing.map((k) => requiredFieldLabel(k, customLabels))
  return `Para mover para "${stageName}", preencha: ${labels.join(", ")}.`
}
