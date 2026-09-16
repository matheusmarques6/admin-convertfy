import { describe, expect, it } from "vitest"

import { aggregateByDay } from "./store-daily-metrics.service"

type Linha = Parameters<typeof aggregateByDay>[0][number]

const campanha = (p: Partial<Linha> & { campaign_id: string }): Linha => ({
  store_id: "loja-1",
  org_id: "org-1",
  recipients: 100,
  delivered: 95,
  opened: 30,
  clicked: 5,
  conversions: 2,
  conversion_value: 250,
  bounced: 1,
  unsubscribed: 0,
  send_time: "2026-09-15T13:00:00.000Z",
  fetched_at: "2026-09-15T18:00:00.000Z",
  ...p,
})

describe("aggregateByDay — a dedupe que sustenta a leitura ampla", () => {
  // Desde 16/09 `fetchCampaigns` lê TODOS os `period_label` (o filtro em
  // '90d' deixava o cron sem dado: 73 linhas contra 2.061 em '30d'). A
  // mesma campanha passa a chegar em várias janelas, e é esta dedupe que
  // impede de somá-la duas vezes — sem ela, receita e envios inflariam em
  // silêncio, que é pior que o número faltando.
  it("a mesma campanha em três rótulos conta UMA vez", () => {
    const linhas = [
      campanha({ campaign_id: "c1" }),
      campanha({ campaign_id: "c1" }),
      campanha({ campaign_id: "c1" }),
    ]
    const buckets = [...aggregateByDay(linhas, "omnisend").values()]
    expect(buckets).toHaveLength(1)
    expect(buckets[0].recipients).toBe(100)
    expect(buckets[0].conversion_value).toBe(250)
  })

  it("campanhas diferentes no mesmo dia somam", () => {
    const buckets = [
      ...aggregateByDay(
        [campanha({ campaign_id: "c1" }), campanha({ campaign_id: "c2" })],
        "omnisend",
      ).values(),
    ]
    expect(buckets).toHaveLength(1)
    expect(buckets[0].recipients).toBe(200)
  })

  // O rótulo mais recente pode trazer números reprocessados pela
  // plataforma; é ele que vale.
  it("entre cópias, vence o sync mais recente", () => {
    const buckets = [
      ...aggregateByDay(
        [
          campanha({ campaign_id: "c1", recipients: 10, fetched_at: "2026-09-15T10:00:00.000Z" }),
          campanha({ campaign_id: "c1", recipients: 999, fetched_at: "2026-09-15T20:00:00.000Z" }),
        ],
        "omnisend",
      ).values(),
    ]
    expect(buckets[0].recipients).toBe(999)
  })

  it("lojas diferentes viram buckets diferentes", () => {
    const buckets = [
      ...aggregateByDay(
        [campanha({ campaign_id: "c1" }), campanha({ campaign_id: "c1", store_id: "loja-2" })],
        "omnisend",
      ).values(),
    ]
    expect(buckets).toHaveLength(2)
  })

  // Sem data de envio não há dia a que pertencer — inventar um colocaria
  // a campanha no dia errado da série.
  it("campanha sem send_time fica de fora", () => {
    const buckets = [...aggregateByDay([campanha({ campaign_id: "c1", send_time: null })], "omnisend").values()]
    expect(buckets).toHaveLength(0)
  })

  it("dias diferentes não se misturam", () => {
    const buckets = [
      ...aggregateByDay(
        [
          campanha({ campaign_id: "c1" }),
          campanha({ campaign_id: "c2", send_time: "2026-09-14T13:00:00.000Z" }),
        ],
        "omnisend",
      ).values(),
    ]
    expect(buckets.map((b) => b.metric_date).sort()).toEqual(["2026-09-14", "2026-09-15"])
  })
})
