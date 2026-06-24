/**
 * Testes de buildN8nTheme — o que o admin manda pro n8n. A "Estrutura & tom da
 * copy" do COO (brief.structure) é o TEMA e tem prioridade: vira o conteúdo
 * literal da master (1 bloco texto, placeholders intactos), sem grid de produtos.
 */
import { describe, it, expect, vi } from "vitest"

// Deps pesadas mockadas só pra importar o módulo (a função sob teste é pura).
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}))

import { buildN8nTheme } from "./campaign-copy-dispatch.service"
import type { CampaignSuggestion, EmailDraft } from "@/types/campaign-central"

type ThemeInput = Pick<CampaignSuggestion, "brief" | "email_draft">

function draft(over: Partial<EmailDraft> = {}): EmailDraft {
  return {
    subject: "",
    preheader: "",
    strategy: "",
    blocks: [{ id: "b1", type: "text", value: "corpo da copy" }],
    ...over,
  }
}

const STRUCTURE = [
  "🎯 HERO",
  "A GENTE DEIXA ELES FALAREM.",
  "[NÚMERO]+ clientes já recomendam.",
  "[QUERO FAZER PARTE]",
  "",
  "⭐ DEPOIMENTOS",
  "[TÍTULO DO DEPOIMENTO 1]",
  "[Texto do depoimento…]",
  "[NOME] | Cliente verificado",
].join("\n")

describe("buildN8nTheme", () => {
  it("usa a estrutura do COO como master literal, placeholders intactos, sem produtos", () => {
    const input: ThemeInput = {
      brief: { structure: STRUCTURE, tone: "confiante" },
      email_draft: null,
    }
    const { master, brief } = buildN8nTheme(input)
    expect(master.blocks).toHaveLength(1)
    expect(master.blocks[0].type).toBe("text")
    expect(master.blocks[0].value).toBe(STRUCTURE)
    expect(master.blocks[0].value).toContain("[NÚMERO]")
    expect(master.blocks[0].value).toContain("[Texto do depoimento…]")
    expect(master.blocks[0].value.toLowerCase()).not.toContain("bestseller")
    expect(brief.structure).toBe(STRUCTURE)
    expect(brief.tone).toBe("confiante")
  })

  it("com estrutura, subject/preheader/strategy vão vazios e a estrutura vence o email_draft da IA", () => {
    const input: ThemeInput = {
      brief: { structure: STRUCTURE },
      email_draft: draft({ subject: "Assunto via IA", preheader: "Pre IA", strategy: "Estrat IA" }),
    }
    const { master } = buildN8nTheme(input)
    expect(master.subject).toBe("")
    expect(master.preheader).toBe("")
    expect(master.strategy).toBe("")
    expect(master.blocks[0].value).toBe(STRUCTURE)
  })

  it("sem estrutura, cai pro email_draft (master) preservando subject e corpo", () => {
    const input: ThemeInput = {
      brief: null,
      email_draft: draft({ subject: "Assunto IA", blocks: [{ id: "b1", type: "text", value: "corpo gerado" }] }),
    }
    const { master, brief } = buildN8nTheme(input)
    expect(master.subject).toBe("Assunto IA")
    expect(master.blocks[0].value).toContain("corpo gerado")
    expect(brief.structure).toBeNull()
  })

  it("estrutura só com espaços é tratada como ausente (cai pro draft)", () => {
    const input: ThemeInput = {
      brief: { structure: "   \n  \t " },
      email_draft: draft({ subject: "Assunto" }),
    }
    const { master } = buildN8nTheme(input)
    expect(master.subject).toBe("Assunto")
    expect(master.blocks[0].value).toContain("corpo da copy")
  })
})
