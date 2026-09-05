import { describe, expect, it } from "vitest"
import {
  atribuirLeads,
  comprimirSerie,
  contarComentariosChave,
  deltaPct,
  diasEntre,
  estagioDaThread,
  formatoDaMidia,
  headDaLegenda,
  inicioDaSemana,
  janelaAnterior,
  mediaParaPost,
  montarCadencia,
  montarFunil,
  montarKpis,
  montarPilarMix,
  seriePorDia,
  serieSeguidores,
  totais,
  type ComentarioRow,
  type MediaRow,
  type ThreadRow,
} from "./agregacao"
import type { Perfil } from "../types"

const media = (over: Partial<MediaRow> = {}): MediaRow => ({
  channel_id: "c1",
  media_id: "m1",
  media_type: "CAROUSEL_ALBUM",
  media_product_type: "FEED",
  caption: "8% dos clientes fazem 41% do faturamento\n\ne a maioria trata igual #email",
  permalink: "https://instagram.com/p/x",
  media_url: null,
  thumbnail_url: "https://cdn/x.jpg",
  published_at: "2026-09-02T15:00:00Z",
  children_count: 7,
  like_count: 100,
  comments_count: 12,
  reach: 5000,
  saved: 40,
  shares: 10,
  follows: 6,
  profile_visits: 30,
  total_interactions: 162,
  views: null,
  pilar: "Case",
  molde: "Turbo",
  palavra_chave: "8%",
  documento_id: null,
  ...over,
})

describe("datas", () => {
  it("diasEntre inclui as duas pontas e janelaAnterior tem o mesmo tamanho", () => {
    expect(diasEntre("2026-09-01", "2026-09-03")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"])
    expect(janelaAnterior("2026-09-01", "2026-09-03")).toEqual({ start: "2026-08-29", end: "2026-08-31" })
    expect(diasEntre("2026-09-03", "2026-09-01")).toEqual([])
  })
  it("inicioDaSemana devolve a segunda-feira", () => {
    expect(inicioDaSemana("2026-09-05")).toBe("2026-08-31") // sábado → segunda
    expect(inicioDaSemana("2026-08-31")).toBe("2026-08-31")
  })
})

describe("formatação", () => {
  it("deltaPct usa vírgula e sinal; null sem base", () => {
    expect(deltaPct(106, 100)).toBe("+6,0%")
    expect(deltaPct(90, 100)).toBe("−10,0%")
    expect(deltaPct(10, 0)).toBeNull()
    expect(deltaPct(null, 10)).toBeNull()
  })
  it("headDaLegenda pega a primeira linha útil e ignora hashtags", () => {
    expect(headDaLegenda("#promo\nTítulo real\ncorpo", "x")).toBe("Título real")
    expect(headDaLegenda(null, "Sem legenda")).toBe("Sem legenda")
    expect(headDaLegenda("a".repeat(200), "x").length).toBeLessThanOrEqual(120)
  })
  it("formatoDaMidia mapeia os tipos da Graph API", () => {
    expect(formatoDaMidia("CAROUSEL_ALBUM", "FEED")).toBe("Carrossel")
    expect(formatoDaMidia("VIDEO", "REELS")).toBe("Reels")
    expect(formatoDaMidia("IMAGE", "FEED")).toBe("Imagem")
  })
  it("comprimirSerie soma blocos até 10 pontos", () => {
    expect(comprimirSerie([1, 1, 1, 1], 10)).toEqual([1, 1, 1, 1])
    expect(comprimirSerie(Array.from({ length: 30 }, () => 1), 10)).toEqual(Array.from({ length: 10 }, () => 3))
  })
})

describe("mediaParaPost", () => {
  it("converte a linha e preserva null onde não há insight", () => {
    const p = mediaParaPost(media({ reach: null, molde: "Inventado" }), 3)
    expect(p.head).toBe("8% dos clientes fazem 41% do faturamento")
    expect(p.fmt).toBe("Carrossel")
    expect(p.slides).toBe(7)
    expect(p.alc).toBeNull()
    expect(p.molde).toBeNull()
    expect(p.pilar).toBe("Case")
    expect(p.leads).toBe(3)
    expect(p.data).toBe("02/09")
  })
})

describe("atribuirLeads", () => {
  const coment = (over: Partial<ComentarioRow>): ComentarioRow => ({
    media_id: "m1",
    sender_id: "u1",
    sender_username: "renata",
    body: "8%",
    created_at: "2026-09-02T16:00:00Z",
    ...over,
  })
  const thread = (over: Partial<ThreadRow>): ThreadRow => ({
    id: "t1",
    channel_id: "c1",
    contact_external_id: "u1",
    contact_name: "renata",
    contact_avatar_url: null,
    created_at: "2026-09-02T17:00:00Z",
    last_message_at: "2026-09-02T17:00:00Z",
    lead_id: null,
    deal_id: null,
    client_id: null,
    ...over,
  })

  it("comentou e depois mandou direct → lead do post", () => {
    const a = atribuirLeads([coment({})], [thread({})])
    expect(a.porThread.get("t1")).toBe("m1")
    expect(a.porMidia.get("m1")?.length).toBe(1)
  })
  it("casa pelo username quando o id não bate", () => {
    const a = atribuirLeads([coment({ sender_id: "outro" })], [thread({ contact_external_id: "igsid-9", contact_name: "Renata" })])
    expect(a.porThread.get("t1")).toBe("m1")
  })
  it("direct ANTES do comentário ou fora de 14 dias não conta; o comentário mais recente vence", () => {
    expect(atribuirLeads([coment({ created_at: "2026-09-03T10:00:00Z" })], [thread({})]).porThread.size).toBe(0)
    expect(atribuirLeads([coment({ created_at: "2026-08-01T10:00:00Z" })], [thread({})]).porThread.size).toBe(0)
    const a = atribuirLeads([coment({ media_id: "velho", created_at: "2026-09-01T10:00:00Z" }), coment({ media_id: "novo", created_at: "2026-09-02T12:00:00Z" })], [thread({})])
    expect(a.porThread.get("t1")).toBe("novo")
  })
  it("threads de comentários (comment:) nunca são leads", () => {
    const a = atribuirLeads([coment({})], [thread({ contact_external_id: "comment:m1" })])
    expect(a.porThread.size).toBe(0)
  })
  it("estagioDaThread segue negócio > cliente > lead > conversa", () => {
    const deals = new Map([["d1", { id: "d1", lead_id: null, status: "won", value: 1000, created_at: "", won_at: "", source: null }]])
    expect(estagioDaThread(thread({ deal_id: "d1" }), deals)).toBe("Cliente fechado")
    expect(estagioDaThread(thread({ client_id: "c" }), deals)).toBe("Cliente")
    expect(estagioDaThread(thread({ lead_id: "l" }), deals)).toBe("Lead no CRM")
    expect(estagioDaThread(thread({}), deals)).toBe("Conversa no direct")
  })
})

describe("seguidores e séries", () => {
  it("serieSeguidores soma canais com carry-forward e null antes do 1º snapshot", () => {
    const s = serieSeguidores(
      [
        { channel_id: "a", history: [{ day: "2026-09-02", followers: 100, follows: null, media: null }, { day: "2026-09-04", followers: 110, follows: null, media: null }] },
        { channel_id: "b", history: [{ day: "2026-09-03", followers: 50, follows: null, media: null }] },
      ],
      diasEntre("2026-09-01", "2026-09-04"),
    )
    expect(s.valores).toEqual([null, 100, 150, 160])
  })
  it("seriePorDia soma por dia local de publicação", () => {
    const p = mediaParaPost(media({ published_at: "2026-09-02T02:00:00Z" }), 0) // 01/09 23h em SP
    const s = seriePorDia([p], diasEntre("2026-09-01", "2026-09-02"), (x) => x.alc)
    expect(s).toEqual([5000, 0])
  })
})

describe("totais, kpis, funil, mix", () => {
  const posts = [mediaParaPost(media({}), 2), mediaParaPost(media({ media_id: "m2", reach: null, saved: null, pilar: null, published_at: "2026-09-03T12:00:00Z" }), 1)]

  it("totais prefere alcance da conta e soma leads/receita", () => {
    const t = totais(posts, [{ channel_id: "c1", day: "2026-09-02", reach: 9000, profile_views: 10, follower_count: null }], [
      { id: "d", lead_id: null, status: "won", value: 1500, created_at: "", won_at: "", source: null },
    ])
    expect(t.alcance).toBe(9000)
    expect(t.alcanceFonte).toBe("conta")
    expect(t.leads).toBe(3)
    expect(t.receita).toBe(1500)
    expect(totais(posts, [], []).alcance).toBe(5000)
    expect(totais(posts, [], []).alcanceFonte).toBe("posts")
  })

  it("montarKpis devolve 6 KPIs com '—' onde falta dado", () => {
    const dias = diasEntre("2026-09-01", "2026-09-05")
    const atual = totais(posts, [], [])
    const k = montarKpis({
      dias,
      seguidoresFim: null,
      seguidoresInicio: null,
      serieSeg: serieSeguidores([], dias),
      atual,
      anterior: { ...atual, alcance: 4000, leads: 2, receita: 0 },
      posts,
      receitaSerie: dias.map(() => 0),
    })
    expect(k).toHaveLength(6)
    expect(k[0].valor).toBe("—")
    expect(k[1].delta).toBe("+25,0%")
    expect(k[4].valor).toBe("3")
    expect(k[5].valor).toBe("R$ 0")
    expect(k[5].delta).toBeNull()
  })

  it("montarFunil marca webhook sem eventos e insights indisponíveis", () => {
    const f = montarFunil({ alcance: null, visitasPerfil: 12, comentariosChave: 0, comentariosWebhook: 0, comentariosGraph: 12, conversas: 3, negocios: 1, clientes: 0 })
    expect(f[0].valor).toBeNull()
    expect(f[2].valor).toBeNull()
    expect(f[2].nota).toMatch(/webhook/)
    expect(f[3].valor).toBe(3)
  })

  it("contarComentariosChave é case-insensitive e ignora post sem palavra", () => {
    const n = contarComentariosChave(
      [
        { media_id: "m1", sender_id: null, sender_username: null, body: "quero o 8%", created_at: "" },
        { media_id: "m1", sender_id: null, sender_username: null, body: "lindo", created_at: "" },
        { media_id: "m2", sender_id: null, sender_username: null, body: "8%", created_at: "" },
      ],
      new Map([["m1", "8%"], ["m2", null]]),
    )
    expect(n).toBe(1)
  })

  it("montarPilarMix conta só classificados e informa os sem pilar", () => {
    const m = montarPilarMix(posts)
    expect(m.classificados).toBe(1)
    expect(m.semClassificacao).toBe(1)
    expect(m.real.Case).toBe(100)
    expect(m.alvo.Case).toBe(50)
  })

  it("montarCadencia conta a semana corrente por perfil", () => {
    const perfis: Perfil[] = [{ id: "c1", nome: "A", handle: null, cor: "#000", avatar: null, canal: "instagram", ativo: true, metaSemanal: 3, seguidores: null, erro: null }]
    expect(montarCadencia(posts, perfis, "2026-09-05")[0]).toEqual({ perfil: "c1", feitos: 2, meta: 3 })
    expect(montarCadencia(posts, perfis, "2026-09-12")[0].feitos).toBe(0)
  })
})
