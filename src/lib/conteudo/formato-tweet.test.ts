import { describe, expect, it } from "vitest"
import {
  CONTADORES,
  FATOR_DO_EMBED,
  LARGURA_DO_CARTAO,
  LARGURA_DO_EMBED,
  TWEET,
  camposTweet,
  carimboDeAgora,
  contadoresDoTweet,
  doEmbed,
  infoDoTweet,
  limiteTweet,
  mostrarInfo,
  mostrarMetricas,
} from "./formato-tweet"
import { FAMILIAS, aplicarFamilia } from "./familias"
import { camposOpcionaisDaPeca } from "./campos"
import { novoDocumento } from "./documento"
import { getTemplate } from "./templates"

describe("medidas do cartão do X", () => {
  it("todas saem da especificação do embed, pelo mesmo fator", () => {
    expect(FATOR_DO_EMBED).toBeCloseTo(LARGURA_DO_CARTAO / LARGURA_DO_EMBED, 6)
    // Os números da tabela do módulo, conferidos um a um contra o CSS do
    // `react-tweet` (550 px de largura).
    expect(doEmbed(48)).toBe(TWEET.avatar)
    expect(doEmbed(20)).toBe(TWEET.texto)
    expect(doEmbed(15)).toBe(TWEET.cabecalho)
    expect(doEmbed(23.75)).toBe(TWEET.logo)
    expect(doEmbed(12)).toBe(TWEET.raioCartao)
  })

  it("as entrelinhas são a razão do embed, não um número redondo", () => {
    expect(TWEET.textoEntrelinha).toBeCloseTo(24 / 20, 6)
    expect(TWEET.cabecalhoEntrelinha).toBeCloseTo(20 / 15, 6)
  })

  it("a foto é 16:9 sobre a largura INTERNA — o recuo entra na conta", () => {
    const interna = LARGURA_DO_CARTAO - 2 * TWEET.recuoLateral
    expect(TWEET.alturaImagem).toBe(Math.round((interna * 9) / 16))
  })

  it("o cartão cabe no canvas com folga dos dois lados", () => {
    expect(TWEET.margemDoSlide * 2 + LARGURA_DO_CARTAO).toBe(1080)
    expect(TWEET.margemDoSlide).toBeGreaterThan(0)
  })
})

describe("contadores", () => {
  it("nenhum nasce preenchido — a barra sai só com os ícones", () => {
    const linhas = contadoresDoTweet(undefined)
    expect(linhas).toHaveLength(CONTADORES.length)
    expect(linhas.every((x) => x.valor === "")).toBe(true)
  })

  it("o contador vazio FICA na barra, com valor vazio", () => {
    // Tirá-lo mudaria o espaçamento dos outros: a barra deixaria de ser a
    // do X justamente no slide sem número.
    const linhas = contadoresDoTweet({ curtidas: "8.932" })
    expect(linhas.map((x) => x.chave)).toEqual(CONTADORES)
    expect(linhas.find((x) => x.chave === "respostas")?.valor).toBe("")
  })

  it("a linha é só chave e valor — cor de ícone não é decisão do contador", () => {
    // O rosa do coração no X quer dizer "eu curti", não "tem muita
    // curtida". Pintá-lo ao ver um número conflataria as duas coisas.
    const com = contadoresDoTweet({ curtidas: "8.932", reposts: "2" })
    expect(Object.keys(com[0]).sort()).toEqual(["chave", "valor"])
    expect(com.find((x) => x.chave === "curtidas")?.valor).toBe("8.932")
    expect(contadoresDoTweet({ curtidas: "   " }).find((x) => x.chave === "curtidas")?.valor).toBe("")
  })

  it("a barra aparece por padrão e só some quando desligada", () => {
    expect(mostrarMetricas(undefined)).toBe(true)
    expect(mostrarMetricas({ mostrarMetricas: false })).toBe(false)
  })
})

describe("linha de hora, data e visualizações", () => {
  it("cada pedaço é independente", () => {
    const r = infoDoTweet({ data: "17 de set de 2026" })
    expect(r.data).toBe("17 de set de 2026")
    expect(r.hora).toBe("")
    expect(r.vazia).toBe(false)
  })

  it("nada preenchido ⇒ a linha inteira sai do cartão", () => {
    expect(infoDoTweet(undefined).vazia).toBe(true)
    expect(infoDoTweet({ hora: "  " }).vazia).toBe(true)
    expect(mostrarInfo(undefined)).toBe(false)
    expect(mostrarInfo({ hora: "14:32" })).toBe(true)
    // Desligar vence o conteúdo.
    expect(mostrarInfo({ hora: "14:32", mostrarInfo: false })).toBe(false)
  })

  it("o carimbo de agora é pt-BR e não é aplicado sozinho", () => {
    const c = carimboDeAgora(new Date("2026-09-17T17:32:00Z"))
    expect(c.hora).toMatch(/^\d{2}:\d{2}$/)
    expect(c.data).toMatch(/2026/)
    // A peça recém-criada continua sem carimbo: quem escreve é o operador.
    const d = novoDocumento("x", "", "molde-tweet")
    expect(d.frames.every((f) => f.tweet === undefined)).toBe(true)
  })
})

describe("campos e limites", () => {
  it("o cartão do X desenha dois parágrafos e nenhum botão", () => {
    expect(camposTweet("capa")).toEqual(["titulo", "corpo"])
    expect(camposTweet("cta")).toEqual(["titulo", "corpo"])
    expect(camposTweet("cta")).not.toContain("botao")
  })

  it("o limite é o da plataforma, não o do tipo de slide", () => {
    // 180 + 180 = 360, na ordem dos 280 caracteres de um post do X — e bem
    // acima dos 5 que o tipo `dado` impõe ao título.
    expect(limiteTweet("titulo")).toBe(180)
    expect(limiteTweet("corpo")).toBe(180)
    expect(limiteTweet("gancho")).toBeNull()
  })
})

describe("a identidade no Estúdio", () => {
  it("o molde declara a identidade que pressupõe", () => {
    expect(getTemplate("molde-tweet").familia).toBe("tweet")
  })

  it("todo slide fica no mesmo fundo — o que separa o cartão é a moldura", () => {
    const d = aplicarFamilia(novoDocumento("x", "", "molde-tweet"), "tweet")
    const fundos = new Set(d.frames.map((f) => d.fundoPorFrame[f.frameId]))
    expect(fundos).toEqual(new Set([FAMILIAS.tweet.fundoClaro]))
    // Nenhum "gradiente" sobrevive: o degradê sutil na capa denunciaria
    // que a peça não é uma captura.
    expect(Object.values(d.fundoPorFrame)).not.toContain("gradiente")
  })

  it("a identidade que simula uma rede não oferece campo opcional nenhum", () => {
    // O renderer dela tem UM desenho e não desenha gancho, anotação nem
    // caixa em lugar nenhum — oferecê-los é o campo fantasma do módulo.
    for (const k of ["tweet", "post", "post-largo", "thread"] as const) {
      expect(camposOpcionaisDaPeca("texto", FAMILIAS[k].traco), k).toEqual([])
    }
    expect(camposOpcionaisDaPeca("texto", FAMILIAS.padrao.traco).length).toBeGreaterThan(0)
  })

  it("trocar para o cartão do X preserva a copy da capa da casa", () => {
    const casa = novoDocumento("x", "", "molde-manchete")
    const capa = casa.frames[0]
    const com = {
      ...casa,
      frames: casa.frames.map((f, i) => (i === 0 ? { ...f, textos: { ...f.textos, titulo: "A tese", subtitulo: "o parágrafo de apoio" } } : f)),
    }
    const r = aplicarFamilia(com, "tweet")
    const nova = r.frames[0]
    expect(nova.campos).toEqual(["titulo", "corpo"])
    expect(nova.textos.titulo).toBe("A tese")
    // O subtítulo não some: migra para o campo longo que a identidade tem.
    expect(nova.textos.corpo).toBe("o parágrafo de apoio")
    expect(capa.frameId).toBe(nova.frameId)
  })
})
