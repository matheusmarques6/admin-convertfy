/**
 * Schemas zod compartilhados da biblioteca de componentes (rotas /api/admin/components*).
 * Separado de component-dimensions.ts para não puxar zod pro bundle client.
 */
import { z } from "zod"
import { FIELD_TYPES, normalizeOutputKey } from "./component-dimensions"

/** Um campo do output_schema de uma variante. */
export const outputFieldSchema = z.object({
  // Canoniza antes de validar: "HEADLINE"/"CTA Text" viram
  // "headline"/"cta_text" em vez de estourar a validação. Só barra quando
  // não sobra nenhuma letra utilizável (ex.: "123" ou "---").
  key: z.preprocess(
    (v) => (typeof v === "string" ? normalizeOutputKey(v) : v),
    z
      .string()
      .min(1, "chave técnica vazia após normalização")
      .regex(/^[a-z][a-z0-9_]*$/, "chave técnica: minúsculas/underscore"),
  ),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  max_len: z.number().int().min(0).default(0),
  required: z.boolean().default(false),
  example: z.string().default(""),
  guidance: z.string().default(""),
})
