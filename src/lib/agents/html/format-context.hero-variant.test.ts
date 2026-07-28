/**
 * resolveHeroVariant — quem manda na escolha da variante da hero.
 *
 * O BLUEPRINT vence o slot_map porque ele é o contrato de endereçamento da
 * copy: `packageBlueprint` deriva `blocks[].fields[]` do `output_schema` da
 * variante que casou e resolve cada `fields.tag` contra o HTML EFETIVO dessa
 * variante. A copy do n8n volta amarrada a esses fields e o `copy_merge`
 * ancora por `fields.tag` — enxertar outra variante deixa as tags do
 * snapshot sem endereço no documento.
 */
import { describe, it, expect, vi } from "vitest"

import { resolveHeroVariant } from "./format-context"
import type { EmailBlueprint } from "@/types/email-generation"

type Row = Record<string, unknown>

/** Client mínimo: devolve a variante pedida em email_component_variants. */
function client(variants: Row[], choices: Row | null = null) {
  const seen: string[] = []
  const api = (table: string) => {
    let id: string | null = null
    const self: Record<string, unknown> = {
      select: () => self,
      eq: (c: string, v: unknown) => {
        if (c === "id") id = v as string
        return self
      },
      order: () => self,
      limit: () => self,
      maybeSingle: () => {
        if (table === "email_generation_choices") {
          return Promise.resolve({ data: choices, error: null })
        }
        seen.push(id ?? "")
        const found = variants.find((v) => v.id === id) ?? null
        return Promise.resolve({ data: found, error: null })
      },
    }
    return self
  }
  return { admin: { from: api } as never, seen }
}

const V_BLUEPRINT = {
  id: "v-blueprint",
  html: "<tr><td>{{HERO_HEADLINE}}</td></tr>",
  html_tagged: null,
  tagging_status: null,
  rendered_html: null,
  output_schema: [],
  block_type: "hero",
}
const V_SLOTMAP = { ...V_BLUEPRINT, id: "v-slotmap" }
const V_CHOICES = { ...V_BLUEPRINT, id: "v-choices" }

const blueprintWith = (variantId: string | null): EmailBlueprint =>
  ({
    blocks: [
      { type: "hero", variant_id: variantId },
      { type: "body", variant_id: "v-body" },
    ],
  }) as unknown as EmailBlueprint

const base = { storeId: "s1", flowType: "abandoned_cart", emailNumber: 1 }

describe("resolveHeroVariant", () => {
  it("blueprint vence o slot_map e sinaliza a divergência", async () => {
    const { admin } = client([V_BLUEPRINT, V_SLOTMAP])
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const res = await resolveHeroVariant(admin, {
      ...base,
      slotMap: [{ section: "hero", variant_id: "v-slotmap" }] as never,
      blueprint: blueprintWith("v-blueprint"),
    })

    expect(res.source).toBe("blueprint")
    expect(res.variant?.id).toBe("v-blueprint")
    expect(res.mismatch).toBe(true)
    warn.mockRestore()
  })

  it("fontes concordando: sem divergência (fluxo natural)", async () => {
    const { admin } = client([V_BLUEPRINT])
    const res = await resolveHeroVariant(admin, {
      ...base,
      slotMap: [{ section: "hero", variant_id: "v-blueprint" }] as never,
      blueprint: blueprintWith("v-blueprint"),
    })
    expect(res.source).toBe("blueprint")
    expect(res.mismatch).toBe(false)
  })

  it("bloco hero sem variant_id no blueprint → cai no slot_map", async () => {
    const { admin } = client([V_SLOTMAP])
    const res = await resolveHeroVariant(admin, {
      ...base,
      slotMap: [{ section: "hero_section", variant_id: "v-slotmap" }] as never,
      blueprint: blueprintWith(null),
    })
    expect(res.source).toBe("slot_map")
    expect(res.variant?.id).toBe("v-slotmap")
    expect(res.mismatch).toBe(false)
  })

  it("sem blueprint nem slot_map → memória do Curador", async () => {
    const { admin } = client([V_CHOICES], {
      choices: [{ section: "hero", variant_id: "v-choices" }],
    })
    const res = await resolveHeroVariant(admin, {
      ...base,
      slotMap: null,
      blueprint: null,
    })
    expect(res.source).toBe("choices")
    expect(res.variant?.id).toBe("v-choices")
  })

  it("nenhuma fonte → null (graft cai em no_variant)", async () => {
    const { admin } = client([], { choices: [] })
    const res = await resolveHeroVariant(admin, {
      ...base,
      slotMap: null,
      blueprint: null,
    })
    expect(res.variant).toBeNull()
    expect(res.source).toBeNull()
  })

  it("id órfão (variante deletada) → null, sem quebrar a geração", async () => {
    const { admin } = client([])
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await resolveHeroVariant(admin, {
      ...base,
      slotMap: null,
      blueprint: blueprintWith("v-sumida"),
    })
    expect(res.variant).toBeNull()
    warn.mockRestore()
  })
})
