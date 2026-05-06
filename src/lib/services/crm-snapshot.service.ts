/**
 * CRM Snapshot service — popula crm_pipeline_snapshots,
 * crm_org_snapshots e crm_lead_funnel_snapshots para o dia atual.
 *
 * Idempotente: usa UPSERT (UNIQUE org_id+day). Pode rodar varias
 * vezes no mesmo dia que sobrescreve.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CrmSnapshot")

export async function computeAllOrgSnapshots(): Promise<{ orgs: number; pipelines: number }> {
  const admin = createAdminClient()

  const { data: orgs } = await admin
    .from("organizations")
    .select("id")
    .eq("type", "agency")

  let pipelinesProcessed = 0

  for (const org of orgs || []) {
    pipelinesProcessed += await snapshotOrg(org.id)
  }

  return { orgs: orgs?.length || 0, pipelines: pipelinesProcessed }
}

async function snapshotOrg(orgId: string): Promise<number> {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const todayStart = `${today}T00:00:00.000Z`
  const todayEnd = `${today}T23:59:59.999Z`

  // Pipelines da org (note: pipelines nao tem org_id; usamos owner_id dos
  // deals -> org_members pra inferir, mas como simplificacao filtramos
  // pipelines por scope sales/cs/internal e processamos todas).
  const { data: pipelines } = await admin
    .from("pipelines")
    .select("id, name, scope")
    .eq("is_archived", false)
    .in("scope", ["sales", "cs", "internal"])

  if (!pipelines || pipelines.length === 0) return 0

  let pipelineCount = 0

  // Per-pipeline snapshots
  for (const p of pipelines) {
    const { data: openDeals } = await admin
      .from("deals")
      .select("id, value, owner_id")
      .eq("pipeline_id", p.id)
      .eq("status", "open")

    // Confirma que deals da pipeline pertencem a org via owner
    const ownerIds = Array.from(new Set((openDeals || []).map((d) => d.owner_id).filter(Boolean)))
    if (ownerIds.length === 0) continue

    const { data: orgMembers } = await admin
      .from("org_members")
      .select("profile_id")
      .eq("org_id", orgId)
      .in("profile_id", ownerIds)

    const memberSet = new Set((orgMembers || []).map((m) => m.profile_id))
    const orgOpenDeals = (openDeals || []).filter((d) => memberSet.has(d.owner_id || ""))

    if (orgOpenDeals.length === 0) {
      // Verifica se ha deals fechados desta org neste pipeline; se sim, ainda gera snapshot zero pra nao deixar buraco
      const { data: closedRecent } = await admin
        .from("deals")
        .select("id, owner_id")
        .eq("pipeline_id", p.id)
        .in("status", ["won", "lost"])
        .gte("won_at", since30)
        .limit(1)
      if (!closedRecent || closedRecent.length === 0) continue
    }

    const openValue = orgOpenDeals.reduce((s, d) => s + (Number(d.value) || 0), 0)

    // Won/lost no dia
    const { data: wonToday } = await admin
      .from("deals")
      .select("id, value, owner_id")
      .eq("pipeline_id", p.id)
      .eq("status", "won")
      .gte("won_at", todayStart)
      .lte("won_at", todayEnd)
    const wonTodayOrg = (wonToday || []).filter((d) => memberSet.has(d.owner_id || ""))

    const { data: lostToday } = await admin
      .from("deals")
      .select("id, value, owner_id")
      .eq("pipeline_id", p.id)
      .eq("status", "lost")
      .gte("lost_at", todayStart)
      .lte("lost_at", todayEnd)
    const lostTodayOrg = (lostToday || []).filter((d) => memberSet.has(d.owner_id || ""))

    // Won/lost rolling 30d
    const { data: won30 } = await admin
      .from("deals")
      .select("id, value, owner_id, created_at, won_at")
      .eq("pipeline_id", p.id)
      .eq("status", "won")
      .gte("won_at", since30)
    const won30Org = (won30 || []).filter((d) => memberSet.has(d.owner_id || ""))

    const { data: lost30 } = await admin
      .from("deals")
      .select("id, value, owner_id")
      .eq("pipeline_id", p.id)
      .eq("status", "lost")
      .gte("lost_at", since30)
    const lost30Org = (lost30 || []).filter((d) => memberSet.has(d.owner_id || ""))

    const winRate30 =
      won30Org.length + lost30Org.length > 0
        ? (won30Org.length / (won30Org.length + lost30Org.length)) * 100
        : null

    const cycleDays = won30Org
      .filter((d) => d.created_at && d.won_at)
      .map(
        (d) =>
          (new Date(d.won_at as string).getTime() - new Date(d.created_at).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    const avgCycle =
      cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null

    await admin.from("crm_pipeline_snapshots").upsert(
      {
        org_id: orgId,
        pipeline_id: p.id,
        day: today,
        open_count: orgOpenDeals.length,
        open_value: openValue,
        won_count_today: wonTodayOrg.length,
        won_value_today: wonTodayOrg.reduce((s, d) => s + (Number(d.value) || 0), 0),
        lost_count_today: lostTodayOrg.length,
        lost_value_today: lostTodayOrg.reduce((s, d) => s + (Number(d.value) || 0), 0),
        won_count_30d: won30Org.length,
        won_value_30d: won30Org.reduce((s, d) => s + (Number(d.value) || 0), 0),
        lost_count_30d: lost30Org.length,
        lost_value_30d: lost30Org.reduce((s, d) => s + (Number(d.value) || 0), 0),
        win_rate_30d: winRate30,
        avg_cycle_days_30d: avgCycle,
      },
      { onConflict: "org_id,pipeline_id,day" },
    )

    pipelineCount += 1
  }

  // Org-wide snapshot (sales rolling 30d)
  const salesPipelines = pipelines.filter((p) => p.scope === "sales")
  const salesPipelineIds = salesPipelines.map((p) => p.id)

  let salesPipelineValue = 0
  let salesOpenCount = 0
  let salesWon30Count = 0
  let salesWon30Value = 0
  let salesLost30Count = 0
  let totalCycleSum = 0
  let totalCycleCount = 0

  if (salesPipelineIds.length > 0) {
    // Reusa snapshots ja calculadas por pipeline (acabou de inserir)
    const { data: snaps } = await admin
      .from("crm_pipeline_snapshots")
      .select(
        "open_value, open_count, won_count_30d, won_value_30d, lost_count_30d, avg_cycle_days_30d",
      )
      .eq("org_id", orgId)
      .eq("day", today)
      .in("pipeline_id", salesPipelineIds)

    for (const s of snaps || []) {
      salesPipelineValue += Number(s.open_value) || 0
      salesOpenCount += s.open_count
      salesWon30Count += s.won_count_30d
      salesWon30Value += Number(s.won_value_30d) || 0
      salesLost30Count += s.lost_count_30d
      if (s.avg_cycle_days_30d != null) {
        totalCycleSum += Number(s.avg_cycle_days_30d) * s.won_count_30d
        totalCycleCount += s.won_count_30d
      }
    }
  }

  const salesWinRate =
    salesWon30Count + salesLost30Count > 0
      ? (salesWon30Count / (salesWon30Count + salesLost30Count)) * 100
      : null
  const salesAvgCycle = totalCycleCount > 0 ? totalCycleSum / totalCycleCount : null

  // Carteira CS
  const { data: stores } = await admin
    .from("client_stores")
    .select("id, mrr_cents, health_score, nps_last_score")
    .eq("org_id", orgId)
    .eq("is_active", true)

  let totalMrrCents = 0
  let avgHealth = 0
  let healthCount = 0
  let critical = 0
  let warning = 0
  let healthy = 0
  let npsSum = 0
  let npsCount = 0
  let promoters = 0
  let detractors = 0

  for (const s of stores || []) {
    if (s.mrr_cents) totalMrrCents += s.mrr_cents
    if (s.health_score != null) {
      avgHealth += s.health_score
      healthCount += 1
      if (s.health_score < 50) critical += 1
      else if (s.health_score < 70) warning += 1
      else healthy += 1
    }
    if (s.nps_last_score != null) {
      npsSum += s.nps_last_score
      npsCount += 1
      if (s.nps_last_score >= 9) promoters += 1
      else if (s.nps_last_score < 7) detractors += 1
    }
  }

  const avgHealthFinal = healthCount > 0 ? avgHealth / healthCount : null
  const npsScore = npsCount > 0 ? ((promoters - detractors) / npsCount) * 100 : null

  // Inbox
  const { data: openThreads } = await admin
    .from("crm_threads")
    .select("status")
    .eq("org_id", orgId)
    .in("status", ["open", "pending"])

  const inboxOpen = (openThreads || []).filter((t) => t.status === "open").length
  const inboxPending = (openThreads || []).filter((t) => t.status === "pending").length

  await admin.from("crm_org_snapshots").upsert(
    {
      org_id: orgId,
      day: today,
      sales_pipeline_value: salesPipelineValue,
      sales_open_count: salesOpenCount,
      sales_won_value_30d: salesWon30Value,
      sales_won_count_30d: salesWon30Count,
      sales_win_rate_30d: salesWinRate,
      sales_avg_cycle_days_30d: salesAvgCycle,
      active_stores_count: stores?.length || 0,
      total_mrr_cents: totalMrrCents,
      avg_health_score: avgHealthFinal,
      critical_health_count: critical,
      warning_health_count: warning,
      healthy_count: healthy,
      nps_score: npsScore,
      nps_responses_30d: npsCount,
      inbox_open_threads: inboxOpen,
      inbox_pending_threads: inboxPending,
    },
    { onConflict: "org_id,day" },
  )

  // Lead funnel
  const { data: orgMembersAll } = await admin
    .from("org_members")
    .select("profile_id")
    .eq("org_id", orgId)
    .eq("is_active", true)
  const memberIds = (orgMembersAll || []).map((m) => m.profile_id)

  let leads: Array<{ status: string; source: string | null; created_at: string }> = []
  if (memberIds.length > 0) {
    const { data } = await admin
      .from("crm_leads")
      .select("status, source, created_at")
      .in("created_by", memberIds)
    leads = (data || []) as never
  }

  const counts = {
    new: 0, qualified: 0, unqualified: 0, converted: 0, lost: 0,
  } as Record<string, number>
  let createdToday = 0
  const sourceMap = new Map<string, number>()

  for (const l of leads) {
    counts[l.status] = (counts[l.status] || 0) + 1
    if (l.created_at >= todayStart) {
      createdToday += 1
      const key = l.source || "Sem fonte"
      sourceMap.set(key, (sourceMap.get(key) || 0) + 1)
    }
  }

  const top5Sources = Array.from(sourceMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})

  await admin.from("crm_lead_funnel_snapshots").upsert(
    {
      org_id: orgId,
      day: today,
      new_count: counts.new || 0,
      qualified_count: counts.qualified || 0,
      unqualified_count: counts.unqualified || 0,
      converted_count: counts.converted || 0,
      lost_count: counts.lost || 0,
      created_today: createdToday,
      qualified_today: 0, // simplificado
      converted_today: 0,
      by_source: top5Sources,
    },
    { onConflict: "org_id,day" },
  )

  log.info("[Snapshot] org done", { org_id: orgId, pipelines: pipelineCount })
  return pipelineCount
}
