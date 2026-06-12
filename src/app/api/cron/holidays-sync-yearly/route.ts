/**
 * Cron anual — primeiro do ano (01 jan 03h UTC).
 *
 * Atualiza commemorative_dates com os feriados oficiais do ano corrente
 * e do próximo de TODOS os países onde a org tem loja ativa. Pega os
 * dois anos pra cobrir o caso de o cron rodar em janeiro e a tela já
 * precisar mostrar datas do ano seguinte na grade.
 *
 * Nager.Date é grátis, sem chave — não há custo.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { syncHolidaysFromNager } from "@/lib/services/campaign-central/nager-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronHolidaysSync")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // Países distintos de TODAS as orgs com loja ativa + Omnisend.
    // Inclui os SECUNDÁRIOS: a união de countries[] de cada loja
    // (fallback [country] quando countries vazio/null) — assim datas dos
    // países secundários também são sincronizadas.
    const { data, error } = await admin
      .from("client_stores")
      .select("country, countries")
      .eq("is_active", true)
      .not("omnisend_api_key", "is", null)
      .not("country", "is", null)
    if (error) throw error

    const countrySet = new Set<string>()
    for (const s of data ?? []) {
      const list =
        Array.isArray(s.countries) && s.countries.length
          ? (s.countries as string[])
          : [s.country as string | null]
      for (const c of list) {
        if (c) countrySet.add(c.toUpperCase())
      }
    }
    const countries = Array.from(countrySet)
    if (countries.length === 0) {
      log.info("cron.no_countries")
      return NextResponse.json({ success: true, countries: 0 })
    }

    const results = await syncHolidaysFromNager({ countries })
    const totals = results.reduce(
      (acc, r) => ({
        inserted: acc.inserted + r.inserted,
        skipped_manual: acc.skipped_manual + r.skipped_manual,
        failed: acc.failed + (r.error ? 1 : 0),
      }),
      { inserted: 0, skipped_manual: 0, failed: 0 },
    )

    log.info("cron.done", { countries: countries.length, ...totals })
    return NextResponse.json({ success: true, countries: countries.length, totals })
  } catch (err) {
    log.error("cron.error", err)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
