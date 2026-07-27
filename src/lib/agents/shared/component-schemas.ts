/**
 * Schemas zod compartilhados da biblioteca de componentes (rotas /api/admin/components*).
 * Separado de component-dimensions.ts para não puxar zod pro bundle client.
 */
import { z } from "zod"
import {
  FIELD_NATURES,
  FIELD_TYPES,
  normalizeOutputKey,
} from "./component-dimensions"

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
  // Natureza do valor final (épico Taguedor). Ausente → derivação por tipo
  // (image → imagem_gerada; resto → copy) via deriveFieldNature.
  nature: z.enum(FIELD_NATURES).optional(),
  max_len: z.number().int().min(0).default(0),
  required: z.boolean().default(false),
  example: z.string().default(""),
  guidance: z.string().default(""),
  // Config extra do campo type="image" (todos opcionais).
  image_spec: z.string().nullable().optional(),
  image_aspect: z.string().nullable().optional(),
  image_width: z.number().int().min(0).nullable().optional(),
  image_height: z.number().int().min(0).nullable().optional(),
})
