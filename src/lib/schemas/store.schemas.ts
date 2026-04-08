import { z } from "zod"

export const storeLinkSchema = z.object({
  client_id: z.string().uuid().nullable(),
})

export const storeQuickCreateSchema = z.object({
  store_name: z.string().min(1, "Nome da loja é obrigatório"),
  platform: z.enum(["shopify", "vtex", "woocommerce", "nuvemshop", "other"]),
  store_url: z.string().url("URL inválida").or(z.literal("")),
  client_id: z.string().uuid().nullable(),
})
