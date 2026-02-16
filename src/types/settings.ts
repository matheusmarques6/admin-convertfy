// Tag Types
export interface Tag {
  id: string
  name: string
  color: string
  entity_type: "client" | "deal"
  created_at: string
}

// Email Template Types
export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  variables: string[]
  created_by: string
  created_at: string
  updated_at: string
}

// Settings Types
export interface Settings {
  id: string
  key: string
  value: unknown
  updated_at: string
}
