import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { renderErrorEmailTemplate } from "./templates/error-email.template"
import { renderSuccessEmailTemplate } from "./templates/success-email.template"

const log = logger.child("GenerationNotify")

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export async function notifyGenerationError(params: {
  runId: string
  storeId: string
  storeName: string
  emailName: string
  agent: string
  model: string
  error: string
  durationMs: number
  costCents: number
}): Promise<void> {
  try {
    const admin = createAdminClient()

    const logUrl = `${APP_URL}/admin/tools/email-generation-logs?run=${params.runId}`

    // 1. In-app notification via notifyByRole
    try {
      const { data: users } = await admin
        .from("profiles")
        .select("id")
        .in("role", ["admin", "manager"])

      if (users && users.length > 0) {
        const notifications = users.map((u) => ({
          user_id: u.id as string,
          title: `Erro na geracao: ${params.storeName} / ${params.emailName}`,
          body: `Agente ${params.agent} falhou: ${params.error.slice(0, 200)}`,
          type: "error" as const,
          link: `/admin/tools/email-generation-logs?run=${params.runId}`,
          metadata: {
            source: "email-generation",
            storeId: params.storeId,
            agent: params.agent,
          },
        }))

        await admin.from("notifications").insert(notifications)
      }
    } catch (err) {
      log.warn("notify.in_app.error", { error: (err as Error).message })
    }

    // 2. Email notification
    try {
      const { data: settings } = await admin
        .from("email_generation_settings")
        .select("notify_on_error, notify_emails")
        .limit(1)
        .maybeSingle()

      const notifyOnError = (settings?.notify_on_error as boolean) ?? false
      const notifyEmails = (settings?.notify_emails as string[]) ?? []

      if (notifyOnError && notifyEmails.length > 0) {
        const { emailService } = await import("@/lib/email/email.service")

        const html = renderErrorEmailTemplate({
          storeName: params.storeName,
          emailName: params.emailName,
          agent: params.agent,
          model: params.model,
          error: params.error,
          durationMs: params.durationMs,
          costCents: params.costCents,
          logUrl,
        })

        for (const to of notifyEmails) {
          try {
            await emailService.send({
              to,
              subject: `[Erro] Geracao de email falhou: ${params.storeName} / ${params.emailName}`,
              html,
            })
          } catch (sendErr) {
            log.warn("notify.email.send_failed", { to, error: (sendErr as Error).message })
          }
        }
      }
    } catch (err) {
      log.warn("notify.email.error", { error: (err as Error).message })
    }
  } catch (err) {
    log.warn("notify.generation_error.fatal", { error: (err as Error).message })
  }
}

export async function notifyGenerationBatchComplete(params: {
  batchId: string
  storeId: string
  storeName: string
  flowName: string
  flowId: string
  emailsGenerated: number
  emailsTotal: number
  totalDurationMs: number
  totalCostCents: number
}): Promise<void> {
  try {
    const admin = createAdminClient()

    const allSuccess = params.emailsGenerated === params.emailsTotal
    const workspaceUrl = `${APP_URL}/admin/stores/${params.storeId}/producao?flow=${params.flowId}`

    // 1. In-app notification
    try {
      const { data: users } = await admin
        .from("profiles")
        .select("id")
        .in("role", ["admin", "manager"])

      if (users && users.length > 0) {
        const title = allSuccess
          ? `Geracao concluida: ${params.storeName} / ${params.flowName}`
          : `Geracao parcial: ${params.storeName} / ${params.flowName} (${params.emailsGenerated}/${params.emailsTotal})`

        const notifications = users.map((u) => ({
          user_id: u.id as string,
          title,
          body: `${params.emailsGenerated} de ${params.emailsTotal} emails gerados em ${(params.totalDurationMs / 1000).toFixed(1)}s`,
          type: (allSuccess ? "success" : "warning") as "success" | "warning",
          link: workspaceUrl,
          metadata: {
            source: "email-generation",
            storeId: params.storeId,
            batchId: params.batchId,
          },
        }))

        await admin.from("notifications").insert(notifications)
      }
    } catch (err) {
      log.warn("notify.batch.in_app.error", { error: (err as Error).message })
    }

    // 2. Email notification
    try {
      const { data: settings } = await admin
        .from("email_generation_settings")
        .select("notify_on_success, notify_emails")
        .limit(1)
        .maybeSingle()

      const notifyOnSuccess = (settings?.notify_on_success as boolean) ?? false
      const notifyEmails = (settings?.notify_emails as string[]) ?? []

      if (notifyOnSuccess && notifyEmails.length > 0) {
        const { emailService } = await import("@/lib/email/email.service")

        const html = renderSuccessEmailTemplate({
          storeName: params.storeName,
          flowName: params.flowName,
          emailsGenerated: params.emailsGenerated,
          emailsTotal: params.emailsTotal,
          totalDurationMs: params.totalDurationMs,
          totalCostCents: params.totalCostCents,
          workspaceUrl,
        })

        const subject = allSuccess
          ? `Geracao concluida: ${params.storeName} / ${params.flowName}`
          : `Geracao parcial: ${params.storeName} / ${params.flowName} (${params.emailsGenerated}/${params.emailsTotal})`

        for (const to of notifyEmails) {
          try {
            await emailService.send({ to, subject, html })
          } catch (sendErr) {
            log.warn("notify.batch.email.send_failed", { to, error: (sendErr as Error).message })
          }
        }
      }
    } catch (err) {
      log.warn("notify.batch.email.error", { error: (err as Error).message })
    }
  } catch (err) {
    log.warn("notify.batch_complete.fatal", { error: (err as Error).message })
  }
}
