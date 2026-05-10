/**
 * GET /api/cron/weekly-feedback
 *
 * Cron de segunda-feira (06h UTC sugerido) que gera relatorios
 * semanais pra todas as lojas ativas de todas as orgs.
 *
 * Query params:
 *   ?force=1       — regenera mesmo que ja exista
 *   ?week=YYYY-MM-DD — usa essa segunda como inicio (default: ultima)
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import {
  addDays,
  generateAllWeeklyReports,
  startOfWeek,
} from "@/lib/services/weekly-report.service"
import { logger } from "@/lib/logger"

const log = logger.child("WeeklyFeedbackCron")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const sp = request.nextUrl.searchParams
    const weekParam = sp.get("week")
    const force = sp.get("force") === "1"

    // Padrao: ultima semana fechada (segunda passada -> domingo)
    const today = new Date()
    const lastWeekDate = addDays(today, -7)
    const baseStart = weekParam
      ? new Date(weekParam + "T00:00:00Z")
      : startOfWeek(lastWeekDate)
    const start = startOfWeek(baseStart)
    const end = addDays(start, 7)

    const admin = createAdminClient()
    const { data: orgs } = await admin
      .from("organizations")
      .select("id, name")
      .eq("is_active", true)

    const results: Array<{
      org_id: string
      org_name: string
      generated: number
      skipped: number
    }> = []
    let totalGenerated = 0

    for (const org of orgs ?? []) {
      const r = await generateAllWeeklyReports(org.id, start, end)
      results.push({
        org_id: org.id,
        org_name: org.name,
        generated: r.generated,
        skipped: r.skipped,
      })
      totalGenerated += r.generated

      // Notifica responsaveis das orgs com novos relatorios
      if (r.generated > 0) {
        const { data: members } = await admin
          .from("org_members")
          .select("profile_id")
          .eq("org_id", org.id)
          .eq("is_active", true)
          .in("role", ["coordinator", "manager", "owner"])
        const rows = (members ?? [])
          .filter((m) => m.profile_id)
          .map((m) => ({
            user_id: m.profile_id as string,
            title: "Relatórios semanais prontos",
            body: `${r.generated} relatórios semanais foram gerados. Confira na ficha de cada loja.`,
            type: "weekly_report",
            link: "/admin/stores",
            metadata: { week_start: start.toISOString().slice(0, 10) },
          }))
        if (rows.length > 0) await admin.from("notifications").insert(rows)
      }
    }

    log.info("Weekly reports generated", {
      total: totalGenerated,
      orgs: results.length,
    })

    return NextResponse.json({
      success: true,
      week_start: start.toISOString().slice(0, 10),
      week_end: end.toISOString().slice(0, 10),
      total_generated: totalGenerated,
      forced: force,
      results,
    })
  } catch (error) {
    log.error("Weekly cron error", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    )
  }
}
