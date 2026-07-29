import { describe, it, expect, beforeEach, vi } from "vitest"

/**
 * Testa a derivacao de status/URL do link a partir das linhas de
 * `onboardings`. O supabase e mockado por um builder minimo que registra
 * os filtros aplicados e devolve fixtures.
 */

interface OnboardingFixture {
  id: string
  store_id: string
  form_token: string | null
  form_token_expires_at: string | null
  briefing_status: string | null
  status: string | null
  created_at: string
}

let onboardings: OnboardingFixture[] = []

function buildOnboardingsQuery() {
  const filters: Record<string, unknown> = {}
  let sortDesc = false

  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return q
    },
    in: (col: string, vals: unknown[]) => {
      filters[`${col}__in`] = vals
      return q
    },
    order: (_col: string, opts?: { ascending?: boolean }) => {
      sortDesc = opts?.ascending === false
      return q
    },
    limit: () => q,
    rows() {
      let out = onboardings.filter((row) =>
        Object.entries(filters).every(([col, val]) => {
          if (col.endsWith("__in")) {
            return (val as unknown[]).includes(
              row[col.replace("__in", "") as keyof OnboardingFixture],
            )
          }
          return row[col as keyof OnboardingFixture] === val
        }),
      )
      if (sortDesc) {
        out = [...out].sort((a, b) => b.created_at.localeCompare(a.created_at))
      }
      return out
    },
    maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
    single: async () => ({ data: q.rows()[0] ?? null, error: null }),
    then: undefined,
  }
  return q
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "onboardings") return buildOnboardingsQuery()
      throw new Error(`tabela inesperada no teste: ${table}`)
    },
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

// createOnboarding nao e exercitado aqui — evita puxar o pipeline inteiro.
vi.mock("../onboarding-pipeline.service", () => ({
  createOnboarding: vi.fn(),
}))

import { getFormLinkByStore } from "../onboarding-form-link.service"

const FUTURE = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

beforeEach(() => {
  onboardings = []
  process.env.NEXT_PUBLIC_APP_URL = "https://app.exemplo.com"
})

describe("getFormLinkByStore", () => {
  it("devolve status none quando a loja nao tem onboarding", async () => {
    const link = await getFormLinkByStore("store-1")
    expect(link.status).toBe("none")
    expect(link.url).toBeNull()
    expect(link.token).toBeNull()
    // Sem link, o cliente por definicao ainda nao respondeu.
    expect(link.awaiting_response).toBe(true)
  })

  it("monta a URL e marca active com token no prazo", async () => {
    onboardings = [
      {
        id: "onb-1",
        store_id: "store-1",
        form_token: "tok123",
        form_token_expires_at: FUTURE,
        briefing_status: "not_started",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.status).toBe("active")
    expect(link.url).toBe("https://app.exemplo.com/form/tok123")
    expect(link.onboarding_id).toBe("onb-1")
    expect(link.awaiting_response).toBe(true)
  })

  it("marca expired quando passou de form_token_expires_at", async () => {
    onboardings = [
      {
        id: "onb-1",
        store_id: "store-1",
        form_token: "tok123",
        form_token_expires_at: PAST,
        briefing_status: "not_started",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.status).toBe("expired")
    // A URL segue montada — util pra mostrar o que foi enviado antes.
    expect(link.url).toBe("https://app.exemplo.com/form/tok123")
  })

  it("trata expires_at nulo como sem vencimento", async () => {
    onboardings = [
      {
        id: "onb-1",
        store_id: "store-1",
        form_token: "tok123",
        form_token_expires_at: null,
        briefing_status: "approved",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.status).toBe("active")
  })

  it("considera respondido quando o briefing saiu de not_started/parcial", async () => {
    onboardings = [
      {
        id: "onb-1",
        store_id: "store-1",
        form_token: "tok123",
        form_token_expires_at: FUTURE,
        briefing_status: "approved",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.awaiting_response).toBe(false)
  })

  it("form_partially_filled ainda conta como aguardando resposta", async () => {
    onboardings = [
      {
        id: "onb-1",
        store_id: "store-1",
        form_token: "tok123",
        form_token_expires_at: FUTURE,
        briefing_status: "form_partially_filled",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.awaiting_response).toBe(true)
  })

  it("sem onboarding ativo, cai no mais recente em vez de 'sem link'", async () => {
    onboardings = [
      {
        id: "onb-antigo",
        store_id: "store-1",
        form_token: "antigo",
        form_token_expires_at: FUTURE,
        briefing_status: "approved",
        status: "completed",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "onb-recente",
        store_id: "store-1",
        form_token: "recente",
        form_token_expires_at: FUTURE,
        briefing_status: "approved",
        status: "completed",
        created_at: "2026-06-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.onboarding_id).toBe("onb-recente")
    expect(link.url).toBe("https://app.exemplo.com/form/recente")
  })

  it("o onboarding in_progress vence o mais recente concluido", async () => {
    onboardings = [
      {
        id: "onb-ativo",
        store_id: "store-1",
        form_token: "ativo",
        form_token_expires_at: FUTURE,
        briefing_status: "not_started",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "onb-novo-concluido",
        store_id: "store-1",
        form_token: "concluido",
        form_token_expires_at: FUTURE,
        briefing_status: "approved",
        status: "completed",
        created_at: "2026-06-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.onboarding_id).toBe("onb-ativo")
  })

  it("linha sem form_token vira status none", async () => {
    onboardings = [
      {
        id: "onb-1",
        store_id: "store-1",
        form_token: null,
        form_token_expires_at: null,
        briefing_status: "not_started",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.status).toBe("none")
    expect(link.onboarding_id).toBe("onb-1")
  })

  it("nao vaza link de outra loja", async () => {
    onboardings = [
      {
        id: "onb-1",
        store_id: "store-OUTRA",
        form_token: "tok123",
        form_token_expires_at: FUTURE,
        briefing_status: "not_started",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const link = await getFormLinkByStore("store-1")
    expect(link.status).toBe("none")
  })
})
