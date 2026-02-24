import { z } from "zod"
import { uuidSchema } from "./common"

// --- Store Quick Create (POST /api/client-stores/credentials sem client_id) ---

export const storeQuickCreateSchema = z.object({
  store_name: z.string().min(1, "Nome da loja é obrigatório"),
  platform: z.enum(["shopify", "nuvemshop", "woocommerce", "other"]),
  store_url: z.string().url("URL da loja inválida"),
  client_id: uuidSchema.nullable().optional(),
})

// --- Store Link (PATCH /api/client-stores/[id]/link) ---

export const storeLinkSchema = z.object({
  client_id: uuidSchema.nullable(),
})
