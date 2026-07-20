import { describe, expect, it } from "vitest"
import {
  getAutomationStatusStr,
  isAutomationLive,
  type OmnisendAutomation,
} from "./omnisend-sync.service"

const auto = (partial: Partial<OmnisendAutomation>): OmnisendAutomation =>
  ({ name: "Flow X", ...partial }) as OmnisendAutomation

describe("getAutomationStatusStr", () => {
  it("isEnabled boolean (v2026) é autoritativo", () => {
    expect(getAutomationStatusStr(auto({ isEnabled: true }))).toBe("live")
    expect(getAutomationStatusStr(auto({ isEnabled: false }))).toBe("disabled")
    // isEnabled vence mesmo com status string presente
    expect(getAutomationStatusStr(auto({ isEnabled: false, status: "enabled" }))).toBe("disabled")
  })

  it("status string 'enabled'/'active'/'live' normaliza para 'live' (bug jul/2026)", () => {
    // Sem isso, as linhas iam pro banco com 'enabled' e o filtro
    // flow_status=live do dashboard nunca as encontrava.
    expect(getAutomationStatusStr(auto({ status: "enabled" }))).toBe("live")
    expect(getAutomationStatusStr(auto({ status: "active" }))).toBe("live")
    expect(getAutomationStatusStr(auto({ status: "live" }))).toBe("live")
  })

  it("status string não-vivo é repassado cru; sem nada vira 'unknown'", () => {
    expect(getAutomationStatusStr(auto({ status: "paused" }))).toBe("paused")
    expect(getAutomationStatusStr(auto({ status: "draft" }))).toBe("draft")
    expect(getAutomationStatusStr(auto({}))).toBe("unknown")
  })

  it("invariante: toda automation viva grava status 'live'", () => {
    // Era exatamente esta invariante que estava quebrada: isAutomationLive
    // aceitava 'enabled' mas o rótulo gravado não era 'live'.
    const cases: OmnisendAutomation[] = [
      auto({ isEnabled: true }),
      auto({ status: "enabled" }),
      auto({ status: "active" }),
      auto({ status: "live" }),
    ]
    for (const a of cases) {
      expect(isAutomationLive(a)).toBe(true)
      expect(getAutomationStatusStr(a)).toBe("live")
    }
  })
})
