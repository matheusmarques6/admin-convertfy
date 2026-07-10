import { describe, expect, it } from "vitest"
import {
  canSeeSection,
  findSettingsSection,
  SETTINGS_SECTIONS,
} from "./settings-sections"
import {
  withSettingsParam,
  withoutSettingsParam,
} from "./settings-modal"
import { SETTINGS_SECTION_COMPONENTS } from "./settings-section-components"

describe("SETTINGS_SECTIONS (registry)", () => {
  it("keys são únicos", () => {
    const keys = SETTINGS_SECTIONS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("hrefs são únicos e absolutos sob /admin", () => {
    const hrefs = SETTINGS_SECTIONS.map((s) => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const href of hrefs) expect(href).toMatch(/^\/admin\//)
  })

  it("page-link é EXATAMENTE o conjunto com gate/página server-side", () => {
    const pageLinks = SETTINGS_SECTIONS.filter((s) => s.kind === "page-link")
      .map((s) => s.key)
      .sort()
    expect(pageLinks).toEqual([
      "email-generation",
      "email-generation-logs",
      "tutorial-cliente",
    ])
  })

  it("toda seção 'component' tem componente registrado (e nenhuma page-link tem)", () => {
    for (const s of SETTINGS_SECTIONS) {
      if (s.kind === "component") {
        expect(SETTINGS_SECTION_COMPONENTS[s.key], `componente de ${s.key}`).toBeDefined()
      } else {
        expect(SETTINGS_SECTION_COMPONENTS[s.key]).toBeUndefined()
      }
    }
  })

  it("findSettingsSection resolve key válida e rejeita inválida/null", () => {
    expect(findSettingsSection("team")?.title).toBe("Equipe")
    expect(findSettingsSection("nao-existe")).toBeNull()
    expect(findSettingsSection(null)).toBeNull()
  })
})

describe("canSeeSection (gate adminOnly — espelho do hub server)", () => {
  const adminOnly = SETTINGS_SECTIONS.find((s) => s.adminOnly)!
  const open = SETTINGS_SECTIONS.find((s) => !s.adminOnly)!

  it("seção aberta é visível para todos (até sem permissions carregadas)", () => {
    expect(canSeeSection(open, null)).toBe(true)
    expect(canSeeSection(open, { isAdmin: false })).toBe(true)
  })

  it("adminOnly: admin de profile vê; org owner/admin vê; demais não", () => {
    expect(canSeeSection(adminOnly, { isAdmin: true })).toBe(true)
    expect(canSeeSection(adminOnly, { isAdmin: false, isOrgOwner: true })).toBe(true)
    expect(canSeeSection(adminOnly, { isAdmin: false, isOrgOwner: false })).toBe(false)
    expect(canSeeSection(adminOnly, null)).toBe(false)
  })
})

describe("helpers de URL do SettingsModal (preservam os demais params)", () => {
  it("abre preservando ?tab= existente", () => {
    const out = withSettingsParam("tab=agents", "team")
    expect(new URLSearchParams(out).get("tab")).toBe("agents")
    expect(new URLSearchParams(out).get("settings")).toBe("team")
  })

  it("fecha removendo só o settings", () => {
    const out = withoutSettingsParam("tab=agents&settings=team")
    expect(out).toBe("tab=agents")
  })

  it("abrir/fechar em página sem params é limpo", () => {
    expect(withSettingsParam("", "account")).toBe("settings=account")
    expect(withoutSettingsParam("settings=account")).toBe("")
  })

  it("trocar de seção substitui o valor (não duplica)", () => {
    const out = withSettingsParam("settings=account", "team")
    expect(out).toBe("settings=team")
  })
})
