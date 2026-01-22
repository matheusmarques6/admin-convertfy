import { WhatsAppMessage, WhatsAppTemplate, WhatsAppWebhookEntry } from "./types"

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"

export interface WhatsAppConfig {
  phoneNumberId: string
  accessToken: string
  businessAccountId?: string
  webhookVerifyToken?: string
}

export class WhatsAppService {
  private phoneNumberId: string
  private accessToken: string
  private businessAccountId?: string
  private webhookVerifyToken?: string

  constructor(config: WhatsAppConfig) {
    this.phoneNumberId = config.phoneNumberId
    this.accessToken = config.accessToken
    this.businessAccountId = config.businessAccountId
    this.webhookVerifyToken = config.webhookVerifyToken
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${WHATSAPP_API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.error?.message || `WhatsApp API error: ${response.status}`
      )
    }

    return response.json()
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getPhoneNumberInfo()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  // Phone number info
  async getPhoneNumberInfo(): Promise<{
    id: string
    display_phone_number: string
    verified_name: string
    quality_rating: string
  }> {
    return this.request(`/${this.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`)
  }

  // Send text message
  async sendTextMessage(to: string, text: string): Promise<{
    messaging_product: string
    contacts: Array<{ wa_id: string }>
    messages: Array<{ id: string }>
  }> {
    const message: WhatsAppMessage = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: this.formatPhoneNumber(to),
      type: "text",
      text: { body: text },
    }

    return this.request(`/${this.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    })
  }

  // Send template message
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = "pt_BR",
    components?: WhatsAppTemplate["components"]
  ): Promise<{
    messaging_product: string
    contacts: Array<{ wa_id: string }>
    messages: Array<{ id: string }>
  }> {
    const message: WhatsAppMessage = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: this.formatPhoneNumber(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }

    return this.request(`/${this.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    })
  }

  // Send image message
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<{
    messaging_product: string
    contacts: Array<{ wa_id: string }>
    messages: Array<{ id: string }>
  }> {
    return this.request(`/${this.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: this.formatPhoneNumber(to),
        type: "image",
        image: {
          link: imageUrl,
          caption,
        },
      }),
    })
  }

  // Send document message
  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string
  ): Promise<{
    messaging_product: string
    contacts: Array<{ wa_id: string }>
    messages: Array<{ id: string }>
  }> {
    return this.request(`/${this.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: this.formatPhoneNumber(to),
        type: "document",
        document: {
          link: documentUrl,
          filename,
          caption,
        },
      }),
    })
  }

  // Mark message as read
  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    return this.request(`/${this.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    })
  }

  // Get message templates
  async getTemplates(): Promise<{
    data: Array<{
      id: string
      name: string
      status: "APPROVED" | "PENDING" | "REJECTED"
      category: string
      language: string
      components: Array<{
        type: string
        text?: string
        format?: string
      }>
    }>
  }> {
    if (!this.businessAccountId) {
      throw new Error("Business Account ID is required to list templates")
    }

    return this.request(`/${this.businessAccountId}/message_templates`)
  }

  // Webhook verification
  verifyWebhook(
    mode: string,
    token: string,
    challenge: string
  ): string | null {
    if (mode === "subscribe" && token === this.webhookVerifyToken) {
      return challenge
    }
    return null
  }

  // Parse webhook payload
  static parseWebhook(body: { object: string; entry: WhatsAppWebhookEntry[] }): {
    messages: Array<{
      from: string
      id: string
      timestamp: string
      type: string
      text?: string
    }>
    statuses: Array<{
      id: string
      recipientId: string
      status: "sent" | "delivered" | "read"
      timestamp: string
    }>
  } {
    const messages: Array<{
      from: string
      id: string
      timestamp: string
      type: string
      text?: string
    }> = []
    const statuses: Array<{
      id: string
      recipientId: string
      status: "sent" | "delivered" | "read"
      timestamp: string
    }> = []

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.value.messages) {
          for (const msg of change.value.messages) {
            messages.push({
              from: msg.from,
              id: msg.id,
              timestamp: msg.timestamp,
              type: msg.type,
              text: msg.text?.body,
            })
          }
        }

        if (change.value.statuses) {
          for (const status of change.value.statuses) {
            statuses.push({
              id: status.id,
              recipientId: status.recipient_id,
              status: status.status,
              timestamp: status.timestamp,
            })
          }
        }
      }
    }

    return { messages, statuses }
  }

  // Helper to format phone number
  private formatPhoneNumber(phone: string): string {
    // Remove non-numeric characters
    let cleaned = phone.replace(/\D/g, "")

    // Add Brazil country code if not present
    if (!cleaned.startsWith("55") && cleaned.length <= 11) {
      cleaned = "55" + cleaned
    }

    return cleaned
  }
}

// Factory function
export function createWhatsAppService(
  credentials: Record<string, string>
): WhatsAppService {
  if (!credentials.phone_number_id) {
    throw new Error("Phone Number ID is required")
  }
  if (!credentials.access_token) {
    throw new Error("Access Token is required")
  }

  return new WhatsAppService({
    phoneNumberId: credentials.phone_number_id,
    accessToken: credentials.access_token,
    businessAccountId: credentials.business_account_id,
    webhookVerifyToken: credentials.webhook_verify_token,
  })
}
