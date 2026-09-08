import { describe, it, expect } from "vitest"
import { canalPodeEntregarFoto, canaisElegiveisParaAvatar } from "./avatar-elegibilidade"

describe("canalPodeEntregarFoto", () => {
  it("aceita Instagram (Messaging Profile API não depende de sessão)", () => {
    expect(canalPodeEntregarFoto({ id: "a", type: "instagram", config: {} })).toBe(true)
  })

  it("aceita Evolution com a sessão aberta", () => {
    expect(
      canalPodeEntregarFoto({
        id: "a",
        type: "whatsapp",
        provider: "evolution",
        config: { connection_state: "open" },
      }),
    ).toBe(true)
  })

  it("recusa Evolution deslogada — é o caso de produção (close desde 04/08)", () => {
    expect(
      canalPodeEntregarFoto({
        id: "a",
        type: "whatsapp",
        provider: "evolution",
        config: { connection_state: "close" },
      }),
    ).toBe(false)
  })

  it("recusa qualquer estado que não seja open (connecting não responde perfil)", () => {
    expect(
      canalPodeEntregarFoto({
        id: "a",
        type: "whatsapp",
        provider: "evolution",
        config: { connection_state: "connecting" },
      }),
    ).toBe(false)
  })

  it("trata estado ausente como aberto: canal novo ainda não recebeu connection.update", () => {
    expect(canalPodeEntregarFoto({ id: "a", type: "whatsapp", provider: "evolution" })).toBe(true)
    expect(
      canalPodeEntregarFoto({ id: "a", type: "whatsapp", provider: "evolution", config: {} }),
    ).toBe(true)
    expect(
      canalPodeEntregarFoto({
        id: "a",
        type: "whatsapp",
        provider: "evolution",
        config: { connection_state: "" },
      }),
    ).toBe(true)
  })

  it("recusa WhatsApp Cloud: a Meta não expõe foto de contato", () => {
    expect(
      canalPodeEntregarFoto({ id: "a", type: "whatsapp", provider: "cloud", config: {} }),
    ).toBe(false)
  })

  it("recusa canal desativado", () => {
    expect(canalPodeEntregarFoto({ id: "a", type: "instagram", is_active: false })).toBe(false)
  })

  it("recusa tipo desconhecido", () => {
    expect(canalPodeEntregarFoto({ id: "a", type: null })).toBe(false)
  })
})

describe("canaisElegiveisParaAvatar", () => {
  it("devolve só os ids que respondem hoje — o lote do cron não pode ser ocupado pelos mudos", () => {
    const ids = canaisElegiveisParaAvatar([
      { id: "ig-1", type: "instagram", config: {} },
      { id: "ig-2", type: "instagram", config: {} },
      {
        id: "wa-off",
        type: "whatsapp",
        provider: "evolution",
        config: { connection_state: "close" },
      },
    ])
    expect(ids).toEqual(["ig-1", "ig-2"])
  })

  it("lista vazia quando nenhum canal responde (o cron sai sem tocar em threads)", () => {
    expect(
      canaisElegiveisParaAvatar([
        {
          id: "wa",
          type: "whatsapp",
          provider: "evolution",
          config: { connection_state: "close" },
        },
      ]),
    ).toEqual([])
  })
})
