import { describe, expect, it } from "vitest"

import { ehAlertaDeDado, separarAlertasDeDado } from "./alertas-de-dado"

// As 28 linhas REAIS de `proibido_neste_toque` da run b9486e7a (Seletor,
// 18/09 04:44, loja 741414b9). Copiadas do banco, não inventadas.
const REAL_18_09 = [
  "história longa da fundação (profundidade tem toque próprio)",
  "pedido de engajamento paralelo (rede social, preferências) — um pedido só",
  "urgência artificial",
  "esgotar os argumentos — uma objeção só, bem atacada",
  "condição nova no incentivo",
  "No explicit statement of what was cut to achieve the price. The DTC + Shopify model is stated; the price-economy argument is inferred. Verify before using in copy.",
  "The 25% savings figure and 51,264 homes figure come from ad copy, not from verified technical documentation. Treat as unverified until confirmed by product spec sheet.",
  "No verified product authenticity claim or quality control process found. Brand mentions 'resultado real' and 'avaliações verificadas' as positioning but no operational proof of product authenticity exists in the research.",
  "Shipping and fulfillment reliability not documented. Frete personalizado por região is mentioned but no delivery guarantee, carrier SLA, or tracking commitment is stated.",
  "'Sem surpresa no checkout' is brand positioning language, not a verified operational policy. Confirm that shipping is shown pre-checkout before using as a hard claim.",
  "No support channel, response time, or support policy documented in the research. Cannot claim support quality without evidence.",
  "Shopify platform is confirmed. PCI compliance and SSL are Shopify defaults but were not explicitly stated in the brand research. Low risk to use but flag for confirmation.",
  "Lifetime warranty is stated in brand positioning and ad copy but no return process, timeline, or operational confirmation exists in the research. Verify before using specific return mechanics in copy.",
  "No long founding story — depth has its own touch",
  "No parallel engagement ask (social, preferences) — one call to action only",
  "No artificial urgency",
  "Do not exhaust the arguments — one objection, attacked well",
  "No new condition on the incentive",
  "Do not state what was cut to reach the price — the DTC model is stated, the price-economy argument is only inferred",
  "Do not present the 25% savings or the 51,264 homes figures as verified fact — they come from ad copy only",
  "Do not claim product authenticity or a quality control process — none is documented",
  "Do not promise delivery times, tracking or carrier reliability — nothing is documented",
  "Do not use 'no surprise at checkout' as a hard policy claim — it is positioning language, not verified",
  "Do not claim support quality, channel or response time — none is documented",
  "Do not name the platform, payment provider or any infrastructure term (Shopify, PCI, SSL) — the buyer did not ask",
  "Do not state return mechanics (timeline, process, conditions) for the lifetime warranty — only the warranty as the brand states it",
  "Do not quote, count or invent specific customer reviews, star ratings or named results — verified reviews are not available in the context; the outside voice must be limited to what the brand itself states about verified reviews",
  "Do not use the Amazon comparison — that is a separate objection for a later touch",
]

describe("separarAlertasDeDado — fixture real de 18/09", () => {
  const r = separarAlertasDeDado(REAL_18_09)

  it("os 8 alertas de pesquisa saem das proibições", () => {
    expect(r.alertas_de_dado).toHaveLength(8)
    expect(r.alertas_de_dado.every((a) => !/^(do not|no [a-z]+ (founding|artificial|parallel|new))/i.test(a))).toBe(true)
    expect(r.alertas_de_dado.some((a) => a.startsWith("No support channel"))).toBe(true)
  })

  it("as 5 canônicas ficam em PT e as 5 traduções colapsam", () => {
    expect(r.traducoes_colapsadas).toBe(5)
    expect(r.proibicoes.slice(0, 5)).toEqual(REAL_18_09.slice(0, 5))
    expect(r.proibicoes).not.toContain("No artificial urgency")
    expect(r.proibicoes).not.toContain("No new condition on the incentive")
  })

  it("28 linhas viram 15 proibições — 'Do not …' com dado específico é regra e FICA", () => {
    expect(r.proibicoes).toHaveLength(15)
    expect(r.proibicoes).toContain("Do not use the Amazon comparison — that is a separate objection for a later touch")
    // "none is documented" no FIM de um "Do not…" continua proibição: o
    // começo da frase decide.
    expect(r.proibicoes).toContain("Do not claim support quality, channel or response time — none is documented")
  })

  it("a soma fecha: nada some", () => {
    expect(r.proibicoes.length + r.alertas_de_dado.length + r.traducoes_colapsadas).toBe(REAL_18_09.length)
  })
})

describe("ehAlertaDeDado", () => {
  it("proibição curta não é alerta", () => {
    expect(ehAlertaDeDado("urgência artificial")).toBe(false)
    expect(ehAlertaDeDado("não prometer prazo de devolução")).toBe(false)
  })
  it("alerta em PT", () => {
    expect(ehAlertaDeDado("política de devolução não encontrada na pesquisa — confirme antes de usar")).toBe(true)
  })
  it("alertas do modelo entram no mesmo balde, deduplicados", () => {
    const r = separarAlertasDeDado(["urgência artificial"], ["No support channel documented", "no support channel documented."])
    expect(r.alertas_de_dado).toEqual(["No support channel documented"])
    expect(r.proibicoes).toEqual(["urgência artificial"])
  })
})
