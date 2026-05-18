/**
 * Omnisend Reports API · per-campaign breakdown (send-date based).
 *
 * Endpoint confirmado pelo suporte Omnisend (2026-05-16, ticket
 * follow-up): `POST /api/analytics/reports` — mesmo schema do
 * Statistics API mas agrupa por SEND date em vez de event date,
 * batendo com a UI "Sales report" do dashboard Omnisend.
 *
 * Arquitetura dual-pipeline confirmada:
 *  - per-campaign table  → Reports API (send date · this file)
 *  - total revenue       → Statistics API (event date · omnisend-sync.service.ts)
 *  - sem join por marketingActivityID — cada pipeline é independente
 */

import { logger } from "@/lib/logger"
import { omnisendRequest, OMNISEND_API } from "./client"

const log = logger.child("OmnisendReportsAPI")

export interface OmnisendCampaignReport {
  marketingActivityID: string
  delivered: number
  opens: number
  clicks: number
  attributedRevenue: number
  attributedOrders: number
  byDate?: Map<string, number> // YYYY-MM-DD → revenue (pra mapear send date depois)
}

interface ReportsResponse {
  data?: Array<{
    alias?: string
    rows?: Array<Record<string, unknown>>
  }>
}

/**
 * Busca per-campaign revenue agrupado por SEND date (matches Omnisend UI).
 * Filtra por `marketingActivityType=Campaign`. Retorna agregado por
 * marketingActivityID com totais + breakdown por dia.
 */
export async function fetchOmnisendCampaignReports(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<OmnisendCampaignReport[] | null> {
  const from = new Date(startDate).toISOString()
  const to = new Date(endDate).toISOString()

  try {
    const resp = await omnisendRequest<ReportsResponse>(
      apiKey,
      `${OMNISEND_API}/analytics/reports`,
      {
        method: "POST",
        logTag: "OmnisendReports",
        omnisendVersion: "2026-preview",
        authStyle: "bearer",
        body: {
          queries: [
            {
              alias: "campaigns",
              metrics: [
                { name: "sent" },
                { name: "openedUnique" },
                { name: "clickedUnique" },
                { name: "attributedRevenue" },
                { name: "attributedOrders" },
              ],
              dateRange: { from, to },
              dimensions: [
                { name: "timestamp", granularity: "day" },
                { name: "marketingActivityID" },
              ],
              filters: [
                { name: "marketingActivityType", operator: "in", values: ["Campaign"] },
              ],
            },
          ],
        },
      },
    )

    if (!resp) {
      log.warn("[Reports] null response — endpoint may be unavailable or rate-limited")
      return null
    }

    const query = resp.data?.find((q) => q.alias === "campaigns")
    const rows = query?.rows ?? []
    if (rows.length === 0) {
      log.info("[Reports] zero rows returned for period", { from, to })
      return []
    }

    return aggregateByActivity(rows)
  } catch (err) {
    log.warn("[Reports] request failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function aggregateByActivity(rows: Array<Record<string, unknown>>): OmnisendCampaignReport[] {
  const map = new Map<string, OmnisendCampaignReport>()

  for (const row of rows) {
    const dims = (row.dimensions as Record<string, unknown> | undefined) ?? {}
    const mets = (row.metrics as Record<string, unknown> | undefined) ?? {}

    const id = String(row.marketingActivityID ?? dims.marketingActivityID ?? "")
    if (!id) continue

    const timestamp = String(row.timestamp ?? dims.timestamp ?? "")
    const day = timestamp.slice(0, 10) // YYYY-MM-DD

    const revenue = Number(row.attributedRevenue ?? mets.attributedRevenue) || 0
    const orders = Number(row.attributedOrders ?? mets.attributedOrders) || 0
    const sent = Number(row.sent ?? mets.sent) || 0
    const opens = Number(row.openedUnique ?? mets.openedUnique) || 0
    const clicks = Number(row.clickedUnique ?? mets.clickedUnique) || 0

    let entry = map.get(id)
    if (!entry) {
      entry = {
        marketingActivityID: id,
        delivered: 0,
        opens: 0,
        clicks: 0,
        attributedRevenue: 0,
        attributedOrders: 0,
        byDate: new Map(),
      }
      map.set(id, entry)
    }
    entry.delivered += sent
    entry.opens += opens
    entry.clicks += clicks
    entry.attributedRevenue += revenue
    entry.attributedOrders += orders
    if (day && entry.byDate) {
      entry.byDate.set(day, (entry.byDate.get(day) ?? 0) + revenue)
    }
  }

  return Array.from(map.values())
}
