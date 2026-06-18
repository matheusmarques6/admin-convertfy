import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import type { EmailComponentVariant } from "@/types/email-generation"
import {
  parseAssemblerOutput,
  resolveChoices,
  assembleReferenceHtml,
  missingBlockNote,
  shuffle,
} from "./component-assembler.service"

function mk(p: Partial<EmailComponentVariant>): EmailComponentVariant {
  return {
    id: p.id ?? "id",
    block_type: p.block_type ?? "hero",
    name: p.name ?? "v",
    html: p.html ?? "<div></div>",
    description: p.description ?? null,
    slots: p.slots ?? [],
    niche_affinity: p.niche_affinity ?? [],
    positioning: p.positioning ?? [],
    mood: p.mood ?? [],
    density: p.density ?? null,
    tags: p.tags ?? [],
    thumbnail: p.thumbnail ?? null,
    is_active: p.is_active ?? true,
    version: p.version ?? 1,
    created_at: p.created_at ?? "2026-01-01",
    created_by: p.created_by ?? null,
  }
}

describe("parseAssemblerOutput", () => {
  it("parseia array válido", () => {
    expect(parseAssemblerOutput('[{"block_index":0,"variant_id":"a"}]')).toEqual([
      { block_index: 0, variant_id: "a" },
    ])
  })
  it("remove fences markdown", () => {
    expect(
      parseAssemblerOutput('```json\n[{"block_index":1,"variant_id":"b"}]\n```'),
    ).toEqual([{ block_index: 1, variant_id: "b" }])
  })
  it("retorna [] para inválido ou não-array", () => {
    expect(parseAssemblerOutput("xpto")).toEqual([])
    expect(parseAssemblerOutput('{"x":1}')).toEqual([])
  })
  it("captura reasoning e brand_evidence quando presentes", () => {
    expect(
      parseAssemblerOutput(
        '[{"block_index":0,"variant_id":"a","reasoning":"r","brand_evidence":"e"}]',
      ),
    ).toEqual([
      { block_index: 0, variant_id: "a", reasoning: "r", brand_evidence: "e" },
    ])
  })
})

describe("shuffle", () => {
  it("preserva todos os elementos (sem perder nem duplicar)", () => {
    const out = shuffle([1, 2, 3, 4, 5])
    expect(out).toHaveLength(5)
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })
  it("não muta a array original", () => {
    const arr = [1, 2, 3]
    shuffle(arr)
    expect(arr).toEqual([1, 2, 3])
  })
})

describe("resolveChoices", () => {
  const a = mk({ id: "a" })
  const b = mk({ id: "b" })
  const c = mk({ id: "c" })

  it("aplica a escolha do LLM", () => {
    const out = resolveChoices([[a, b]], [{ block_index: 0, variant_id: "b" }])
    expect(out).toEqual([b])
  })
  it("cai no top-1 quando a escolha está ausente ou é inválida", () => {
    expect(resolveChoices([[a, b]], [])).toEqual([a])
    expect(
      resolveChoices([[a, b]], [{ block_index: 0, variant_id: "zzz" }]),
    ).toEqual([a])
  })
  it("pula blocos sem candidato", () => {
    const out = resolveChoices([[a], [], [c]], [])
    expect(out).toEqual([a, c])
  })
})

describe("assembleReferenceHtml", () => {
  it("concatena os snippets na ordem dentro de um shell 600px", () => {
    const hero = mk({ id: "a", block_type: "hero", name: "H", html: "<div>hero</div>" })
    const foot = mk({ id: "b", block_type: "footer", name: "F", html: "<div>foot</div>" })
    const html = assembleReferenceHtml([hero, foot])
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("max-width:600px")
    expect(html.indexOf("hero")).toBeLessThan(html.indexOf("foot"))
  })
})

describe("missingBlockNote", () => {
  it("a nota tem o texto pedido pelo produto", () => {
    expect(missingBlockNote("offer")).toContain(
      "nao foi encontrada referencia para esse bloco",
    )
  })
})
