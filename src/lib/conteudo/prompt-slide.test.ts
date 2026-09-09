import { describe, expect, it } from "vitest"
import { CORES_PADRAO, GRADIENTE_PADRAO } from "./brand"
import { construirPromptDeSlide, pedeImagem, preenchimento, promptEfetivo, sugerirModo, type ContextoPrompt } from "./prompt-slide"
import type { DocFrame, Documento } from "./types"

const frame = (over: Partial<DocFrame> & { tipo: DocFrame["tipo"] }): DocFrame => ({
  frameId: over.frameId ?? "f1",
  label: "Slide",
  slotsImagem: 0,
  campos: over.tipo === "capa" ? ["titulo", "subtitulo"] : over.tipo === "cta" ? ["titulo", "subtitulo", "botao"] : ["titulo", "corpo"],
  textos: {},
  imagens: {},
  ...over,
})

const doc: ContextoPrompt["doc"] = {
  cores: { ...CORES_PADRAO },
  brandKit: { brandName: "@convertfy", brandName2: "Convertfy", copyright: "© 2026", avatar: "https://x/avatar.png", verificado: true },
  proporcaoExport: "4:5",
  fundoPorFrame: {},
  gradiente: GRADIENTE_PADRAO,
  cta: { mostrar: true, texto: "Comente 41", fundo: "#fff", cor: "#041366" },
  ocultos: {},
}

const ctx = (over: Partial<ContextoPrompt> & { frame: DocFrame }): ContextoPrompt => ({ indice: 1, total: 7, doc, modo: "hibrido", ...over })

describe("preenchimento e sugestão automática", () => {
  it("frame vazio com lugar para imagem pede imagem; cheio não pede", () => {
    const vazio = frame({ tipo: "texto", textos: { titulo: "Curto" } })
    expect(pedeImagem(vazio)).toBe(true)
    const cheio = frame({ tipo: "texto", textos: { titulo: "x".repeat(60), corpo: "y".repeat(170) } })
    expect(preenchimento(cheio)).toBeGreaterThan(0.9)
    expect(pedeImagem(cheio)).toBe(false)
  })

  it("não pede imagem em frame oculto, com imagem, ou sem lugar (dado, CTA)", () => {
    expect(pedeImagem(frame({ tipo: "texto", oculto: true }))).toBe(false)
    expect(pedeImagem(frame({ tipo: "texto", imagens: { slot1: { url: "u", zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 900 } } }))).toBe(false)
    expect(pedeImagem(frame({ tipo: "dado" }))).toBe(false)
    expect(pedeImagem(frame({ tipo: "cta" }))).toBe(false)
  })

  it("preenchimento ignora campo sem limite e não passa de 1", () => {
    const f = frame({ tipo: "dado", campos: ["titulo", "corpo", "botao"], textos: { titulo: "41,5%", corpo: "z".repeat(500), botao: "sem limite em dado" } })
    expect(preenchimento(f)).toBe(1)
    expect(preenchimento(frame({ tipo: "texto", campos: [] }))).toBe(0)
  })

  it("modo sugerido: híbrido onde há lugar; completo em dado e CTA; o gravado vence", () => {
    expect(sugerirModo(frame({ tipo: "texto" }))).toBe("hibrido")
    expect(sugerirModo(frame({ tipo: "capa" }))).toBe("hibrido")
    expect(sugerirModo(frame({ tipo: "dado" }))).toBe("completo")
    expect(sugerirModo(frame({ tipo: "cta" }))).toBe("completo")
    expect(sugerirModo(frame({ tipo: "dado", imagemModo: "hibrido" }))).toBe("hibrido")
  })
})

describe("prompt híbrido", () => {
  const f = frame({ tipo: "texto", textos: { titulo: "8% dos clientes fazem 41%", corpo: "e a maioria trata todo mundo igual" } })

  it("proíbe texto na imagem e cita a copy só como contexto", () => {
    const p = construirPromptDeSlide(ctx({ frame: f }))
    expect(p).toMatch(/NÃO escreva nenhum texto/)
    expect(p).toContain("«8% dos clientes fazem 41%»")
    expect(p).toContain("1080×1350 px")
    expect(p).not.toContain("Barlow")
  })

  it("reserva a área do texto conforme o tipo e a variante", () => {
    expect(construirPromptDeSlide(ctx({ frame: frame({ tipo: "capa" }) }))).toMatch(/terço INFERIOR/)
    expect(construirPromptDeSlide(ctx({ frame: frame({ tipo: "capa", variante: "b" }) }))).toMatch(/centralizado/)
    expect(construirPromptDeSlide(ctx({ frame: frame({ tipo: "texto", variante: "b" }) }))).toMatch(/METADE SUPERIOR/)
    expect(construirPromptDeSlide(ctx({ frame: frame({ tipo: "prova" }) }))).toMatch(/véu azul-escuro/)
  })

  it("a cena vem do papel narrativo quando há motor editorial, senão do tipo", () => {
    const comPapel = construirPromptDeSlide(ctx({ frame: f, papel: "aplicacao" }))
    expect(comPapel).toMatch(/Papel deste slide na narrativa: aplicação/)
    expect(comPapel).toMatch(/conta feita à mão/)
    const semPapel = construirPromptDeSlide(ctx({ frame: f }))
    expect(semPapel).not.toMatch(/Papel deste slide/)
    expect(semPapel).toMatch(/um detalhe concreto do que o texto afirma/)
  })

  it("leva o 'por que funciona' das referências como direção, quando existe", () => {
    const sem = construirPromptDeSlide(ctx({ frame: f }))
    expect(sem).not.toMatch(/referência/)
    const com = construirPromptDeSlide(ctx({ frame: f, porQueFunciona: ["Capa com número e contraste", "  ", "Um dado por slide"] }))
    expect(com).toMatch(/- Capa com número e contraste\n- Um dado por slide/)
  })

  it("respeita a proporção 9:16", () => {
    expect(construirPromptDeSlide(ctx({ frame: f, doc: { ...doc, proporcaoExport: "9:16" } }))).toContain("1080×1920 px")
  })
})

describe("prompt completo (slide inteiro)", () => {
  it("leva a copy exata, as fontes por nome, a marca e o contador", () => {
    const f = frame({ tipo: "texto", textos: { titulo: "Só 8% compram de novo", corpo: "É onde a receita mora." } })
    const p = construirPromptDeSlide(ctx({ frame: f, modo: "completo", templateNome: "Turbo" }))
    expect(p).toMatch(/EXATAMENTE como está escrito/)
    expect(p).toContain('"Só 8% compram de novo"')
    expect(p).toContain('"É onde a receita mora."')
    expect(p).toContain("Barlow Condensed")
    expect(p).toContain("Georgia")
    expect(p).toContain('"@convertfy"')
    expect(p).toContain('"2/7"')
    expect(p).toContain('molde "Turbo"')
    expect(p).not.toMatch(/NÃO escreva nenhum texto/)
  })

  it("CTA usa o botão do frame, senão o texto global do CTA; oculto some do rodapé", () => {
    const f = frame({ tipo: "cta", textos: { titulo: "Quer a segmentação?" } })
    expect(construirPromptDeSlide(ctx({ frame: f, modo: "completo" }))).toContain('"Comente 41"')
    const proprio = frame({ tipo: "cta", textos: { titulo: "Quer?", botao: "Comente MÉTODO" } })
    expect(construirPromptDeSlide(ctx({ frame: proprio, modo: "completo" }))).toContain('"Comente MÉTODO"')
    const semMarca = construirPromptDeSlide(ctx({ frame: f, modo: "completo", doc: { ...doc, ocultos: { brandName: true, avatar: true } } }))
    expect(semMarca).not.toContain('"@convertfy"')
    expect(semMarca).toContain('"Convertfy"')
  })

  it("dado descreve o número gigante; lista descreve barra de progresso e numeração", () => {
    const dado = construirPromptDeSlide(ctx({ frame: frame({ tipo: "dado", textos: { titulo: "41%", corpo: "da receita" } }), modo: "completo" }))
    expect(dado).toMatch(/~360 px/)
    const lista = construirPromptDeSlide(ctx({ frame: frame({ tipo: "lista", textos: { titulo: "Segmente" } }), modo: "completo", indice: 2, total: 9 }))
    expect(lista).toMatch(/barra de progresso/)
    expect(lista).toContain('"02"')
    expect(lista).toContain("item de 7")
  })

  it("descreve o fundo do frame: gradiente ou cor sólida", () => {
    const f = frame({ tipo: "texto", frameId: "f3" })
    expect(construirPromptDeSlide(ctx({ frame: f, modo: "completo" }))).toMatch(/gradiente diagonal \(160°\)/)
    expect(construirPromptDeSlide(ctx({ frame: f, modo: "completo", doc: { ...doc, fundoPorFrame: { f3: "#F6F8FE" } } }))).toMatch(/cor sólida #F6F8FE \(fundo claro/)
  })
})

describe("promptEfetivo", () => {
  it("o prompt editado pelo humano vence o sugerido; vazio cai no sugerido", () => {
    const f = frame({ tipo: "texto", promptImagem: "  Meu prompt próprio  " })
    expect(promptEfetivo(ctx({ frame: f }))).toEqual({ prompt: "Meu prompt próprio", origem: "editado" })
    const r = promptEfetivo(ctx({ frame: frame({ tipo: "texto", promptImagem: "   " }) }))
    expect(r.origem).toBe("sugerido")
    expect(r.prompt).toMatch(/carrossel do Instagram/)
  })

  it("um documento inteiro sem dado do frame produz prompt para todo tipo", () => {
    const tipos: Documento["frames"][number]["tipo"][] = ["capa", "dado", "texto", "prova", "lista", "mec", "cta"]
    for (const tipo of tipos) {
      for (const modo of ["hibrido", "completo"] as const) {
        const p = construirPromptDeSlide(ctx({ frame: frame({ tipo }), modo }))
        expect(p.length).toBeGreaterThan(120)
        expect(p).not.toMatch(/undefined|null/)
      }
    }
  })
})
