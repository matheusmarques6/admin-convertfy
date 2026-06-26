import { describe, expect, it } from "vitest"
import {
  canAccessOnboardingStage,
  getOnboardingStageAccess,
  getOnboardingStageResponsibleRole,
  isOnboardingBypass,
  normalizeOnboardingRoles,
} from "./onboarding-stage-access"

describe("onboarding stage access", () => {
  it("maps every stage to the definitive responsible role", () => {
    expect(getOnboardingStageResponsibleRole("entrada")).toBe("suporte")
    expect(getOnboardingStageResponsibleRole("cliente_formulario")).toBe(
      "suporte",
    )
    expect(getOnboardingStageResponsibleRole("preview_aprovacao")).toBe(
      "suporte",
    )
    expect(getOnboardingStageResponsibleRole("preview_producao")).toBe(
      "designer",
    )
    expect(getOnboardingStageResponsibleRole("emails_finais")).toBe("designer")
    expect(getOnboardingStageResponsibleRole("cliente_ativo")).toBe("designer")
    expect(getOnboardingStageResponsibleRole("implementacao")).toBe(
      "implementacao",
    )
  })

  it("normalizes legacy roles without losing multi-role union", () => {
    expect(
      normalizeOnboardingRoles(["cs", "estrategista", "ops", "designer"]),
    ).toEqual(["suporte", "implementacao", "designer"])
    expect(canAccessOnboardingStage(["suporte", "designer"], "entrada")).toBe(
      true,
    )
    expect(
      canAccessOnboardingStage(["suporte", "designer"], "emails_finais"),
    ).toBe(true)
    expect(
      canAccessOnboardingStage(["suporte", "designer"], "implementacao"),
    ).toBe(false)
  })

  it.each(["admin", "dev", "coo"])(
    "grants total bypass to %s",
    (role) => {
      expect(isOnboardingBypass([role])).toBe(true)
      expect(canAccessOnboardingStage([role], "entrada")).toBe(true)
      expect(canAccessOnboardingStage([role], "implementacao")).toBe(true)
      expect(canAccessOnboardingStage([role], "unknown")).toBe(true)
    },
  )

  it("does not grant cross-role access", () => {
    expect(canAccessOnboardingStage(["suporte"], "preview_producao")).toBe(
      false,
    )
    expect(canAccessOnboardingStage(["designer"], "preview_aprovacao")).toBe(
      false,
    )
    expect(canAccessOnboardingStage(["implementacao"], "cliente_ativo")).toBe(
      false,
    )
  })

  // Etapas numeradas conforme a matriz (posição na pipeline):
  // 1 entrada · 2 cliente_formulario · 3 preview_producao · 4 preview_aprovacao
  // 5 emails_finais · 6 implementacao · 7 cliente_ativo
  const ALL_STAGES = [
    "entrada",
    "cliente_formulario",
    "preview_producao",
    "preview_aprovacao",
    "emails_finais",
    "implementacao",
    "cliente_ativo",
  ] as const

  it("suporte vê apenas etapas 1/2/4 (entrada, cliente_formulario, preview_aprovacao)", () => {
    const visible = ALL_STAGES.filter((s) =>
      canAccessOnboardingStage(["suporte"], s),
    )
    expect(visible).toEqual([
      "entrada",
      "cliente_formulario",
      "preview_aprovacao",
    ])
  })

  it("designer vê apenas etapas 3/5/7 (preview_producao, emails_finais, cliente_ativo)", () => {
    const visible = ALL_STAGES.filter((s) =>
      canAccessOnboardingStage(["designer"], s),
    )
    expect(visible).toEqual([
      "preview_producao",
      "emails_finais",
      "cliente_ativo",
    ])
  })

  it("implementacao vê apenas etapa 6 (implementacao)", () => {
    const visible = ALL_STAGES.filter((s) =>
      canAccessOnboardingStage(["implementacao"], s),
    )
    expect(visible).toEqual(["implementacao"])
  })

  it.each(["admin", "dev", "coo"])("%s (bypass) vê todas as 7 etapas", (role) => {
    const visible = ALL_STAGES.filter((s) => canAccessOnboardingStage([role], s))
    expect(visible).toEqual([...ALL_STAGES])
  })

  it("multifunção = união das visibilidades (suporte + implementacao)", () => {
    const visible = ALL_STAGES.filter((s) =>
      canAccessOnboardingStage(["suporte", "implementacao"], s),
    )
    expect(visible).toEqual([
      "entrada",
      "cliente_formulario",
      "preview_aprovacao",
      "implementacao",
    ])
  })

  it("legados (cs/estrategista/ops) herdam a visibilidade canônica", () => {
    expect(canAccessOnboardingStage(["cs"], "entrada")).toBe(true)
    expect(canAccessOnboardingStage(["estrategista"], "preview_aprovacao")).toBe(
      true,
    )
    expect(canAccessOnboardingStage(["ops"], "implementacao")).toBe(true)
    expect(canAccessOnboardingStage(["ops"], "emails_finais")).toBe(false)
  })

  it("mudança de etapa transfere a visibilidade entre funções", () => {
    // Etapa 3 (preview_producao) é do designer; ao mudar pra 4
    // (preview_aprovacao) passa a ser do suporte. O designer perde acesso e o
    // suporte ganha — exatamente o handoff entre equipes.
    expect(canAccessOnboardingStage(["designer"], "preview_producao")).toBe(true)
    expect(canAccessOnboardingStage(["suporte"], "preview_producao")).toBe(false)

    expect(canAccessOnboardingStage(["designer"], "preview_aprovacao")).toBe(
      false,
    )
    expect(canAccessOnboardingStage(["suporte"], "preview_aprovacao")).toBe(true)
  })

  it("returns explicit read/work/admin capabilities", () => {
    expect(getOnboardingStageAccess(["designer"], "emails_finais")).toEqual({
      canRead: true,
      canWork: true,
      canAdmin: false,
      responsibleRole: "designer",
    })
    expect(getOnboardingStageAccess(["suporte"], "emails_finais")).toEqual({
      canRead: false,
      canWork: false,
      canAdmin: false,
      responsibleRole: "designer",
    })
    expect(getOnboardingStageAccess(["coo"], "emails_finais")).toEqual({
      canRead: true,
      canWork: true,
      canAdmin: true,
      responsibleRole: "designer",
    })
  })
})
