/**
 * `buscar_doutrina` (09/09): a base do Advisor Max aberta ao Curador.
 *
 * O que estes testes travam: só as subpastas de método entram; o cabeçalho
 * que rebaixa a doutrina a "curso" vai SEMPRE; erro vira texto (o loop de
 * tools nunca pode morrer por uma consulta); vazio diz para não inventar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
  notas: [] as Array<{ path: string; titulo: string; pasta: string; resumo: string | null }>,
  semanticaRodou: true,
  falha: null as string | null,
  corpos: new Map<string, string>(),
  chamadas: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/ai/convertia/knowledge", () => ({
  buscarConhecimento: async (_admin: unknown, params: Record<string, unknown>) => {
    h.chamadas.push(params)
    if (h.falha) throw new Error(h.falha)
    return { notas: h.notas, semanticaRodou: h.semanticaRodou }
  },
  lerNotaDaBase: async (_admin: unknown, ref: string) => {
    const body = h.corpos.get(ref)
    return body ? { path: ref, title: ref, body } : null
  },
}))

import { buscarDoutrina, executarFerramentaDoVault, VAULT_TOOLS } from "./curador-vault-tools"

beforeEach(() => {
  h.notas = []
  h.semanticaRodou = true
  h.falha = null
  h.corpos = new Map()
  h.chamadas = []
})

describe("buscar_doutrina", () => {
  it("está em VAULT_TOOLS — o Curador ganha a ferramenta sem mudança do caller", () => {
    expect(VAULT_TOOLS.map((t) => t.function.name)).toContain("buscar_doutrina")
  })

  it("busca com o prefixo do Max, filtra as subpastas de método e serve top 3 + corpo da 1ª", async () => {
    h.notas = [
      { path: "Advisors/Max/_registro/descartes-1.md", titulo: "Descartes", pasta: "Advisors/Max/_registro", resumo: "fora" },
      { path: "Advisors/Max/design/hierarquia.md", titulo: "Hierarquia visual", pasta: "Advisors/Max/design", resumo: "uma promessa" },
      { path: "Advisors/Max/sms/x.md", titulo: "SMS", pasta: "Advisors/Max/sms", resumo: null },
      { path: "Advisors/Max/copy/prova.md", titulo: "Prova social", pasta: "Advisors/Max/copy", resumo: null },
      { path: "Advisors/Max/flows/welcome.md", titulo: "Welcome", pasta: "Advisors/Max/flows", resumo: "3 toques" },
      { path: "Advisors/Max/fundamentos/z.md", titulo: "Fund", pasta: "Advisors/Max/fundamentos", resumo: null },
      { path: "Advisors/Max", titulo: "Max", pasta: "Advisors/Max", resumo: "persona" },
    ]
    h.corpos.set("Advisors/Max/design/hierarquia.md", "# Hierarquia\nUma promessa por dobra.")
    const r = await buscarDoutrina("prova social antes da oferta")
    expect(h.chamadas[0]).toMatchObject({ folderPrefix: "Advisors/Max", limit: 12 })
    expect(r.startsWith("[doutrina de curso — perde para dado da loja")).toBe(true)
    expect(r).toContain("1. Hierarquia visual — Advisors/Max/design/hierarquia.md — uma promessa")
    expect(r).toContain("2. Prova social")
    expect(r).toContain("3. Welcome")
    expect(r).not.toContain("Fund")
    expect(r).not.toContain("Descartes")
    expect(r).not.toContain("SMS")
    expect(r).not.toContain("persona")
    expect(r).toContain("Uma promessa por dobra.")
  })

  it("vazio manda não inventar; sem semântica avisa", async () => {
    h.semanticaRodou = false
    const r = await buscarDoutrina("algo sem nota")
    expect(r).toContain("não invente a regra")
    expect(r).toContain("só a busca por palavras rodou")
  })

  it("erro vira texto com o cabeçalho, nunca lança", async () => {
    h.falha = "statement timeout"
    const r = await executarFerramentaDoVault("buscar_doutrina", { pergunta: "x" })
    expect(r).toContain("falhou: statement timeout")
    expect(r).toContain("[doutrina de curso")
  })

  it("pergunta vazia é recusada com instrução", async () => {
    expect(await buscarDoutrina("")).toContain("informe a pergunta")
  })
})
