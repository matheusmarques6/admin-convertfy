import { describe, it, expect } from "vitest"
import { groupDivergence } from "./tagging-divergence"
import type { TaggingFieldReport } from "@/types/email-generation"

const r = (
  key: string,
  anchored_by: TaggingFieldReport["anchored_by"],
): TaggingFieldReport => ({
  key,
  placeholder: key.toUpperCase(),
  anchored_by,
})

const miss = (key: string) => ({ key, placeholder: key.toUpperCase() })

describe("groupDivergence", () => {
  it("arte sem elemento: not_found não vira 'schema mudou'", () => {
    // Caso real (13/08): variante de arte-única com schema de hero. Sete
    // campos, sete `not_found` — mandar re-rodar manda repetir o resultado.
    const missing = [
      miss("hero_headline"),
      miss("hero_subhead"),
      miss("coupon_code"),
    ]
    const report = missing.map((m) => r(m.key, "not_found"))
    const out = groupDivergence(missing, report)

    expect(out).toHaveLength(1)
    expect(out[0].cause).toBe("sem_ancora")
    expect(out[0].placeholders).toEqual([
      "{{HERO_HEADLINE}}",
      "{{HERO_SUBHEAD}}",
      "{{COUPON_CODE}}",
    ])
  })

  it("campo ausente do relatório entrou no schema depois do run", () => {
    const out = groupDivergence([miss("offer_value")], [r("hero_headline", "exact")])
    expect(out).toEqual([
      { cause: "schema_novo", placeholders: ["{{OFFER_VALUE}}"] },
    ])
  })

  it("existing_tag é retagueamento, não remontagem", () => {
    const out = groupDivergence([miss("hero_body")], [r("hero_body", "existing_tag")])
    expect(out[0].cause).toBe("tag_divergente")
  })

  it("ancorou no relatório e sumiu da proposta = promessa não cumprida", () => {
    for (const by of ["exact", "fuzzy", "inference", "renamed"] as const) {
      const out = groupDivergence([miss("cta_label")], [r("cta_label", by)])
      expect(out[0].cause).toBe("prometida")
    }
  })

  it("causas misturadas saem separadas e em ordem estável", () => {
    const missing = [miss("novo"), miss("sem_arte"), miss("outra_tag")]
    const out = groupDivergence(missing, [
      r("sem_arte", "not_found"),
      r("outra_tag", "existing_tag"),
    ])
    // Ordem fixa (sem_ancora → tag_divergente → schema_novo → prometida),
    // independente da ordem em que os campos chegam: o aviso não pode
    // dançar entre renders.
    expect(out.map((g) => g.cause)).toEqual([
      "sem_ancora",
      "tag_divergente",
      "schema_novo",
    ])
  })

  it("sem relatório nenhum, tudo é schema novo (não acusa o agente)", () => {
    const out = groupDivergence([miss("a"), miss("b")], null)
    expect(out).toEqual([
      { cause: "schema_novo", placeholders: ["{{A}}", "{{B}}"] },
    ])
  })
})
