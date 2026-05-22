import { describe, it, expect } from "vitest"
import { SEED_COLUMNS } from "@/lib/services/onboarding-bootstrap.service"
import {
  TASK_SLUG_MAP,
  resolveTaskWorkspaceTarget,
  resolveTaskWorkspaceTargetByTitle,
  resolveSubItemEmailTarget,
  resolveSlugForEmail,
} from "./slug-mapping"

// Slugs do bootstrap que NÃO devem ter target de workspace (são tasks de outras
// etapas: entrada, formulario, aprovação, implementação, finalização).
const NON_WORKSPACE_STAGES = new Set([
  "entrada",
  "cliente_formulario",
  "preview_aprovacao",
  "implementacao",
  "cliente_ativo",
])

function collectSlugsFromBootstrap(): Array<{
  parentSlug: string
  stageSlug: string
  hasSubItems: boolean
  subItemSlugs: string[]
}> {
  const out: Array<{
    parentSlug: string
    stageSlug: string
    hasSubItems: boolean
    subItemSlugs: string[]
  }> = []
  for (const col of SEED_COLUMNS) {
    for (const item of col.checklist_template) {
      const slug = item.slug ?? item.id
      out.push({
        parentSlug: slug,
        stageSlug: col.slug,
        hasSubItems: Boolean(item.sub_items?.length),
        subItemSlugs: item.sub_items?.map((s) => s.slug) ?? [],
      })
    }
  }
  return out
}

describe("TASK_SLUG_MAP — contrato com onboarding bootstrap", () => {
  const bootstrap = collectSlugsFromBootstrap()

  it("cobre todos os slugs das etapas de produção sem unmapped silencioso", () => {
    const productionSlugs = bootstrap.filter(
      (b) => !NON_WORKSPACE_STAGES.has(b.stageSlug),
    )
    const missing: string[] = []
    for (const b of productionSlugs) {
      if (!(b.parentSlug in TASK_SLUG_MAP)) missing.push(b.parentSlug)
    }
    expect(missing, `slugs faltando em TASK_SLUG_MAP: ${missing.join(", ")}`).toEqual([])
  })

  it("sub_items de tasks 1:N batem com TASK_SLUG_MAP", () => {
    for (const b of bootstrap) {
      if (!b.hasSubItems) continue
      const target = TASK_SLUG_MAP[b.parentSlug]
      if (target == null) continue // flow não-suportado (fase 2)
      expect(target.kind).toBe("email-list")
      if (target.kind !== "email-list") continue
      const mappedSlugs = target.subItems.map((s) => s.slug).sort()
      expect(mappedSlugs).toEqual([...b.subItemSlugs].sort())
    }
  })
})

describe("resolveTaskWorkspaceTarget", () => {
  it("retorna null para slug desconhecido", () => {
    expect(resolveTaskWorkspaceTarget("nada_aqui")).toBeNull()
    expect(resolveTaskWorkspaceTarget(null)).toBeNull()
    expect(resolveTaskWorkspaceTarget(undefined)).toBeNull()
  })

  it("retorna checkbox-only para preview_brand_brain", () => {
    const t = resolveTaskWorkspaceTarget("preview_brand_brain")
    expect(t).toEqual({ kind: "checkbox-only", resource: "briefing" })
  })

  it("retorna EmailTarget para pilotos 1:1", () => {
    expect(resolveTaskWorkspaceTarget("preview_email_welcome")).toMatchObject({
      kind: "email",
      mode: "preview",
      flowType: "welcome",
      emailNumber: 1,
    })
    expect(resolveTaskWorkspaceTarget("preview_email_carrinho_2")).toMatchObject({
      kind: "email",
      mode: "preview",
      flowType: "abandoned_cart",
      emailNumber: 2,
    })
    expect(resolveTaskWorkspaceTarget("preview_email_pos_compra")).toMatchObject({
      kind: "email",
      mode: "preview",
      flowType: "post_purchase",
      emailNumber: 1,
    })
  })

  it("retorna EmailListTarget para flows da etapa 5", () => {
    const welcome = resolveTaskWorkspaceTarget("flow_welcome")
    expect(welcome?.kind).toBe("email-list")
    if (welcome?.kind === "email-list") {
      expect(welcome.flowType).toBe("welcome")
      expect(welcome.subItems).toHaveLength(8)
    }

    const winback = resolveTaskWorkspaceTarget("flow_winback")
    if (winback?.kind === "email-list") {
      expect(winback.flowType).toBe("win_back")
      expect(winback.subItems).toHaveLength(3)
    }
  })

  it("retorna null para flows fase 2", () => {
    expect(resolveTaskWorkspaceTarget("flow_site_abandoned")).toBeNull()
    expect(resolveTaskWorkspaceTarget("flow_etapas_envio")).toBeNull()
    expect(resolveTaskWorkspaceTarget("flow_atraso_entrega")).toBeNull()
    expect(resolveTaskWorkspaceTarget("flow_pedido_enviado")).toBeNull()
  })
})

describe("resolveSubItemEmailTarget", () => {
  it("resolve sub_item válido para email completo", () => {
    const t = resolveSubItemEmailTarget("flow_welcome", "welcome_email_3")
    expect(t).toMatchObject({
      kind: "email",
      mode: "full",
      flowType: "welcome",
      emailNumber: 3,
    })
  })

  it("retorna null para sub_item desconhecido", () => {
    expect(resolveSubItemEmailTarget("flow_welcome", "welcome_email_99")).toBeNull()
    expect(resolveSubItemEmailTarget("flow_inexistente", "x")).toBeNull()
  })

  it("retorna null para parent que não é email-list", () => {
    expect(resolveSubItemEmailTarget("preview_email_welcome", "x")).toBeNull()
    expect(resolveSubItemEmailTarget("preview_brand_brain", "x")).toBeNull()
  })
})

describe("resolveSlugForEmail (caminho reverso)", () => {
  it("encontra task piloto 1:1 antes de flow 1:N", () => {
    const r = resolveSlugForEmail("welcome", 1)
    expect(r?.parentSlug).toBe("preview_email_welcome")
    expect(r?.subItemSlug).toBeUndefined()
  })

  it("encontra sub_item dentro do flow", () => {
    const r = resolveSlugForEmail("welcome", 5)
    expect(r).toEqual({ parentSlug: "flow_welcome", subItemSlug: "welcome_email_5" })
  })

  it("preview de abandoned_cart distingue parte 1 vs parte 2", () => {
    expect(resolveSlugForEmail("abandoned_cart", 1)?.parentSlug).toBe(
      "preview_email_carrinho_1",
    )
    expect(resolveSlugForEmail("abandoned_cart", 2)?.parentSlug).toBe(
      "preview_email_carrinho_2",
    )
    expect(resolveSlugForEmail("abandoned_cart", 3)).toEqual({
      parentSlug: "flow_carrinho_abandonado",
      subItemSlug: "carrinho_email_3",
    })
  })

  it("retorna null para combinação não mapeada", () => {
    expect(resolveSlugForEmail("custom", 1)).toBeNull()
  })
})

describe("resolveTaskWorkspaceTargetByTitle (fallback p/ tasks legadas)", () => {
  it("identifica Brand Brain pelo título", () => {
    expect(
      resolveTaskWorkspaceTargetByTitle(
        "Estudar Brand Brain + referencias do cliente",
      ),
    ).toEqual({ kind: "checkbox-only", resource: "briefing" })
  })

  it("identifica email-piloto Welcome (label novo do seed)", () => {
    const t = resolveTaskWorkspaceTargetByTitle(
      "Criar email-piloto 1: Welcome (boas-vindas)",
    )
    expect(t).toMatchObject({ kind: "email", flowType: "welcome", emailNumber: 1 })
  })

  it("identifica email-piloto Welcome (label antigo do seed)", () => {
    const t = resolveTaskWorkspaceTargetByTitle(
      "Criar email-piloto: Welcome (boas-vindas)",
    )
    expect(t).toMatchObject({ kind: "email", flowType: "welcome", emailNumber: 1 })
  })

  it("identifica email-piloto Carrinho pelo número (variação nova com 1 carrinho só)", () => {
    const t = resolveTaskWorkspaceTargetByTitle(
      "Criar email-piloto 2: Carrinho abandonado",
    )
    expect(t).toMatchObject({
      kind: "email",
      flowType: "abandoned_cart",
      emailNumber: 1,
    })
  })

  it("identifica Carrinho parte 2 (variação antiga)", () => {
    const t = resolveTaskWorkspaceTargetByTitle(
      "Criar email-piloto: Carrinho abandonado (parte 2)",
    )
    expect(t).toMatchObject({
      kind: "email",
      flowType: "abandoned_cart",
      emailNumber: 2,
    })
  })

  it("identifica Pós-compra (ambas variações)", () => {
    expect(
      resolveTaskWorkspaceTargetByTitle(
        "Criar email-piloto 3: Pos-compra (engajamento)",
      ),
    ).toMatchObject({ kind: "email", flowType: "post_purchase", emailNumber: 1 })
    expect(
      resolveTaskWorkspaceTargetByTitle(
        "Criar email-piloto: Pos-compra (engajamento)",
      ),
    ).toMatchObject({ kind: "email", flowType: "post_purchase", emailNumber: 1 })
  })

  it("retorna null pra título não-relacionado", () => {
    expect(resolveTaskWorkspaceTargetByTitle("Configurar Klaviyo")).toBeNull()
    expect(resolveTaskWorkspaceTargetByTitle("")).toBeNull()
    expect(resolveTaskWorkspaceTargetByTitle(null)).toBeNull()
  })
})
