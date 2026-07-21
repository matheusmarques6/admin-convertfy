/**
 * Coerência entre o output_schema de uma variante e as {{TAGS}} do seu HTML.
 *
 * O contrato v2 do payload de copy resolve a tag de cada campo por copyKey
 * OU pelo nome normalizado ({{COUPON_CODE}} ↔ key "coupon_code"). Campos sem
 * tag correspondente geram copy SEM slot no template (o n8n devolve o valor,
 * mas o HTML não tem onde renderizar); tags de copy sem campo no schema
 * ficam dependentes do fallback tag-registry.
 *
 * Usado como WARNING não-bloqueante no editor de variantes (a biblioteca tem
 * variantes legadas — endurecer depois) e como telemetria no builder.
 * Puro — testável.
 */

import { lookupTag, normalizeTagName } from "./tag-registry"
import type { ComponentOutputField } from "@/types/email-generation"

// Mesmo formato de placeholder do reference-structure (MAIÚSCULAS; tolera
// espaços internos).
const TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

export interface SchemaTagCoherence {
  /** Campos do schema (não-imagem) sem {{TAG}} correspondente no HTML. */
  keysWithoutTag: string[]
  /** Tags de copy do HTML sem campo correspondente no schema. */
  copyTagsWithoutKey: string[]
}

export function validateSchemaTagCoherence(
  html: string,
  schema: ComponentOutputField[],
): SchemaTagCoherence {
  const tags: string[] = []
  const seen = new Set<string>()
  for (const m of (html ?? "").matchAll(TAG_PATTERN)) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      tags.push(m[1])
    }
  }

  const tagMatchesKey = (t: string, key: string): boolean =>
    lookupTag(t)?.copyKey === key ||
    normalizeTagName(t).toLowerCase() === key.toLowerCase()

  const keysWithoutTag = schema
    .filter((f) => f.type !== "image" && f.key.trim())
    .filter((f) => !tags.some((t) => tagMatchesKey(t, f.key.trim())))
    .map((f) => f.key.trim())

  const copyTagsWithoutKey = tags
    .filter((t) => lookupTag(t)?.kind === "copy")
    .filter(
      (t) => !schema.some((f) => f.key.trim() && tagMatchesKey(t, f.key.trim())),
    )

  return { keysWithoutTag, copyTagsWithoutKey }
}
