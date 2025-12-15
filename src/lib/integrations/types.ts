import { IntegrationType } from "@/types"

export interface IntegrationConfig {
  type: IntegrationType
  name: string
  description: string
  icon: string
  color: string
  requiredCredentials: CredentialField[]
  optionalCredentials?: CredentialField[]
  features: string[]
  docsUrl?: string
  oauthUrl?: string
}

export interface CredentialField {
  key: string
  label: string
  type: "text" | "password" | "url" | "select"
  placeholder?: string
  helpText?: string
  options?: { value: string; label: string }[]
  required?: boolean
}

export interface IntegrationStatus {
  connected: boolean
  lastSync?: Date
  error?: string
  data?: Record<string, unknown>
}

export interface WebhookPayload {
  event: string
  data: Record<string, unknown>
  timestamp: string
  signature?: string
}

// Asaas Types
export interface AsaasCustomer {
  id: string
  name: string
  email?: string  // Optional - Asaas requires email OR phone
  cpfCnpj: string
  phone?: string
  mobilePhone?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
  postalCode?: string
  externalReference?: string
  notificationDisabled?: boolean
  additionalEmails?: string
}

export interface AsaasPayment {
  id: string
  customer: string
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
  value: number
  dueDate: string
  description?: string
  externalReference?: string
  status: AsaasPaymentStatus
  paymentDate?: string
  clientPaymentDate?: string
  invoiceUrl?: string
  bankSlipUrl?: string
  pixTransaction?: {
    qrCode: string
    payload: string
    expirationDate: string
  }
}

export type AsaasPaymentStatus =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "RECEIVED_IN_CASH"
  | "REFUND_REQUESTED"
  | "REFUND_IN_PROGRESS"
  | "CHARGEBACK_REQUESTED"
  | "CHARGEBACK_DISPUTE"
  | "AWAITING_CHARGEBACK_REVERSAL"
  | "DUNNING_REQUESTED"
  | "DUNNING_RECEIVED"
  | "AWAITING_RISK_ANALYSIS"

// Meta Ads Types
export interface MetaAdAccount {
  id: string
  account_id: string
  name: string
  currency: string
  timezone_name: string
  account_status: number
}

export interface MetaCampaign {
  id: string
  name: string
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED"
  objective: string
  daily_budget?: number
  lifetime_budget?: number
  insights?: MetaInsights
}

export interface MetaInsights {
  impressions: number
  reach: number
  clicks: number
  spend: number
  cpm: number
  cpc: number
  ctr: number
  conversions?: number
  cost_per_conversion?: number
  roas?: number
  date_start: string
  date_stop: string
}

// Google Ads Types
export interface GoogleAdsAccount {
  customer_id: string
  descriptive_name: string
  currency_code: string
  time_zone: string
  manager: boolean
}

export interface GoogleAdsCampaign {
  id: string
  name: string
  status: "ENABLED" | "PAUSED" | "REMOVED"
  advertising_channel_type: string
  budget_amount_micros: number
  metrics?: GoogleAdsMetrics
}

export interface GoogleAdsMetrics {
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
  conversions_value: number
  average_cpc: number
  ctr: number
  date: string
}

// Klaviyo Types
export interface KlaviyoProfile {
  id: string
  email: string
  phone_number?: string
  first_name?: string
  last_name?: string
  properties?: Record<string, unknown>
  created: string
  updated: string
}

export interface KlaviyoList {
  id: string
  name: string
  created: string
  updated: string
  profile_count: number
}

export interface KlaviyoMetrics {
  id: string
  name: string
  created: string
  integration?: {
    id: string
    name: string
  }
}

export interface KlaviyoFlowMetrics {
  flow_id: string
  flow_name: string
  recipient_count: number
  open_count: number
  click_count: number
  conversion_count: number
  revenue: number
}

// Shopify Types
export interface ShopifyShop {
  id: number
  name: string
  email: string
  domain: string
  myshopify_domain: string
  currency: string
  money_format: string
  timezone: string
  plan_name: string
}

export interface ShopifyOrder {
  id: number
  order_number: number
  email: string
  created_at: string
  updated_at: string
  total_price: string
  subtotal_price: string
  total_tax: string
  currency: string
  financial_status: "pending" | "authorized" | "paid" | "partially_paid" | "refunded" | "voided"
  fulfillment_status: "fulfilled" | "partial" | null
  customer: ShopifyCustomer
  line_items: ShopifyLineItem[]
}

export interface ShopifyCustomer {
  id: number
  email: string
  first_name: string
  last_name: string
  phone?: string
  orders_count: number
  total_spent: string
  created_at: string
}

export interface ShopifyLineItem {
  id: number
  product_id: number
  variant_id: number
  title: string
  quantity: number
  price: string
  sku?: string
}

export interface ShopifyProduct {
  id: number
  title: string
  body_html: string
  vendor: string
  product_type: string
  handle: string
  status: "active" | "archived" | "draft"
  variants: ShopifyVariant[]
  images: ShopifyImage[]
}

export interface ShopifyVariant {
  id: number
  product_id: number
  title: string
  price: string
  sku?: string
  inventory_quantity: number
}

export interface ShopifyImage {
  id: number
  product_id: number
  src: string
  alt?: string
}

// WhatsApp Types
export interface WhatsAppMessage {
  messaging_product: "whatsapp"
  recipient_type: "individual"
  to: string
  type: "text" | "template" | "image" | "document" | "audio" | "video"
  text?: { body: string }
  template?: WhatsAppTemplate
}

export interface WhatsAppTemplate {
  name: string
  language: { code: string }
  components?: WhatsAppTemplateComponent[]
}

export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button"
  parameters?: Array<{
    type: "text" | "currency" | "date_time" | "image" | "document"
    text?: string
    image?: { link: string }
  }>
}

export interface WhatsAppWebhookEntry {
  id: string
  changes: Array<{
    value: {
      messaging_product: string
      metadata: {
        display_phone_number: string
        phone_number_id: string
      }
      contacts?: Array<{
        profile: { name: string }
        wa_id: string
      }>
      messages?: Array<{
        from: string
        id: string
        timestamp: string
        type: string
        text?: { body: string }
      }>
      statuses?: Array<{
        id: string
        recipient_id: string
        status: "sent" | "delivered" | "read"
        timestamp: string
      }>
    }
    field: string
  }>
}

// Google Calendar Types
export interface GoogleCalendarEvent {
  id?: string
  summary: string
  description?: string
  location?: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted"
  }>
  conferenceData?: {
    createRequest?: {
      requestId: string
      conferenceSolutionKey: { type: "hangoutsMeet" }
    }
    entryPoints?: Array<{
      entryPointType: "video" | "phone"
      uri: string
      label?: string
    }>
  }
  reminders?: {
    useDefault: boolean
    overrides?: Array<{
      method: "email" | "popup"
      minutes: number
    }>
  }
}

export interface GoogleCalendarList {
  id: string
  summary: string
  description?: string
  timeZone: string
  accessRole: "freeBusyReader" | "reader" | "writer" | "owner"
  primary?: boolean
}

// Wise Types
export interface WiseBalance {
  id: number
  currency: string
  amount: {
    value: number
    currency: string
  }
  reservedAmount: {
    value: number
    currency: string
  }
  bankDetails?: {
    accountHolderName: string
    bankIdentifier?: string
    accountNumber?: string
    iban?: string
    swift?: string
    routingNumber?: string
  }
}

export interface WiseTransaction {
  type: string
  date: string
  amount: {
    value: number
    currency: string
  }
  totalFees: {
    value: number
    currency: string
  }
  details: {
    type: string
    description: string
    senderName?: string
    senderAccount?: string
    paymentReference?: string
    recipient?: {
      name: string
      bankAccount?: string
    }
  }
  exchangeDetails?: {
    toAmount: {
      value: number
      currency: string
    }
    fromAmount: {
      value: number
      currency: string
    }
    rate: number
  }
  runningBalance: {
    value: number
    currency: string
  }
  referenceNumber: string
}

export interface WiseStatementResponse {
  accountHolder: {
    type: string
    firstName?: string
    lastName?: string
    businessName?: string
  }
  issuer: {
    name: string
    firstLine: string
    city: string
    postCode: string
    stateCode?: string
    country: string
  }
  bankDetails?: WiseBalance["bankDetails"]
  transactions: WiseTransaction[]
  startOfStatementBalance: {
    value: number
    currency: string
  }
  endOfStatementBalance: {
    value: number
    currency: string
  }
  query: {
    intervalStart: string
    intervalEnd: string
    currency: string
    accountId: number
  }
}

export interface WiseProfile {
  id: number
  type: "personal" | "business"
  details: {
    firstName?: string
    lastName?: string
    name?: string
    companyName?: string
    companyType?: string
  }
}
