// Financial Types
export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled" | "refunded"

export interface Invoice {
  id: string
  client_id: string
  asaas_id?: string
  amount: number
  due_date: string
  payment_date?: string
  status: PaymentStatus
  description?: string
  created_at: string
  source?: "asaas" | "local"
  payment_method?: string
  actual_payment_method?: string
  subscription_id?: string
  notes?: string
}
