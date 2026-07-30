import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it, expect } from "vitest"

import { classifyRenderedHtml } from "./rendered-classify"

// O editor de variantes é um componente CLIENT e classifica ao vivo o que
// está sendo colado. Se este módulo voltar a puxar `node:crypto` — direta ou
// indiretamente — o build do Next quebra com UnhandledSchemeError, e só no
// deploy. Este teste faz falhar antes.
describe("rendered-classify é isomórfico", () => {
  const raw = readFileSync(join(__dirname, "rendered-classify.ts"), "utf8")

  // As asserções valem sobre CÓDIGO, não sobre prosa: o cabeçalho do módulo
  // explica por que ele foi separado do `rendered-reference` e cita
  // `node:crypto` pelo nome. Citar não é importar.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")

  it("não importa nada de node:", () => {
    expect(code).not.toMatch(/from\s+["']node:/)
    expect(code).not.toMatch(/require\(\s*["']node:/)
  })

  it("não importa o módulo server-only de hash", () => {
    expect(code).not.toContain("rendered-reference")
  })

  it("não usa APIs de servidor", () => {
    for (const api of ["createHash", "process.env", "createAdminClient"]) {
      expect(code).not.toContain(api)
    }
  })
})

describe("classifyRenderedHtml (contrato mínimo)", () => {
  it("classifica sem depender de crypto", () => {
    expect(classifyRenderedHtml(null).kind).toBe("empty")
    expect(
      classifyRenderedHtml(`<table><tr><td><img src="${"x".repeat(1200)}"></td></tr></table>`)
        .kind,
    ).toBe("mockup")
  })
})
