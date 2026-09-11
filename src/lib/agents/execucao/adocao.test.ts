import { describe, expect, it } from "vitest"

import { decidirAdocao, JANELA_DE_ADOCAO_MS } from "./adocao"

const AGORA = Date.parse("2026-09-11T16:38:00Z")
const iso = (msAntes: number) => new Date(AGORA - msAntes).toISOString()

describe("decidirAdocao", () => {
  it("execução carimbada com o MESMO batch é adotada, sem recarimbar", () => {
    expect(
      decidirAdocao({
        batchDaExecucao: "batch-a",
        batchAtual: "batch-a",
        startedAt: iso(60_000),
        agora: AGORA,
      }),
    ).toEqual({ adota: true, carimba: false })
  })

  // O caso real (Hero Boxers, 11/09): execução de 16:31 com `assembler_chooser`
  // e `blueprint` pinados foi adotada pela geração de 16:38 e curto-circuitou a
  // fase 1. Sete minutos, nenhuma run `skipped`, nada em tela.
  it("execução criada há 7 min e NUNCA disparada não é adotada", () => {
    const d = decidirAdocao({
      batchDaExecucao: null,
      batchAtual: "batch-novo",
      startedAt: iso(7 * 60_000),
      agora: AGORA,
    })
    expect(d.adota).toBe(false)
    expect(d.motivo).toMatch(/nunca disparada/)
  })

  it("execução recém-criada é adotada e CARIMBADA", () => {
    expect(
      decidirAdocao({
        batchDaExecucao: null,
        batchAtual: "batch-novo",
        startedAt: iso(8_000),
        agora: AGORA,
      }),
    ).toEqual({ adota: true, carimba: true })
  })

  it("a janela é o limite, não uma aproximação", () => {
    const dentro = decidirAdocao({
      batchDaExecucao: null,
      batchAtual: "b",
      startedAt: iso(JANELA_DE_ADOCAO_MS - 1),
      agora: AGORA,
    })
    const fora = decidirAdocao({
      batchDaExecucao: null,
      batchAtual: "b",
      startedAt: iso(JANELA_DE_ADOCAO_MS + 1),
      agora: AGORA,
    })
    expect(dentro.adota).toBe(true)
    expect(fora.adota).toBe(false)
  })

  it("execução de OUTRO batch nunca é herdada, por mais nova que seja", () => {
    const d = decidirAdocao({
      batchDaExecucao: "batch-antigo",
      batchAtual: "batch-novo",
      startedAt: iso(1_000),
      agora: AGORA,
    })
    expect(d.adota).toBe(false)
    expect(d.motivo).toMatch(/outra geração/)
  })

  it("sem batch atual não adota — não haveria como carimbar", () => {
    // Adotar aqui deixaria a execução solta para a próxima geração, que é
    // exatamente o defeito que este módulo fecha.
    const d = decidirAdocao({
      batchDaExecucao: null,
      batchAtual: null,
      startedAt: iso(1_000),
      agora: AGORA,
    })
    expect(d.adota).toBe(false)
    expect(d.motivo).toMatch(/sem batch/)
  })

  it("data ilegível cai para produção, não para o caminho antigo", () => {
    const d = decidirAdocao({
      batchDaExecucao: null,
      batchAtual: "b",
      startedAt: "não é data",
      agora: AGORA,
    })
    expect(d.adota).toBe(false)
    expect(d.motivo).toMatch(/início legível/)
  })
})
