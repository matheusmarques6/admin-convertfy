/**
 * Retagueamento MECÂNICO — as regras 1–3 do Taguedor, sem modelo.
 *
 * O endereço de um campo é `{{MAIÚSCULA_DA_KEY}}`, e só existem dois jeitos
 * de chegar nele:
 *
 *   1. o HTML já tem uma tag no papel do campo  → renomeia para a key
 *   2. o HTML tem a FRASE do `example`          → troca a frase pelo placeholder
 *
 * Os dois são determinísticos. O LLM só é necessário para o que exige
 * JULGAMENTO — decidir que `PRODUCT_1_IMAGE` serve `product_1_collage_image`,
 * ou inserir elemento que a arte não tem. Aqui não se inventa nada: campo sem
 * tag e sem a frase sai como `sem_lugar`.
 *
 * Usa as MESMAS funções do painel Schema × HTML, então o resultado dos dois
 * é o mesmo por construção.
 *
 * Puro — sem I/O. O script `scripts/retag-mecanico.ts` é quem lê e grava.
 */

import {
  anchorByExample,
  auditSchemaTags,
  findExampleAnchor,
  renameTagInHtml,
} from "./schema-tag-coherence"
import { placeholderForKey } from "@/lib/agents/shared/component-dimensions"
import type { ComponentOutputField } from "@/types/email-generation"

export interface FieldOutcome {
  key: string
  placeholder: string
  via: "renomeada" | "exemplo" | "ja_ancorada" | "sem_lugar"
  from?: string
}

/**
 * Ancora o que der no HTML de origem.
 *
 * Re-audita a CADA campo: ancorar um campo muda o HTML, e o conjunto de tags
 * livres muda junto. Sem isso, dois campos poderiam reivindicar a mesma tag.
 */
export function retag(html: string, schema: ComponentOutputField[]) {
  let out = html
  const outcomes: FieldOutcome[] = []

  for (const f of schema) {
    const key = f.key?.trim()
    if (!key) continue
    const ph = placeholderForKey(key)
    if (!ph) continue

    const audit = auditSchemaTags(out, schema)
    if (audit.anchored.some((a) => a.key === key)) {
      outcomes.push({ key, placeholder: ph, via: "ja_ancorada" })
      continue
    }
    const m = audit.missing.find((x) => x.key === key)
    if (!m) continue

    if (m.legacyTag) {
      out = renameTagInHtml(out, m.legacyTag, ph)
      outcomes.push({ key, placeholder: ph, via: "renomeada", from: m.legacyTag })
      continue
    }
    // Recalcula a frase contra o HTML corrente: uma troca anterior pode ter
    // criado ou destruído a unicidade da ocorrência.
    const phrase = findExampleAnchor(out, f.example)
    if (phrase) {
      out = anchorByExample(out, phrase, ph)
      outcomes.push({ key, placeholder: ph, via: "exemplo", from: phrase })
      continue
    }
    outcomes.push({ key, placeholder: ph, via: "sem_lugar" })
  }

  return { html: out, outcomes }
}

