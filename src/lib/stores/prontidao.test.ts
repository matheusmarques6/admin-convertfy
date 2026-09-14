import { describe, expect, it } from "vitest"

import { avaliarProntidao, resumoDaProntidao, type EntradaDeProntidao } from "./prontidao"

/** Hero Boxers como estava em 14/09: pesquisa e produtos ok, identidade v3 sem confirmar. */
const heroBoxers = (): EntradaDeProntidao => ({
  store: {
    id: "daee0632-4a1d-476e-810b-c616ba32625d",
    brand_thesis: "Cuecas que não marcam.",
    store_story: "Nascida em 2021…",
    icp_persona: "Homem 25-40",
    tone_description: "Direto",
    ads_summary: "Anúncios focados em conforto",
    devolucao_politica: "30 dias",
  },
  identity: {
    colors_primary: [
      { hex: "#000000", name: "Preto", role: "Principal" },
      { hex: "#ffffff", name: "Branco", role: "Principal" },
    ],
    colors_secondary: [],
    logo_main_png: "https://x/logo.png",
    font_heading: "Poppins",
    font_body: "Poppins",
    trust_icons: [],
    confirmed_at: null,
  },
  produtos: 5,
  idioma: { codigo: "en", outline_tem_cupom: true, traducao_presente: true },
})

describe("avaliarProntidao", () => {
  it("Hero Boxers gera sem preencher nada, com os avisos certos", () => {
    const p = avaliarProntidao(heroBoxers())
    expect(p.pronta).toBe(true)
    expect(p.bloqueios).toEqual([])
    expect(p.avisos.map((a) => a.id)).toEqual([
      "paleta_dois_principais",
      "trust_icons_vazio",
      "identidade_nao_confirmada",
    ])
  })

  it("loja sem pesquisa NÃO gera — e diz quais pilares faltam", () => {
    const e = heroBoxers()
    e.store = { id: e.store!.id, devolucao_politica: "30 dias" }
    const p = avaliarProntidao(e)
    expect(p.pronta).toBe(false)
    expect(p.bloqueios[0].id).toBe("pesquisa_incompleta")
    expect(p.bloqueios[0].detalhe).toContain("Nenhum pilar")
    expect(p.bloqueios[0].acao.destino).toEqual({ tipo: "rota", href: `/admin/stores/${e.store.id}?tab=contexto` })
  })

  it("um pilar vazio é bloqueio e nomeia o pilar", () => {
    const e = heroBoxers()
    delete e.store!.ads_summary
    const p = avaliarProntidao(e)
    expect(p.bloqueios.map((b) => b.id)).toEqual(["pesquisa_incompleta"])
    expect(p.bloqueios[0].detalhe).toContain("Review dos anúncios")
  })

  it("sem produtos, sem hex, sem logo e sem fontes são quatro bloqueios distintos", () => {
    const e = heroBoxers()
    e.produtos = 0
    e.identity = { colors_primary: [{ hex: "azul", name: "x", role: "Principal" }], trust_icons: [{ image_url: "s" }], confirmed_at: "2026-01-01" }
    const p = avaliarProntidao(e)
    expect(p.bloqueios.map((b) => b.id)).toEqual(["sem_produtos", "paleta_sem_hex", "logo_ausente", "fontes_ausentes"])
    // a paleta inválida NÃO gera o aviso de dois principais (só tem uma)
    expect(p.avisos.map((a) => a.id)).not.toContain("paleta_dois_principais")
  })

  it("identidade ausente conta como sem paleta, sem logo e sem fontes, mas não como 'não confirmada'", () => {
    const e = heroBoxers()
    e.identity = null
    const p = avaliarProntidao(e)
    expect(p.bloqueios.map((b) => b.id)).toEqual(["paleta_sem_hex", "logo_ausente", "fontes_ausentes"])
    expect(p.avisos.map((a) => a.id)).not.toContain("identidade_nao_confirmada")
  })

  it("dois principais COM fundo declarado não avisa", () => {
    const e = heroBoxers()
    e.identity!.colors_secondary = [{ hex: "#f4f4f4", name: "Fundo", role: "fundo" }]
    const p = avaliarProntidao(e)
    expect(p.avisos.map((a) => a.id)).not.toContain("paleta_dois_principais")
  })

  it("política ausente no setup E na ficha vira aviso; presente em qualquer um, não", () => {
    const e = heroBoxers()
    delete e.store!.devolucao_politica
    expect(avaliarProntidao(e).avisos.map((a) => a.id)).toContain("politica_sem_pagina")
    e.ficha = { envio: { prazo: "3 dias úteis" } }
    expect(avaliarProntidao(e).avisos.map((a) => a.id)).not.toContain("politica_sem_pagina")
  })

  it("cupom sem tradução só avisa em loja de outro idioma com outline que entrega cupom", () => {
    const e = heroBoxers()
    e.idioma = { codigo: "en", outline_tem_cupom: true, traducao_presente: false }
    expect(avaliarProntidao(e).avisos.map((a) => a.id)).toContain("cupom_sem_override")
    e.idioma = { codigo: "pt-BR", outline_tem_cupom: true, traducao_presente: false }
    expect(avaliarProntidao(e).avisos.map((a) => a.id)).not.toContain("cupom_sem_override")
    e.idioma = { codigo: "en", outline_tem_cupom: false, traducao_presente: false }
    expect(avaliarProntidao(e).avisos.map((a) => a.id)).not.toContain("cupom_sem_override")
  })

  it("resumo em uma linha", () => {
    expect(resumoDaProntidao(avaliarProntidao(heroBoxers()))).toBe(
      "avisos: paleta_dois_principais, trust_icons_vazio, identidade_nao_confirmada",
    )
    const e = heroBoxers()
    e.produtos = 0
    e.identity!.confirmed_at = "x"
    e.identity!.trust_icons = [{}]
    e.identity!.colors_secondary = [{ hex: "#eeeeee", role: "fundo" }]
    expect(resumoDaProntidao(avaliarProntidao(e))).toBe("bloqueios: sem_produtos")
  })
})
