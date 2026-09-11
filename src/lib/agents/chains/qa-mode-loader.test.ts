import { describe, expect, it } from "vitest"

import { qaModeDoAmbiente } from "./qa-mode-loader"

describe("qaModeDoAmbiente", () => {
  it("ambiente sem declaração devolve null — quem decide é o banco", () => {
    // É a diferença que faz a alavanca existir: `getQaMode()` nunca devolve
    // "ninguém disse", sempre devolve `shadow`, e por isso o banco nunca
    // teria vez.
    expect(qaModeDoAmbiente({})).toBeNull()
    expect(qaModeDoAmbiente({ EMAIL_QA_MODE: "" })).toBeNull()
    expect(qaModeDoAmbiente({ EMAIL_QA_MODE: "qualquer" })).toBeNull()
  })

  it("a env VENCE o banco — é o freio que não depende do Postgres", () => {
    expect(qaModeDoAmbiente({ EMAIL_QA_MODE: "off" })).toBe("off")
    expect(qaModeDoAmbiente({ EMAIL_QA_MODE: "ENFORCE" })).toBe("enforce")
  })

  it("o alias legado continua valendo", () => {
    expect(qaModeDoAmbiente({ EMAIL_QA_ENABLED: "true" })).toBe("enforce")
    expect(qaModeDoAmbiente({ EMAIL_QA_ENABLED: "false" })).toBe("off")
  })

  it("EMAIL_QA_MODE vence o alias quando os dois existem", () => {
    expect(qaModeDoAmbiente({ EMAIL_QA_MODE: "shadow", EMAIL_QA_ENABLED: "true" })).toBe("shadow")
  })
})
