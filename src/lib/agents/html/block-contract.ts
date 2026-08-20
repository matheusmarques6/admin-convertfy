/**
 * O contrato do bloco para os agentes de FORMATAÇÃO (MC-3).
 *
 * Os formatadores (text_format, image_format, color_format, qa) recebiam
 * só recortes do HTML — views, inventário de cores, slots de imagem. Eles
 * sabiam o que estava escrito no documento, e não o que aquele bloco
 * DEVIA conter: quais campos existem, com que limite, de que natureza.
 * Sem isso um agente não tem como saber que `hero_cta_2_label` é um campo
 * legítimo esperando valor, e trata o slot vazio como sujeira a remover —
 * foi assim que o segundo botão do welcome da Luxe Lift desapareceu.
 *
 * Aqui o mesmo desenho do payload do n8n é reaproveitado: um objeto
 * endereçável por key, não um array de propriedades planas. `nature` e
 * `source` do snapshot ficam de fora do que não interessa a quem formata.
 *
 * Puro (zero I/O) — testável.
 */

/** Campo do contrato como o formatador o vê. */
export interface ContractField {
  label: string
  tipo: string
  natureza: string
  max_caracteres: number | null
  /** A frase-âncora do campo no HTML (o example do schema). */
  exemplo_ancora: string | null
}

/** Contrato de um bloco do email. */
export interface BlockContract {
  block_id: string
  position: number
  tipo: string
  label: string | null
  campos: Record<string, ContractField>
}

/** Só o que o builder precisa de uma linha de `email_blocks`. */
export interface ContractBlockRow {
  id: string
  position: number
  block_type: string
  label?: string | null
  fields?: unknown
}

interface RawField {
  key?: string | null
  label?: string | null
  type?: string | null
  nature?: string | null
  max_len?: number | null
  example?: string | null
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/** Mesma derivação do resto do pipeline: image → imagem_gerada, resto copy. */
function natureza(f: RawField): string {
  const n = texto(f.nature)
  if (n === "copy" || n === "imagem_gerada" || n === "asset_fixo") return n
  return f.type === "image" ? "imagem_gerada" : "copy"
}

/**
 * Monta o contrato de cada bloco a partir do snapshot gravado na linha
 * (`email_blocks.fields`). Bloco sem contrato sai da lista: mandar um
 * bloco vazio é convite para o agente inventar o que fazer com ele.
 */
export function buildBlockContracts(
  rows: ReadonlyArray<ContractBlockRow> | null | undefined,
): BlockContract[] {
  const out: BlockContract[] = []
  // Contexto sem blocos carregados não pode derrubar a cadeia inteira: o
  // contrato é informação ADICIONAL para os formatadores, e a ausência
  // dele degrada para o comportamento anterior.
  for (const row of Array.isArray(rows) ? rows : []) {
    const fields = Array.isArray(row.fields) ? (row.fields as RawField[]) : []
    const campos: Record<string, ContractField> = {}
    for (const f of fields) {
      const key = texto(f?.key)
      if (!key || key in campos) continue
      campos[key] = {
        label: texto(f?.label) ?? key,
        tipo: texto(f?.type) ?? "text_short",
        natureza: natureza(f),
        max_caracteres:
          typeof f?.max_len === "number" && f.max_len > 0 ? f.max_len : null,
        exemplo_ancora: texto(f?.example),
      }
    }
    if (Object.keys(campos).length === 0) continue
    out.push({
      block_id: row.id,
      position: row.position,
      tipo: row.block_type,
      label: texto(row.label),
      campos,
    })
  }
  return out
}
