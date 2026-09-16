import { describe, expect, it } from "vitest"
import { CORES_PADRAO, GRADIENTE_PADRAO, SLIDE } from "./brand"
import { FAMILIAS } from "./familias"
import { construirPromptDeSlide, pedeImagem, preenchimento, promptEfetivo, sugerirModo, type ContextoPrompt } from "./prompt-slide"
import type { DocFrame, Documento } from "./types"
import { aceitaImagem, novoDocumento } from "./documento"
import { validarDocumento } from "@/lib/services/conteudo-documentos.service"

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
    // O véu sai na cor do documento, não num azul fixo: com outra
    // identidade o azul da casa seria a única cor fora da paleta.
    expect(construirPromptDeSlide(ctx({ frame: frame({ tipo: "prova" }) }))).toMatch(/véu escuro/)
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
    expect(construirPromptDeSlide(ctx({ frame: f, modo: "completo", doc: { ...doc, fundoPorFrame: { f3: "gradiente" } } }))).toMatch(/gradiente diagonal \(160°\)/)
    expect(construirPromptDeSlide(ctx({ frame: f, modo: "completo", doc: { ...doc, fundoPorFrame: { f3: "#F6F8FE" } } }))).toMatch(/cor sólida #F6F8FE \(fundo claro/)
  })

  it("frame sem fundo no mapa cai no MESMO padrão do renderer, não em gradiente", () => {
    // `doc.fundoPorFrame[id] ?? SLIDE.fundoClaro` é o que o `frame.tsx` faz;
    // o prompt descrevia um gradiente que a peça não teria.
    const p = construirPromptDeSlide(ctx({ frame: frame({ tipo: "texto", frameId: "f9" }), modo: "completo" }))
    expect(p).toContain(`cor sólida ${SLIDE.fundoClaro}`)
    expect(p).not.toMatch(/gradiente diagonal/)
  })

  it("o realce `**` vira instrução de COR, nunca asterisco na imagem", () => {
    const f = frame({ tipo: "texto", textos: { titulo: "O frete grátis **não** trava a venda", corpo: "São **40 segundos** antes." } })
    const p = construirPromptDeSlide(ctx({ frame: f, modo: "completo" }))
    expect(p).not.toContain("**")
    expect(p).toContain("O frete grátis não trava a venda")
    expect(p).toMatch(/As palavras «não», «40 segundos» saem na cor de destaque/)
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

describe("integração com o documento salvo", () => {
  it("aceitaImagem cobre o slide inteiro em frame que o template criou sem slot", () => {
    const slot = { url: "u", zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 1350 }
    expect(aceitaImagem(frame({ tipo: "dado" }))).toBe(false)
    expect(aceitaImagem(frame({ tipo: "dado", imagens: { slot1: slot } }))).toBe(true)
    expect(aceitaImagem(frame({ tipo: "capa", slotsImagem: 1 }))).toBe(true)
  })

  it("o documento com prompt e modo sobrevive à validação da rota de salvamento", () => {
    const base = novoDocumento("Carrossel", "canal-1", "molde-neon", { agora: new Date("2026-09-09T10:00:00-03:00") })
    const doc = {
      ...base,
      frames: base.frames.map((fr, i) =>
        i === 1
          ? { ...fr, promptImagem: "Prompt escrito à mão", imagemModo: "completo" as const, imagens: { slot1: { url: "https://x/y.png", zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 1350 } } }
          : fr,
      ),
    }
    const salvo = validarDocumento(JSON.parse(JSON.stringify(doc)))
    expect(salvo.frames[1].promptImagem).toBe("Prompt escrito à mão")
    expect(salvo.frames[1].imagemModo).toBe("completo")
    expect(salvo.frames[1].imagens.slot1?.url).toBe("https://x/y.png")
  })
})

describe("a anatomia é da FAMÍLIA, não da casa", () => {
  const post: ContextoPrompt["doc"] = { ...doc, familia: "post" }
  const neon: ContextoPrompt["doc"] = { ...doc, familia: "neon", cores: { ...FAMILIAS.neon.cores } }
  const comFoto = frame({ tipo: "texto", slotsImagem: 1, textos: { titulo: "Why it works:", corpo: "The biggest option wins." } })

  it("nada de instrução contraditória: a Post nega fotografia e o fundo é declarado UMA vez", () => {
    const p = construirPromptDeSlide({ frame: comFoto, indice: 1, total: 4, doc: post, modo: "completo" })
    // O ESTILO_BASE abre com "fotografia real"; a direção da Post diz o
    // contrário. As duas no mesmo prompt = o modelo escolhe uma ao acaso.
    expect(p).toContain("não é fotografia")
    expect(p).not.toContain("fotografia real ou 3D fotorrealista")
    // A cena da casa fala de objeto e gesto; a direção da Post proíbe os dois.
    expect(p).not.toContain("objeto, ambiente ou gesto")
    expect(p).toContain("a tela que o post comenta")
    expect(p.match(/Fundo|fundo #/g)?.length).toBe(1)
  })

  it("o cartão de perfil descreve a captura — e NÃO o rodapé da casa", () => {
    const p = construirPromptDeSlide({ frame: comFoto, indice: 1, total: 4, doc: post, modo: "completo" })
    expect(p).toContain("Captura de tela de um post")
    expect(p).toContain("@convertfy")
    // O que denuncia que a peça não é uma captura:
    expect(p).not.toContain("Rodapé:")
    expect(p).not.toContain('contador "2/4"')
  })

  it("no cartão de perfil a foto NÃO é fundo, nem no híbrido nem no completo", () => {
    const hibrido = construirPromptDeSlide({ frame: comFoto, indice: 1, total: 4, doc: post, modo: "hibrido" })
    expect(hibrido).toMatch(/não ocupa o slide inteiro/)
    const capa = construirPromptDeSlide({ frame: frame({ tipo: "capa", slotsImagem: 1 }), indice: 0, total: 4, doc: post, modo: "completo" })
    expect(capa).not.toContain("a fotografia descrita abaixo")
  })

  it("onde a foto acende, ela é bloco recortado — sangrar apagaria o brilho", () => {
    const capa = construirPromptDeSlide({ frame: frame({ tipo: "capa", slotsImagem: 1 }), indice: 0, total: 6, doc: neon, modo: "hibrido" })
    expect(capa).toMatch(/bloco recortado/)
    expect(capa).not.toMatch(/ocupa o slide inteiro/)
  })

  it("o CTA sai na forma que a família desenha", () => {
    const cta = frame({ tipo: "cta", textos: { titulo: "Quer o passo a passo?", botao: "Comente TURBO" } })
    expect(construirPromptDeSlide({ frame: cta, indice: 5, total: 6, doc: neon, modo: "completo" })).toMatch(/Caixa sólida/)
    expect(construirPromptDeSlide({ frame: cta, indice: 5, total: 6, doc, modo: "completo" })).toMatch(/Pílula sólida/)
  })

  it("a régua entre título e corpo só existe onde a família a declara", () => {
    const t = frame({ tipo: "texto", textos: { titulo: "Corte três campos", corpo: "Nome, e-mail e pagamento." } })
    expect(construirPromptDeSlide({ frame: t, indice: 3, total: 6, doc: neon, modo: "completo" })).toMatch(/régua horizontal curta/)
    expect(construirPromptDeSlide({ frame: t, indice: 3, total: 6, doc, modo: "completo" })).not.toMatch(/régua horizontal curta/)
  })
})
