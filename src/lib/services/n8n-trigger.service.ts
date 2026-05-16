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

  private async sendWebhook(type: string, payload: Record<string, unknown>): Promise<TriggerResult> {
    if (!this.baseUrl) {
      log.warn("N8N_ONBOARDING_WEBHOOK_URL not configured, skipping trigger")
      return { success: false, error: "N8N_ONBOARDING_WEBHOOK_URL not configured" }
    }

    try {
      // Timeout de 15s para não estourar o limite do Vercel (60s).
      // O resultado real vem via callback_url, não precisamos esperar N8N processar tudo.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-N8N-API-Key": this.apiKey } : {}),
        },
        body: JSON.stringify({ type, ...payload }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const text = await response.text().catch(() => "Unknown error")
        log.error(`N8N webhook failed: ${response.status}`, { type, status: response.status, body: text })
        return { success: false, error: `N8N responded with ${response.status}` }
      }

      log.info(`N8N webhook triggered successfully`, { type })
      return { success: true }
    } catch (error) {
      // Se abortou por timeout, o trigger já foi enviado — N8N vai processar e chamar callback
      if (error instanceof Error && error.name === "AbortError") {
        log.info(`N8N webhook timed out but trigger was sent, relying on callback`, { type })
        return { success: true }
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      log.error(`N8N webhook error: ${message}`, { type })
      return { success: false, error: message }
    }
  }

  /**
   * Trigger copy generation in N8N after COO approval
   */
  async triggerCopyGeneration(params: {
    onboarding_id: string
    client: {
      name: string
      email: string
      phone?: string | null
      cpf_cnpj?: string | null
      company?: string | null
    }
    store: {
      name: string
      url: string
      platform: string
      niche?: string | null
      country?: string | null
      language?: string | null
      target_audience?: string | null
      free_shipping_type?: string | null
      shopify_collaborator_code?: string | null
    }
    form_data?: {
      price_sensitivity?: string | null
      additional_notes?: string | null
      logo_url?: string | null
      design_direction_text?: string | null
      design_direction_file_url?: string | null
      brand_manual_url?: string | null
    } | null
    callback_url: string
  }): Promise<TriggerResult> {
    log.info(`Triggering copy generation for onboarding ${params.onboarding_id}`)

    return this.sendWebhook("copy-generation", {
      onboarding_id: params.onboarding_id,
      client: params.client,
      store: params.store,
      form_data: params.form_data,
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
    // AC 37.2.2/37.2.3: Campos adicionais (opcionais para backward-compat)
    action_type?: string
    store_name?: string
    rejection_comments?: string
    resubmit_url?: string
    subject?: string
  }): Promise<TriggerResult> {
    log.info(`Triggering client notification for phase: ${params.phase}`, { email: params.email })

    return this.sendWebhook("client-notification", {
      email: params.email,
      client_name: params.client_name,
      phase: params.phase,
      phase_label: params.phase_label,
      message: params.message,
      portal_url: params.portal_url,
      ...(params.action_type && { action_type: params.action_type }),
      ...(params.store_name && { store_name: params.store_name }),
      ...(params.rejection_comments && { rejection_comments: params.rejection_comments }),
      ...(params.resubmit_url && { resubmit_url: params.resubmit_url }),
      ...(params.subject && { subject: params.subject }),
    })
  }

  /**
   * Trigger briefing generation in N8N
   */
  async triggerBriefingGeneration(params: {
    onboarding_id: string
    store: {
      name: string
      url: string
      platform: string
      niche?: string | null
      country?: string | null
      language?: string | null
      target_audience?: string | null
      free_shipping_type?: string | null
      shopify_collaborator_code?: string | null
    }
    form_data?: {
      price_sensitivity?: string | null
      additional_notes?: string | null
      logo_url?: string | null
      design_direction_text?: string | null
      design_direction_file_url?: string | null
      brand_manual_url?: string | null
    } | null
    callback_url: string
  }): Promise<TriggerResult> {
    log.info(`Triggering briefing generation for onboarding ${params.onboarding_id}`)

    return this.sendWebhook("briefing-generation", {
      onboarding_id: params.onboarding_id,
      store: params.store,
      form_data: params.form_data,
      callback_url: params.callback_url,
      callback_secret: process.env.ONBOARDING_WEBHOOK_SECRET,
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

    return this.sendWebhook("welcome-email", {
      email: params.email,
      name: params.name,
      temp_password: params.temp_password,
      login_url: params.login_url,
    })
  }

  /**
   * Trigger o workflow "Analisador de ADS" no n8n quando uma loja é criada.
   * URL configurável via N8N_ADS_ANALYZER_WEBHOOK_URL. Os 7 callbacks
   * (snapshot, icp, tone, ads-review, products, competitors,
   * briefing-markdown) são chamados pelo próprio workflow.
   */
  async triggerAdsAnalyzer(params: {
    store_id: string
    client_id: string
    store_name: string
    store_url: string | null
    platform: string | null
  }): Promise<TriggerResult> {
    const url = process.env.N8N_ADS_ANALYZER_WEBHOOK_URL
    if (!url) {
      log.warn("N8N_ADS_ANALYZER_WEBHOOK_URL not configured, skipping ads analyzer trigger")
      return { success: false, error: "N8N_ADS_ANALYZER_WEBHOOK_URL not configured" }
    }

    log.info(`Triggering ads analyzer for store ${params.store_id}`)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: params.store_id,
          client_id: params.client_id,
          store: {
            id: params.store_id,
            name: params.store_name,
            url: params.store_url,
            platform: params.platform,
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const text = await response.text().catch(() => "Unknown error")
        log.error(`Ads analyzer webhook failed: ${response.status}`, { status: response.status, body: text })
        return { success: false, error: `N8N responded with ${response.status}` }
      }

      log.info(`Ads analyzer webhook triggered successfully`, { store_id: params.store_id })
      return { success: true }
    } catch (error) {
      // Timeout aceito como sucesso (n8n já recebeu o trigger e processa async)
      if (error instanceof Error && error.name === "AbortError") {
        log.info(`Ads analyzer webhook timed out but trigger was sent`, { store_id: params.store_id })
        return { success: true }
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      log.error(`Ads analyzer webhook error: ${message}`)
      return { success: false, error: message }
    }
  }
}

export const n8nTriggerService = new N8nTriggerService()
