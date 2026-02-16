// User Types
export type UserRole = "admin" | "manager" | "sdr" | "closer" | "cs" | "financial"

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  role: UserRole
  created_at: string
  updated_at: string
}
