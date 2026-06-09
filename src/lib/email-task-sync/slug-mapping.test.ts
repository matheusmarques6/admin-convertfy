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
// etapas: entrada, formulario, aprovação, finalização). A `implementacao`
// (Etapa 6) é parcialmente mapeada: os 7 itens "subir os e-mails" abrem o
// workspace em modo implementation; os 4 técnicos (acesso/dns/popup/teste)
// ficam como `null` — todos PRESENTES no mapa, por isso fora desta lista.
const NON_WORKSPACE_STAGES = new Set([
  "entrada",
  "cliente_formulario",
  "preview_aprovacao",
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
      flowType: "upsell",
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

  it("retorna EmailListTarget para site_abandoned e etapas_envio", () => {
    const sa = resolveTaskWorkspaceTarget("flow_site_abandoned")
    expect(sa?.kind).toBe("email-list")
    if (sa?.kind === "email-list") {
      expect(sa.flowType).toBe("site_abandoned")
      expect(sa.subItems).toHaveLength(1)
    }

    const ee = resolveTaskWorkspaceTarget("flow_etapas_envio")
    expect(ee?.kind).toBe("email-list")
    if (ee?.kind === "email-list") {
      expect(ee.flowType).toBe("shipping_stages")
      expect(ee.subItems).toHaveLength(5)
    }
  })

  it("retorna null para slug desconhecido ou legado", () => {
    expect(resolveTaskWorkspaceTarget("flow_inexistente")).toBeNull()
  })

  it("mapeia os itens de flow da Etapa 6 para email-list em modo implementation", () => {
    const cases: Array<[string, string, number]> = [
      ["impl_welcome", "welcome", 8],
      ["impl_carrinho", "abandoned_cart", 8],
      ["impl_site_abandonado", "site_abandoned", 1],
      ["impl_browse_abandonado", "browse_abandonment", 5],
      ["impl_post_purchase", "upsell", 4],
      ["impl_winback", "win_back", 3],
      ["impl_pedido_pago", "shipping_stages", 5],
    ]
    for (const [slug, flowType, count] of cases) {
      const t = resolveTaskWorkspaceTarget(slug)
      expect(t?.kind, slug).toBe("email-list")
      if (t?.kind === "email-list") {
        expect(t.mode, slug).toBe("implementation")
        expect(t.flowType, slug).toBe(flowType)
        expect(t.subItems, slug).toHaveLength(count)
      }
    }
  })

  it("itens técnicos da Etapa 6 ficam sem workspace (null/422)", () => {
    for (const slug of ["impl_acesso_instrucoes", "impl_dns", "impl_popup", "impl_teste_e2e"]) {
      expect(resolveTaskWorkspaceTarget(slug), slug).toBeNull()
    }
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

  it("nunca atribui a posse do email a um slug de implementação", () => {
    // shipping_stages só tem flow `full` (etapas_envio) — impl_pedido_pago
    // (implementation) deve ser ignorado no reverse-lookup.
    expect(resolveSlugForEmail("shipping_stages", 1)?.parentSlug).toBe(
      "flow_etapas_envio",
    )
    // browse_abandonment idem: flow_browse_abandoned, nunca impl_browse_abandonado.
    expect(resolveSlugForEmail("browse_abandonment", 2)?.parentSlug).toBe(
      "flow_browse_abandoned",
    )
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

  it("identifica Pós-compra / Upsell (ambas variações)", () => {
    expect(
      resolveTaskWorkspaceTargetByTitle(
        "Criar email-piloto 3: Pos-compra (engajamento)",
      ),
    ).toMatchObject({ kind: "email", flowType: "upsell", emailNumber: 1 })
    expect(
      resolveTaskWorkspaceTargetByTitle(
        "Criar email-piloto: Pos-compra (engajamento)",
      ),
    ).toMatchObject({ kind: "email", flowType: "upsell", emailNumber: 1 })
  })

  it("retorna null pra título não-relacionado", () => {
    expect(resolveTaskWorkspaceTargetByTitle("Configurar Klaviyo")).toBeNull()
    expect(resolveTaskWorkspaceTargetByTitle("")).toBeNull()
    expect(resolveTaskWorkspaceTargetByTitle(null)).toBeNull()
  })

  it("resolve tasks de implementação (Etapa 6) pelo título — cobre slug NULL legado", () => {
    const cases: Array<[string, string, number]> = [
      ["Configurar a automacao de Welcome Flow e subir os e-mails", "welcome", 8],
      ["Configurar a automacao de Carrinho/checkout abandonado Flow e subir os e-mails", "abandoned_cart", 8],
      ["Configurar a automacao de Site abandonado Flow e subir os e-mails", "site_abandoned", 1],
      ["Configurar a automacao de Browse abandonado Flow e subir os e-mails", "browse_abandonment", 5],
      ["Configurar a automacao de Post Purchase e subir os e-mails", "upsell", 4],
      ["Configurar a automacao de Winback e subir os e-mails", "win_back", 3],
      ["Configurar a automacao de Pedido pago e subir os e-mails", "shipping_stages", 5],
    ]
    for (const [title, flowType, count] of cases) {
      const t = resolveTaskWorkspaceTargetByTitle(title)
      expect(t?.kind, title).toBe("email-list")
      if (t?.kind === "email-list") {
        expect(t.mode, title).toBe("implementation")
        expect(t.flowType, title).toBe(flowType)
        expect(t.subItems, title).toHaveLength(count)
      }
    }
  })

  it("NÃO resolve os itens técnicos da Etapa 6 pelo título", () => {
    expect(
      resolveTaskWorkspaceTargetByTitle("Enviar instrucoes pra cliente criar conta Klaviyo/Omnisend"),
    ).toBeNull()
    expect(resolveTaskWorkspaceTargetByTitle("Ensinar a configurar dominio + DKIM/SPF")).toBeNull()
    expect(resolveTaskWorkspaceTargetByTitle("Implementar popup")).toBeNull()
  })
})
