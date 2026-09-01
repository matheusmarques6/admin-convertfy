import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AlvoDeEncurtamento } from "@/lib/email-workspace/copy-fit"

const { invokeMock, loadConfigMock, startMock, finishMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  loadConfigMock: vi.fn(),
  startMock: vi.fn(),
  finishMock: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock("../architect/llm-invoke", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>
  return {
    ...real,
    invokeAgent: invokeMock,
    loadActiveAgentConfig: loadConfigMock,
  }
})

vi.mock("../callbacks/telemetry.callback", () => ({
  startGenerationRun: startMock,
  finishGenerationRun: finishMock,
  resolveCostCents: () => 1,
}))

import { runCopyFit } from "./copy-fit.chain"

function alvo(over: Partial<AlvoDeEncurtamento> = {}): AlvoDeEncurtamento {
  return {
    id: "1.section_body_1",
    position: 1,
    block_id: "b-body",
    type: "body",
    key: "section_body_1",
    label: "Corpo da seção",
    orientacao: "Um parágrafo curto",
    texto: "x".repeat(190),
    max: 120,
    min: null,
    motivos: ["max_len"],
    tracos: 0,
    ...over,
  }
}

function entrada(alvos: AlvoDeEncurtamento[]) {
  return {
    storeId: "store-1",
    batchId: "batch-1",
    emailId: "email-1",
    flowId: "flow-1",
    brandName: "InnovaBay",
    tomVoz: "direto",
    alvos,
  }
}

function respostaComResultado() {
  return finishMock.mock.calls.at(-1)?.[1] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  loadConfigMock.mockResolvedValue(null) // usa o DEFAULT in-code
  startMock.mockResolvedValue("run-1")
  finishMock.mockResolvedValue(undefined)
})

function respostaLLM(campos: Record<string, unknown>) {
  return {
    raw: JSON.stringify({ campos }),
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: 0,
  }
}

describe("runCopyFit", () => {
  it("sem alvo não chama o modelo nem abre run", async () => {
    const r = await runCopyFit(entrada([]))
    expect(r).toEqual({ aceitas: [], de_para: [], rodou: false })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(startMock).not.toHaveBeenCalled()
  })

  it("aceita a reescrita que cabe e devolve o endereço do bloco", async () => {
    invokeMock.mockResolvedValue(respostaLLM({ "1.section_body_1": "y".repeat(100) }))
    const r = await runCopyFit(entrada([alvo()]))
    expect(r.rodou).toBe(true)
    expect(r.aceitas).toEqual([
      {
        id: "1.section_body_1",
        position: 1,
        block_id: "b-body",
        key: "section_body_1",
        texto: "y".repeat(100),
      },
    ])
    expect(r.de_para[0]).toMatchObject({ antes_len: 190, depois_len: 100, aceito: true })
  })

  // O modelo erra o limite por pouco com frequência: a 2ª passada leva SÓ o
  // que não coube. A terceira não resolveria e custaria.
  it("reescrita que ainda estoura vai para uma retentativa, só ela", async () => {
    invokeMock
      .mockResolvedValueOnce(
        respostaLLM({
          "1.section_body_1": "y".repeat(150),
          "2.headline": "cabe",
        }),
      )
      .mockResolvedValueOnce(respostaLLM({ "1.section_body_1": "y".repeat(110) }))

    const r = await runCopyFit(
      entrada([
        alvo(),
        alvo({ id: "2.headline", position: 2, key: "headline", texto: "muito longo", max: 8 }),
      ]),
    )

    expect(invokeMock).toHaveBeenCalledTimes(2)
    // A 2ª chamada leva um contrato com UM campo — o que ainda não coube.
    const varsDaRetentativa = invokeMock.mock.calls[1][1] as Record<string, string>
    expect(JSON.parse(varsDaRetentativa.contrato_json)).toHaveLength(1)
    expect(varsDaRetentativa.contrato_json).toContain("1.section_body_1")

    expect(r.aceitas.map((a) => a.id).sort()).toEqual(["1.section_body_1", "2.headline"])
    expect(respostaComResultado().parsedOutput).toMatchObject({
      alvos: 2,
      corrigidos: 2,
      mantidos: 0,
      tentativas: 2,
    })
  })

  // A recusa nunca é silenciosa: o motivo entra no de_para do run.
  it("reescrita recusada mantém a original e registra o motivo", async () => {
    invokeMock.mockResolvedValue(respostaLLM({ "1.section_body_1": "y".repeat(150) }))
    const r = await runCopyFit(entrada([alvo()]))
    expect(r.aceitas).toEqual([])
    expect(r.de_para[0]).toMatchObject({
      aceito: false,
      motivo: "ainda_acima_do_limite",
      depois: null,
    })
  })

  it("campo que o modelo ignorou fica como sem_resposta", async () => {
    invokeMock.mockResolvedValue(respostaLLM({ "9.outro": "qualquer" }))
    const r = await runCopyFit(entrada([alvo()]))
    expect(r.aceitas).toEqual([])
    expect(r.de_para[0].motivo).toBe("sem_resposta")
  })

  // Fail-open: JSON torto não pode derrubar a geração.
  it("resposta inválida não lança e grava run com erro", async () => {
    invokeMock.mockResolvedValue({
      raw: "isso não é json",
      tokensInput: 10,
      tokensOutput: 5,
      costUsd: 0,
    })
    const r = await runCopyFit(entrada([alvo()]))
    expect(r.aceitas).toEqual([])
    expect(r.rodou).toBe(false)
    expect(respostaComResultado().status).toBe("error")
  })

  // Erro na retentativa não pode descartar a correção boa da 1ª passada.
  it("falha na 2ª passada preserva o que já foi aceito", async () => {
    invokeMock
      .mockResolvedValueOnce(
        respostaLLM({ "1.section_body_1": "y".repeat(100) }),
      )
      .mockRejectedValueOnce(new Error("timeout"))

    const r = await runCopyFit(
      entrada([
        alvo(),
        alvo({ id: "2.headline", position: 2, key: "headline", texto: "muito longo", max: 8 }),
      ]),
    )
    expect(r.aceitas.map((a) => a.id)).toEqual(["1.section_body_1"])
    expect(r.rodou).toBe(true)
    expect(respostaComResultado().status).toBe("error")
  })

  // O traço é motivo de alvo desde 01/09: campo que cabe no limite mas
  // volta com "—" entra na lista, e a reescrita que MANTÉM o traço é
  // recusada — a 2ª passada cobra de novo.
  it("reescrita que mantém o travessão é recusada e volta na retentativa", async () => {
    const comTraco = alvo({
      id: "1.body",
      key: "body",
      texto: "Funciona — e sem risco.",
      max: 120,
      motivos: ["travessao"],
      tracos: 1,
    })
    invokeMock
      .mockResolvedValueOnce(respostaLLM({ "1.body": "Funciona — sem risco." }))
      .mockResolvedValueOnce(respostaLLM({ "1.body": "Funciona, e é sem risco." }))

    const r = await runCopyFit(entrada([comTraco]))

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(r.aceitas[0].texto).toBe("Funciona, e é sem risco.")
    const out = respostaComResultado().parsedOutput as Record<string, unknown>
    expect(out).toMatchObject({
      com_travessao: 1,
      travessoes_antes: 1,
      travessoes_depois: 0,
    })
  })

  // O número que prova o trabalho: recusado até o fim, o traço CONTINUA no
  // texto que o cliente lê — e o `depois` tem de dizer isso.
  it("traço que sobrevive às duas passadas conta em travessoes_depois", async () => {
    invokeMock.mockResolvedValue(respostaLLM({ "1.body": "Ainda — com traço." }))
    const r = await runCopyFit(
      entrada([
        alvo({
          id: "1.body",
          key: "body",
          texto: "Funciona — e sem risco.",
          max: 120,
          motivos: ["travessao"],
          tracos: 1,
        }),
      ]),
    )
    expect(r.aceitas).toEqual([])
    const out = respostaComResultado().parsedOutput as Record<string, unknown>
    expect(out).toMatchObject({ travessoes_antes: 1, travessoes_depois: 1 })
    const dePara = (out.de_para as Array<Record<string, unknown>>)[0]
    expect(dePara.motivo).toBe("traco_permaneceu")
  })

  // Sem entrada no mapa de origens o guard de recomposição zera os segmentos
  // e a run perde a proveniência inteira, em silêncio.
  it("grava proveniência: os segmentos recompõem o prompt enviado", async () => {
    invokeMock.mockResolvedValue(respostaLLM({ "1.section_body_1": "y".repeat(100) }))
    await runCopyFit(entrada([alvo()]))

    const params = startMock.mock.calls[0][0] as Record<string, unknown>
    const segments = params.promptSegments as Array<{
      texto: string
      parte: string
      cls: string
    }>
    expect(segments).toBeTruthy()
    const userRecomposto = segments
      .filter((s) => s.parte === "user")
      .map((s) => s.texto)
      .join("")
    expect(userRecomposto).toBe(params.renderedPrompt)
    // As quatro classes esperadas do encurtador.
    const classes = new Set(segments.map((s) => s.cls))
    expect(classes).toContain("agente")
    expect(classes).toContain("loja")
    expect(classes).toContain("curadoria")
    expect(classes).toContain("upstream")
  })

  // ── Idioma (01/09) ────────────────────────────────────────────────────
  const ALVO_IDIOMA = {
    id: "0.offer_body",
    position: 0,
    block_id: "b-offer",
    type: "offer",
    key: "offer_body",
    label: "Corpo da oferta",
    orientacao: "",
    texto: "Use code WELCOME10 na compra. Sem mínimo, sem expiração.",
    max: 200,
    min: null,
    motivos: ["idioma"] as const,
    tracos: 0,
    idioma_detectado: "pt" as const,
    idioma_esperado: "en",
  }

  it("o contrato pede o idioma da loja pelo nome", async () => {
    invokeMock.mockResolvedValue(respostaLLM({}))
    await runCopyFit(entrada([alvo(ALVO_IDIOMA)]))
    const vars = invokeMock.mock.calls[0][1] as Record<string, string>
    expect(vars.contrato_json).toContain('"reescrever_no_idioma": "en (Inglês)"')
    expect(vars.copy_atual_json).toContain('"idioma_agora": "pt"')
  })

  it("aceita a versão em inglês e registra o antes/depois do idioma", async () => {
    invokeMock.mockResolvedValue(
      respostaLLM({
        "0.offer_body": "Use the code WELCOME10 and get your first order with no minimum.",
      }),
    )
    const r = await runCopyFit(entrada([alvo(ALVO_IDIOMA)]))
    expect(r.aceitas).toHaveLength(1)
    const parsed = respostaComResultado().parsedOutput as Record<string, unknown>
    expect(parsed.com_idioma_errado).toBe(1)
    expect(parsed.idioma_esperado).toBe("en")
    expect(parsed.idioma_errado_depois).toBe(0)
    const dePara = (parsed.de_para as Array<Record<string, unknown>>)[0]
    expect(dePara.idioma_antes).toBe("pt")
    expect(dePara.idioma_depois).toBe("en")
  })

  it("reescrita que volta em português é recusada — a copy original fica", async () => {
    invokeMock.mockResolvedValue(
      respostaLLM({
        "0.offer_body": "Use o código WELCOME10 na sua compra. Sem valor mínimo.",
      }),
    )
    const r = await runCopyFit(entrada([alvo(ALVO_IDIOMA)]))
    expect(r.aceitas).toEqual([])
    const parsed = respostaComResultado().parsedOutput as Record<string, unknown>
    const dePara = (parsed.de_para as Array<Record<string, unknown>>)[0]
    expect(dePara.motivo).toBe("idioma_permaneceu")
    expect(dePara.idioma_depois).toBe("pt")
    expect(parsed.idioma_errado_depois).toBe(1)
  })

})
