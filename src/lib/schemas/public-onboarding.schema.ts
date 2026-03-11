import { z } from "zod"

export const publicOnboardingSchema = z.object({
  // Personal data
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email invalido"),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Telefone invalido").optional().nullable(),
  cpf_cnpj: z.string().optional().nullable(),

  // Store data
  store_name: z.string().min(2, "Nome da loja deve ter pelo menos 2 caracteres").max(100),
  store_url: z.string().min(5, "URL da loja e obrigatoria").refine(
    (val) => /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(val.trim()),
    { message: "URL invalida. Ex: minhaloja.com.br ou https://minhaloja.com.br" }
  ),
  platform: z.enum(["shopify", "nuvemshop", "woocommerce", "tray", "vtex", "other"]),
  niche: z.string().optional().nullable(),
  country: z.string().min(1, "Pais e obrigatorio"),
  language: z.string().min(1, "Idioma e obrigatorio"),
  target_audience: z.string().optional().nullable(),
  free_shipping_type: z.enum(["all", "conditional", "none"]).optional().nullable(),
  shopify_collaborator_code: z.string().optional().nullable(),
  price_sensitivity: z.enum(["price", "quality", "balanced"]).optional().nullable(),

  // Design data
  additional_notes: z.string().optional().nullable(),
  logo_url: z.string().optional().nullable(),
  design_direction_text: z.string().optional().nullable(),
  design_direction_file_url: z.string().optional().nullable(),
  brand_manual_url: z.string().optional().nullable(),

  // Honeypot (must be empty)
  website: z.string().max(0, "").optional().default(""),
})

export type PublicOnboardingFormData = z.infer<typeof publicOnboardingSchema>
