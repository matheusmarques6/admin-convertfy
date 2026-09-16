import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import {
  VARS_CRIADAS_NO_AVANCO,
  classificarPendencias,
  formatarTelefone,
  labelDaVar,
  marcadorDaVar,
  motivoDoBloqueio,
} from "./preview-do-avanco"

describe("classificarPendencias", () => {
  it("separa o que o avanco resolve do que bloqueia", () => {
    const r = classificarPendencias(
      ["tutorial_link", "figma_link"],
      "implementacao",
    )
    expect(r.resolvemNoAvanco).toEqual(["tutorial_link"])
    expect(r.bloqueiam).toEqual(["figma_link"])
  })

  it("a MESMA variavel bloqueia em outra coluna", () => {
    // `tutorial_link` so e criado ao entrar em `implementacao`. Em qualquer
    // outro destino, vazio e vazio.
    const r = classificarPendencias(["tutorial_link"], "cliente_ativo")
    expect(r.bloqueiam).toEqual(["tutorial_link"])
    expect(r.resolvemNoAvanco).toEqual([])
  })

  it("slug desconhecido ou ausente nao inventa isencao", () => {
    for (const slug of [null, undefined, "coluna_nova"]) {
      const r = classificarPendencias(["tutorial_link"], slug)
      expect(r.bloqueiam).toEqual(["tutorial_link"])
    }
  })

  it("sem pendencia, nada em lugar nenhum", () => {
    const r = classificarPendencias([], "implementacao")
    expect(r).toEqual({ bloqueiam: [], resolvemNoAvanco: [] })
  })
})

describe("VARS_CRIADAS_NO_AVANCO", () => {
  it("cobre a coluna cujo template usa a variavel criada no avanco", () => {
    expect(VARS_CRIADAS_NO_AVANCO.implementacao).toContain("tutorial_link")
  })

  it("casa com o slug que o pipeline realmente usa pra gerar o token", () => {
    // O acoplamento e real e invisivel: `advanceColumn` chama
    // `generateTutorialTokenIfMissing` so pra um slug, e e o template DESSA
    // coluna que usa `{{tutorial_link}}`. Mudar o slug de um lado sem o outro
    // trava o interruptor exatamente no caso comum — e nada gritaria.
    const fonte = readFileSync(
      new URL("../services/onboarding-pipeline.service.ts", import.meta.url),
      "utf-8",
    )
    const m = fonte.match(
      /nextCol\.slug === "([a-z_]+)"\)\s*\{\s*await generateTutorialTokenIfMissing/,
    )
    expect(m, "o gate do token mudou de forma — reveja a tabela").not.toBeNull()
    expect(VARS_CRIADAS_NO_AVANCO[m![1]]).toContain("tutorial_link")
  })
})

describe("motivoDoBloqueio", () => {
  it("libera quando ha template, telefone e nada faltando", () => {
    expect(
      motivoDoBloqueio({
        temTemplate: true,
        temTelefone: true,
        bloqueiam: [],
      }),
    ).toBeNull()
  })

  it("template ausente vence telefone ausente", () => {
    const m = motivoDoBloqueio({
      temTemplate: false,
      temTelefone: false,
      bloqueiam: ["figma_link"],
    })
    expect(m).toContain("nao tem mensagem")
  })

  it("telefone vence variavel faltando", () => {
    const m = motivoDoBloqueio({
      temTemplate: true,
      temTelefone: false,
      bloqueiam: ["figma_link"],
    })
    expect(m).toContain("telefone")
  })

  it("lista as variaveis com nome de gente", () => {
    expect(
      motivoDoBloqueio({
        temTemplate: true,
        temTelefone: true,
        bloqueiam: ["figma_link"],
      }),
    ).toBe("Ainda falta o link do Figma do preview.")
  })

  it("junta duas com 'e', tres com virgula", () => {
    const duas = motivoDoBloqueio({
      temTemplate: true,
      temTelefone: true,
      bloqueiam: ["figma_link", "tutorial_link"],
    })
    expect(duas).toBe(
      "Ainda falta o link do Figma do preview e o link do tutorial.",
    )
    const tres = motivoDoBloqueio({
      temTemplate: true,
      temTelefone: true,
      bloqueiam: ["figma_link", "tutorial_link", "briefing_url"],
    })
    expect(tres).toContain(", ")
    expect(tres).toContain(" e o link do briefing")
  })
})

describe("marcadorDaVar", () => {
  it("nomeia o que sera criado, entre colchetes", () => {
    // A linha em branco e indistinguivel de template quebrado — e e a cara
    // exata das mensagens que sairam no incidente.
    expect(marcadorDaVar("tutorial_link")).toBe(
      "[o link do tutorial — gerado ao avançar]",
    )
  })

  it("nao se confunde com texto final", () => {
    expect(marcadorDaVar("tutorial_link")).toMatch(/^\[.+\]$/)
  })
})

describe("labelDaVar", () => {
  it("cai na propria variavel quando nao ha rotulo", () => {
    // Template novo com variavel nova nao pode virar frase sem sujeito.
    expect(labelDaVar("coisa_nova")).toBe("a variavel {{coisa_nova}}")
  })
})

describe("formatarTelefone", () => {
  it("formata celular BR com 9 digitos", () => {
    expect(formatarTelefone("5511987654321")).toBe("+55 (11) 98765-4321")
  })

  it("formata fixo BR com 8 digitos", () => {
    expect(formatarTelefone("551133334444")).toBe("+55 (11) 3333-4444")
  })

  it("numero de fora sai com DDI e sem mascara BR", () => {
    expect(formatarTelefone("14155552671")).toBe("+14155552671")
  })

  it("null continua null — nao inventa destinatario", () => {
    expect(formatarTelefone(null)).toBeNull()
  })
})
