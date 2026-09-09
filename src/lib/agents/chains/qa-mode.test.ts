import { describe, expect, it } from "vitest"

import { getQaMode } from "./qa-mode"

describe("getQaMode", () => {
  it.each(["off", "shadow", "enforce"] as const)("aceita o modo %s", (mode) => {
    expect(getQaMode({ EMAIL_QA_MODE: mode })).toBe(mode)
  })

  it("mantém EMAIL_QA_ENABLED=true como enforce", () => {
    expect(getQaMode({ EMAIL_QA_ENABLED: "true" })).toBe("enforce")
  })

  it("cai para off sem configuração ou com modo inválido", () => {
    expect(getQaMode({})).toBe("off")
    expect(getQaMode({ EMAIL_QA_MODE: "invalid", EMAIL_QA_ENABLED: "false" })).toBe("off")
  })
})
