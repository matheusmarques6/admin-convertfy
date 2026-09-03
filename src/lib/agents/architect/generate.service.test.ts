import { describe, it, expect, vi, beforeEach } from "vitest"

// Controla o source do blueprint + spies dos passos.
const h = vi.hoisted(() => ({
  blueprintSource: "ai" as "ai" | "manual",
  textOnly: false,
  // Guard de reuso: existência de reference/blueprint persistidos por loja.
  storedRef: false,
  storedBp: false,
  reconcileSpy: vi.fn(),
  assembleSpy: vi.fn(),
  blueprintSpy: vi.fn(),
  // Estruturador (02/09): modo lido de email_generation_settings e a run
  // mockada — o teste controla a sequência que ele devolve.
  estruturadorMode: "off" as "off" | "shadow" | "on",
  estruturadorSpy: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => {
  // Builder mínimo table-aware: o Promise.all inicial lê store/briefing/
  // produtos/outline ({} genérico); o guard de reuso lê store_email_
  // references/blueprints (controlado por h.storedRef/h.storedBp).
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        if (table === "client_stores") {
          return Promise.resolve({ data: { org_id: "org1" }, error: null })
        }
        if (table === "email_generation_settings") {
          return Promise.resolve({
            data: { estruturador_mode: h.estruturadorMode },
            error: null,
          })
        }
        if (table === "store_email_references") {
          return Promise.resolve({
            data: h.storedRef ? { id: "ref1" } : null,
            error: null,
          })
        }
        if (table === "store_email_blueprints") {
          return Promise.resolve({
            data: h.storedBp ? { id: "bp1" } : null,
            error: null,
          })
        }
        return Promise.resolve({ data: {}, error: null })
      },
      then: (onF: (v: unknown) => unknown) => {
        // Lookup do email desta geração (email_id/flow_id p/ telemetria).
        if (table === "email_flow_emails") {
          return Promise.resolve({
            data: [{ id: "email-1", flow_id: "flow-1" }],
            error: null,
          }).then(onF)
        }
        return Promise.resolve({ data: [], error: null }).then(onF)
      },
    }
    return chain
  }
  return {
    createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
    createClient: () => ({}),
  }
})

vi.mock("../estruturador/estruturador.service", () => ({
  runEstruturador: (...a: unknown[]) => h.estruturadorSpy(...a),
}))

vi.mock("./component-assembler.service", () => ({
  assembleStoreReference: (...a: unknown[]) => {
    h.assembleSpy(...a)
    return Promise.resolve({ html: "<html></html>", source: "llm", variantIds: [] })
  },
}))

vi.mock("./blueprint-generator.service", () => ({
  generateStoreBlueprint: (...a: unknown[]) => {
    h.blueprintSpy(...a)
    return Promise.resolve({
      blueprint: { objective: "", messaging: "", subject_hint: null, blocks: [] },
      source: h.blueprintSource,
      model: h.blueprintSource === "ai" ? "sonnet" : null,
    })
  },
}))

vi.mock("@/lib/services/reconcile-blocks.service", () => ({
  reconcileEmailStructure: (...a: unknown[]) => h.reconcileSpy(...a),
}))

vi.mock("../reference-template", () => ({
  loadGlobalReferenceTemplate: () => Promise.resolve(""),
}))

vi.mock("./outline-sections", () => ({
  resolveStructure: () => [],
}))

// Flag "somente texto": controlada pelo teste (default false).
vi.mock("./blueprint-loader", () => ({
  loadGlobalBlueprintBlocks: () => Promise.resolve([]),
  isTextOnlyEmail: () => Promise.resolve(h.textOnly),
}))

import { generateBlueprintAndReference } from "./generate.service"

const input = { storeId: "store1", flowType: "welcome", emailNumber: 1, batchId: "b1" }

beforeEach(() => {
  h.blueprintSource = "ai"
  h.textOnly = false
  h.storedRef = false
  h.storedBp = false
  h.estruturadorMode = "off"
  h.estruturadorSpy.mockReset()
  h.reconcileSpy.mockReset()
  h.reconcileSpy.mockResolvedValue({
    reconciled: true,
    added: 7,
    total: 17,
    skipped: null,
  })
  h.assembleSpy.mockReset()
  h.blueprintSpy.mockReset()
})

describe("generateBlueprintAndReference — propaga estrutura (Fase 1)", () => {
  it("resolve o email da geração e repassa emailId/flowId ao Montador e ao Blueprint", async () => {
    // Sem isso as runs da fase 1 nascem com email_id NULL e ficam
    // invisíveis na aba Execuções (nós "pulado" com run success no banco).
    await generateBlueprintAndReference(input)
    expect(h.assembleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: "email-1", flowId: "flow-1" }),
    )
    expect(h.blueprintSpy).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: "email-1", flowId: "flow-1" }),
    )
  })

  it("source='ai' → reconcilia os email_blocks com a estrutura nova", async () => {
    h.blueprintSource = "ai"
    const res = await generateBlueprintAndReference(input)
    expect(h.reconcileSpy).toHaveBeenCalledWith("store1", "welcome", 1, {
      force: false,
    })
    expect(res.referenceSource).toBe("llm")
  })

  it("source='manual' (fallback) → NÃO reconcilia (store_bp não mudou)", async () => {
    h.blueprintSource = "manual"
    await generateBlueprintAndReference(input)
    expect(h.reconcileSpy).not.toHaveBeenCalled()
  })

  it("falha no reconcile NÃO derruba o Architect", async () => {
    h.blueprintSource = "ai"
    h.reconcileSpy.mockRejectedValue(new Error("db down"))
    const res = await generateBlueprintAndReference(input)
    expect(h.reconcileSpy).toHaveBeenCalled()
    expect(res.referenceSource).toBe("llm")
  })
})

describe("generateBlueprintAndReference — email somente texto (text_only)", () => {
  it("curto-circuita com referenceSource='global' SEM rodar Montador/Blueprint/reconcile", async () => {
    h.textOnly = true
    const res = await generateBlueprintAndReference(input)
    expect(res.referenceSource).toBe("global")
    expect(h.assembleSpy).not.toHaveBeenCalled()
    expect(h.blueprintSpy).not.toHaveBeenCalled()
    expect(h.reconcileSpy).not.toHaveBeenCalled()
  })
})

describe("generateBlueprintAndReference — guard de reuso (sem force)", () => {
  it("reference+blueprint persistidos → 'store' SEM rodar Montador/Blueprint", async () => {
    h.storedRef = true
    h.storedBp = true
    const res = await generateBlueprintAndReference(input)
    expect(res.referenceSource).toBe("store")
    expect(h.assembleSpy).not.toHaveBeenCalled()
    expect(h.blueprintSpy).not.toHaveBeenCalled()
    expect(h.reconcileSpy).not.toHaveBeenCalled()
  })

  it("force=true → regenera mesmo com reference+blueprint persistidos", async () => {
    h.storedRef = true
    h.storedBp = true
    const res = await generateBlueprintAndReference({ ...input, force: true })
    expect(res.referenceSource).toBe("llm")
    expect(h.assembleSpy).toHaveBeenCalledTimes(1)
    expect(h.blueprintSpy).toHaveBeenCalledTimes(1)
  })

  it("só reference sem blueprint (geração anterior incompleta) → regenera", async () => {
    h.storedRef = true
    h.storedBp = false
    const res = await generateBlueprintAndReference(input)
    expect(res.referenceSource).toBe("llm")
    expect(h.assembleSpy).toHaveBeenCalledTimes(1)
  })
})


describe("generateBlueprintAndReference — Estruturador ligado (02/09)", () => {
  const decisao = {
    diagnostico: { objecao_dominante: "eficácia", traducao_do_mecanismo: "inspeção → prova" },
    // Ordem DIFERENTE da Arquitetura de propósito: a sequência é dele.
    estrutura: [
      { section: "hero", papel: "Entregar o cupom", referencia: "r1", porque: "p" },
      { section: "body", papel: "Nomear a objeção", referencia: "r1", adaptacao: "gadget", porque: "p" },
      { section: "offer", papel: "Remover o risco", referencia: "r1", porque: "p" },
    ],
    fio_narrativo: "cupom → objeção → risco",
    fontes: [],
    aprendizados_aplicados: [],
    text_only: false,
    descartes: [{ section: "cta", papel_na_referencia: "CTA isolado", porque: "competiria", origem: "modelo" }],
  }

  it("modo on: a sequência é a dele, a decisão COMPLETA vai ao Curador e os papéis ao blueprint; reuso é ignorado", async () => {
    h.estruturadorMode = "on"
    h.storedRef = true
    h.storedBp = true
    h.estruturadorSpy.mockResolvedValue({ output: decisao, runId: "run-e", status: "ok" })

    const res = await generateBlueprintAndReference(input)
    expect(res.referenceSource).toBe("llm")
    // Recebe o perfil inteiro + top produtos, NÃO os campos soltos nem intenções por bloco.
    const entrada = h.estruturadorSpy.mock.calls[0][0] as Record<string, unknown>
    expect(entrada).toMatchObject({ mode: "on", flowType: "welcome", emailNumber: 1 })
    expect(entrada).toHaveProperty("pesquisa")
    expect(entrada).toHaveProperty("topProducts")
    expect(entrada).not.toHaveProperty("intencoesPorBloco")
    expect(entrada).not.toHaveProperty("nicho")

    const asm = h.assembleSpy.mock.calls[0][0] as { structure: Array<{ section: string; label: string }>; estruturadorDecisao: string }
    expect(asm.structure.map((s) => s.section)).toEqual(["hero", "body", "offer"])
    expect(asm.structure[1].label).toBe("Nomear a objeção")
    const servida = JSON.parse(asm.estruturadorDecisao)
    expect(servida.descartes[0].papel_na_referencia).toBe("CTA isolado")
    expect(servida.estrutura[1].adaptacao).toBe("gadget")

    const bp = h.blueprintSpy.mock.calls[0][0] as Record<string, unknown>
    expect(bp.papeisPorPosicao).toEqual([
      "Entregar o cupom",
      "Nomear a objeção — Adaptação: gadget",
      "Remover o risco",
    ])
    expect(bp.intencoesHumanas).toBe(0)
    expect(bp.fioNarrativo).toBe("cupom → objeção → risco")
    expect(bp.estruturadorStatus).toBe("consumido")
  })

  it("modo on com falha do Estruturador: segue sem ele (fail-open) e o Curador não recebe decisão", async () => {
    h.estruturadorMode = "on"
    h.estruturadorSpy.mockResolvedValue({ output: null, runId: "run-e", status: "falhou" })
    await generateBlueprintAndReference(input)
    const asm = h.assembleSpy.mock.calls[0][0] as { estruturadorDecisao: string | null }
    expect(asm.estruturadorDecisao).toBeNull()
    const bp = h.blueprintSpy.mock.calls[0][0] as Record<string, unknown>
    expect(bp.estruturadorStatus).toBe("falhou")
  })

  it("modo off: não chama o Estruturador", async () => {
    await generateBlueprintAndReference(input)
    expect(h.estruturadorSpy).not.toHaveBeenCalled()
  })
})
