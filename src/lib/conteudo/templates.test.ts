import { describe, expect, it } from "vitest"
import { getTemplate, moldeKeyDoTemplate, ST_MOLDE_KEY, ST_TEMPLATES, TEMPLATE_PADRAO_ID, templateDaMoldeKey, templatePorFunil, variantesDoTipo } from "./templates"
import { PROMPTS_PRONTOS } from "./config"
import { FAMILIAS } from "./familias"
import { MOLDE_KEYS } from "./types"

describe("a prateleira", () => {
  it("todo molde declara a identidade que pressupõe — era a falta disso que deixava cinco cartões iguais", () => {
    for (const t of ST_TEMPLATES) {
      expect(t.familia, t.nome).toBeDefined()
      expect(FAMILIAS[t.familia!], t.nome).toBeDefined()
    }
  })

  it("todo molde tem chave de classificação declarada — o fallback não pode ser o caminho normal", () => {
    for (const t of ST_TEMPLATES) {
      expect(ST_MOLDE_KEY[t.nome], t.nome).toBeDefined()
      expect(MOLDE_KEYS).toContain(moldeKeyDoTemplate(t))
    }
  })

  it("o molde padrão existe de verdade", () => {
    expect(getTemplate(TEMPLATE_PADRAO_ID).id).toBe(TEMPLATE_PADRAO_ID)
  })

  it("ids são únicos", () => {
    expect(new Set(ST_TEMPLATES.map((t) => t.id)).size).toBe(ST_TEMPLATES.length)
  })
})

describe("prompts prontos", () => {
  /**
   * Molde aposentado não dá erro: `getTemplate` cai no primeiro da lista e a
   * peça nasce com outra sequência e outra identidade, em silêncio. É o
   * defeito que este teste existe para impedir.
   */
  it("todo prompt pronto aponta para um molde VIVO", () => {
    for (const p of PROMPTS_PRONTOS) {
      expect(ST_TEMPLATES.map((t) => t.id), p.n).toContain(p.tpl)
    }
  })
})

describe("templatePorFunil", () => {
  it("devolve um molde daquela etapa quando existe", () => {
    for (const etapa of ["topo", "meio", "fundo"] as const) {
      const t = templatePorFunil(etapa)
      const tem = ST_TEMPLATES.some((x) => x.etapaFunil === etapa)
      if (tem) expect(t.etapaFunil).toBe(etapa)
      else expect(t.id).toBe(ST_TEMPLATES[0].id)
    }
  })
})

describe("templateDaMoldeKey", () => {
  it("chave sem molde vivo devolve undefined em vez de um molde qualquer", () => {
    expect(templateDaMoldeKey("Turbo")).toBeUndefined()
    expect(templateDaMoldeKey("Post")?.id).toBe("molde-post")
  })
})

describe("variantesDoTipo", () => {
  it("no cartão de perfil os rótulos falam de POSE, não do desenho da casa", () => {
    const v = variantesDoTipo("capa", true)!
    expect(v.map(([k]) => k)).toEqual(["a", "b", "c"])
    expect(v.map(([, l]) => l).join(" ")).not.toMatch(/Texto embaixo/)
    expect(v.map(([, l]) => l).join(" ")).toMatch(/Automático/)
  })

  it("fora do cartão de perfil nada muda", () => {
    expect(variantesDoTipo("capa")).toEqual([
      ["a", "Texto embaixo"],
      ["b", "Texto no centro"],
      ["c", "Texto em cima"],
    ])
    expect(variantesDoTipo("dado")).toBeUndefined()
  })

  it("o CTA não tem variação em identidade nenhuma", () => {
    expect(variantesDoTipo("cta", true)).toBeUndefined()
    expect(variantesDoTipo("cta", false)).toBeUndefined()
  })
})
