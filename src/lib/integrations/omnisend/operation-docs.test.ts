import { describe, expect, it } from "vitest"
import {
  getOmnisendDoc,
  listOmnisendDocKeys,
  OMNISEND_DOC_MAX_CHARS,
  operationsWithDoc,
  suggestOmnisendDocs,
} from "./operation-docs"
import {
  findOmnisendOperation,
  OMNISEND_OPERATIONS,
  searchOmnisendOperations,
} from "./operation-catalog"

describe("catálogo de operações", () => {
  it("nomes canônicos são únicos e batem com method+path", () => {
    const names = OMNISEND_OPERATIONS.map((op) => op.n)
    expect(new Set(names).size).toBe(names.length)
    const combos = OMNISEND_OPERATIONS.map((op) => `${op.m} ${op.p}`)
    expect(new Set(combos).size).toBe(combos.length)
  })

  it("acha por nome, por 'METHOD /path' e por path preenchido", () => {
    expect(findOmnisendOperation("post_forms")?.p).toBe("/api/forms")
    expect(findOmnisendOperation("POST /api/forms")?.n).toBe("post_forms")
    expect(findOmnisendOperation("/api/forms", "GET")?.n).toBe("get_forms")
    // path com o param preenchido — é assim que o modelo o tem na mão
    expect(findOmnisendOperation("/api/forms/64e86f8da3b352df6ae90af2", "PATCH")?.n).toBe(
      "patch_form_id",
    )
    expect(
      findOmnisendOperation("/api/form-ab-setups/64e86f8da3b352df6ae90af2/start", "POST")?.n,
    ).toBe("post_form_ab_setups_ab_setup_id_start")
  })

  it("path ambíguo sem method não chuta", () => {
    // /api/forms tem GET e POST
    expect(findOmnisendOperation("/api/forms")).toBeNull()
    // /api/brands/current tem GET e POST
    expect(findOmnisendOperation("/api/brands/current")).toBeNull()
    expect(findOmnisendOperation("/api/forms/x/report", "GET")?.n).toBe("get_forms_form_id_report")
  })

  it("search filtra por nome também", () => {
    expect(searchOmnisendOperations("wheel").map((o) => o.n)).toContain("post_forms")
    expect(searchOmnisendOperations("ab_setups", "create").map((o) => o.n)).toEqual([
      "post_form_ab_setups",
    ])
  })
})

describe("guias por operação", () => {
  it("toda chave de guia de operação existe no catálogo", () => {
    const names = new Set(OMNISEND_OPERATIONS.map((op) => op.n))
    for (const key of operationsWithDoc()) {
      expect(names.has(key), `guia órfão: ${key}`).toBe(true)
    }
  })

  it("nenhum guia estoura o teto que a tool devolve", () => {
    for (const key of listOmnisendDocKeys()) {
      const doc = getOmnisendDoc(key)
      expect(doc?.markdown.length ?? 0).toBeLessThanOrEqual(OMNISEND_DOC_MAX_CHARS)
    }
  })

  it("o fluxo de popup + roleta + A/B está coberto", () => {
    for (const key of [
      "get_form_templates",
      "get_template_id",
      "post_forms",
      "patch_form_id",
      "post_forms_form_id_render",
      "post_forms_form_id_enable",
      "post_form_ab_setups",
      "post_form_ab_setups_ab_setup_id_start",
      "post_form_ab_setups_ab_setup_id_winner",
      "get_forms_form_id_ab_setup_reports",
    ]) {
      expect(getOmnisendDoc(key), key).not.toBeNull()
    }
    // a negativa que motivou tudo: a roleta EXISTE como bloco
    expect(getOmnisendDoc("post_forms")?.markdown).toContain("wheelOfFortune")
  })

  it("resolve por path, por 'METHOD /path' e por tópico", () => {
    expect(getOmnisendDoc("POST /api/forms")?.operation).toBe("post_forms")
    expect(getOmnisendDoc("/api/campaigns", "POST")?.operation).toBe("post_campaigns")
    expect(getOmnisendDoc("/api/forms/64e86f8da3b352df6ae90af2", "PATCH")?.operation).toBe(
      "patch_form_id",
    )
    expect(getOmnisendDoc("automation_content")?.key).toBe("topic_automation_content")
    expect(getOmnisendDoc("topic_email_templates")?.operation).toBeNull()
    expect(getOmnisendDoc("Post Forms")?.operation).toBe("post_forms")
  })

  it("sem guia devolve null e sugere operações parecidas", () => {
    expect(getOmnisendDoc("delete_images_id")).toBeNull()
    expect(getOmnisendDoc("")).toBeNull()
    const s = suggestOmnisendDocs("criar popup roleta")
    expect(s.length).toBeGreaterThan(0)
    expect(s.some((x) => x.operation === "post_forms" && x.has_doc)).toBe(true)
    expect(suggestOmnisendDocs("zz")).toEqual([])
  })
})
