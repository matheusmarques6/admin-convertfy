// Client Types
export type ClientStatus = "active" | "inactive" | "churned" | "prospect" | "onboarding"

export interface Client {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  website?: string
  cpf_cnpj?: string
  asaas_customer_id?: string
  address?: {
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    postal_code?: string
    city?: string
    state?: string
  }
  status: ClientStatus
  health_score: number
  tags: string[]
  custom_fields: Record<string, unknown>
  owner_id?: string
  created_at: string
  updated_at: string
}

export interface ClientStore {
  id: string
  client_id: string
  platform: "shopify" | "nuvemshop" | "woocommerce" | "other"
  store_name: string
  store_url: string
  api_key?: string
  api_secret?: string
  access_token?: string
  is_active: boolean
  created_at: string
}
