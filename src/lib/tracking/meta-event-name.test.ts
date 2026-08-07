import { describe, expect, it } from "vitest"
import {
  DEFAULT_QUALIFIED_EVENT_NAME,
  metaEventName,
  willRenameEvent,
} from "./meta-event-name"

describe("metaEventName", () => {
  it("junta as palavras — o espaço vira %20 na URL do pixel e cria um evento separado", () => {
    expect(metaEventName("Lead qualificado")).toBe("LeadQualificado")
  })

  it("remove acento", () => {
    expect(metaEventName("Lead qualificado é ótimo")).toBe("LeadQualificadoEOtimo")
  })

  it("mantém nome que já está pronto", () => {
    expect(metaEventName("LeadQualificado")).toBe("LeadQualificado")
    expect(metaEventName("lead_qualificado")).toBe("lead_qualificado")
    expect(metaEventName("Lead-Qualificado")).toBe("Lead-Qualificado")
  })

  it("tira espaço das pontas", () => {
    expect(metaEventName("  Lead qualificado  ")).toBe("LeadQualificado")
  })

  it("descarta pontuação que a Meta escaparia", () => {
    expect(metaEventName("Lead (qualificado)!")).toBe("LeadQualificado")
  })

  it("colapsa espaços repetidos", () => {
    expect(metaEventName("Lead    muito   qualificado")).toBe("LeadMuitoQualificado")
  })

  it("cai no padrão quando não sobra nada", () => {
    expect(metaEventName("")).toBe(DEFAULT_QUALIFIED_EVENT_NAME)
    expect(metaEventName(null)).toBe(DEFAULT_QUALIFIED_EVENT_NAME)
    expect(metaEventName("!!!")).toBe(DEFAULT_QUALIFIED_EVENT_NAME)
  })

  it("preserva números", () => {
    expect(metaEventName("Lead qualificado 2")).toBe("LeadQualificado2")
  })

  it("é estável: aplicar de novo não muda nada (servidor e browser convergem)", () => {
    const once = metaEventName("Lead qualificado")
    expect(metaEventName(once)).toBe(once)
  })
})

describe("willRenameEvent", () => {
  it("avisa quando o nome configurado será alterado", () => {
    expect(willRenameEvent("Lead qualificado")).toBe(true)
  })

  it("não avisa quando o nome já está adequado", () => {
    expect(willRenameEvent("LeadQualificado")).toBe(false)
  })

  it("nome vazio não gera aviso (a tela mostra o padrão)", () => {
    expect(willRenameEvent("")).toBe(false)
  })
})
