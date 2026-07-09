import { describe, it, expect } from "vitest"
import {
  CAMPAIGN_DESIGN_STAGE_ROLE,
  canAccessCampaignStage,
  getCampaignStageAccess,
  getCampaignStageResponsibleRole,
} from "./campaign-stage-access"

describe("CAMPAIGN_DESIGN_STAGE_ROLE — matriz de responsabilidade", () => {
  it("estrutura/producao/finalizacao = designer; aprovacao = coo; implementacao = implementacao", () => {
    expect(CAMPAIGN_DESIGN_STAGE_ROLE).toEqual({
      estrutura: "designer",
      aprovacao: "coo",
      producao: "designer",
      finalizacao: "designer",
      implementacao: "implementacao",
    })
  })

  it("resolve role por slug; slug desconhecido = null", () => {
    expect(getCampaignStageResponsibleRole("estrutura")).toBe("designer")
    expect(getCampaignStageResponsibleRole("aprovacao")).toBe("coo")
    expect(getCampaignStageResponsibleRole("inexistente")).toBeNull()
    expect(getCampaignStageResponsibleRole(null)).toBeNull()
  })
})

describe("canAccessCampaignStage — visibilidade por funcao", () => {
  it("designer ve estrutura/producao/finalizacao, NAO ve aprovacao", () => {
    const designer = ["designer"]
    expect(canAccessCampaignStage(designer, "estrutura")).toBe(true)
    expect(canAccessCampaignStage(designer, "producao")).toBe(true)
    expect(canAccessCampaignStage(designer, "finalizacao")).toBe(true)
    expect(canAccessCampaignStage(designer, "aprovacao")).toBe(false)
  })

  it("COO aprova (ve aprovacao) e por ser bypass enxerga tudo", () => {
    const coo = ["coo"]
    expect(canAccessCampaignStage(coo, "aprovacao")).toBe(true)
    expect(canAccessCampaignStage(coo, "estrutura")).toBe(true)
    expect(canAccessCampaignStage(coo, "producao")).toBe(true)
  })

  it("admin e dev (bypass) enxergam todas as etapas", () => {
    for (const role of [["admin"], ["dev"]]) {
      expect(canAccessCampaignStage(role, "estrutura")).toBe(true)
      expect(canAccessCampaignStage(role, "aprovacao")).toBe(true)
      expect(canAccessCampaignStage(role, "finalizacao")).toBe(true)
    }
  })

  it("suporte/implementacao NAO enxergam as etapas de design", () => {
    expect(canAccessCampaignStage(["suporte"], "estrutura")).toBe(false)
    expect(canAccessCampaignStage(["implementacao"], "producao")).toBe(false)
  })

  it("implementacao ve a propria etapa (e designer nao)", () => {
    expect(canAccessCampaignStage(["implementacao"], "implementacao")).toBe(true)
    expect(canAccessCampaignStage(["designer"], "implementacao")).toBe(false)
  })

  it("multifuncao = uniao (suporte + designer ve etapas de designer)", () => {
    const multi = ["suporte", "designer"]
    expect(canAccessCampaignStage(multi, "estrutura")).toBe(true)
    expect(canAccessCampaignStage(multi, "aprovacao")).toBe(false)
  })

  it("normaliza roles legados (ops->implementacao nao acessa; estrategista->suporte nao acessa)", () => {
    expect(canAccessCampaignStage(["ops"], "producao")).toBe(false)
    expect(canAccessCampaignStage(["estrategista"], "estrutura")).toBe(false)
  })
})

describe("getCampaignStageAccess — can_read/work/admin", () => {
  it("designer na etapa estrutura: trabalha mas nao e admin", () => {
    const a = getCampaignStageAccess(["designer"], "estrutura")
    expect(a).toEqual({
      canRead: true,
      canWork: true,
      canAdmin: false,
      responsibleRole: "designer",
    })
  })

  it("designer na etapa aprovacao: sem acesso", () => {
    const a = getCampaignStageAccess(["designer"], "aprovacao")
    expect(a.canRead).toBe(false)
    expect(a.canWork).toBe(false)
    expect(a.responsibleRole).toBe("coo")
  })

  it("coo/admin/dev: canAdmin = true em qualquer etapa", () => {
    for (const role of [["coo"], ["admin"], ["dev"]]) {
      const a = getCampaignStageAccess(role, "producao")
      expect(a.canAdmin).toBe(true)
      expect(a.canWork).toBe(true)
    }
  })
})
