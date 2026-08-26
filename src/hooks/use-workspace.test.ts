import { describe, expect, it } from "vitest"
import { detectWorkspace, detectWorkspaceOrNull } from "./use-workspace"

describe("detectWorkspaceOrNull", () => {
  it("classifica rotas comerciais", () => {
    expect(detectWorkspaceOrNull("/admin/comercial/dashboard")).toBe("comercial")
    expect(detectWorkspaceOrNull("/admin/comercial/pipelines")).toBe("comercial")
    expect(detectWorkspaceOrNull("/admin/inbox")).toBe("comercial")
  })

  it("classifica rotas operacionais", () => {
    for (const p of [
      "/admin/operacional/dashboard",
      "/admin/operacional/pipelines?tab=cadencias",
      "/admin/clients",
      "/admin/stores/abc",
      "/admin/onboarding",
      "/admin/health",
      "/admin/campaigns/central",
      "/admin/insights",
      "/admin/list-hygiene",
      // Geração de Imagens mora no nav Operacional (fix Onda 1)
      "/admin/imagens",
    ]) {
      expect(detectWorkspaceOrNull(p)).toBe("operacional")
    }
  })

  it("classifica rotas do geral", () => {
    for (const p of [
      "/admin/productivity",
      "/admin/board",
      "/admin/financial",
      "/admin/team",
      "/admin/meetings",
      "/admin/reports",
    ]) {
      expect(detectWorkspaceOrNull(p)).toBe("geral")
    }
  })

  it("rotas NEUTRAS devolvem null (mantêm o último workspace)", () => {
    expect(detectWorkspaceOrNull("/admin/settings")).toBeNull()
    expect(detectWorkspaceOrNull("/admin/settings/team")).toBeNull()
    expect(detectWorkspaceOrNull("/admin/notifications")).toBeNull()
    expect(detectWorkspaceOrNull("/admin/onboarding-help")).toBeNull()
    expect(detectWorkspaceOrNull("/admin/onboarding-help/x/edit")).toBeNull()
    // Ferramentas internas viraram rota neutra (acesso via Configurações)
    expect(detectWorkspaceOrNull("/admin/tools")).toBeNull()
    expect(detectWorkspaceOrNull("/admin/tools/currency-audit")).toBeNull()
    expect(detectWorkspaceOrNull("/admin/ai-usage")).toBeNull()
    expect(detectWorkspaceOrNull("/admin/agents/studio")).toBeNull()
  })

  it("onboarding-help é neutro SEM engolir /admin/onboarding (operacional)", () => {
    // Regressão da ordem dos prefixos: "/admin/onboarding" contém
    // "/admin/onboarding-help" como irmão — os dois não podem se misturar.
    expect(detectWorkspaceOrNull("/admin/onboarding")).toBe("operacional")
    expect(detectWorkspaceOrNull("/admin/onboarding/123")).toBe("operacional")
    expect(detectWorkspaceOrNull("/admin/onboarding-help")).toBeNull()
  })
})

describe("detectWorkspace (compat)", () => {
  it("rota neutra cai em geral (comportamento sem memória)", () => {
    expect(detectWorkspace("/admin/settings")).toBe("geral")
    expect(detectWorkspace("/admin/comercial/leads")).toBe("comercial")
  })
})
