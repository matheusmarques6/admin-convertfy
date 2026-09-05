/**
 * Integração do Dashboard Social com um Supabase FALSO.
 *
 * Cobre o que o TypeScript não vê: a montagem inteira do payload a partir das
 * linhas que as queries devolvem (mídias, série diária, threads, mensagens de
 * comentário, negócios, agenda) e o comportamento quando uma fonte falha —
 * é o caminho em que "número errado sem aviso" nasce.
 */

import { describe, expect, it, vi } from "vitest"
import { carregarDashboard, normalizarPeriodo } from "./conteudo-dashboard.service"

vi.mock("./conteudo-perfis.service", async () => {
  const real = await vi.importActual<typeof import("./conteudo-perfis.service")>("./conteudo-perfis.service")
  return {
    ...real,
    // Sem rede: os canais entram como estão (o refresh da Graph API é testado à parte).
    loadPerfis: vi.fn(async (_admin: unknown, _org: string) => ({
      channels: canaisFake,
      perfis: canaisFake.map((c, i) => real.perfilDoCanal(c, i)),
    })),
  }
})

vi.mock("./conteudo-instagram-sync.service", async () => {
  const real = await vi.importActual<typeof import("./conteudo-instagram-sync.service")>("./conteudo-instagram-sync.service")
  return { ...real, ensureChannelsSynced: vi.fn(async () => []), fetchVisitasPerfil: vi.fn(async () => ({ ok: true as const, data: 120 })) }
})

const CANAL = "11111111-1111-1111-1111-111111111111"
const ORG = "22222222-2222-2222-2222-222222222222"

const canaisFake = [
  {
    id: CANAL,
    org_id: ORG,
    type: "instagram",
    display_name: "@marca",
    external_id: "1784100",
    is_active: true,
    config: {
      conteudo: {
        profile: { username: "marca", name: "Marca", picture_url: null, followers: 1000, fetched_at: new Date().toISOString() },
        last_media_sync_at: "2026-09-05T09:00:00Z",
      },
      follower_history: [
        { day: "2026-09-01", followers: 900, follows: null, media: null },
        { day: "2026-09-05", followers: 1000, follows: null, media: null },
      ],
    } as Record<string, unknown>,
  },
]

// ── Supabase falso ──────────────────────────────────────────────────────

type Linhas = Record<string, unknown>[]

/**
 * Builder thenable que aceita a cadeia inteira do supabase-js e devolve as
 * linhas registradas para a tabela. `erros` força a falha de uma tabela.
 */
function fakeAdmin(tabelas: Record<string, Linhas>, erros: Record<string, string> = {}) {
  const chamadas: string[] = []
  const builder = (tabela: string) => {
    const b: Record<string, unknown> = {}
    const encadeia = () => b
    for (const m of ["select", "eq", "neq", "in", "gte", "lte", "or", "not", "order", "limit", "returns", "update", "upsert", "insert", "delete", "single", "maybeSingle"]) {
      b[m] = vi.fn(() => encadeia())
    }
    b.then = (resolve: (v: { data: Linhas | null; error: { message: string } | null }) => unknown) =>
      Promise.resolve(erros[tabela] ? { data: null, error: { message: erros[tabela] } } : { data: tabelas[tabela] ?? [], error: null }).then(resolve)
    return b
  }
  return {
    from: vi.fn((t: string) => {
      chamadas.push(t)
      return builder(t)
    }),
    chamadas,
  } as never
}

const midia = (over: Record<string, unknown> = {}) => ({
  channel_id: CANAL,
  media_id: "m1",
  media_type: "CAROUSEL_ALBUM",
  media_product_type: "FEED",
  caption: "Como dobrar a receita de e-mail",
  permalink: "https://instagram.com/p/1",
  media_url: null,
  thumbnail_url: "https://cdn/1.jpg",
  published_at: "2026-09-02T15:00:00Z",
  children_count: 8,
  like_count: 90,
  comments_count: 12,
  reach: 5000,
  saved: 40,
  shares: 10,
  follows: 7,
  profile_visits: 25,
  total_interactions: 152,
  views: null,
  pilar: "Case",
  molde: "Turbo",
  palavra_chave: "8%",
  documento_id: null,
  documento: null,
  ...over,
})

const baseTabelas = () => ({
  conteudo_ig_media: [midia()],
  conteudo_ig_daily: [{ channel_id: CANAL, day: "2026-09-02", reach: 9000, profile_views: 30, follower_count: 1000 }],
  crm_threads: [
    { id: "t-com", channel_id: CANAL, contact_external_id: "comment:m1", contact_name: null, contact_avatar_url: null, created_at: "2026-09-02T16:00:00Z", last_message_at: "2026-09-02T16:00:00Z", lead_id: null, deal_id: null, client_id: null },
    { id: "t-dm", channel_id: CANAL, contact_external_id: "u-9", contact_name: "renata", contact_avatar_url: null, created_at: "2026-09-02T18:00:00Z", last_message_at: "2026-09-02T18:00:00Z", lead_id: null, deal_id: "d1", client_id: null },
  ],
  crm_messages: [{ thread_id: "t-com", body: "quero o 8%", created_at: "2026-09-02T16:00:00Z", metadata: { media_id: "m1", sender_id: "u-9", sender_username: "renata" } }],
  pipelines: [{ id: "p1" }],
  deals: [{ id: "d1", lead_id: null, status: "won", value: 3000, created_at: "2026-09-02T19:00:00Z", won_at: "2026-09-04T10:00:00Z", source: "inbox:instagram", stage: { name: "Ganho" } }],
  conteudo_agenda: [{ id: "a1", documento_id: "doc1", channel_id: CANAL, data: "2026-09-30", hora: "11:30:00", documento: { nome: "Próximo carrossel", status: "agendado" } }],
})

const PERIODO = { start: "2026-09-01", end: "2026-09-05" }

describe("normalizarPeriodo", () => {
  it("aceita a janela pedida e rejeita data inválida ou invertida", () => {
    expect(normalizarPeriodo("2026-09-01", "2026-09-05")).toEqual(PERIODO)
    expect(normalizarPeriodo("xx", "2026-09-05").start).toBe("2026-08-07")
    expect(normalizarPeriodo("2026-09-30", "2026-09-05").start).toBe("2026-08-07")
  })
})

describe("carregarDashboard", () => {
  it("monta KPIs, funil, leads e receita a partir das linhas reais", async () => {
    const admin = fakeAdmin(baseTabelas())
    const d = await carregarDashboard(admin, ORG, { ...PERIODO, syncBudgetMs: 0 })

    expect(d.perfis).toHaveLength(1)
    expect(d.posts).toHaveLength(1)
    // o contato comentou "8%" e depois abriu direct: é lead do post
    expect(d.posts[0].leads).toBe(1)
    expect(d.posts[0].head).toBe("Como dobrar a receita de e-mail")

    const porLabel = Object.fromEntries(d.kpis.map((k) => [k.label, k]))
    expect(porLabel["Seguidores"].valor).toBe("1.000")
    expect(porLabel["Alcance"].valor).toBe("9.000") // insights da conta vencem a soma dos posts
    expect(porLabel["Alcance"].nota).toContain("insights da conta")
    expect(porLabel["Leads do conteúdo"].valor).toBe("1")
    expect(porLabel["Receita atribuída"].valor).toBe("R$ 3.000")

    const funil = Object.fromEntries(d.funil.map((e) => [e.label, e.valor]))
    expect(funil["Alcance"]).toBe(9000)
    expect(funil["Comentários com palavra-chave"]).toBe(1)
    expect(funil["Conversas no direct"]).toBe(1)
    expect(funil["Clientes fechados"]).toBe(1)

    expect(d.derivados.ticketMedio).toBe(3000)
    expect(d.pilarMix.classificados).toBe(1)
    expect(d.agendados[0].hora).toBe("11:30")
    expect(d.avisos).toEqual([])
  })

  it("sem canal conectado devolve payload vazio com aviso, não zeros silenciosos", async () => {
    const { loadPerfis } = await import("./conteudo-perfis.service")
    vi.mocked(loadPerfis).mockResolvedValueOnce({ channels: [], perfis: [] })
    const d = await carregarDashboard(fakeAdmin({}), ORG, { ...PERIODO, syncBudgetMs: 0 })
    expect(d.posts).toEqual([])
    expect(d.kpis).toEqual([])
    expect(d.avisos[0]).toContain("Nenhum canal Instagram conectado")
  })

  it("falha ao ler negócios vira AVISO — receita zero nunca passa como fato", async () => {
    const admin = fakeAdmin(baseTabelas(), { pipelines: "column does not exist" })
    const d = await carregarDashboard(admin, ORG, { ...PERIODO, syncBudgetMs: 0 })
    expect(d.avisos.some((a) => a.includes("Negócios não puderam ser lidos"))).toBe(true)
    expect(d.derivados.receita).toBe(0)
    expect(d.derivados.ticketMedio).toBeNull()
  })

  it("post sem insight mantém null (e o alcance cai para a soma dos posts)", async () => {
    const t = baseTabelas()
    t.conteudo_ig_media = [midia({ reach: null, saved: null, follows: null, total_interactions: null })]
    t.conteudo_ig_daily = []
    const d = await carregarDashboard(fakeAdmin(t), ORG, { ...PERIODO, syncBudgetMs: 0 })
    expect(d.posts[0].alc).toBeNull()
    const alc = d.kpis.find((k) => k.label === "Alcance")!
    expect(alc.valor).toBe("—")
    expect(d.derivados.alcanceParaLead).toBeNull()
  })

  it("mídia fora da janela não entra nos posts do período", async () => {
    const t = baseTabelas()
    t.conteudo_ig_media = [midia({ media_id: "antigo", published_at: "2026-08-20T12:00:00Z" })]
    const d = await carregarDashboard(fakeAdmin(t), ORG, { ...PERIODO, syncBudgetMs: 0 })
    expect(d.posts).toHaveLength(0)
    expect(d.derivados.postsPublicados).toBe(0)
  })
})
