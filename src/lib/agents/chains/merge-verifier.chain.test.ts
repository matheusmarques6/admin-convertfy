/**
 * Verificador de merge (7b): parse defensivo do output + invoke.
 * Falha de parse/invoke NUNCA derruba a geração — o runner trata como
 * fallback mecânico; aqui garantimos que o erro sobe nomeado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

const invokeFormatModel = vi.fn()
vi.mock("./format-invoke", async (importActual) => {
  const actual = await importActual<typeof import("./format-invoke")>()
  return {
    ...actual,
    invokeFormatModel: (...a: unknown[]) => invokeFormatModel(...a),
  }
})

import {
  parseMergeVerifierOutput,
  invokeMergeVerifierChain,
  DEFAULT_MERGE_VERIFIER_SYSTEM_PROMPT,
} from "./merge-verifier.chain"

beforeEach(() => invokeFormatModel.mockReset())

describe("parseMergeVerifierOutput", () => {
  it("parseia a fila com copy candidata e ação sugerida", () => {
    const r = parseMergeVerifierOutput(
      JSON.stringify({
        aprovado: true,
        excecoes: [
          {
            block_id: "b1",
            tag: "{{ LEGAL_LINE }}",
            motivo: "slot_vazio",
            copy_candidata: { key: "cupom", valor: "Use VOLTA10" },
            acao_sugerida: "preencher",
          },
          { tag: "SUBTITLE_2", motivo: "sem_copy", acao_sugerida: "remove_row" },
        ],
      }),
    )
    expect(r.aprovado).toBe(true)
    expect(r.excecoes).toEqual([
      {
        block_id: "b1",
        tag: "LEGAL_LINE", // normalizada (sem chaves/espaços)
        motivo: "slot_vazio",
        copy_candidata: { key: "cupom", valor: "Use VOLTA10" },
        acao_sugerida: "preencher",
      },
      {
        block_id: null,
        tag: "SUBTITLE_2",
        motivo: "sem_copy",
        copy_candidata: null,
        acao_sugerida: "remove_row",
      },
    ])
  })

  it("tolera fences markdown e prosa ao redor (extractJson)", () => {
    const r = parseMergeVerifierOutput(
      'Segue a auditoria:\n```json\n{"aprovado": false, "excecoes": []}\n```',
    )
    expect(r.aprovado).toBe(false)
    expect(r.excecoes).toEqual([])
  })

  it("entrada sem tag é descartada; candidata com valor vazio vira null", () => {
    const r = parseMergeVerifierOutput(
      JSON.stringify({
        excecoes: [
          { motivo: "sem tag" },
          { tag: "X", copy_candidata: { key: "k", valor: "  " } },
        ],
      }),
    )
    expect(r.excecoes).toHaveLength(1)
    expect(r.excecoes[0].tag).toBe("X")
    expect(r.excecoes[0].copy_candidata).toBeNull()
  })

  it("output sem array excecoes → lança (runner cai no fallback)", () => {
    expect(() => parseMergeVerifierOutput('{"aprovado": true}')).toThrow(
      "excecoes",
    )
    expect(() => parseMergeVerifierOutput("não é json")).toThrow()
  })
})

describe("invokeMergeVerifierChain", () => {
  const config = {
    model: "moonshotai/kimi-k3",
    temperature: 0.2,
    max_tokens: 2048,
    system_prompt: "",
    user_template: "",
  }

  it("usa o prompt default quando a config vem vazia e parseia o output", async () => {
    invokeFormatModel.mockResolvedValue({
      text: '{"aprovado": true, "excecoes": []}',
      tokensInput: 100,
      tokensOutput: 20,
      costUsd: 0,
    })
    const r = await invokeMergeVerifierChain({
      config,
      vars: {
        relatorio_merge_json: "{}",
        slots_preenchidos_json: "[]",
        slots_sobrando_json: "[]",
        copy_nao_usada_json: "[]",
      },
    })
    expect(r.result.aprovado).toBe(true)
    expect(invokeFormatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "moonshotai/kimi-k3",
        systemPrompt: DEFAULT_MERGE_VERIFIER_SYSTEM_PROMPT,
        // Julgamento curto: reasoning desligado por padrão.
        reasoning: { enabled: false },
      }),
    )
  })

  it("output inválido do modelo → lança (nunca retorna fila fantasma)", async () => {
    invokeFormatModel.mockResolvedValue({
      text: "desculpa, não consegui",
      tokensInput: 1,
      tokensOutput: 1,
      costUsd: 0,
    })
    await expect(
      invokeMergeVerifierChain({ config, vars: {} }),
    ).rejects.toThrow()
  })
})
