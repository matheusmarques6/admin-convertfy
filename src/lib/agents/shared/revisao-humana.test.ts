import { describe, it, expect } from "vitest"
import {
  SEM_REVISAO,
  aplicaveis,
  montarBlocoRevisao,
  type RevisaoHumana,
} from "./revisao-humana"

const doEmail: RevisaoHumana = {
  alcance: "este_email",
  flow_type: "welcome",
  email_number: 1,
  ordem_anterior: ["hero", "body", "offer", "products", "reviews", "footer"],
  ordem_nova: ["hero", "body", "reviews", "offer", "products", "footer"],
  blocos_removidos: [],
  justificativa: "o cético precisa da prova antes da vitrine",
  created_at: "2026-08-27T14:00:00Z",
  para_estruturador: true,
  para_montador: true,
}

const doFlow: RevisaoHumana = {
  alcance: "todo_email_do_flow",
  flow_type: "welcome",
  email_number: 1,
  ordem_anterior: ["hero", "offer", "footer"],
  ordem_nova: ["hero", "footer"],
  blocos_removidos: ["offer"],
  justificativa: "o primeiro toque não vende",
  para_estruturador: true,
}

describe("montarBlocoRevisao", () => {
  // O diff é o ponto: só a ordem final faria o agente ler preferência
  // estética; "estava assim → ficou assim porque X" é correção.
  it("mostra as duas ordens e o porquê", () => {
    const bloco = montarBlocoRevisao([doEmail], "estruturador")
    expect(bloco).toContain("[hero, body, offer, products, reviews, footer]")
    expect(bloco).toContain("[hero, body, reviews, offer, products, footer]")
    expect(bloco).toContain("o cético precisa da prova antes da vitrine")
  })

  it("escreve o alcance e a data", () => {
    expect(montarBlocoRevisao([doEmail], "estruturador")).toContain(
      "[welcome #1 desta loja · 27/08]",
    )
    expect(montarBlocoRevisao([doFlow], "estruturador")).toContain(
      "todo welcome #1, em qualquer loja",
    )
  })

  it("remoção aparece nomeada", () => {
    expect(montarBlocoRevisao([doFlow], "estruturador")).toContain(
      "Removido: offer",
    )
  })

  // A mais específica por último — onde o modelo dá mais peso quando duas se
  // contradizem, e onde quem escreveu sabia mais sobre o caso.
  it("global vem antes da revisão deste email", () => {
    const bloco = montarBlocoRevisao([doEmail, doFlow], "estruturador")
    expect(bloco.indexOf("o primeiro toque não vende")).toBeLessThan(
      bloco.indexOf("o cético precisa da prova"),
    )
  })

  it("só entrega a quem foi marcado", () => {
    expect(montarBlocoRevisao([doEmail], "montador")).toContain("cético")
    expect(montarBlocoRevisao([doEmail], "curador")).toBe(SEM_REVISAO)
    expect(montarBlocoRevisao([doFlow], "montador")).toBe(SEM_REVISAO)
  })

  // O Estruturador é o dono da ORDEM: revisão antiga sem a coluna não pode
  // sumir do prompt dele por causa de um default.
  it("estruturador recebe quando a marcação não veio", () => {
    const semColuna = { ...doEmail, para_estruturador: undefined }
    expect(montarBlocoRevisao([semColuna], "estruturador")).toContain("cético")
  })

  it("nenhuma aplicável → texto de vazio (o prompt não muda de forma)", () => {
    expect(montarBlocoRevisao([], "estruturador")).toBe(SEM_REVISAO)
    expect(
      montarBlocoRevisao([{ ...doEmail, justificativa: "   " }], "estruturador"),
    ).toBe(SEM_REVISAO)
  })

  it("preserva o texto do operador literalmente", () => {
    const bloco = montarBlocoRevisao(
      [{ ...doEmail, justificativa: "use < 3 blocos & nada de </p>" }],
      "estruturador",
    )
    expect(bloco).toContain("use < 3 blocos & nada de </p>")
  })
})

describe("aplicaveis", () => {
  const todas = [
    { ...doEmail, store_id: "loja-a" },
    { ...doFlow, store_id: null },
    { ...doEmail, store_id: "loja-b", justificativa: "de outra loja" },
    { ...doEmail, store_id: "loja-a", email_number: 3, justificativa: "outro email" },
  ]

  it("este_email só da própria loja; do flow sempre", () => {
    const r = aplicaveis(todas, "loja-a", "welcome", 1)
    expect(r.map((x) => x.justificativa)).toEqual([
      "o cético precisa da prova antes da vitrine",
      "o primeiro toque não vende",
    ])
  })

  it("outro número do mesmo flow não traz a revisão do #1", () => {
    expect(aplicaveis(todas, "loja-a", "welcome", 3)).toHaveLength(1)
  })

  it("outro flow fica sem nada", () => {
    expect(aplicaveis(todas, "loja-a", "winback", 1)).toEqual([])
  })

  it("loja sem revisão própria ainda recebe a do flow", () => {
    const r = aplicaveis(todas, "loja-z", "welcome", 1)
    expect(r).toHaveLength(1)
    expect(r[0].alcance).toBe("todo_email_do_flow")
  })
})
