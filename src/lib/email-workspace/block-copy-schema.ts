/**
 * O bloco leva um SCHEMA, não uma lista de campos.
 *
 * Depois da 20261065 o bloco passou a carregar o contrato de copy
 * (`email_blocks.fields`), mas ele viajava até o n8n do jeito que está
 * gravado: um array de 9-11 objetos, cada um com 11 propriedades planas
 * (`key,label,type,nature,max_len,min_len,required,example,guidance,tag,
 * source`), incluindo as que são de uso interno (`nature`, `source`) e as
 * que só existem para imagem. Como INPUT DE AGENTE isso não serve: o
 * contrato de resposta — quais chaves devolver — fica implícito num campo
 * (`key`) perdido no meio de dez outros, e o modelo tem que inferir.
 *
 * Aqui o mesmo dado vira um objeto endereçável:
 *
 *   schema: {
 *     variante, diretriz, total_campos, obrigatorios[],
 *     campos: { <key>: { label, tipo, obrigatorio, max_caracteres, ... } }
 *   }
 *
 * O mapa `campos` É o contrato de resposta: as chaves do objeto são
 * exatamente as chaves que o n8n tem de devolver em `content`. Não há mais
 * `key` dentro do item — ela é a posição dele.
 *
 * `placeholder_no_html` SAIU (20/08): o endereço do campo passou a ser o
 * próprio `exemplo` (merge por example) — não há mais {{TAG}} a informar.
 *
 * Campos internos ficam de fora: `nature` já filtrou o que é copy antes de
 * chegar aqui, `source` é telemetria do blueprint e `image_*` é do agente
 * de imagem. O que o copywriter não usa não entra no prompt dele.
 */

export interface BlockCopySchemaField {
  label: string
  tipo: string
  obrigatorio: boolean
  max_caracteres: number | null
  min_caracteres: number | null
  exemplo: string | null
  orientacao: string | null
}

export interface BlockCopySchema {
  variante: string | null
  diretriz: string | null
  total_campos: number
  obrigatorios: string[]
  campos: Record<string, BlockCopySchemaField>
}

/** Só o que o builder precisa de um BlueprintBlockField/BlueprintFieldV2. */
export interface CopySchemaInputField {
  key?: string | null
  label?: string | null
  type?: string | null
  max_len?: number | null
  min_len?: number | null
  required?: boolean | null
  example?: string | null
  guidance?: string | null
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function numeroPositivo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * Monta o `schema` do bloco a partir dos campos de copy já filtrados.
 *
 * Chave duplicada mantém a PRIMEIRA ocorrência (a ordem do schema da
 * variante é a ordem do HTML; a segunda seria uma sobrescrita silenciosa).
 * Campo sem `key` é descartado — sem chave não há como devolver o valor.
 */
export function buildBlockCopySchema(
  fields: CopySchemaInputField[],
  meta: { variantName?: string | null; purpose?: string | null },
): BlockCopySchema {
  const campos: Record<string, BlockCopySchemaField> = {}
  const obrigatorios: string[] = []

  for (const f of fields) {
    const key = texto(f?.key)
    if (!key || key in campos) continue

    const obrigatorio = f?.required === true
    campos[key] = {
      label: texto(f?.label) ?? key,
      tipo: texto(f?.type) ?? "text_short",
      obrigatorio,
      max_caracteres: numeroPositivo(f?.max_len),
      min_caracteres: numeroPositivo(f?.min_len),
      exemplo: texto(f?.example),
      orientacao: texto(f?.guidance),
    }
    if (obrigatorio) obrigatorios.push(key)
  }

  return {
    variante: texto(meta?.variantName),
    diretriz: texto(meta?.purpose),
    total_campos: Object.keys(campos).length,
    obrigatorios,
    campos,
  }
}
