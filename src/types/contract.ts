// Contract Types
export type ContractStatus = "active" | "expired" | "cancelled" | "pending"

export interface Contract {
  id: string
  client_id: string
  plan_name: string
  monthly_value: number
  start_date: string
  end_date?: string
  status: ContractStatus
  notes?: string
  document_url?: string
  created_at: string
  updated_at: string
}
