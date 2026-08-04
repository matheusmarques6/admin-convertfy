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

export type RequiredFieldKey = (typeof REQUIRED_FIELD_KEYS)[number]

export const REQUIRED_FIELD_LABELS: Record<RequiredFieldKey, string> = {
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
}

/** Normaliza o JSONB do banco para chaves conhecidas (ignora lixo). */
export function parseRequiredFields(raw: unknown): RequiredFieldKey[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((k): k is RequiredFieldKey =>
    (REQUIRED_FIELD_KEYS as readonly string[]).includes(String(k)),
  )
}

/** Chaves que o negócio ainda NÃO cumpre. */
export function missingRequiredFields(
  required: RequiredFieldKey[],
  deal: DealRequirementSnapshot,
): RequiredFieldKey[] {
  return required.filter((key) => {
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

/** Mensagem de bloqueio pronta pro toast. */
export function requiredFieldsMessage(
  stageName: string,
  missing: RequiredFieldKey[],
): string {
  const labels = missing.map((k) => REQUIRED_FIELD_LABELS[k])
  return `Para mover para "${stageName}", preencha: ${labels.join(", ")}.`
}
