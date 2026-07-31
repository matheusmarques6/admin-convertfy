import { describe, it, expect } from "vitest"
import {
  countFunnelEntries,
  type FunnelEntryDeal,
  type FunnelEntryLead,
} from "./crm-funnel-entries"

const WINDOW = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T23:59:59.999Z" }

const deal = (
  id: string,
  created_at: string,
  lead_id: string | null = null,
): FunnelEntryDeal => ({ id, created_at, lead_id })

const lead = (
  id: string,
  created_at: string,
  converted_to_deal_id: string | null = null,
): FunnelEntryLead => ({ id, created_at, converted_to_deal_id })

describe("countFunnelEntries", () => {
  it("conta negocio criado no periodo mesmo sem lead — o caso que quebrava", () => {
    // Era isto que mostrava "0 leads e 8 MQLs": deals criados direto no
    // pipeline nao passam por crm_leads.
    const r = countFunnelEntries(
      [
        deal("d1", "2026-07-05T10:00:00Z"),
        deal("d2", "2026-07-06T10:00:00Z"),
        deal("d3", "2026-07-07T10:00:00Z"),
      ],
      [],
      WINDOW,
    )
    expect(r.total).toBe(3)
    expect(r.fromDeals).toBe(3)
    expect(r.fromLeads).toBe(0)
  })

  it("conta lead que ainda nao virou negocio", () => {
    const r = countFunnelEntries([], [lead("l1", "2026-07-10T10:00:00Z")], WINDOW)
    expect(r.total).toBe(1)
    expect(r.fromLeads).toBe(1)
  })

  it("nao conta duas vezes o lead que virou negocio (via deals.lead_id)", () => {
    const r = countFunnelEntries(
      [deal("d1", "2026-07-10T12:00:00Z", "l1")],
      [lead("l1", "2026-07-10T10:00:00Z")],
      WINDOW,
    )
    expect(r.total).toBe(1)
    expect(r.fromDeals).toBe(1)
    expect(r.fromLeads).toBe(0)
    expect(r.dedupedLeads).toBe(1)
  })

  it("deduplica tambem pelo lado do lead (converted_to_deal_id)", () => {
    // Fluxo em que o vinculo ficou so no lead
    const r = countFunnelEntries(
      [deal("d1", "2026-07-10T12:00:00Z", null)],
      [lead("l1", "2026-07-10T10:00:00Z", "d1")],
      WINDOW,
    )
    expect(r.total).toBe(1)
    expect(r.dedupedLeads).toBe(1)
  })

  it("soma as duas fontes sem dupla contagem", () => {
    const r = countFunnelEntries(
      [
        deal("d1", "2026-07-02T10:00:00Z", "l1"), // veio do lead l1
        deal("d2", "2026-07-03T10:00:00Z"), // criado direto
      ],
      [
        lead("l1", "2026-07-01T10:00:00Z"), // convertido → nao conta
        lead("l2", "2026-07-04T10:00:00Z"), // ainda nao virou negocio
      ],
      WINDOW,
    )
    expect(r.total).toBe(3)
    expect(r.fromDeals).toBe(2)
    expect(r.fromLeads).toBe(1)
    expect(r.dedupedLeads).toBe(1)
  })

  it("ignora entradas fora da janela", () => {
    const r = countFunnelEntries(
      [deal("antigo", "2026-06-20T10:00:00Z"), deal("novo", "2026-07-05T10:00:00Z")],
      [lead("antigo-l", "2026-06-25T10:00:00Z"), lead("novo-l", "2026-07-06T10:00:00Z")],
      WINDOW,
    )
    expect(r.total).toBe(2)
    expect(r.fromDeals).toBe(1)
    expect(r.fromLeads).toBe(1)
  })

  it("negocio antigo que avancou no periodo NAO reentra no topo", () => {
    // Entrada e evento unico: quem entrou antes ja foi contado antes.
    const r = countFunnelEntries([deal("d1", "2026-05-01T10:00:00Z", null)], [], WINDOW)
    expect(r.total).toBe(0)
  })

  it("negocio perdido continua tendo entrado no funil", () => {
    // A contagem e de ENTRADA, nao de quem esta ativo agora.
    const r = countFunnelEntries([deal("d1", "2026-07-05T10:00:00Z")], [], WINDOW)
    expect(r.total).toBe(1)
  })

  it("bordas da janela sao inclusivas", () => {
    const r = countFunnelEntries(
      [deal("inicio", WINDOW.from), deal("fim", WINDOW.to)],
      [],
      WINDOW,
    )
    expect(r.total).toBe(2)
  })

  it("sem dados devolve zero", () => {
    const r = countFunnelEntries([], [], WINDOW)
    expect(r).toEqual({ total: 0, fromDeals: 0, fromLeads: 0, dedupedLeads: 0 })
  })

  it("o total nunca fica menor que o numero de negocios criados", () => {
    // Invariante que impede o funil de mostrar topo menor que as etapas
    // seguintes por erro de deduplicacao.
    const deals = [
      deal("d1", "2026-07-02T10:00:00Z", "l1"),
      deal("d2", "2026-07-03T10:00:00Z", "l2"),
      deal("d3", "2026-07-04T10:00:00Z", "l3"),
    ]
    const leads = [
      lead("l1", "2026-07-01T10:00:00Z"),
      lead("l2", "2026-07-01T10:00:00Z"),
      lead("l3", "2026-07-01T10:00:00Z"),
    ]
    const r = countFunnelEntries(deals, leads, WINDOW)
    expect(r.total).toBeGreaterThanOrEqual(r.fromDeals)
    expect(r.total).toBe(3)
  })
})
