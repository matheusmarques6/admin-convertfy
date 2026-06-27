import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * CONTRATO DA FASE 5 — notificacoes do pipeline de design de campanha.
 *
 * notifyCampaignDesignStage({ suggestionId, orgId, stageSlug, event, campaignTitle? })
 *   -> { notified: number }
 *
 * - event "entered": notifica a FUNCAO responsavel da etapa
 *     (aprovacao -> coo; estrutura/producao/finalizacao -> designer).
 *     Ex: quando o Figma e entregue e a campanha entra em `aprovacao`, o COO e
 *     notificado para avaliar.
 * - event "changes_requested": notifica os DESIGNERS (a etapa estrutura volta
 *     pra eles com o pedido de mudancas do COO).
 *
 * Resolve usuarios por funcao via org_members + org_member_roles (mesmo padrao
 * do onboarding) e insere em `notifications` (1 por usuario).
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {
    org_members: [],
    org_member_roles: [],
    notifications: [],
  }
  let seq = 0
  function reset() {
    for (const k of Object.keys(db)) db[k] = []
    seq = 0
  }
  function from(table: string) {
    if (!db[table]) db[table] = []
    const filters: Array<[string, unknown, "eq" | "in"]> = []
    const match = (r: Row) =>
      filters.every(([k, v, op]) =>
        op === "eq" ? r[k] === v : Array.isArray(v) && v.includes(r[k]),
      )
    const rows = () => db[table].filter(match)
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => (filters.push([k, v, "eq"]), chain),
      in: (k: string, v: unknown[]) => (filters.push([k, v, "in"]), chain),
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (r: (v: unknown) => unknown) => r({ data: rows(), error: null }),
      insert: (input: Row | Row[]) => {
        const arr = Array.isArray(input) ? input : [input]
        const inserted = arr.map((x) => ({ id: x.id ?? `id-${++seq}`, ...x }))
        db[table].push(...inserted)
        return {
          select: () => ({
            single: async () => ({ data: inserted[0], error: null }),
            then: (r: (v: unknown) => unknown) =>
              r({ data: inserted, error: null }),
          }),
          then: (r: (v: unknown) => unknown) => r({ data: inserted, error: null }),
        }
      },
    }
    return chain
  }
  return { db, reset, client: { from } }
})

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => h.client }))

import { notifyCampaignDesignStage } from "./campaign-design-notify.service"

const ORG = "org1"

function seedMember(memberId: string, profileId: string, role: string) {
  h.db.org_members.push({
    id: memberId,
    profile_id: profileId,
    org_id: ORG,
    is_active: true,
    role,
  })
  h.db.org_member_roles.push({ org_member_id: memberId, role })
}

const notifiedUsers = () =>
  h.db.notifications.map((n) => n.user_id as string).sort()

beforeEach(() => h.reset())

describe("notifyCampaignDesignStage — Fase 5", () => {
  it("aprovacao entered: notifica o COO, NAO o designer", async () => {
    seedMember("m-coo", "p-coo", "coo")
    seedMember("m-des", "p-des", "designer")
    const res = await notifyCampaignDesignStage({
      suggestionId: "sug1",
      orgId: ORG,
      stageSlug: "aprovacao",
      event: "entered",
      campaignTitle: "Camp X",
    })
    expect(res.notified).toBe(1)
    expect(notifiedUsers()).toEqual(["p-coo"])
  })

  it("producao entered: notifica os designers", async () => {
    seedMember("m-coo", "p-coo", "coo")
    seedMember("m-des", "p-des", "designer")
    const res = await notifyCampaignDesignStage({
      suggestionId: "sug1",
      orgId: ORG,
      stageSlug: "producao",
      event: "entered",
    })
    expect(res.notified).toBe(1)
    expect(notifiedUsers()).toEqual(["p-des"])
  })

  it("changes_requested: notifica os designers (estrutura volta pra eles)", async () => {
    seedMember("m-des1", "p-des1", "designer")
    seedMember("m-des2", "p-des2", "designer")
    seedMember("m-coo", "p-coo", "coo")
    const res = await notifyCampaignDesignStage({
      suggestionId: "sug1",
      orgId: ORG,
      stageSlug: "estrutura",
      event: "changes_requested",
    })
    expect(res.notified).toBe(2)
    expect(notifiedUsers()).toEqual(["p-des1", "p-des2"])
  })

  it("nenhum membro com a funcao: notified=0, sem inserts", async () => {
    seedMember("m-coo", "p-coo", "coo")
    const res = await notifyCampaignDesignStage({
      suggestionId: "sug1",
      orgId: ORG,
      stageSlug: "producao",
      event: "entered",
    })
    expect(res.notified).toBe(0)
    expect(h.db.notifications).toHaveLength(0)
  })

  it("cada notificacao referencia a campanha no metadata/link", async () => {
    seedMember("m-coo", "p-coo", "coo")
    await notifyCampaignDesignStage({
      suggestionId: "sug-abc",
      orgId: ORG,
      stageSlug: "aprovacao",
      event: "entered",
    })
    const n = h.db.notifications[0]
    expect(n).toBeTruthy()
    const meta = (n.metadata ?? {}) as Record<string, unknown>
    const refsCampaign =
      meta.suggestion_id === "sug-abc" ||
      String(n.link ?? "").includes("sug-abc")
    expect(refsCampaign).toBe(true)
  })
})
