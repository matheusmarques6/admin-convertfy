import { describe, expect, it } from "vitest"
import {
  contagemDeTelas,
  conversao,
  deltaPercent,
  filtrarLista,
  kpisDaLista,
  statusDaLinha,
  type LinhaDaLista,
  type ResumoDoForm,
} from "../lista"
import { normalizarSchema } from "../schema"

const resumo = (p: Partial<ResumoDoForm>): ResumoDoForm => ({
  form_id: "f",
  registra_visitas: true,
  visitas: 0,
  visitas_anterior: 0,
  envios: 0,
  envios_anterior: 0,
  deals: 0,
  deals_anterior: 0,
  ...p,
})

const linha = (p: Partial<LinhaDaLista>): LinhaDaLista => ({
  id: "f",
  name: "Form",
  slug: "form",
  status: "published",
  display_mode: "conversational",
  has_unpublished_changes: false,
  versao: 1,
  telas: { n: 1, unidade: "tela" },
  pipeline: { id: "p", name: "Inbound", color: null },
  stage: null,
  resumo: null,
  views_count: 0,
  submissions_count: 0,
  ...p,
})

describe("deltaPercent / conversao", () => {
  it("sem base não há delta — zero → um não é +100%", () => {
    expect(deltaPercent(5, 0)).toBeNull()
    expect(deltaPercent(12, 10)).toBe(20)
    expect(deltaPercent(8, 10)).toBe(-20)
  })
  it("conversão sem visita medida é null, nunca 100%", () => {
    expect(conversao(11, null)).toBeNull()
    expect(conversao(11, 0)).toBeNull()
    expect(conversao(19, 184)).toBe(10.3)
  })
})

describe("kpisDaLista — o clássico não mede visita", () => {
  // O retrato real de 18/09: a Página de vendas (clássico) tem 11 envios e
  // nenhuma sessão; o Diagnóstico (conversacional) tem 18 sessões e 2 envios.
  const linhas = [
    linha({ id: "pv", display_mode: "classic", views_count: 467, resumo: resumo({ registra_visitas: false, envios: 11, deals: 11 }) }),
    linha({ id: "dg", resumo: resumo({ visitas: 18, visitas_anterior: 9, envios: 2, deals: 2 }) }),
  ]
  const k = kpisDaLista(linhas)

  it("visitas somam só quem mede, e a tela sabe quantos são", () => {
    expect(k.visitas).toBe(18)
    expect(k.formsComVisita).toBe(1)
    expect(k.visitasDelta).toBe(100)
  })
  it("envios e negócios somam todos", () => {
    expect(k.envios).toBe(13)
    expect(k.deals).toBe(13)
    expect(k.enviosDelta).toBeNull()
  })
  it("a conversão média cruza envios COM visitas do mesmo conjunto", () => {
    // 2 envios do Diagnóstico ÷ 18 visitas — não 13 ÷ 18.
    expect(k.conversao).toBe(11.1)
  })
  it("sem nenhum formulário medindo, visitas e conversão são null", () => {
    const k2 = kpisDaLista([linhas[0]])
    expect(k2.visitas).toBeNull()
    expect(k2.conversao).toBeNull()
  })
  it("conta os publicados sem pipeline", () => {
    expect(kpisDaLista([linha({ pipeline: null }), linha({ pipeline: null, status: "draft" })]).semPipeline).toBe(1)
  })
})

describe("statusDaLinha", () => {
  it("as três formas do handoff", () => {
    expect(statusDaLinha({ status: "published", has_unpublished_changes: false })).toEqual({ label: "No ar", tom: "pos" })
    expect(statusDaLinha({ status: "published", has_unpublished_changes: true }).tom).toBe("warn")
    expect(statusDaLinha({ status: "draft", has_unpublished_changes: true }).label).toBe("Rascunho")
  })
})

describe("contagemDeTelas", () => {
  it("conversacional: perguntas agrupadas contam uma tela; oculta não conta", () => {
    const s = normalizarSchema({
      blocks: [
        { ref: "a", type: "text", label: "Nome" },
        { ref: "b", type: "phone", label: "Wpp", mesma_tela: true },
        { ref: "c", type: "email", label: "Email", mesma_tela: true },
        { ref: "d", type: "select", label: "Plat" },
        { ref: "h", type: "text", label: "utm", hidden: true },
      ],
    })
    expect(contagemDeTelas(s, 5, "conversational")).toEqual({ n: 2, unidade: "tela" })
  })
  it("clássico conta campos — '1 tela' esconderia o tamanho", () => {
    expect(contagemDeTelas(null, 6, "classic")).toEqual({ n: 6, unidade: "campo" })
  })
})

describe("filtrarLista", () => {
  const linhas = [
    linha({ id: "1", name: "Diagnóstico", slug: "diagnostico" }),
    linha({ id: "2", name: "teste", slug: "teste", status: "draft" }),
    linha({ id: "3", name: "velho", slug: "velho", status: "archived" }),
  ]
  it("arquivado nunca aparece; 'No ar' e 'Rascunhos' separam; busca casa nome ou slug", () => {
    expect(filtrarLista(linhas, "", "todos").map((l) => l.id)).toEqual(["1", "2"])
    expect(filtrarLista(linhas, "", "ar").map((l) => l.id)).toEqual(["1"])
    expect(filtrarLista(linhas, "", "rascunhos").map((l) => l.id)).toEqual(["2"])
    expect(filtrarLista(linhas, "DIAG", "todos").map((l) => l.id)).toEqual(["1"])
  })
})
