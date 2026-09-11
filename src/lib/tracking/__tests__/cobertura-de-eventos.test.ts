import { describe, expect, it } from "vitest"

import {
  avisoDeCobertura,
  DIAS_SEM_REFERENCIA,
  inicioDaJanela,
  medirCobertura,
} from "../cobertura-de-eventos"

const DESDE = "2026-07-01T00:00:00Z"

const cadastro = (id: string, created_at: string, tem_lead = true) => ({ id, created_at, tem_lead })

describe("cobertura entre cadastro e fila", () => {
  it("conta quem não gerou evento nenhum", () => {
    const c = medirCobertura(
      [cadastro("a", "2026-08-05T00:00:00Z"), cadastro("b", "2026-08-10T00:00:00Z")],
      new Set(["a"]),
      DESDE,
    )
    expect(c.elegiveis).toBe(2)
    expect(c.com_evento).toBe(1)
    expect(c.sem_evento).toBe(1)
    expect(c.exemplos).toEqual([{ submission_id: "b", created_at: "2026-08-10T00:00:00Z" }])
  })

  it("cadastro sem lead fica fora da conta — o envio nem é tentado", () => {
    const c = medirCobertura(
      [cadastro("a", "2026-08-05T00:00:00Z", false), cadastro("b", "2026-08-10T00:00:00Z")],
      new Set(),
      DESDE,
    )
    expect(c.elegiveis).toBe(1)
    expect(c.sem_evento).toBe(1)
    expect(c.exemplos.map((e) => e.submission_id)).toEqual(["b"])
  })

  it("os exemplos vêm do mais recente para o mais antigo", () => {
    const c = medirCobertura(
      [
        cadastro("velho", "2026-08-01T00:00:00Z"),
        cadastro("novo", "2026-08-29T00:00:00Z"),
        cadastro("meio", "2026-08-10T00:00:00Z"),
      ],
      new Set(),
      DESDE,
    )
    expect(c.exemplos.map((e) => e.submission_id)).toEqual(["novo", "meio", "velho"])
    expect(c.ultimo_sem_evento).toBe("2026-08-29T00:00:00Z")
  })

  it("mostra no máximo cinco exemplos, mas conta todos", () => {
    const muitos = Array.from({ length: 13 }, (_, i) =>
      cadastro(`s${i}`, `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    )
    const c = medirCobertura(muitos, new Set(), DESDE)
    expect(c.sem_evento).toBe(13)
    expect(c.exemplos).toHaveLength(5)
  })

  it("sem lacuna não há aviso — o espaço da tela é do problema", () => {
    const c = medirCobertura([cadastro("a", "2026-08-05T00:00:00Z")], new Set(["a"]), DESDE)
    expect(c.sem_evento).toBe(0)
    expect(c.ultimo_sem_evento).toBeNull()
    expect(avisoDeCobertura(c)).toBeNull()
  })

  it("o aviso diz que o evento não chegou a entrar na fila", () => {
    const c = medirCobertura([cadastro("a", "2026-08-05T00:00:00Z")], new Set(), DESDE)
    const aviso = avisoDeCobertura(c)
    expect(aviso).toContain("1 cadastro não gerou")
    expect(aviso).toContain("nunca chegou a entrar na fila")
  })

  it("plural correto com mais de um", () => {
    const c = medirCobertura(
      [cadastro("a", "2026-08-05T00:00:00Z"), cadastro("b", "2026-08-06T00:00:00Z")],
      new Set(),
      DESDE,
    )
    expect(avisoDeCobertura(c)).toContain("2 cadastros não geraram")
  })

  it("lista vazia não quebra", () => {
    const c = medirCobertura([], new Set(), DESDE)
    expect(c).toMatchObject({ elegiveis: 0, com_evento: 0, sem_evento: 0, ultimo_sem_evento: null })
  })
})

describe("janela de cobrança", () => {
  it("cadastro anterior à janela não é cobrado", () => {
    const c = medirCobertura(
      [cadastro("antigo", "2026-05-13T00:00:00Z"), cadastro("novo", "2026-08-10T00:00:00Z")],
      new Set(),
      DESDE,
    )
    expect(c.fora_da_janela).toBe(1)
    expect(c.elegiveis).toBe(1)
    expect(c.sem_evento).toBe(1)
    expect(c.exemplos.map((e) => e.submission_id)).toEqual(["novo"])
  })

  it("o marco é o primeiro evento já enfileirado", () => {
    expect(inicioDaJanela("2026-07-21T10:00:00Z")).toBe("2026-07-21T10:00:00Z")
  })

  it("sem nenhum evento, a janela vira um prazo recente", () => {
    const agora = new Date("2026-09-11T00:00:00Z")
    const desde = inicioDaJanela(null, agora)
    const dias = (agora.getTime() - new Date(desde).getTime()) / 86_400_000
    expect(dias).toBe(DIAS_SEM_REFERENCIA)
  })

  it("formulário sem evento nenhum ainda é acusado — é o pior caso", () => {
    const c = medirCobertura(
      [cadastro("a", "2026-09-10T00:00:00Z")],
      new Set(),
      inicioDaJanela(null, new Date("2026-09-11T00:00:00Z")),
    )
    expect(c.sem_evento).toBe(1)
    expect(avisoDeCobertura(c)).not.toBeNull()
  })
})
