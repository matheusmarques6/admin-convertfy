// Tracking Module Types

export interface TrackingStore {
  id: string
  client_store_id: string
  org_id: string | null
  shop_domain: string
  shop_name: string | null
  shopify_access_token: string | null
  webhook_secret: string | null
  seventeen_track_api_key: string | null
  is_active: boolean
  widget_config: Record<string, unknown> | null
  last_sync_at: string | null
  created_at: string
  updated_at: string
}

export interface TrackingOrder {
  id: string
  tracking_store_id: string
  org_id: string | null
  shopify_order_id: string
  shopify_order_number: string | null
  order_name: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  financial_status: string | null
  fulfillment_status: string | null
  total_price: number | null
  currency: string
  order_created_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}

export type TrackingStatus =
  | "pending"
  | "info_received"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_attempt"
  | "exception"
  | "expired"

export interface TrackingEvent {
  date: string
  status: TrackingStatus
  description: string
  location: string | null
}

export interface TrackingCode {
  id: string
  tracking_order_id: string
  tracking_store_id: string
  org_id: string | null
  tracking_number: string
  carrier_code: string | null
  carrier_name: string | null
  status: TrackingStatus
  status_detail: string | null
  last_event: string | null
  last_event_at: string | null
  estimated_delivery: string | null
  tracking_events: TrackingEvent[]
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface TrackingLookup {
  id: string
  tracking_store_id: string | null
  tracking_number: string | null
  order_number: string | null
  customer_email: string | null
  ip_address: string | null
  user_agent: string | null
  found: boolean
  source: string
  created_at: string
}

export interface TrackingOrderWithCodes extends TrackingOrder {
  tracking_codes: TrackingCode[]
  store?: Pick<TrackingStore, "shop_domain" | "shop_name">
}

export interface TrackingStats {
  totalOrders: number
  inTransit: number
  delivered: number
  pending: number
  deliveryRate: number
}

export interface WidgetConfig {
  primaryColor: string
  position: "bottom-right" | "bottom-left" | "inline"
  language: "pt-BR" | "en" | "de" | "it" | "es"
}

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  pending: "Pendente",
  info_received: "Informação Recebida",
  in_transit: "Em Trânsito",
  out_for_delivery: "Saiu para Entrega",
  delivered: "Entregue",
  failed_attempt: "Tentativa Falha",
  exception: "Exceção",
  expired: "Expirado",
}

export const TRACKING_STATUS_COLORS: Record<TrackingStatus, string> = {
  pending: "text-slate-400",
  info_received: "text-blue-400",
  in_transit: "text-amber-400",
  out_for_delivery: "text-purple-400",
  delivered: "text-emerald-400",
  failed_attempt: "text-red-400",
  exception: "text-red-500",
  expired: "text-slate-500",
}
