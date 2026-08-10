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
 * A segunda metade do módulo é a MEDIDA: toda op que um formatador emite
 * é conferida contra as tags do contrato. O `allowedTags` do applyOps já
 * REJEITA op fora da alçada; o que não existia era o número — sem ele não
 * dá para saber se um agente está fora do trilho, só que uma op foi
 * descartada. É o mesmo raciocínio do `contrato.taxa_pct` que o callback
 * de copy passou a gravar.
 *
 * Puro (zero I/O) — testável.
 */

import { lookupTag } from "@/lib/email-workspace/tag-registry"

/** Campo do contrato como o formatador o vê. */
export interface ContractField {
  label: string
  tipo: string
  natureza: string
  max_caracteres: number | null
  placeholder_no_html: string | null
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
  tag?: string | null
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
      const tag = texto(f?.tag)
      campos[key] = {
        label: texto(f?.label) ?? key,
        tipo: texto(f?.type) ?? "text_short",
        natureza: natureza(f),
        max_caracteres:
          typeof f?.max_len === "number" && f.max_len > 0 ? f.max_len : null,
        placeholder_no_html: tag ? `{{${tag}}}` : null,
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

/** Tags canônicas cobertas pelo contrato dos blocos (para a medida). */
export function contractTags(
  rows: ReadonlyArray<ContractBlockRow> | null | undefined,
): Set<string> {
  const tags = new Set<string>()
  for (const row of Array.isArray(rows) ? rows : []) {
    const fields = Array.isArray(row.fields) ? (row.fields as RawField[]) : []
    for (const f of fields) {
      const tag = texto(f?.tag)
      if (tag) tags.add(tag)
    }
  }
  return tags
}

/**
 * Tag que a PLATAFORMA preenche, não o contrato: logo, preheader, ano,
 * unsubscribe, `*_URL`, `*_ALT`. Um formatador tocá-las é legítimo, então
 * elas ficam fora do numerador e do denominador da taxa — contá-las como
 * desvio faria todo run parecer fora do contrato.
 */
export function isPlatformTag(tag: string): boolean {
  const kind = lookupTag(tag)?.kind
  return kind === "data" || kind === "url"
}

export interface OpsContractReport {
  /** Ops emitidas pelo agente. */
  total: number
  /** Ops ancoradas em tag (replace/recolor não têm — ficam fora). */
  com_tag: number
  /** Ops cuja tag está no contrato de algum bloco. */
  no_contrato: number
  /** Ops em tag de plataforma (LOGO, PREHEADER, *_URL, *_ALT). */
  plataforma: number
  /** Percentual sobre no_contrato + fora. `null` quando não há o que medir. */
  taxa_pct: number | null
  /** Amostra do que ficou fora — é isto que se investiga. */
  fora: Array<{ action: string; tag: string; block_id: string | null }>
}

interface MeasurableOp {
  action: string
  tag?: string
  block_id?: string | null
}

/** Confere as ops de um estágio contra as tags do contrato. Pura. */
export function measureOpsAgainstContract(
  opsInput: ReadonlyArray<MeasurableOp> | null | undefined,
  tags: ReadonlySet<string>,
  foraSampleMax = 20,
): OpsContractReport {
  const ops = Array.isArray(opsInput) ? opsInput : []
  let comTag = 0
  let noContrato = 0
  let plataforma = 0
  const fora: OpsContractReport["fora"] = []

  for (const op of ops) {
    const tag = texto(op?.tag)
    if (!tag) continue
    comTag++
    if (tags.has(tag)) {
      noContrato++
    } else if (isPlatformTag(tag)) {
      plataforma++
    } else {
      if (fora.length < foraSampleMax) {
        fora.push({
          action: op.action,
          tag,
          block_id: op.block_id ?? null,
        })
      }
    }
  }

  const foraTotal = comTag - noContrato - plataforma
  const denominador = noContrato + foraTotal
  return {
    total: ops.length,
    com_tag: comTag,
    no_contrato: noContrato,
    plataforma,
    taxa_pct:
      denominador > 0 ? Math.round((noContrato / denominador) * 100) : null,
    fora,
  }
}
