/**
 * /admin/stores/[id]/emails (Epic AE - Story AE-6)
 *
 * Pagina para designer + dev acompanharem o pipeline de geracao de
 * emails da loja em tempo real. Server component faz o fetch inicial
 * (sem chamar HTTP loopback — consulta direta via admin client) e
 * passa para o client component <EmailsLiveList /> que conecta SSE.
 *
 * Auth: requer user autenticado + acesso multi-tenant (mesmo org_id
 * que a loja). isDev = role IN ('admin', 'owner') OR tags @> ['dev'].
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { PageHeader } from "@/components/ui/page-header"
import { ROUTES } from "@/lib/routes"
import { EmailsLiveList } from "@/components/stores/emails-live-list"
import type { LiveEmail } from "@/hooks/use-emails-live"
import type { EmailStatus, EmailBlock } from "@/types/email-workspace"
import type { QaIssue } from "@/types/email-generation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface PageStats {
  total: number
  by_status: Record<string, number>
  pct_ready: number
}

async function loadInitialData(storeId: string): Promise<{
  emails: LiveEmail[]
  stats: PageStats
} | null> {
  const admin = createAdminClient()

  const { data: flows, error: flowsErr } = await admin
    .from("email_flows")
    .select("id, flow_type, name")
    .eq("store_id", storeId)

  if (flowsErr) {
    console.error("[StoreEmailsPage] flows query failed", flowsErr)
    return null
  }

  const flowIds = (flows ?? []).map((f) => f.id as string)
  if (flowIds.length === 0) {
    return {
      emails: [],
      stats: { total: 0, by_status: {}, pct_ready: 0 },
    }
  }

  const { data: emailsRaw, error: emailsErr } = await admin
    .from("email_flow_emails")
    .select(
      `id, flow_id, number, name, status, subject, preheader, html,
       generation_batch_id, copy_started_at, copy_ready_at,
       rendering_started_at, qa_started_at, ready_at, failed_at,
       failure_reason, qa_issues, total_cost_cents, attempts,
       blocks:email_blocks(id, email_id, block_type, position, label, content, applied, applied_at, applied_by, created_at)`,
    )
    .in("flow_id", flowIds)
    .order("number", { ascending: true })

  if (emailsErr) {
    console.error("[StoreEmailsPage] emails query failed", emailsErr)
    return null
  }

  const flowMeta = new Map<string, { flow_type: string; flow_name: string }>()
  for (const f of flows ?? []) {
    flowMeta.set(f.id as string, {
      flow_type: (f.flow_type as string) ?? "custom",
      flow_name: (f.name as string) ?? "",
    })
  }

  const emails: LiveEmail[] = (emailsRaw ?? []).map((e) => {
    const meta = flowMeta.get(e.flow_id as string)
    const blocks = ((e.blocks as EmailBlock[] | null) ?? []).slice().sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    )
    return {
      id: e.id as string,
      flow_id: e.flow_id as string,
      flow_type: meta?.flow_type ?? "custom",
      flow_name: meta?.flow_name ?? "",
      number: (e.number as number) ?? 0,
      name: (e.name as string) ?? "",
      status: (e.status as EmailStatus) ?? "draft",
      subject: (e.subject as string | null) ?? null,
      preheader: (e.preheader as string | null) ?? null,
      html: (e.html as string | null) ?? null,
      blocks: blocks.map((b) => ({
        id: b.id,
        block_type: b.block_type,
        position: b.position,
        label: b.label,
        content: (b.content as unknown as Record<string, unknown>) ?? {},
      })),
      timing: {
        copy_started_at: (e.copy_started_at as string | null) ?? null,
        copy_ready_at: (e.copy_ready_at as string | null) ?? null,
        rendering_started_at: (e.rendering_started_at as string | null) ?? null,
        qa_started_at: (e.qa_started_at as string | null) ?? null,
        ready_at: (e.ready_at as string | null) ?? null,
        failed_at: (e.failed_at as string | null) ?? null,
      },
      failure_reason: (e.failure_reason as string | null) ?? null,
      qa_issues: ((e.qa_issues as QaIssue[] | null) ?? []) as QaIssue[],
      total_cost_cents: (e.total_cost_cents as number) ?? 0,
      attempts: (e.attempts as number) ?? 0,
      generation_batch_id: (e.generation_batch_id as string | null) ?? null,
    }
  })

  const by_status: Record<string, number> = {}
  let readyCount = 0
  for (const e of emails) {
    by_status[e.status] = (by_status[e.status] ?? 0) + 1
    if (e.status === "ready") readyCount++
  }
  const total = emails.length
  return {
    emails,
    stats: { total, by_status, pct_ready: total > 0 ? Math.round((readyCount / total) * 100) : 0 },
  }
}

export default async function StoreEmailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: storeId } = await params

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  // Loja + multi-tenant guard.
  const { data: store } = await admin
    .from("client_stores")
    .select("id, store_name, org_id")
    .eq("id", storeId)
    .single()
  if (!store) notFound()

  if (store.org_id) {
    const userOrgId = await resolveOrgId(user.id)
    if (store.org_id !== userOrgId) notFound()
  }

  // Profile: role + tags para checagem isDev.
  const { data: profile } = await admin
    .from("profiles")
    .select("role, tags")
    .eq("id", user.id)
    .single()

  const role = (profile?.role as string | null) ?? null
  const tags = (profile?.tags as string[] | null) ?? []
  const isDev = role === "admin" || role === "owner" || tags.includes("dev")

  // Briefing confirmado (necessario pra habilitar StartOnboardingButton).
  const { data: briefing } = await admin
    .from("store_briefings")
    .select("status")
    .eq("store_id", storeId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle()
  const briefingConfirmed = !!briefing

  const initial = await loadInitialData(storeId)
  if (!initial) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">
          Falha ao carregar emails. Verifique os logs do servidor.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Emails"
        breadcrumb={[
          { label: "Lojas", href: ROUTES.ADMIN.STORES.LIST },
          { label: store.store_name as string, href: `/admin/stores/${storeId}` },
          { label: "Emails" },
        ]}
        actions={
          <Link
            href={`/admin/stores/${storeId}`}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a loja
          </Link>
        }
      />

      <EmailsLiveList
        storeId={storeId}
        initialEmails={initial.emails}
        initialStats={initial.stats}
        briefingConfirmed={briefingConfirmed}
        isDev={isDev}
      />
    </div>
  )
}
