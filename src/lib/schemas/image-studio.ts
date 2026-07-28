/**
 * Schemas Zod do Estúdio de Imagens (/api/admin/image-studio/*).
 * Compartilhados entre as rotas de criar/editar lote.
 */

import { z } from "zod"
import {
  MAX_STORE_SPEC_CHARS,
  MAX_VARIATIONS,
} from "@/lib/services/image-studio.service"

const textFieldSchema = z
  .object({ include: z.boolean(), value: z.string().max(500).optional() })
  .strict()

export const imageStudioBatchBodySchema = z
  .object({
    name: z.string().max(120).optional(),
    format: z
      .enum(["hero", "square", "story", "portrait", "landscape", "banner", "vertical"])
      .optional(),
    instruction: z.string().max(4000).optional(),
    reference_image_url: z.string().url().nullable().optional(),
    adapt_flags: z
      .object({
        idioma: z.boolean().optional(),
        cores: z.boolean().optional(),
        logo: z.boolean().optional(),
        catalogo: z.boolean().optional(),
      })
      .strict()
      .optional(),
    text_context: z
      .object({
        nicho: textFieldSchema.optional(),
        publico: textFieldSchema.optional(),
        tom: textFieldSchema.optional(),
        moeda: textFieldSchema.optional(),
        headline: textFieldSchema.optional(),
      })
      .strict()
      .optional(),
    store_ids: z.array(z.string().uuid()).max(500).optional(),
    // Adendos por loja: { <store_id>: { instruction } }. O service
    // normaliza (apara, corta no teto, descarta vazios).
    store_specs: z
      .record(
        z.string().uuid(),
        z
          .object({ instruction: z.string().max(MAX_STORE_SPEC_CHARS).optional() })
          .strict(),
      )
      .optional(),
    variations: z
      .array(
        z
          .object({
            label: z.string().max(60).optional(),
            direction: z.string().max(1000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_VARIATIONS)
      .optional(),
  })
  .strict()
