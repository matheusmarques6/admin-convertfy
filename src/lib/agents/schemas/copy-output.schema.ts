/**
 * Zod schema do output do agente Copy.
 *
 * O LLM deve retornar JSON neste formato. Usado pra validar/parse
 * a resposta antes de persistir nos blocos e no email.
 */

import { z } from "zod"

export const CopyOutputSchema = z.object({
  subject: z.string().max(240),
  preheader: z.string().max(240),
  blocks: z.array(
    z.object({
      position: z.number(),
      content: z.record(z.string(), z.unknown()),
    }),
  ),
})

export type CopyOutput = z.infer<typeof CopyOutputSchema>
