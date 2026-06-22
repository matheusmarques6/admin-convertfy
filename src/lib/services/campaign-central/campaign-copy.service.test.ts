/**
 * Testes do merge defensivo do fallback inline (Parte D).
 *
 * Foco: mergeInlineResults — quando o watchdog roda o fallback inline, ele NÃO
 * pode apagar uma loja que o n8n já preencheu (race write-write) nem uma copy
 * aprovada pelo COO. O n8n vence o fallback.
 */
import { describe, it, expect, vi } from "vitest"

// Deps pesadas mockadas só pra permitir importar o módulo (a função sob teste é pura).
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }))
vi.mock("./anthropic-client", () => ({ callAnthropicJson: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}))

import { mergeInlineResults } from "./campaign-copy.service"
import type { CopyResultEntry } from "@/types/campaign-central"

function entry(over: Partial<CopyResultEntry> = {}): CopyResultEntry {
  return {
    subject: "s",
    preview: "p",
    preheader: "p",
    blocks: [{ id: "b1", type: "text", value: "x" }],
    quality: null,
    generated_at: "2026-01-01T00:00:00Z",
    generated_via: "inline_fallback",
    status: "success",
    ...over,
  }
}

describe("mergeInlineResults", () => {
  it("inline_fallback NÃO sobrescreve loja já preenchida pelo n8n (success)", () => {
    const existing = { s1: entry({ generated_via: "n8n", status: "success", subject: "n8n copy" }) }
    const results = { s1: entry({ generated_via: "inline_fallback", subject: "fallback copy" }) }
    const out = mergeInlineResults(existing, results, "inline_fallback")
    expect(out.s1.subject).toBe("n8n copy")
    expect(out.s1.generated_via).toBe("n8n")
  })

  it("inline_fallback NÃO sobrescreve copy aprovada (quality good)", () => {
    const existing = {
      s1: entry({ quality: "good", generated_via: "ai_master_adapt", subject: "aprovada" }),
    }
    const results = { s1: entry({ subject: "fallback" }) }
    const out = mergeInlineResults(existing, results, "inline_fallback")
    expect(out.s1.subject).toBe("aprovada")
  })

  it("inline_fallback sobrescreve loja que não é n8n nem aprovada", () => {
    const existing = {
      s1: entry({ generated_via: "inline_fallback", status: "success", subject: "fallback antigo" }),
    }
    const results = { s1: entry({ generated_via: "inline_fallback", subject: "fallback novo" }) }
    const out = mergeInlineResults(existing, results, "inline_fallback")
    expect(out.s1.subject).toBe("fallback novo")
  })

  it("caminho manual do COO (ai_master_adapt) sobrescreve até n8n-success (deliberado)", () => {
    const existing = { s1: entry({ generated_via: "n8n", status: "success", subject: "n8n copy" }) }
    const results = { s1: entry({ generated_via: "ai_master_adapt", subject: "manual" }) }
    const out = mergeInlineResults(existing, results, "ai_master_adapt")
    expect(out.s1.subject).toBe("manual")
  })

  it("adiciona lojas novas e mantém as não tocadas", () => {
    const existing = { s1: entry({ subject: "existente" }) }
    const results = { s2: entry({ subject: "nova" }) }
    const out = mergeInlineResults(existing, results, "inline_fallback")
    expect(out.s1.subject).toBe("existente")
    expect(out.s2.subject).toBe("nova")
  })
})
