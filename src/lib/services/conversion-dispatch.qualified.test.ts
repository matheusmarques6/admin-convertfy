/**
 * Regras do evento "Lead qualificado".
 *
 * O modo de falha real deste recurso é silencioso: a regra não bate, o
 * evento não dispara e nada avisa. Estes testes fixam justamente os
 * casos que faziam o evento sumir na prática — diferença de maiúsculas,
 * acento, espaço sobrando e campo renomeado no editor.
 */

import { describe, expect, it } from "vitest"
import {
  diagnoseQualified,
  evaluateQualified,
  normalizeForCompare,
} from "./conversion-dispatch.service"
import type { QualifiedLeadConfig } from "@/types/form-tracking"

const cfg = (over: Partial<QualifiedLeadConfig> = {}): QualifiedLeadConfig => ({
  enabled: true,
  event_name: "Lead qualificado",
  logic: "and",
  rules: [],
  ...over,
})

describe("normalizeForCompare", () => {
  it("ignora caixa, acento e espaço nas pontas", () => {
    expect(normalizeForCompare("  São Paulo ")).toBe("sao paulo")
    expect(normalizeForCompare("SIM")).toBe(normalizeForCompare("sim"))
  })
})

describe("evaluateQualified — casos que faziam o evento nunca disparar", () => {
  it('regra "Sim" bate a resposta "sim"', () => {
    const config = cfg({ rules: [{ field_id: "f1", operator: "equals", value: "Sim" }] })
    expect(evaluateQualified(config, { f1: "sim" })).toBe(true)
  })

  it("acento não impede o casamento", () => {
    const config = cfg({ rules: [{ field_id: "f1", operator: "equals", value: "Sao Paulo" }] })
    expect(evaluateQualified(config, { f1: "São Paulo" })).toBe(true)
  })

  it("espaço sobrando na resposta não impede", () => {
    const config = cfg({ rules: [{ field_id: "f1", operator: "equals", value: "premium" }] })
    expect(evaluateQualified(config, { f1: "  Premium  " })).toBe(true)
  })

  it("in/not_in comparam normalizado", () => {
    const rules = [{ field_id: "f1", operator: "in" as const, value: ["Acima de 100k", "Acima de 500k"] }]
    expect(evaluateQualified(cfg({ rules }), { f1: "acima de 100k" })).toBe(true)
    const notIn = [{ field_id: "f1", operator: "not_in" as const, value: ["Menos de 10k"] }]
    expect(evaluateQualified(cfg({ rules: notIn }), { f1: "menos de 10k" })).toBe(false)
  })

  it("contains ignora acento e caixa", () => {
    const rules = [{ field_id: "f1", operator: "contains" as const, value: "orcamento" }]
    expect(evaluateQualified(cfg({ rules }), { f1: "Tenho ORÇAMENTO aprovado" })).toBe(true)
  })

  it("is_set não aceita resposta só com espaços", () => {
    const rules = [{ field_id: "f1", operator: "is_set" as const }]
    expect(evaluateQualified(cfg({ rules }), { f1: "   " })).toBe(false)
    expect(evaluateQualified(cfg({ rules }), { f1: "algo" })).toBe(true)
  })

  it("comparação numérica continua numérica", () => {
    const rules = [{ field_id: "f1", operator: "gte" as const, value: 10 }]
    expect(evaluateQualified(cfg({ rules }), { f1: "25" })).toBe(true)
    expect(evaluateQualified(cfg({ rules }), { f1: "5" })).toBe(false)
  })

  it("desligado ou sem regras nunca qualifica", () => {
    expect(evaluateQualified(cfg({ enabled: false }), { f1: "sim" })).toBe(false)
    expect(evaluateQualified(cfg({ rules: [] }), { f1: "sim" })).toBe(false)
  })

  it("logic 'or' basta uma condição", () => {
    const config = cfg({
      logic: "or",
      rules: [
        { field_id: "f1", operator: "equals", value: "sim" },
        { field_id: "f2", operator: "equals", value: "nunca" },
      ],
    })
    expect(evaluateQualified(config, { f1: "Sim", f2: "outro" })).toBe(true)
  })

  it("resolve o campo pelo label quando o id mudou no editor", () => {
    const config = cfg({
      rules: [{ field_id: "id-antigo", field_label: "Faturamento", operator: "equals", value: "alto" }],
    })
    const fields = [{ id: "id-novo", label: "Faturamento" }]
    expect(evaluateQualified(config, { "id-novo": "Alto" }, fields)).toBe(true)
  })
})

describe("diagnoseQualified — explica por que não disparou", () => {
  it("aponta o recurso desligado", () => {
    const d = diagnoseQualified(cfg({ enabled: false }), {})
    expect(d.qualified).toBe(false)
    expect(d.reason).toContain("desligado")
  })

  it("aponta a ausência de condições", () => {
    const d = diagnoseQualified(cfg({ rules: [] }), {})
    expect(d.reason).toContain("Nenhuma condição")
  })

  it("aponta o campo que não existe mais no formulário", () => {
    const config = cfg({
      rules: [{ field_id: "sumiu", field_label: "Orçamento", operator: "equals", value: "sim" }],
    })
    const d = diagnoseQualified(config, { outro: "sim" }, [{ id: "outro", label: "Outro" }])
    expect(d.qualified).toBe(false)
    expect(d.reason).toContain("não existe mais")
    expect(d.rules[0].field_missing).toBe(true)
  })

  it("mostra esperado × respondido quando a condição reprova", () => {
    const config = cfg({ rules: [{ field_id: "f1", operator: "equals", value: "premium" }] })
    const d = diagnoseQualified(config, { f1: "básico" }, [{ id: "f1", label: "Plano" }])
    expect(d.qualified).toBe(false)
    expect(d.reason).toContain("premium")
    expect(d.reason).toContain("básico")
    expect(d.rules[0].passed).toBe(false)
  })

  it("qualifica e não devolve motivo quando tudo passa", () => {
    const config = cfg({ rules: [{ field_id: "f1", operator: "equals", value: "sim" }] })
    const d = diagnoseQualified(config, { f1: "Sim" }, [{ id: "f1", label: "Quer orçamento?" }])
    expect(d.qualified).toBe(true)
    expect(d.reason).toBeNull()
  })
})
