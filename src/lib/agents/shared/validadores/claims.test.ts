import { describe, it, expect } from "vitest"
import { avaliarClaims, detectarClaims, percentualDoValor } from "./claims"
import { validarCopy } from "./copy"
import { validarHtmlFinal } from "./html-final"
import { montarDecisao } from "../decisao-do-email"
import { ALVO_HERO_BOXERS_W1, ESTRUTURADOR_HERO_BOXERS_W1 } from "../fixtures/hero-boxers-welcome-1"

const SEM = { existe: false, codigo: null, valor: null }
const COM = { existe: true, codigo: "WELCOME10", valor: "10%" }

describe("detectarClaims — oferta reprova, atributo passa (pt/en/pl/da)", () => {
  const pares: Array<[string, boolean]> = [
    ["Ganhe 10% de desconto na primeira compra", true],
    ["Get 10% off your first order", true],
    ["Zyskaj 15% taniej", true],
    ["Spar 20% på din første ordre", true],
    ["Save up to 30% today", true],
    ["Use code WELCOME10 at checkout", true],
    ["Kod rabatowy: LATO20", true],
    ["Special offer for new members", true],
    ["Tecido 10% mais leve que o algodão", false],
    ["83% more resistant than cotton", false],
    ["Cintura acima do abdômen, sem apertar", false],
    ["Rated 4.8 out of 5 by 200 customers", false],
    ["Free shipping over $60", true], // frete é claim, mas não conta como oferta sem incentivo
  ]
  for (const [texto, esperado] of pares) {
    it(`${esperado ? "claim" : "atributo"}: "${texto}"`, () => {
      expect(detectarClaims(texto).length > 0).toBe(esperado)
    })
  }

  it("lê o percentual e o código", () => {
    expect(detectarClaims("Get 10% off with code WELCOME10")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tipo: "percentual", percentual: 10 }),
        expect.objectContaining({ tipo: "codigo", codigo: "WELCOME10" }),
      ]),
    )
    expect(percentualDoValor("10%")).toBe(10)
    expect(percentualDoValor("R$ 20")).toBeNull()
  })
})

describe("avaliarClaims", () => {
  it("sem incentivo: qualquer oferta é high; frete grátis não conta", () => {
    const v = avaliarClaims("Get 10% off — free shipping over $60", SEM)
    expect(v.map((x) => x.tipo)).toEqual(["oferta_sem_incentivo"])
    expect(v[0].severidade).toBe("high")
  })

  it("com incentivo: percentual e código iguais passam; diferentes divergem", () => {
    expect(avaliarClaims("10% off with code WELCOME10", COM)).toEqual([])
    const v = avaliarClaims("15% off with code SUMMER15", COM)
    expect(v.map((x) => x.tipo).sort()).toEqual(["codigo_diverge", "percentual_diverge"])
  })

  it("urgência só é violação quando a decisão a proíbe — e é medium", () => {
    expect(avaliarClaims("Offer ends soon!", COM)).toEqual([])
    const v = avaliarClaims("Offer ends soon!", COM, ["No artificial urgency, countdown or 'offer ends soon'"])
    expect(v).toEqual([expect.objectContaining({ tipo: "urgencia_artificial", severidade: "medium" })])
  })

  it("o mesmo trecho duas vezes é uma violação", () => {
    expect(avaliarClaims("10% off! Yes, 10% off.", SEM)).toHaveLength(1)
  })
})

describe("validarCopy / validarHtmlFinal com a decisão real", () => {
  const decisao = montarDecisao({
    alvo: ALVO_HERO_BOXERS_W1,
    estruturador: ESTRUTURADOR_HERO_BOXERS_W1,
    incentivo: { ...SEM, mecanica: null, origem: "sem_incentivo", traducao_faltante: false },
  })

  it("campo omitido preenchido, oferta em campo de copy e max_len viram violações com o campo", () => {
    const r = validarCopy(decisao, [
      {
        block_index: 0,
        block_type: "hero",
        fields: [
          { key: "hero_headline", max_len: 40 },
          { key: "coupon_line", omitir: true },
          { key: "hero_image", type: "image" },
        ],
        content: {
          hero_headline: "Here's 10% OFF to start — and a headline long enough to blow the limit",
          coupon_line: "Use code WELCOME10",
          hero_image: "10% off (imagem, não conta)",
        },
      },
    ])
    expect(r.violacoes.map((v) => `${v.campo}:${v.tipo}`)).toEqual([
      "hero_headline:oferta_sem_incentivo",
      "hero_headline:max_len",
      "coupon_line:omitido_preenchido",
      "coupon_line:oferta_sem_incentivo",
    ])
    expect(r.ok).toBe(false)
  })

  it("o HTML final é validado por bloco, com o block_id da view", () => {
    const r = validarHtmlFinal(decisao, [
      { block_id: "b1", indice: 0, tipo: "hero", texto_visivel: "Welcome. Here's 10% off." },
      { block_id: "b2", indice: 1, tipo: "body", texto_visivel: "Waistband above the abdomen." },
    ])
    expect(r.violacoes).toEqual([expect.objectContaining({ tipo: "oferta_sem_incentivo", variant_id: "b1", section: "hero" })])
  })

  it("a decisão do batch de referência proíbe urgência: 'offer ends soon' no HTML é medium", () => {
    const r = validarHtmlFinal(decisao, [{ block_id: null, indice: 0, tipo: "hero", texto_visivel: "Offer ends soon" }])
    expect(r.violacoes.map((v) => v.tipo)).toEqual(["urgencia_artificial"])
    expect(r.ok).toBe(true)
  })
})
