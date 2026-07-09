/**
 * Testes de regressão do snapshot do relatório mensal.
 *
 * Fixture baseada no caso real da auditoria (Clube Rock, junho/2026):
 *  - pedidos da loja 7.473 vs atribuídos 1.567 (relatório inflava 4,8x)
 *  - campanhas do período 10 vs lifetime 87 (relatório mostrava 40)
 *  - engajamento consolidado da Reports API vs soma de buckets diários
 *  - delivered = sent − failed (nunca "100% de entrega" com bounces > 0)
 *  - zero legítimo ≠ dado ausente (null)
 */

import { describe, it, expect } from "vitest"
import {
  buildReportSnapshot,
  num,
  firstPresent,
  matchByDate,
  distributeRevenue,
  type SnapshotSources,
  type SnapshotRow,
} from "./report-snapshot.service"

// ─── Fixture Clube Rock (junho/2026) ─────────────────────────────────────

function makeRow(overrides: Partial<SnapshotRow> & { id: string }): SnapshotRow {
  return {
    name: `Campanha ${overrides.id}`,
    sendTime: "2026-06-06T10:00:00Z",
    recipients: 30_000,
    delivered: 30_000,
    opened: 9_000,
    clicked: 700,
    conversions: 40,
    revenue: 0,
    ...overrides,
  } as SnapshotRow
}

function clubeRockSources(overrides?: Partial<SnapshotSources>): SnapshotSources {
  const campaigns = Array.from({ length: 10 }, (_, i) =>
    makeRow({ id: `c${i + 1}`, revenue: i === 0 ? 8_967.96 : 4_000 }),
  )
  return {
    reportRes: {
      success: true,
      platform: "omnisend",
      account: { currency: "BRL" },
      revenue: {
        storeRevenue: 1_190_000,
        storeOrders: 7_473,
        totalRevenue: 286_000,
        klaviyoAttributedRevenue: 286_000,
        campaignRevenue: 63_800,
        flowRevenue: 222_200,
        totalOrders: 7_473,
        klaviyoAttributedOrders: 1_567,
        averageOrderValue: 159.03,
        recoveryRate: 23.97,
      },
      overview: {
        campaignsInPeriod: 10, // filtrado por isInPeriod — fonte correta
        liveFlows: 12,
        sentCampaigns: 87, // lifetime — NÃO pode ser usado
      },
      emailPerformance: {
        delivered: 624_977, // Statistics API (sent, com overcount a jusante)
        opened: 182_315, // soma de buckets diários — INFLADO
        clicked: 14_364,
        openRate: 29.17,
        clickRate: 2.3,
        clickToOpenRate: 7.88,
        bounceRate: 0.23,
        unsubscribeRate: 0.17,
      },
      deliverability: {
        sent: 590_405,
        delivered: 584_900, // sent − failed
        failed: 5_505, // campanhas + automations (1.461 + 4.044)
        failRate: 0.93,
        opened: 133_800, // consolidado send-date (bate com dashboard)
        openedUnique: 120_000,
        clicked: 10_282,
        clickedUnique: 9_100,
        openRate: 22.9,
        clickRate: 1.76,
        unsubscribedUnique: 1_712,
        unsubscribeRate: 0.29,
        markedAsSpamUnique: 72,
        markedAsSpamRate: 0.012,
        source: "omnisend-reports-api",
      },
    },
    campaignsRes: {
      campaigns,
      summary: { sentCampaigns: 87, totalRevenue: 63_800 }, // lifetime!
    },
    flowsRes: {
      flows: Array.from({ length: 8 }, (_, i) =>
        makeRow({ id: `f${i + 1}`, revenue: 25_000 }),
      ),
      summary: { liveFlows: 12, totalRevenue: 222_200 },
    },
    shopifyRes: {
      orders: { totalOrders: 7_400, totalRevenue: 990_000, averageOrderValue: 133 },
      customers: { newCustomersLast30Days: 812 },
    },
    cachedSummary: {
      store_total_revenue: 1_180_000,
      store_orders: 7_400,
      total_leads: 45_000,
      omnisend_total_orders: 1_500,
    },
    cacheCampaigns: [],
    cacheFlows: [],
    reportsByDate: null,
    ...overrides,
  }
}

function build(sources: SnapshotSources) {
  return buildReportSnapshot({
    sources,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
  })
}

// ─── F1: pedidos loja vs atribuídos ──────────────────────────────────────

describe("F1 — pedidos da loja vs pedidos atribuídos", () => {
  it("separa pedidos_loja (7473) de pedidos_atribuidos (1567)", () => {
    const snap = build(clubeRockSources())
    expect(snap.kpis.pedidos_loja).toBe(7_473)
    expect(snap.kpis.pedidos_atribuidos).toBe(1_567)
    // Campo legado mantém a semântica histórica (loja)
    expect(snap.kpis.pedidos).toBe(7_473)
  })

  it("ticket_medio usa pedidos da loja; ticket_medio_atribuido usa atribuídos", () => {
    const snap = build(clubeRockSources())
    expect(snap.kpis.ticket_medio).toBeCloseTo(1_190_000 / 7_473, 2)
    // ~R$ 182/pedido atribuído — nunca mais os R$ 38 do bug (286k/7473)
    expect(snap.kpis.ticket_medio_atribuido).toBeCloseTo(286_000 / 1_567, 2)
    expect(snap.kpis.ticket_medio_atribuido).toBeGreaterThan(100)
  })

  it("sem endpoint, pedidos_atribuidos cai pro cache omnisend_total_orders", () => {
    const snap = build(clubeRockSources({ reportRes: null }))
    expect(snap.kpis.pedidos_atribuidos).toBe(1_500)
    expect(snap.kpis.pedidos_loja).toBe(7_400) // cachedSummary.store_orders
  })
})

// ─── F2: contagens do período ────────────────────────────────────────────

describe("F2 — campanhas do período (não lifetime)", () => {
  it("usa overview.campaignsInPeriod (10), nunca summary.sentCampaigns (87)", () => {
    const snap = build(clubeRockSources())
    expect(snap.kpis.total_campaigns).toBe(10)
  })

  it("lista .slice(0,10) cheia nunca vira contagem (teto artificial)", () => {
    const src = clubeRockSources()
    delete (src.reportRes as Record<string, unknown>).overview
    const snap = build(src)
    // 10 rows = lista possivelmente truncada → null (ausente), não 10
    expect(snap.kpis.total_campaigns).toBeNull()
  })

  it("total_flows prefere overview.liveFlows", () => {
    const snap = build(clubeRockSources())
    expect(snap.kpis.total_flows).toBe(12)
  })
})

// ─── F3/F4: engajamento e entregabilidade consolidados ──────────────────

describe("F3/F4 — deliverability (Reports API) como fonte primária", () => {
  it("prefere agregados consolidados às somas infladas de buckets diários", () => {
    const snap = build(clubeRockSources())
    expect(snap.kpis.open_rate).toBeCloseTo(22.9, 4) // não 29.17
    expect(snap.kpis.click_rate).toBeCloseTo(1.76, 4)
    expect(snap.email.opened).toBe(133_800) // não 182.315
    expect(snap.email.source).toBe("reports-api")
  })

  it("entregues = sent − failed; bounce/unsub da Reports API", () => {
    const snap = build(clubeRockSources())
    expect(snap.kpis.envios).toBe(584_900)
    expect(snap.kpis.bounce_rate).toBeCloseTo(0.93, 4) // failRate consolidado
    expect(snap.kpis.unsub_rate).toBeCloseTo(0.29, 4) // não 0.17 (só campanhas)
    expect(snap.kpis.opened_unique).toBe(120_000)
    expect(snap.kpis.clicked_unique).toBe(9_100)
    expect(snap.kpis.spam_rate).toBeCloseTo(0.012, 4)
  })

  it("sem deliverability (Klaviyo), cai na derivação legada e únicos ficam null", () => {
    const src = clubeRockSources()
    ;(src.reportRes as Record<string, unknown>).deliverability = null
    ;(src.reportRes as Record<string, unknown>).platform = "klaviyo"
    const snap = build(src)
    expect(snap.kpis.opened_unique).toBeNull()
    expect(snap.kpis.clicked_unique).toBeNull()
    expect(snap.kpis.spam_rate).toBeNull()
    expect(snap.email.source).toBe("rows")
    // Derivação legada: ep.delivered / ep.opened
    expect(snap.kpis.envios).toBe(624_977)
    expect(snap.kpis.open_rate).toBeCloseTo((182_315 / 624_977) * 100, 2)
  })
})

// ─── F5: zero legítimo ≠ dado ausente ────────────────────────────────────

describe("F5 — presença explícita (zero ≠ ausente)", () => {
  it("zero legítimo do endpoint NÃO cai pro fallback", () => {
    const src = clubeRockSources()
    ;((src.reportRes as Record<string, unknown>).revenue as Record<string, unknown>).storeOrders = 0
    const snap = build(src)
    // Antes: 0 || cachedSummary.store_orders → 7400 (errado)
    expect(snap.kpis.pedidos_loja).toBe(0)
  })

  it("novos_clientes = 0 real fica 0; Shopify indisponível fica null", () => {
    const zeroReal = build(clubeRockSources({
      shopifyRes: { orders: {}, customers: { newCustomersLast30Days: 0 } },
    }))
    expect(zeroReal.kpis.novos_clientes).toBe(0)

    const ausente = build(clubeRockSources({ shopifyRes: null }))
    expect(ausente.kpis.novos_clientes).toBeNull()
  })

  it("todas as fontes ausentes → KPIs null (não zeros falsos)", () => {
    const snap = build(clubeRockSources({
      reportRes: null,
      campaignsRes: null,
      flowsRes: null,
      shopifyRes: null,
      cachedSummary: null,
    }))
    expect(snap.kpis.receita_total).toBeNull()
    expect(snap.kpis.pedidos_loja).toBeNull()
    expect(snap.kpis.pedidos_atribuidos).toBeNull()
    expect(snap.kpis.novos_clientes).toBeNull()
    expect(snap.kpis.total_campaigns).toBeNull()
    expect(snap.kpis.atribuicao_pct).toBeNull()
  })
})

// ─── Receita (camada saudável — não regredir) ────────────────────────────

describe("Receita — comportamento preservado", () => {
  it("mantém receitas e atribuição do caso Clube Rock", () => {
    const snap = build(clubeRockSources())
    expect(snap.kpis.receita_total).toBe(1_190_000)
    expect(snap.kpis.receita_atribuida).toBe(286_000)
    expect(snap.kpis.receita_campanhas).toBe(63_800)
    expect(snap.kpis.receita_flows).toBe(222_200)
    expect(snap.kpis.atribuicao_pct).toBeCloseTo(286_000 / 1_190_000, 6)
  })

  it("identidade campanhas + flows = atribuída quando rv ausente", () => {
    const src = clubeRockSources({ reportRes: null })
    ;(src.campaignsRes as Record<string, unknown>).summary = { totalRevenue: 60_000 }
    ;(src.flowsRes as Record<string, unknown>).summary = { totalRevenue: 200_000 }
    const snap = build(src)
    expect(snap.kpis.receita_atribuida).toBe(260_000)
  })
})

// ─── Helpers ─────────────────────────────────────────────────────────────

describe("num / firstPresent", () => {
  it("num distingue ausente (null) de zero (0)", () => {
    expect(num({ a: 0 }, "a")).toBe(0)
    expect(num({ a: 5 }, "a")).toBe(5)
    expect(num({}, "a")).toBeNull()
    expect(num(null, "a")).toBeNull()
    expect(num({ a: null }, "a")).toBeNull()
    expect(num({ a: "abc" }, "a")).toBeNull()
    expect(num({ a: Infinity }, "a")).toBeNull()
  })

  it("firstPresent aceita 0 como presente", () => {
    expect(firstPresent(null, 0, 5)).toBe(0)
    expect(firstPresent(undefined, null)).toBeNull()
    expect(firstPresent(7)).toBe(7)
  })
})

describe("matchByDate / distributeRevenue (comportamento preservado)", () => {
  const reports = [
    {
      marketingActivityID: "x",
      attributedRevenue: 1_000,
      byDate: new Map([["2026-06-06", 1_000]]),
    },
  ]

  it("1 campanha no dia → receita exata, não estimada", () => {
    const rows = [makeRow({ id: "a", sendTime: "2026-06-06T10:00:00Z" })]
    const out = matchByDate(rows, reports)
    expect(out[0].revenue).toBe(1_000)
    expect(out[0].revenue_estimated).toBe(false)
  })

  it("N campanhas no dia → split por delivered com flag estimated", () => {
    const rows = [
      makeRow({ id: "a", sendTime: "2026-06-06T07:00:00Z", delivered: 30_000 }),
      makeRow({ id: "b", sendTime: "2026-06-06T18:00:00Z", delivered: 10_000 }),
    ]
    const out = matchByDate(rows, reports)
    expect(out[0].revenue).toBe(750)
    expect(out[1].revenue).toBe(250)
    expect(out[0].revenue_estimated).toBe(true)
  })

  it("distributeRevenue preserva a soma total e marca estimated", () => {
    const rows = [
      makeRow({ id: "a", revenue: 0, delivered: 3_000 }),
      makeRow({ id: "b", revenue: 0, delivered: 1_000 }),
    ]
    const out = distributeRevenue(rows, 4_000)
    expect(out[0].revenue).toBe(3_000)
    expect(out[1].revenue).toBe(1_000)
    expect(out.every((r) => r.revenue_estimated === true)).toBe(true)
  })

  it("distributeRevenue não toca rows que já têm receita", () => {
    const rows = [makeRow({ id: "a", revenue: 500 })]
    const out = distributeRevenue(rows, 4_000)
    expect(out[0].revenue).toBe(500)
    expect(out[0].revenue_estimated).toBeUndefined()
  })
})
