import { describe, expect, it } from "vitest"
import { audioExpiraEm, DIAS_RETENCAO_AUDIO } from "./transcricoes-assets"

/**
 * A janela de retomada é o que separa "transcrição saiu ruim, refaça" de
 * "reenvie o arquivo de 400 MB". Ela precisa aparecer na tela, e para
 * aparecer precisa ser calculável — daí o teste.
 */
describe("audioExpiraEm", () => {
  it("conta a janela a partir da conclusão", () => {
    const fim = audioExpiraEm("2026-09-06T12:00:00.000Z", "org-x/t1/audio.flac")
    expect(fim).toBeInstanceOf(Date)
    expect(fim!.toISOString()).toBe(
      new Date(Date.parse("2026-09-06T12:00:00.000Z") + DIAS_RETENCAO_AUDIO * 86_400_000).toISOString(),
    )
  })

  it("sem áudio guardado não há prazo — já foi descartado", () => {
    expect(audioExpiraEm("2026-09-06T12:00:00.000Z", null)).toBeNull()
  })

  it("sem conclusão não há prazo — ainda está processando", () => {
    // Contar a partir de "agora" prometeria uma janela que o cron não
    // honraria: ele mede por `concluido_em`.
    expect(audioExpiraEm(null, "org-x/t1/audio.flac")).toBeNull()
  })

  it("data corrompida não vira Invalid Date na tela", () => {
    expect(audioExpiraEm("nem data é", "org-x/t1/audio.flac")).toBeNull()
  })
})
