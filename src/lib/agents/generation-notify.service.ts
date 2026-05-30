import { createAdminClient } from "@/lib/supabase/server"
import { notificationService } from "@/lib/services/notification.service"
import { logger } from "@/lib/logger"
import { renderErrorEmailTemplate } from "./templates/error-email.template"
import { renderSuccessEmailTemplate } from "./templates/success-email.template"

const log = logger.child("GenerationNotify")

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

// ── Dedup helper (story AE-7.6) ────────────────────────────────────────
// Checa se ja existe uma notification recente com o mesmo dedup_key. O
// dedup_key vive em `notifications.metadata.dedup_key` (JSONB) — usamos
// PostgREST `.contains()` que mapeia para `@>`. Janela de 1h previne
// duplicacao quando o watchdog retenta um caminho de falha.
//
// Retorna `true` se uma notificacao com mesma chave ja foi criada no
// periodo — o caller deve fazer early-return.
async function checkDedupKey(dedupKey: string): Promise<boolean> {
  const admin = createAdminClient()
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from("notifications")
    .select("id")
    .contains("metadata", { dedup_key: dedupKey })
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle()
  if (error) {
    log.warn("notify.dedup.check_failed", { dedupKey, error: error.message })
    return false
  }
  if (data) {
    log.info("notify.skipped_dedup", { dedupKey })
    return true
  }
  return false
}

// ── Resolve admins envolvidos com a loja (story AE-7.3) ────────────────
// Ordem de resolucao:
//   1. profile owner do client (`client_stores.client_id -> clients.owner_id`)
//   2. assignees de deals da loja nos ultimos 30 dias (best-effort)
//   3. fallback: todos profiles com role IN ('admin','owner','cs')
// Retorna lista deduplicada {id, email, name}.
export async function getStoreInvolvedAdmins(
  storeId: string,
): Promise<Array<{ id: string; email: string; name: string | null }>> {
  const admin = createAdminClient()
  const ids = new Set<string>()

  // 1. owner do client da loja
  const { data: storeRow } = await admin
    .from("client_stores")
    .select("client_id")
    .eq("id", storeId)
    .maybeSingle()
  const clientId = (storeRow?.client_id as string | undefined) ?? null
  if (clientId) {
    const { data: clientRow } = await admin
      .from("clients")
      .select("owner_id")
      .eq("id", clientId)
      .maybeSingle()
    const ownerId = (clientRow?.owner_id as string | undefined) ?? null
    if (ownerId) ids.add(ownerId)

    // 2. deal owners ativos nos ultimos 30 dias para este client
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: dealRows } = await admin
      .from("deals")
      .select("owner_id")
      .eq("client_id", clientId)
      .gte("updated_at", since)
    for (const d of (dealRows ?? []) as Array<{ owner_id: string | null }>) {
      if (d.owner_id) ids.add(d.owner_id)
    }
  }

  let userIds = Array.from(ids)

  // 3. fallback: todos admins/owners/cs
  if (userIds.length === 0) {
    const { data: roleRows } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "owner", "cs"])
    userIds = ((roleRows ?? []) as Array<{ id: string }>).map((r) => r.id)
  }

  if (userIds.length === 0) return []

  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, email, name")
    .in("id", userIds)
  return ((profileRows ?? []) as Array<{ id: string; email: string; name: string | null }>)
}

// ── Helper: envia email transacional em batch sem bloquear ─────────────
// `emailService.send` ja faz retry interno (2s, 4s, 8s) por destinatario.
// Aqui paralelizamos com `Promise.allSettled` e logamos falhas — nunca
// throwamos para nao derrubar o caller no pipeline AE.
async function sendTransactionalBatch(params: {
  to: string[]
  subject: string
  html: string
}): Promise<{ sent: number; failed: number }> {
  if (params.to.length === 0) return { sent: 0, failed: 0 }
  const { emailService } = await import("@/lib/email/email.service")
  const results = await Promise.allSettled(
    params.to.map((to) =>
      emailService.send({ to, subject: params.subject, html: params.html }),
    ),
  )
  let sent = 0
  let failed = 0
  for (const r of results) {
    if (r.status === "fulfilled") sent++
    else failed++
  }
  if (failed > 0) {
    log.warn("notify.email.batch_partial", {
      sent,
      failed,
      total: params.to.length,
    })
  }
  return { sent, failed }
}

// ── AE-7.2: notifyEmailFailed ──────────────────────────────────────────
// Dispara para tag CTO + email transacional quando um email termina em
// `failed` no pipeline (qualquer fase: copy timeout, image, html, qa, etc).
// Idempotente via dedup-key — watchdog re-rodando nao gera duplicatas.
export async function notifyEmailFailed(params: {
  storeId: string
  emailId: string
  failureReason: string
  batchId?: string | null
}): Promise<void> {
  try {
    const dedupKey = `email_gen_failed:${params.storeId}:${params.emailId}`
    if (await checkDedupKey(dedupKey)) return

    const admin = createAdminClient()
    // Resolve email + flow + store em uma unica passada
    const { data: emailRow } = await admin
      .from("email_flow_emails")
      .select("name, email_number, flow_id")
      .eq("id", params.emailId)
      .maybeSingle()

    const flowId = (emailRow?.flow_id as string | undefined) ?? null
    const emailName = (emailRow?.name as string | undefined) ?? "Email"
    const emailNumber = (emailRow?.email_number as number | undefined) ?? null

    let flowType = ""
    if (flowId) {
      const { data: flowRow } = await admin
        .from("email_flows")
        .select("flow_type")
        .eq("id", flowId)
        .maybeSingle()
      flowType = (flowRow?.flow_type as string | undefined) ?? ""
    }

    const { data: storeRow } = await admin
      .from("client_stores")
      .select("store_name")
      .eq("id", params.storeId)
      .maybeSingle()
    const storeName = (storeRow?.store_name as string | undefined) ?? "Loja"

    const title = "Falha na geracao de email"
    const numberLabel = emailNumber != null ? `#${emailNumber}` : ""
    const body = `Store ${storeName} - ${flowType || emailName} ${numberLabel} - ${params.failureReason}`
    const link = `/admin/stores/${params.storeId}/emails?email_id=${params.emailId}`

    // 1. In-app via notifyByTag (CTO)
    const count = await notificationService.notifyByTag(["cto"], {
      title,
      body,
      type: "error",
      link,
      event_id: `email-gen-failed-${params.emailId}`,
      metadata: {
        dedup_key: dedupKey,
        source: "email-generation",
        store_id: params.storeId,
        email_id: params.emailId,
        failure_reason: params.failureReason,
        batch_id: params.batchId ?? null,
      },
    })

    // 2. Email transacional para os mesmos profiles taggeados como CTO
    if (count > 0) {
      try {
        const { createAdminClient: getAdmin } = await import(
          "@/lib/supabase/server"
        )
        const adminCli = getAdmin()
        const { data: ctos } = await adminCli
          .from("profiles")
          .select("email")
          .overlaps("tags", ["cto"])
        const toEmails = ((ctos ?? []) as Array<{ email: string | null }>)
          .map((p) => p.email)
          .filter((e): e is string => Boolean(e))

        const html = renderErrorEmailTemplate({
          storeName,
          emailName: `${flowType || emailName} ${numberLabel}`.trim(),
          agent: "pipeline",
          model: "agent-email-generation",
          error: params.failureReason,
          durationMs: 0,
          costCents: 0,
          logUrl: `${APP_URL}${link}`,
        })

        await sendTransactionalBatch({
          to: toEmails,
          subject: `[Convertfy] ${title} - ${storeName}`,
          html,
        })
      } catch (err) {
        log.warn("notify.email_failed.email_send_failed", {
          error: (err as Error).message,
        })
      }
    }

    log.info("notify.fired", {
      event_type: "email_generation_failed",
      recipients_count: count,
      tags: ["cto"],
      email_id: params.emailId,
      store_id: params.storeId,
    })
  } catch (err) {
    log.warn("notify.email_failed.fatal", { error: (err as Error).message })
  }
}

// ── AE-7.2: notifyBatchComplete ────────────────────────────────────────
// Disparado quando todos os emails de um batch atingem status terminal
// (ready ou failed). Resolve admins envolvidos com a loja e envia
// in-app + email. Idempotente via dedup-key.
export async function notifyBatchComplete(params: {
  storeId: string
  batchId: string
}): Promise<void> {
  try {
    const dedupKey = `email_gen_batch_complete:${params.storeId}:${params.batchId}`
    if (await checkDedupKey(dedupKey)) return

    const admin = createAdminClient()
    const { data: emails } = await admin
      .from("email_flow_emails")
      .select("status")
      .eq("generation_batch_id", params.batchId)

    const all = (emails ?? []) as Array<{ status: string }>
    const total = all.length
    const ready = all.filter((e) => e.status === "ready").length
    const failed = all.filter((e) => e.status === "failed").length

    // Se 100% falhou, o caller deve chamar notifyBatchAllFailed em vez
    // disso. Aqui fazemos uma checagem defensiva e degradamos para evento
    // generico (nao silenciamos para evitar perda de sinal).
    if (total > 0 && failed === total) {
      log.info("notify.batch_complete.delegated_to_all_failed", {
        storeId: params.storeId,
        batchId: params.batchId,
      })
    }

    const { data: storeRow } = await admin
      .from("client_stores")
      .select("store_name")
      .eq("id", params.storeId)
      .maybeSingle()
    const storeName = (storeRow?.store_name as string | undefined) ?? "Loja"

    const title = `Batch de emails completo - ${storeName}`
    const body = `${ready} de ${total} emails prontos. ${failed} falharam.`
    const link = `/admin/stores/${params.storeId}/emails`

    const admins = await getStoreInvolvedAdmins(params.storeId)
    if (admins.length === 0) {
      log.warn("notify.batch_complete.no_admins", {
        storeId: params.storeId,
        batchId: params.batchId,
      })
      return
    }

    const userIds = admins.map((a) => a.id)
    const created = await notificationService.createBulkAdmin(userIds, {
      title,
      body,
      type: ready === total ? "success" : "warning",
      link,
      event_id: `email-gen-batch-${params.batchId}`,
      metadata: {
        dedup_key: dedupKey,
        source: "email-generation",
        store_id: params.storeId,
        batch_id: params.batchId,
        total,
        ready,
        failed,
      },
    })

    // Email transacional para admins envolvidos
    try {
      const html = renderSuccessEmailTemplate({
        storeName,
        flowName: "Batch de emails",
        emailsGenerated: ready,
        emailsTotal: total,
        totalDurationMs: 0,
        totalCostCents: 0,
        workspaceUrl: `${APP_URL}${link}`,
      })
      await sendTransactionalBatch({
        to: admins.map((a) => a.email).filter(Boolean),
        subject: `[Convertfy] ${title}`,
        html,
      })
    } catch (err) {
      log.warn("notify.batch_complete.email_send_failed", {
        error: (err as Error).message,
      })
    }

    log.info("notify.fired", {
      event_type: "email_generation_batch_complete",
      recipients_count: created,
      store_id: params.storeId,
      batch_id: params.batchId,
      total,
      ready,
      failed,
    })
  } catch (err) {
    log.warn("notify.batch_complete.fatal", { error: (err as Error).message })
  }
}

// ── AE-7.2: notifyBatchAllFailed ───────────────────────────────────────
// Disparado quando 100% dos emails do batch acabaram em `failed`. Notifica
// tag CTO (nao admins comuns — e um sinal de falha sistemica).
export async function notifyBatchAllFailed(params: {
  storeId: string
  batchId: string
}): Promise<void> {
  try {
    const dedupKey = `email_gen_batch_all_failed:${params.storeId}:${params.batchId}`
    if (await checkDedupKey(dedupKey)) return

    const admin = createAdminClient()
    const { data: storeRow } = await admin
      .from("client_stores")
      .select("store_name")
      .eq("id", params.storeId)
      .maybeSingle()
    const storeName = (storeRow?.store_name as string | undefined) ?? "Loja"

    const { count: failedCount } = await admin
      .from("email_flow_emails")
      .select("id", { count: "exact", head: true })
      .eq("generation_batch_id", params.batchId)
      .eq("status", "failed")

    const title = `Batch totalmente falhou - ${storeName}`
    const body = `Todos os ${failedCount ?? "?"} emails do batch terminaram em failed. Investigar.`
    const link = `/admin/stores/${params.storeId}/emails`

    const count = await notificationService.notifyByTag(["cto"], {
      title,
      body,
      type: "error",
      link,
      event_id: `email-gen-batch-failed-${params.batchId}`,
      metadata: {
        dedup_key: dedupKey,
        source: "email-generation",
        store_id: params.storeId,
        batch_id: params.batchId,
        failed_count: failedCount ?? 0,
      },
    })

    if (count > 0) {
      try {
        const adminCli = createAdminClient()
        const { data: ctos } = await adminCli
          .from("profiles")
          .select("email")
          .overlaps("tags", ["cto"])
        const toEmails = ((ctos ?? []) as Array<{ email: string | null }>)
          .map((p) => p.email)
          .filter((e): e is string => Boolean(e))

        const html = renderErrorEmailTemplate({
          storeName,
          emailName: `Batch ${params.batchId.slice(0, 8)}`,
          agent: "pipeline",
          model: "agent-email-generation",
          error: `Todos os ${failedCount ?? "?"} emails do batch falharam`,
          durationMs: 0,
          costCents: 0,
          logUrl: `${APP_URL}${link}`,
        })
        await sendTransactionalBatch({
          to: toEmails,
          subject: `[Convertfy] ALERTA: ${title}`,
          html,
        })
      } catch (err) {
        log.warn("notify.batch_all_failed.email_send_failed", {
          error: (err as Error).message,
        })
      }
    }

    log.info("notify.fired", {
      event_type: "email_generation_batch_all_failed",
      recipients_count: count,
      tags: ["cto"],
      store_id: params.storeId,
      batch_id: params.batchId,
    })
  } catch (err) {
    log.warn("notify.batch_all_failed.fatal", { error: (err as Error).message })
  }
}

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
    const logUrl = `${APP_URL}/admin/tools/email-generation-logs?run=${params.runId}`

    // 1. In-app notification
    try {
      await notificationService.notifyByRole(["admin", "manager"], {
        title: `Erro na geracao: ${params.storeName} / ${params.emailName}`,
        body: `Agente ${params.agent} falhou: ${params.error.slice(0, 200)}`,
        type: "error",
        link: `/admin/tools/email-generation-logs?run=${params.runId}`,
        event_id: `gen-error-${params.runId}`,
        metadata: {
          source: "email-generation",
          storeId: params.storeId,
          agent: params.agent,
        },
      })
    } catch (err) {
      log.warn("notify.in_app.error", { error: (err as Error).message })
    }

    // 2. Email notification (condicional via settings)
    try {
      const admin = createAdminClient()
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
    const allSuccess = params.emailsGenerated === params.emailsTotal
    const workspaceUrl = `${APP_URL}/admin/stores/${params.storeId}/producao?flow=${params.flowId}`

    // 1. In-app notification
    try {
      const title = allSuccess
        ? `Geracao concluida: ${params.storeName} / ${params.flowName}`
        : `Geracao parcial: ${params.storeName} / ${params.flowName} (${params.emailsGenerated}/${params.emailsTotal})`

      await notificationService.notifyByRole(["admin", "manager"], {
        title,
        body: `${params.emailsGenerated} de ${params.emailsTotal} emails gerados em ${(params.totalDurationMs / 1000).toFixed(1)}s`,
        type: allSuccess ? "success" : "warning",
        link: workspaceUrl,
        event_id: `gen-batch-${params.batchId}`,
        metadata: {
          source: "email-generation",
          storeId: params.storeId,
          batchId: params.batchId,
        },
      })
    } catch (err) {
      log.warn("notify.batch.in_app.error", { error: (err as Error).message })
    }

    // 2. Email notification (condicional via settings)
    try {
      const admin = createAdminClient()
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
