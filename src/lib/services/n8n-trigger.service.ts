import { logger } from "@/lib/logger"

const log = logger.child("N8nTrigger")

interface TriggerResult {
  success: boolean
  error?: string
}

export class N8nTriggerService {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = process.env.N8N_ONBOARDING_WEBHOOK_URL || ""
    this.apiKey = process.env.N8N_ONBOARDING_API_KEY || ""
  }

  private async sendWebhook(path: string, payload: Record<string, unknown>): Promise<TriggerResult> {
    if (!this.baseUrl) {
      log.warn("N8N_ONBOARDING_WEBHOOK_URL not configured, skipping trigger")
      return { success: false, error: "N8N_ONBOARDING_WEBHOOK_URL not configured" }
    }

    const url = `${this.baseUrl}${path}`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-N8N-API-Key": this.apiKey } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => "Unknown error")
        log.error(`N8N webhook failed: ${response.status}`, { url, status: response.status, body: text })
        return { success: false, error: `N8N responded with ${response.status}` }
      }

      log.info(`N8N webhook triggered successfully`, { path })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      log.error(`N8N webhook error: ${message}`, { path })
      return { success: false, error: message }
    }
  }

  /**
   * Trigger copy generation in N8N after COO approval
   */
  async triggerCopyGeneration(params: {
    onboarding_id: string
    client_name: string
    store_name: string
    store_url: string
    platform: string
    niche?: string | null
    target_audience?: string | null
    price_sensitivity?: string | null
    briefing_data?: Record<string, unknown>
    callback_url: string
  }): Promise<TriggerResult> {
    log.info(`Triggering copy generation for onboarding ${params.onboarding_id}`)

    return this.sendWebhook("/copy-generation", {
      onboarding_id: params.onboarding_id,
      client_name: params.client_name,
      store: {
        name: params.store_name,
        url: params.store_url,
        platform: params.platform,
        niche: params.niche,
        target_audience: params.target_audience,
        price_sensitivity: params.price_sensitivity,
      },
      briefing_data: params.briefing_data,
      callback_url: params.callback_url,
      callback_secret: process.env.ONBOARDING_WEBHOOK_SECRET,
    })
  }

  /**
   * Trigger client notification email via N8N
   */
  async triggerClientNotification(params: {
    email: string
    client_name: string
    phase: string
    phase_label: string
    message: string
    portal_url: string
  }): Promise<TriggerResult> {
    log.info(`Triggering client notification for phase: ${params.phase}`, { email: params.email })

    return this.sendWebhook("/client-notification", {
      email: params.email,
      client_name: params.client_name,
      phase: params.phase,
      phase_label: params.phase_label,
      message: params.message,
      portal_url: params.portal_url,
    })
  }

  /**
   * Trigger welcome email with portal credentials
   */
  async triggerWelcomeEmail(params: {
    email: string
    name: string
    temp_password?: string
    login_url: string
  }): Promise<TriggerResult> {
    log.info(`Triggering welcome email`, { email: params.email })

    return this.sendWebhook("/welcome-email", {
      email: params.email,
      name: params.name,
      temp_password: params.temp_password,
      login_url: params.login_url,
    })
  }
}

export const n8nTriggerService = new N8nTriggerService()
