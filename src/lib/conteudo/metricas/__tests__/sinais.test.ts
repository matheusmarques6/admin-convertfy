import { describe, expect, it } from "vitest"

import {
  colunasDeInsight,
  contraMercado,
  MEDIANAS_DE_MERCADO,
  porAlcance,
  segundosDeWatchTime,
  sinaisDoPeriodo,
  taxaDeEngajamento,
  SETS_REELS,
  SETS_VIDEO_FEED,
  SETS_FEED,
  conjuntosDeInsight,
  escadaPede,
} from "../sinais"

describe("porAlcance — os três sinais de ranking", () => {
  it("calcula a razão em percentual", () => {
    expect(porAlcance(30, 1000)).toBeCloseTo(3)
  })

  it("sem alcance devolve null, NUNCA zero", () => {
    expect(porAlcance(30, 0)).toBeNull()
    expect(porAlcance(30, null)).toBeNull()
    expect(porAlcance(30, undefined)).toBeNull()
  })

  it("parte ausente é ausência, não zero", () => {
    expect(porAlcance(null, 1000)).toBeNull()
  })

  it("zero medido continua sendo zero", () => {
    expect(porAlcance(0, 1000)).toBe(0)
  })
})

describe("segundosDeWatchTime", () => {
  it("converte milissegundos em segundos — a armadilha documentada da API", () => {
    expect(segundosDeWatchTime(8400)).toBe(8.4)
  })

  it("ausente, negativo ou não finito viram null", () => {
    expect(segundosDeWatchTime(null)).toBeNull()
    expect(segundosDeWatchTime(undefined)).toBeNull()
    expect(segundosDeWatchTime(-1)).toBeNull()
    expect(segundosDeWatchTime(Number.NaN)).toBeNull()
  })

  it("zero medido sobrevive", () => {
    expect(segundosDeWatchTime(0)).toBe(0)
  })
})

describe("taxaDeEngajamento", () => {
  it("usa a fórmula completa quando há compartilhamentos e salvos", () => {
    const t = taxaDeEngajamento(
      { curtidas: 40, comentarios: 5, compartilhamentos: 4, salvos: 1 },
      1000,
    )
    expect(t.valor).toBeCloseTo(5)
    expect(t.completa).toBe(true)
    expect(t.formula).toContain("compartilhamentos")
  })

  it("marca numerador PARCIAL quando é concorrente", () => {
    const t = taxaDeEngajamento({ curtidas: 40, comentarios: 5 }, 1000)
    expect(t.valor).toBeCloseTo(4.5)
    expect(t.completa).toBe(false)
    expect(t.formula).not.toContain("salvos")
  })

  it("sem seguidores não há taxa — e a fórmula continua sendo dita", () => {
    const t = taxaDeEngajamento({ curtidas: 40, comentarios: 5 }, 0)
    expect(t.valor).toBeNull()
    expect(t.formula).toBeTruthy()
  })
})

describe("colunasDeInsight", () => {
  it("traduz ig_reels_avg_watch_time para a coluna", () => {
    const c = colunasDeInsight({ reach: 10, ig_reels_avg_watch_time: 8400 })
    expect(c.avg_watch_time_ms).toBe(8400)
    expect(c.reach).toBe(10)
  })

  it("toda coluna existe mesmo com a API devolvendo pouco — nada some na fronteira", () => {
    const c = colunasDeInsight({})
    expect(Object.keys(c).sort()).toEqual(
      [
        "avg_watch_time_ms",
        "follows",
        "profile_visits",
        "reach",
        "saved",
        "shares",
        "total_interactions",
        "views",
      ].sort(),
    )
    expect(Object.values(c).every((v) => v === null)).toBe(true)
  })
})

describe("contraMercado", () => {
  it("compara com as duas medianas publicadas, nomeadas", () => {
    const r = contraMercado(1)
    expect(r).toHaveLength(MEDIANAS_DE_MERCADO.length)
    expect(r?.map((x) => x.fonte)).toEqual(["Rival IQ", "Socialinsider"])
    expect(r?.[0].diferenca).toBeCloseTo(0.7)
  })

  it("sem taxa não afirma nada sobre o mercado", () => {
    expect(contraMercado(null)).toBeNull()
  })
})

describe("sinaisDoPeriodo", () => {
  const p = (alc: number | null, sh: number | null, curtidas: number | null, watchTimeS: number | null = null) =>
    ({ alc, sh, curtidas, watchTimeS })

  it("razão é soma ÷ soma, não média das razões", () => {
    // 10/50 = 20% e 10/5000 = 0,2%. A média das razões daria 10,1%;
    // a conta certa é 20/5050 = 0,396%.
    const s = sinaisDoPeriodo([p(50, 10, 0), p(5000, 10, 0)])
    expect(s.sendsPorAlcance).toBeCloseTo(0.396, 2)
  })

  it("sem alcance no período não há razão", () => {
    const s = sinaisDoPeriodo([p(null, 10, 5), p(0, 3, 2)])
    expect(s.sendsPorAlcance).toBeNull()
    expect(s.curtidasPorAlcance).toBeNull()
    expect(s.postsComAlcance).toBe(0)
  })

  it("watch time é média POR PEÇA e ignora quem não tem a métrica", () => {
    const s = sinaisDoPeriodo([p(100, 1, 1, 10), p(100, 1, 1, 20), p(100, 1, 1, null)])
    expect(s.watchTimeMedioS).toBe(15)
    expect(s.postsComWatchTime).toBe(2)
  })

  it("sem nenhum watch time devolve null, não zero", () => {
    const s = sinaisDoPeriodo([p(100, 1, 1, null)])
    expect(s.watchTimeMedioS).toBeNull()
    expect(s.postsComWatchTime).toBe(0)
  })

  it("lista vazia não quebra", () => {
    expect(sinaisDoPeriodo([])).toEqual({
      sendsPorAlcance: null,
      curtidasPorAlcance: null,
      watchTimeMedioS: null,
      postsComWatchTime: 0,
      postsComAlcance: 0,
    })
  })
})

describe("escada de insights (medida na Graph API em 11/09)", () => {
  it("reel NUNCA pede follows nem profile_visits — a Meta recusa o conjunto inteiro", () => {
    // (#100) "does not support the follows metric for this media product
    // type", inclusive pedindo follows sozinho. Um degrau que os inclui é
    // um degrau que sempre cai.
    for (const set of SETS_REELS) {
      expect(set).not.toContain("follows")
      expect(set).not.toContain("profile_visits")
    }
  })

  it("watch time anda em DOIS degraus — no topo só, ele nunca seria coletado", () => {
    const comWatch = SETS_REELS.filter((s) => s.includes("ig_reels_avg_watch_time"))
    expect(comWatch.length).toBeGreaterThanOrEqual(2)
    // e os dois primeiros, para sobreviver a uma queda de um degrau
    expect(SETS_REELS[0]).toContain("ig_reels_avg_watch_time")
    expect(SETS_REELS[1]).toContain("ig_reels_avg_watch_time")
  })

  it("toda escada termina num degrau mínimo que a Meta sempre serve", () => {
    for (const escada of [SETS_REELS, SETS_VIDEO_FEED, SETS_FEED]) {
      expect(escada[escada.length - 1]).toEqual(["reach", "saved"])
    }
  })

  it("degrau nunca cresce ao descer a escada", () => {
    for (const escada of [SETS_REELS, SETS_VIDEO_FEED, SETS_FEED]) {
      for (let i = 1; i < escada.length; i++) {
        expect(escada[i].length).toBeLessThanOrEqual(escada[i - 1].length)
      }
    }
  })

  it("o product type decide antes do media type", () => {
    expect(conjuntosDeInsight("VIDEO", "REELS")).toBe(SETS_REELS)
    expect(conjuntosDeInsight("VIDEO", "FEED")).toBe(SETS_VIDEO_FEED)
    expect(conjuntosDeInsight("IMAGE", null)).toBe(SETS_FEED)
    expect(conjuntosDeInsight("CAROUSEL_ALBUM", "FEED")).toBe(SETS_FEED)
    // vídeo sem product type: hoje todo vídeo da base é reel, e pedir
    // follows garantiria a queda do degrau que carrega o watch time.
    expect(conjuntosDeInsight("VIDEO", null)).toBe(SETS_REELS)
  })

  it("watch time é pedido para reel e NÃO para imagem", () => {
    expect(escadaPede(conjuntosDeInsight("VIDEO", "REELS"), "ig_reels_avg_watch_time")).toBe(true)
    expect(escadaPede(conjuntosDeInsight("IMAGE", "FEED"), "ig_reels_avg_watch_time")).toBe(false)
  })

  it("a unidade que a própria Meta declara é milissegundo", () => {
    // Título devolvido pela API: "Tempo médio de visualização de reels
    // (milissegundos)"; valor medido 13212 = 13,2 s num reel curto.
    expect(segundosDeWatchTime(13212)).toBeCloseTo(13.212, 3)
  })
})
