import { describe, expect, it } from "vitest"
import { encurtar, metadataDoFormulario } from "./metadata"
import { normalizarSchema } from "./schema"

/** A abertura REAL do `/forms/diagnostico`, o destino do anúncio. */
const DIAGNOSTICO = normalizarSchema({
  display_mode: "conversational",
  blocks: [{ ref: "f1", type: "text", label: "Como você se chama?", alias: "nome" }],
  settings: {
    welcome: {
      title: "Diagnóstico gratuito da sua operação de e-mail",
      description:
        "6 perguntas, menos de 2 minutos. No fim, a gente te mostra onde sua loja está deixando dinheiro na mesa.",
      button_label: "Começar",
    },
  },
})

describe("metadataDoFormulario", () => {
  it("no conversacional, a aba é a tela de abertura — não o nome interno", () => {
    const m = metadataDoFormulario({
      form: { name: "Diagnóstico", description: "Diagnóstico conversacional para tráfego pago (uma pergunta por vez)." },
      schema: DIAGNOSTICO,
      displayMode: "conversational",
    })
    expect(m.title).toBe("Diagnóstico gratuito da sua operação de e-mail")
    expect(m.description).toMatch(/^6 perguntas/)
    // A nota interna do operador NÃO vaza para a prévia do link.
    expect(m.description).not.toMatch(/uma pergunta por vez/)
  })

  it("no clássico, o cabeçalho do cartão vence o nome", () => {
    const m = metadataDoFormulario({
      form: {
        name: "Pagina de vendas",
        description: "descrição na tela",
        theme: { headline: "Fale com um especialista", subheadline: "Resposta em 1 dia útil" },
      },
      displayMode: "classic",
    })
    expect(m).toEqual({ title: "Fale com um especialista", description: "Resposta em 1 dia útil" })
  })

  it("sem headline cai no nome, e sem subheadline cai na descrição", () => {
    const m = metadataDoFormulario({
      form: { name: "Pagina de vendas", description: "descrição na tela" },
      displayMode: "classic",
    })
    expect(m).toEqual({ title: "Pagina de vendas", description: "descrição na tela" })
  })

  it("a abertura do conversacional vence mesmo com tema preenchido", () => {
    const m = metadataDoFormulario({
      form: { name: "x", theme: { headline: "do tema" } },
      schema: DIAGNOSTICO,
      displayMode: "conversational",
    })
    expect(m.title).toBe("Diagnóstico gratuito da sua operação de e-mail")
  })

  it("o schema do conversacional NÃO é usado quando o modo é clássico", () => {
    // Trocar o modo sem publicar deixa os dois no payload; quem manda é
    // o que está sendo renderizado.
    const m = metadataDoFormulario({
      form: { name: "Pagina de vendas" },
      schema: DIAGNOSTICO,
      displayMode: "classic",
    })
    expect(m.title).toBe("Pagina de vendas")
  })

  it("`hideTitle` tira o título da TELA, não da aba", () => {
    const m = metadataDoFormulario({
      form: { name: "Fale conosco", theme: { headline: "escondida", hideTitle: true } },
      displayMode: "classic",
    })
    expect(m.title).toBe("Fale conosco")
  })

  it("recall sem resposta nenhuma vira o que a tela mostra, nunca a chave crua", () => {
    const schema = normalizarSchema({
      display_mode: "conversational",
      blocks: [{ ref: "f1", type: "text", label: "Nome", alias: "nome" }],
      settings: { welcome: { title: "Prazer, {{nome}}. Vamos começar?" } },
    })
    const m = metadataDoFormulario({ form: { name: "x" }, schema, displayMode: "conversational" })
    // A vírgula pendurada some: "Prazer, {{nome}}." sem resposta vira
    // "Prazer." — e não "Prazer, ." nem "Prazer,.".
    expect(m.title).toBe("Prazer. Vamos começar?")
    expect(m.title).not.toContain("{{")
  })

  it("formulário sem nada ainda tem título — aba vazia parece página quebrada", () => {
    expect(metadataDoFormulario({ form: {} }).title).toBe("Formulário")
    expect(metadataDoFormulario({ form: { name: "   " } }).description).toBeNull()
  })
})

describe("encurtar", () => {
  it("corta na palavra e marca o corte", () => {
    const s = encurtar("um título bastante longo que não cabe na aba do navegador", 30)
    expect(s!.length).toBeLessThanOrEqual(30)
    expect(s!.endsWith("…")).toBe(true)
    expect(s).not.toMatch(/nav…$/)
  })

  it("não mexe no que cabe, e colapsa espaço", () => {
    expect(encurtar("  Diagnóstico   gratuito ", 70)).toBe("Diagnóstico gratuito")
  })

  it("palavra única gigante é cortada mesmo assim — melhor que estourar", () => {
    expect(encurtar("a".repeat(50), 10)).toHaveLength(10)
  })
})
