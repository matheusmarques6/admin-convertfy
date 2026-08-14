/**
 * Duplicar campo e copiar schema entre variantes.
 *
 * O cadastro de schema é repetitivo por natureza: uma grade de 9 produtos são
 * 18 campos que só diferem no número, e metade das variantes sem schema tem a
 * mesma forma de outra que já está pronta (`BODY_TITLE`/`BODY_TEXT`/
 * `BODY_CTA_LABEL` aparece em quatro). Digitar tudo de novo, campo a campo, é
 * onde o cadastro trava — e onde nascem os erros de digitação que viram campo
 * sem âncora.
 *
 * Puro — sem I/O, client-safe.
 */

import { sanitizeOutputKeyInput } from "@/lib/agents/shared/component-dimensions"
import type { ComponentOutputField } from "@/types/email-generation"

/**
 * Próxima key livre a partir de uma existente.
 *
 * Incrementa o ÚLTIMO número da key, que é o mais específico:
 * `product_1_thumb_2` → `product_1_thumb_3` (mais uma miniatura), não
 * `product_2_thumb_2`. Para trocar o índice do produto, o curador edita — é
 * um caractere. Key sem número nenhum ganha `_2` no fim.
 *
 * Continua incrementando enquanto a key estiver ocupada, para duplicar duas
 * vezes seguidas não gerar colisão silenciosa (duas keys iguais viram o mesmo
 * `{{PLACEHOLDER}}` e a copy de uma sobrescreve a da outra).
 */
export function nextIndexedKey(key: string, taken: Iterable<string>): string {
  const usadas = new Set(Array.from(taken, (k) => k.trim().toLowerCase()))
  const base = (key ?? "").trim().toLowerCase()
  if (!base) return "novo_campo"

  // Último grupo de dígitos da key, com o que vem antes e depois.
  const m = /^(.*?)(\d+)(\D*)$/.exec(base)
  const proximo = (n: number) =>
    m ? `${m[1]}${n}${m[3]}` : `${base}_${n}`

  let n = m ? Number(m[2]) + 1 : 2
  // Teto defensivo: sem ele uma lista corrompida travaria a UI.
  for (let i = 0; i < 500; i++, n++) {
    const cand = proximo(n)
    if (!usadas.has(cand)) return cand
  }
  return `${base}_copia`
}

/**
 * Cópia do campo com key nova e livre.
 *
 * Tudo o mais é preservado — tipo, limite, natureza, briefing e medidas de
 * imagem. O `example` também: numa grade de produtos ele serve de modelo, e
 * apagá-lo tiraria justamente a referência que o curador ia ajustar. O rótulo
 * acompanha a key quando termina em número.
 */
export function duplicateField(
  field: ComponentOutputField,
  taken: Iterable<string>,
): ComponentOutputField {
  const key = nextIndexedKey(field.key ?? "", taken)
  const label = bumpLabel(field.label ?? "", field.key ?? "", key)
  return { ...field, key, label }
}

/**
 * Rótulo segue a key: "Produto 1" vira "Produto 2" quando a key foi de
 * `product_1_*` para `product_2_*`. Sem número no rótulo, ganha o sufixo da
 * key nova — melhor que dois campos chamados igual na lista.
 */
function bumpLabel(label: string, fromKey: string, toKey: string): string {
  const de = /(\d+)\D*$/.exec(fromKey)?.[1]
  const para = /(\d+)\D*$/.exec(toKey)?.[1]
  if (!de || !para || de === para) return label
  return /\d/.test(label) ? label.replace(de, para) : `${label} ${para}`
}

export interface MergeResult {
  schema: ComponentOutputField[]
  /** Keys que entraram. */
  added: string[]
  /** Keys que já existiam no destino e foram ignoradas. */
  skipped: string[]
}

/**
 * Traz os campos de outra variante, sem sobrescrever o que já está aqui.
 *
 * Ignorar a key repetida (em vez de substituir) é deliberado: o campo do
 * destino pode já estar ancorado no HTML, e trocá-lo pelo da origem
 * derrubaria a âncora sem avisar. O que é do destino, fica.
 *
 * Campos da origem sem key são descartados — não têm endereço.
 */
export function mergeSchemas(
  current: ReadonlyArray<ComponentOutputField>,
  incoming: ReadonlyArray<ComponentOutputField>,
): MergeResult {
  const schema = [...(current ?? [])]
  const usadas = new Set(
    schema.map((f) => (f.key ?? "").trim().toLowerCase()).filter(Boolean),
  )
  const added: string[] = []
  const skipped: string[] = []

  for (const f of incoming ?? []) {
    const key = sanitizeOutputKeyInput((f.key ?? "").trim())
    if (!key) continue
    if (usadas.has(key)) {
      skipped.push(key)
      continue
    }
    usadas.add(key)
    added.push(key)
    schema.push({ ...f, key })
  }

  return { schema, added, skipped }
}
