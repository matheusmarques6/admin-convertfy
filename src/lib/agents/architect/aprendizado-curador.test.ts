import { describe, it, expect } from "vitest"
import {
  buildAprendizadoCuradorDraft,
  escolhasDoCurador,
} from "./aprendizado-curador"

const base = {
  flowType: "welcome",
  emailNumber: 1,
  storeName: "Innova Bay",
  runId: "11111111-1111-1111-1111-111111111111",
  dataIso: "2026-09-04T12:30:00.000Z",
  feedbacks: [
    { rating: "down" as const, comentario: "hero genérica demais", autor: "Matheus" },
  ],
}

describe("escolhasDoCurador", () => {
  it("lê o formato do Curador do vault e casa o papel pela seção", () => {
    const e = escolhasDoCurador({
      estrutura: [{ section: "hero", papel: "primeira declaração de posicionamento" }],
      ranking_justificado: [
        {
          block_index: 0,
          section: "hero",
          justificativa: "5 candidatas; objecao decidiu",
          escolhas: [{ variant_id: "v1", variante: "hero-3", motivo: "declara preço-valor" }],
        },
      ],
    })
    expect(e).toHaveLength(1)
    expect(e[0].variante).toBe("hero-3")
    expect(e[0].papel).toBe("primeira declaração de posicionamento")
  })

  it("cai no formato antigo quando o novo não veio", () => {
    const e = escolhasDoCurador({
      ranking_detalhado: [
        { block_index: 1, section: "offer", opcoes: [{ variant_id: "v9", name: "offer-2" }] },
      ],
    })
    expect(e[0].variante).toBe("offer-2")
  })

  it("run sem ranking nenhum devolve lista vazia — não inventa posição", () => {
    expect(escolhasDoCurador({ fio_narrativo: "x" })).toEqual([])
  })
})

describe("buildAprendizadoCuradorDraft", () => {
  const draft = buildAprendizadoCuradorDraft({
    ...base,
    output: {
      fio_narrativo: "da promessa à prova",
      estrutura: [{ section: "hero", papel: "abrir com posicionamento" }],
      ranking_justificado: [
        {
          block_index: 0,
          section: "hero",
          escolhas: [{ variant_id: "v1", variante: "hero-3", motivo: "declara preço-valor" }],
        },
      ],
    },
  })

  it("nasce como proposta de aprendizado do flow, com a data da run", () => {
    expect(draft.markdown).toContain("tipo: aprendizado")
    expect(draft.markdown).toContain("status: proposta")
    expect(draft.markdown).toContain("origem: feedback-curador")
    expect(draft.markdown).toContain("data: 2026-09-04")
    expect(draft.path).toMatch(/^aprendizados\/welcome\/.+\.md$/)
  })

  it("mostra posição, papel, variante e motivo — o traço da escolha", () => {
    expect(draft.markdown).toContain("1. **hero** — papel: abrir com posicionamento")
    expect(draft.markdown).toContain("escolheu: hero-3")
    expect(draft.markdown).toContain("motivo: declara preço-valor")
  })

  it("conta o feedback e o transcreve com autor", () => {
    expect(draft.markdown).toContain("## Feedback (1 👎 · 0 👍)")
    expect(draft.markdown).toContain("👎 (Matheus): hero genérica demais")
  })

  it("aponta a lacuna como nota certa quando falta bloco na biblioteca", () => {
    expect(draft.markdown).toContain("componentes/lacunas/")
  })

  it("é determinístico — o relógio não entra", () => {
    const outro = buildAprendizadoCuradorDraft({
      ...base,
      output: {
        fio_narrativo: "da promessa à prova",
        estrutura: [{ section: "hero", papel: "abrir com posicionamento" }],
        ranking_justificado: [
          {
            block_index: 0,
            section: "hero",
            escolhas: [{ variant_id: "v1", variante: "hero-3", motivo: "declara preço-valor" }],
          },
        ],
      },
    })
    expect(outro.markdown).toBe(draft.markdown)
  })

  it("run vazia não quebra: diz que não há escolha registrada", () => {
    const vazio = buildAprendizadoCuradorDraft({ ...base, feedbacks: [], output: {} })
    expect(vazio.markdown).toContain("(nenhuma escolha registrada nesta run)")
    expect(vazio.markdown).toContain("(nenhum comentário)")
  })
})
