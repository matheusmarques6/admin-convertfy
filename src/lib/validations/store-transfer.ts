import { z } from "zod"

export const transferStoreSchema = z.object({
  targetClientId: z.string().uuid("ID do cliente destino inválido"),
  reason: z.string().max(500, "Motivo deve ter no máximo 500 caracteres").optional(),
})

export type TransferStoreInput = z.infer<typeof transferStoreSchema>
