import { z } from "zod"

export const generateRequestSchema = z.object({
  name: z.string().min(1, "Nome da campanha e obrigatorio").max(255, "Nome da campanha muito longo"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),
  reference_doc_url: z.string().url().nullable().optional(),
  store_ids: z.array(z.string().uuid()).min(1, "Selecione pelo menos uma loja"),
  generation_id: z.string().uuid().nullable().optional(),
})

export const webhookCallbackSchema = z.object({
  generation_id: z.string().uuid("generation_id deve ser um UUID valido"),
  drive_folder_id: z.string().optional(),
  drive_folder_url: z.string().url().optional(),
  stores: z.array(z.object({
    store_id: z.string().uuid(),
    status: z.enum(["done", "error"]),
    error_message: z.string().optional(),
  })),
})

export type GenerateRequest = z.infer<typeof generateRequestSchema>
export type WebhookCallbackPayload = z.infer<typeof webhookCallbackSchema>
