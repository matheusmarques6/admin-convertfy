import { Resend } from "resend"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/server"
import { EmailConfigError, EmailRateLimitError, EmailDeliveryError } from "@/lib/api/errors"
import {
  welcomeWithPasswordTemplate,
  passwordResetTemplate,
  testEmailTemplate,
} from "./templates"

export { EmailConfigError, EmailRateLimitError, EmailDeliveryError }

const log = logger.child("EmailService")

// --- Types ---

interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
}

interface SendResult {
  id: string
  success: true
}

// --- Service ---

class EmailService {
  private resend: Resend | null = null

  private getResend(): Resend {
    if (!this.resend) {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) {
        throw new EmailConfigError("RESEND_API_KEY não configurada")
      }
      this.resend = new Resend(apiKey)
    }
    return this.resend
  }

  private getFromAddress(): string {
    const email = process.env.RESEND_FROM_EMAIL || "noreply@convertfy.com"
    const name = process.env.RESEND_FROM_NAME || "Convertfy"
    return `${name} <${email}>`
  }

  async send(params: SendEmailParams, retries = 3): Promise<SendResult> {
    const resend = this.getResend()
    const from = params.from || this.getFromAddress()

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await resend.emails.send({
          from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          ...(params.replyTo ? { replyTo: params.replyTo } : {}),
        })

        if (error) {
          if (error.message?.toLowerCase().includes("rate limit")) {
            throw new EmailRateLimitError()
          }
          throw new EmailDeliveryError(error.message || "Erro desconhecido do Resend")
        }

        if (!data?.id) {
          throw new EmailDeliveryError("Resend não retornou ID do email")
        }

        log.info(`Email enviado com sucesso`, {
          to: params.to,
          subject: params.subject,
          resendId: data.id,
          attempt,
        })

        // Log to database (fire-and-forget)
        this.logToDatabase({
          to_email: params.to,
          subject: params.subject,
          template_type: this.extractTemplateType(params.subject),
          resend_id: data.id,
          status: "sent",
        }).catch((err) => log.warn("Falha ao salvar log de email", { error: (err as Error).message }))

        return { id: data.id, success: true }
      } catch (err) {
        lastError = err as Error

        // Don't retry config errors or rate limits
        if (err instanceof EmailConfigError || err instanceof EmailRateLimitError) {
          throw err
        }

        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
          log.warn(`Tentativa ${attempt}/${retries} falhou, retrying em ${delay}ms`, {
            error: (err as Error).message,
          })
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    // Log failure
    this.logToDatabase({
      to_email: params.to,
      subject: params.subject,
      template_type: this.extractTemplateType(params.subject),
      resend_id: null,
      status: "failed",
      error_message: lastError?.message || "Todas tentativas falharam",
    }).catch(() => {})

    throw new EmailDeliveryError(
      `Falha após ${retries} tentativas: ${lastError?.message || "erro desconhecido"}`
    )
  }

  async sendWelcomeWithPassword(params: {
    to: string
    name: string
    email: string
    tempPassword: string
    loginUrl?: string
    orgName?: string
  }): Promise<SendResult> {
    const loginUrl = params.loginUrl || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/portal/login`

    return this.send({
      to: params.to,
      subject: `Bem-vindo(a) ao ${params.orgName || "Convertfy"} - Suas credenciais de acesso`,
      html: welcomeWithPasswordTemplate({
        name: params.name,
        email: params.email,
        tempPassword: params.tempPassword,
        loginUrl,
        orgName: params.orgName,
      }),
    })
  }

  async sendPasswordResetNotification(params: {
    to: string
    name: string
    tempPassword: string
    loginUrl?: string
    orgName?: string
  }): Promise<SendResult> {
    const loginUrl = params.loginUrl || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`

    return this.send({
      to: params.to,
      subject: "Sua senha foi redefinida",
      html: passwordResetTemplate({
        name: params.name,
        tempPassword: params.tempPassword,
        loginUrl,
        orgName: params.orgName,
      }),
    })
  }

  async sendTestEmail(to: string): Promise<SendResult> {
    return this.send({
      to,
      subject: "Email de Teste - Convertfy",
      html: testEmailTemplate(),
    })
  }

  isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY
  }

  private extractTemplateType(subject: string): string {
    if (subject.includes("Bem-vindo")) return "welcome"
    if (subject.includes("redefinida")) return "password_reset"
    if (subject.includes("Teste")) return "test"
    if (subject.includes("Convite")) return "invite"
    return "custom"
  }

  private async logToDatabase(data: {
    to_email: string
    subject: string
    template_type: string
    resend_id: string | null
    status: string
    error_message?: string
  }): Promise<void> {
    try {
      const adminClient = createAdminClient()
      await adminClient.from("email_logs").insert({
        to_email: data.to_email,
        subject: data.subject,
        template_type: data.template_type,
        resend_id: data.resend_id,
        status: data.status,
        error_message: data.error_message || null,
      })
    } catch {
      // Silently fail - logging should not break email sending
    }
  }
}

export const emailService = new EmailService()
