// Integration Types
export type IntegrationType =
  | "asaas"
  | "meta_ads"
  | "google_ads"
  | "klaviyo"
  | "shopify"
  | "instagram"
  | "whatsapp"
  | "google_calendar"
  | "wise"

export interface Integration {
  id: string
  type: IntegrationType
  name: string
  is_active: boolean
  credentials: Record<string, string>
  last_sync?: string
  created_at: string
  updated_at: string
}

// Custom Field Types
export type CustomFieldType = "text" | "number" | "date" | "select" | "multiselect" | "boolean" | "url" | "email"

export interface CustomField {
  id: string
  name: string
  key: string
  type: CustomFieldType
  entity_type: "client" | "deal" | "contract"
  options?: string[] // For select/multiselect
  is_required: boolean
  order: number
  created_at: string
}
