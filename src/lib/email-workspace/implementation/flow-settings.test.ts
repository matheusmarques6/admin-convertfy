import { describe, it, expect } from "vitest"
import {
  defaultFlowSetup,
  resolveFlowSetupFor,
  resolveFlowSetup,
} from "./flow-settings"
import { IMPLEMENTATION_FLOW_TYPES } from "./flow-meta"

describe("defaultFlowSetup", () => {
  it("usa os defaults de flow-meta + UTM", () => {
    const w = defaultFlowSetup("welcome")
    expect(w.trigger).toMatch(/inscri/i)
    expect(w.utmSource).toBe("Convertfy")
    expect(w.utmMedium).toBe("email")
  })
})

describe("resolveFlowSetupFor", () => {
  it("sem override retorna o default", () => {
    expect(resolveFlowSetupFor("welcome")).toEqual(defaultFlowSetup("welcome"))
  })

  it("override vence o default", () => {
    const r = resolveFlowSetupFor("welcome", {
      welcome: { trigger: "Meu gatilho", utmSource: "MinhaSource" },
    })
    expect(r.trigger).toBe("Meu gatilho")
    expect(r.utmSource).toBe("MinhaSource")
    // campos não sobrescritos caem no default
    expect(r.audience).toBe(defaultFlowSetup("welcome").audience)
  })

  it("string vazia no override é ignorada (cai no default)", () => {
    const r = resolveFlowSetupFor("welcome", { welcome: { trigger: "   " } })
    expect(r.trigger).toBe(defaultFlowSetup("welcome").trigger)
  })
})

describe("resolveFlowSetup", () => {
  it("resolve todos os flow types da UI", () => {
    const all = resolveFlowSetup()
    for (const ft of IMPLEMENTATION_FLOW_TYPES) {
      expect(all[ft], ft).toBeDefined()
      expect(all[ft].trigger, ft).toBeTruthy()
    }
  })
})
