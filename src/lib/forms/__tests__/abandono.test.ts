import { describe, expect, it } from "vitest"
import { normalizarSchema } from "../schema"
import {
  classificarAbandono,
  ehAbandono,
  JANELA_MAX_MINUTOS,
  JANELA_MIN_MINUTOS,
  janelaDeAbandonoMs,
  resumirAbandono,
  textoDaTimeline,
  tituloDoNegocio,
} from "../abandono"

const SCHEMA = normalizarSchema({
  blocks: [
    { ref: "n", type: "text", label: "Como você se chama?", map_to_lead_field: "name" },
    { ref: "e", type: "email", label: "Seu melhor email?", map_to_lead_field: "email" },
    { ref: "f", type: "radio", label: "Faturamento mensal?" },
    { ref: "u", type: "text", label: "utm", hidden: true },
    { ref: "s", type: "statement", label: "Falta pouco!" },
  ],
})

const AGORA = Date.parse("2026-09-17T12:00:00Z")
const base = {
  status: "in_progress",
  answers: { n: "Bruno" },
  completed_at: null,
  abandon_processed_at: null,
}

describe("janelaDeAbandonoMs", () => {
  it("usa o padrão quando ninguém configurou", () => {
    expect(janelaDeAbandonoMs(null)).toBe(20 * 60_000)
    expect(janelaDeAbandonoMs({})).toBe(20 * 60_000)
  })

  it("respeita a configuração do formulário", () => {
    expect(janelaDeAbandonoMs({ abandono_minutos: 45 })).toBe(45 * 60_000)
  })

  it("zero digitado no editor não vira 'ligue agora'", () => {
    expect(janelaDeAbandonoMs({ abandono_minutos: 0 })).toBe(JANELA_MIN_MINUTOS * 60_000)
    expect(janelaDeAbandonoMs({ abandono_minutos: -5 })).toBe(JANELA_MIN_MINUTOS * 60_000)
    expect(janelaDeAbandonoMs({ abandono_minutos: 99999 })).toBe(JANELA_MAX_MINUTOS * 60_000)
    expect(janelaDeAbandonoMs({ abandono_minutos: "trinta" })).toBe(20 * 60_000)
  })
})

describe("ehAbandono", () => {
  const janela = 20 * 60_000

  it("inatividade além da janela é abandono", () => {
    expect(ehAbandono({ ...base, last_activity_at: "2026-09-17T11:30:00Z" }, AGORA, janela)).toBe(true)
  })

  it("quem mexeu agora há pouco NÃO é abandono", () => {
    expect(ehAbandono({ ...base, last_activity_at: "2026-09-17T11:55:00Z" }, AGORA, janela)).toBe(false)
  })

  it("quem concluiu nunca é abandono, por mais antigo que seja", () => {
    expect(
      ehAbandono(
        { ...base, last_activity_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-01T00:01:00Z" },
        AGORA,
        janela,
      ),
    ).toBe(false)
  })

  it("já processado sai da fila", () => {
    expect(
      ehAbandono(
        { ...base, last_activity_at: "2026-09-01T00:00:00Z", abandon_processed_at: "2026-09-01T01:00:00Z" },
        AGORA,
        janela,
      ),
    ).toBe(false)
  })

  it("status terminal não volta", () => {
    for (const status of ["completed", "disqualified", "abandoned"]) {
      expect(ehAbandono({ ...base, status, last_activity_at: "2026-09-01T00:00:00Z" }, AGORA, janela)).toBe(false)
    }
  })

  it("data ilegível não vira abandono — seria processar no escuro", () => {
    expect(ehAbandono({ ...base, last_activity_at: "ontem" }, AGORA, janela)).toBe(false)
  })
})

describe("classificarAbandono", () => {
  it("quem só abriu a página é visita, não lead", () => {
    expect(classificarAbandono(SCHEMA, {}, { email: null, phone: null })).toBe("so_visita")
  })

  it("campo oculto preenchido não conta como resposta", () => {
    expect(classificarAbandono(SCHEMA, { u: "meta-ads" }, { email: null, phone: null })).toBe("so_visita")
  })

  it("respondeu sem deixar contato: registro, não lead", () => {
    expect(classificarAbandono(SCHEMA, { n: "Bruno" }, { email: null, phone: null })).toBe("sem_contato")
  })

  it("com email ou telefone vira lead", () => {
    expect(classificarAbandono(SCHEMA, { n: "B" }, { email: "b@x.com", phone: null })).toBe("com_contato")
    expect(classificarAbandono(SCHEMA, { n: "B" }, { email: null, phone: "11999999999" })).toBe("com_contato")
  })
})

describe("resumirAbandono e o texto da timeline", () => {
  const bloco = SCHEMA.blocks.find((b) => b.ref === "f")!

  it("conta só as perguntas de verdade — oculto e statement ficam fora", () => {
    const r = resumirAbandono(SCHEMA, { n: "Bruno", e: "b@x.com" }, bloco)
    expect(r.total).toBe(3)
    expect(r.respondidas).toBe(2)
    expect(r.parouEm).toBe("Faturamento mensal?")
  })

  it("o texto diz onde parou, o que respondeu e o link", () => {
    const r = resumirAbandono(SCHEMA, { n: "Bruno", e: "b@x.com" }, bloco)
    const txt = textoDaTimeline(r, { name: "Diagnóstico" }, {
      quandoParou: "17/09 às 09:12",
      linkDeRetomada: "https://x/forms/diagnostico?retomar=abc",
    })
    expect(txt).toContain('Abandonou o formulário "Diagnóstico" em 2 de 3 perguntas.')
    expect(txt).toContain("Parou em: Faturamento mensal?")
    expect(txt).toContain("• Como você se chama? → Bruno")
    expect(txt).toContain("• Seu melhor email? → b@x.com")
    expect(txt).toContain("?retomar=abc")
  })

  it("sem respostas, o texto não inventa a seção", () => {
    const txt = textoDaTimeline(resumirAbandono(SCHEMA, {}, null), { name: "X" })
    expect(txt).not.toContain("O que respondeu")
    expect(txt).not.toContain("Parou em")
    expect(txt).toContain("0 de 3")
  })

  it("resposta múltipla sai em português", () => {
    const s = normalizarSchema({ blocks: [{ ref: "c", type: "multi_select", label: "Canais" }] })
    const r = resumirAbandono(s, { c: ["Email", "SMS"] }, null)
    expect(r.respostas[0].resposta).toBe("Email e SMS")
  })
})

describe("tituloDoNegocio", () => {
  it("o abandono aparece no NOME, não só na etapa", () => {
    expect(tituloDoNegocio({ name: "Bruno", email: null, phone: null }, { name: "Diagnóstico" })).toBe(
      "Bruno — abandonou Diagnóstico",
    )
  })

  it("sem nome, usa o contato que existe", () => {
    expect(tituloDoNegocio({ name: null, email: "b@x.com", phone: null }, { name: "D" })).toBe(
      "b@x.com — abandonou D",
    )
    expect(tituloDoNegocio({ name: "  ", email: null, phone: "119" }, { name: "D" })).toBe("119 — abandonou D")
    expect(tituloDoNegocio({ name: null, email: null, phone: null }, { name: "D" })).toBe("Sem nome — abandonou D")
  })
})
