import { describe, it, expect } from "vitest"
import {
  MISSING_FIELD,
  fieldOrMissing,
  missingStoreFields,
  renderTopProducts,
  resolveBrandProfile,
  resolveObjecoes,
  resolvePersonaText,
  resolveVocabulario,
} from "./store-context"

// Dados reais da Innova Bay nova (ago/2026) — a loja que expôs o bug.
const INNOVA_ICP = {
  name: "Robert Prova-Antes",
  age: "40",
  city: "Estados Unidos — subúrbios e cidades médias",
  monogram: "R",
}
const INNOVA_DEMO = {
  age_range: "35–45 anos",
  income: "USD 35.000–55.000 anuais",
  education: "Ensino médio +",
  occupation: "Profissional assalariado(a)",
}

describe("resolvePersonaText", () => {
  it("monta texto legível a partir do ICP da pesquisa", () => {
    const out = resolvePersonaText({
      icpPersona: INNOVA_ICP,
      icpDemographics: INNOVA_DEMO,
    })
    expect(out).toContain("Robert Prova-Antes")
    expect(out).toContain("40")
    expect(out).toContain("Faixa etária: 35–45 anos")
    expect(out).toContain("Ocupação: Profissional assalariado(a)")
  })

  it("NUNCA devolve objeto — era o bug do cast `as string`", () => {
    const out = resolvePersonaText({
      icpPersona: INNOVA_ICP,
      icpDemographics: INNOVA_DEMO,
    })
    expect(typeof out).toBe("string")
    expect(out).not.toContain("[object Object]")
  })

  it("persona do briefing vence o ICP", () => {
    expect(
      resolvePersonaText({
        marcaPersona: "Mulher 30-40, classe B",
        icpPersona: INNOVA_ICP,
      }),
    ).toBe("Mulher 30-40, classe B")
  })

  it("ignora coluna legada quando não é string (objeto JSONB)", () => {
    expect(
      resolvePersonaText({ personaColumn: { name: "X" } as unknown }),
    ).toBe("")
  })

  it("usa a coluna legada quando é texto e não há ICP", () => {
    expect(resolvePersonaText({ personaColumn: "Persona antiga" })).toBe(
      "Persona antiga",
    )
  })

  it("devolve vazio sem nenhuma fonte", () => {
    expect(resolvePersonaText({})).toBe("")
  })

  it("monta só com persona, sem demographics", () => {
    expect(resolvePersonaText({ icpPersona: { name: "Ana" } })).toBe("Ana")
  })
})

describe("fieldOrMissing", () => {
  it("declara a ausência em vez de mandar vazio mudo", () => {
    expect(fieldOrMissing(null)).toBe(MISSING_FIELD)
    expect(fieldOrMissing("")).toBe(MISSING_FIELD)
    expect(fieldOrMissing("   ")).toBe(MISSING_FIELD)
  })

  it("preserva o valor quando existe", () => {
    expect(fieldOrMissing("skincare")).toBe("skincare")
  })
})

describe("resolveBrandProfile", () => {
  it("cai na pesquisa quando o briefing está vazio — o caso da Innova", () => {
    const r = resolveBrandProfile({
      marca: {},
      pesquisa: "## 01 · Perfil da Marca\nProdutos funcionais de ticket acessível",
    })
    expect(r.source).toBe("pesquisa")
    expect(r.text).toContain("Perfil da Marca")
    // O literal "{}" era o que chegava ao prompt antes.
    expect(r.text).not.toBe("{}")
  })

  it("prefere o briefing curado quando ele tem conteúdo", () => {
    const r = resolveBrandProfile({
      marca: { nicho: "skincare" },
      pesquisa: "## pesquisa",
    })
    expect(r.source).toBe("briefing")
    expect(r.text).toContain("skincare")
  })

  it("briefing só com chaves vazias conta como vazio", () => {
    const r = resolveBrandProfile({
      marca: { nicho: "", persona: "  " },
      pesquisa: "## pesquisa",
    })
    expect(r.source).toBe("pesquisa")
  })

  it("sem briefing e sem pesquisa, diz isso — nunca '{}'", () => {
    const r = resolveBrandProfile({ marca: {}, pesquisa: "" })
    expect(r.source).toBe("none")
    expect(r.text).not.toBe("{}")
  })
})

describe("missingStoreFields", () => {
  it("lista o que a Innova tinha vazio", () => {
    expect(
      missingStoreFields({
        nicho: "",
        posicionamento: null,
        persona: "Robert Prova-Antes — 40",
        tomVoz: "voz de vendedor experiente",
      }),
    ).toEqual(["nicho", "posicionamento"])
  })

  it("vazio quando está tudo preenchido", () => {
    expect(
      missingStoreFields({
        nicho: "skincare",
        posicionamento: "premium",
        persona: "Ana",
        tomVoz: "afetivo",
      }),
    ).toEqual([])
  })
})

// ── Blocos nomeados do Curador (27/08) ──────────────────────────────────
// Dados reais da Innova Bay nova: 5 objeções, 22 palavras a usar, 28 a
// evitar, 5 produtos com handle.

// Objeções reais (Rivo Coast, set/2026) — voz da pessoa + tratamento.
const OBJECOES_RIVO = [
  {
    objection: "Marca nova, não conheço. Como sei que a qualidade é boa de verdade?",
    treatment: "Mostra o acabamento de perto. Close no solado, na tira, na costura.",
  },
  {
    objection: "E se não servir ou não for o que eu esperava? Troca é complicada?",
    treatment: "Política de troca direta e clara em uma frase.",
  },
]

describe("resolveObjecoes", () => {
  it("uma objeção por linha, com o tratamento na mesma linha", () => {
    expect(resolveObjecoes({ icp_objections: OBJECOES_RIVO })).toBe(
      `- ${OBJECOES_RIVO[0].objection} — tratamento: ${OBJECOES_RIVO[0].treatment}\n` +
        `- ${OBJECOES_RIVO[1].objection} — tratamento: ${OBJECOES_RIVO[1].treatment}`,
    )
  })

  it("objeção sem tratamento sai sozinha; item sem objeção some", () => {
    expect(
      resolveObjecoes({
        icp_objections: [
          { objection: "Vale o que custa?", treatment: "" },
          { objection: "  ", treatment: "órfão" },
        ],
      }),
    ).toBe("- Vale o que custa?")
  })

  // set/2026: friction é DOR, não objeção — deixou de ser lida aqui. Uma loja
  // com frictions e sem objeções tem de declarar ausência, não servir dor
  // como se fosse objeção.
  it("icp_frictions NÃO conta como objeção", () => {
    expect(
      resolveObjecoes({
        icp_frictions: ["desconfia de anúncio bonito"],
      } as unknown as Parameters<typeof resolveObjecoes>[0]),
    ).toContain("não presuma")
  })

  // Regra do módulo: ausência é DECLARADA. Bloco vazio faria o modelo
  // inventar a objeção que "provavelmente" trava a compra desta loja.
  it("sem objeções → ausência declarada, nunca vazio", () => {
    expect(resolveObjecoes({ icp_objections: [] })).toContain("não presuma")
    expect(resolveObjecoes({})).toContain("não presuma")
    expect(resolveObjecoes(null)).toContain("não presuma")
  })
})

describe("resolveVocabulario", () => {
  const vocab = {
    tone_use_words: ["garantia vitalícia", "sem risco", "resultado real"],
    tone_avoid_words: ["jornada", "imersão", "ecossistema", "sinergia"],
  }

  // LITERAL: a lista de "evitar" é proibição. Truncar deixaria passar
  // exatamente a palavra cortada, e ninguém saberia que houve corte.
  it("preserva ordem e conteúdo das duas listas, sem truncar", () => {
    const r = resolveVocabulario(vocab)
    expect(r).toBe(
      "Usar: garantia vitalícia, sem risco, resultado real\n" +
        "Evitar: jornada, imersão, ecossistema, sinergia",
    )
  })

  it("só uma das listas cadastrada → só ela aparece", () => {
    expect(resolveVocabulario({ tone_avoid_words: ["jargão"] })).toBe(
      "Evitar: jargão",
    )
  })

  it("nenhuma → ausência declarada", () => {
    expect(resolveVocabulario({ tone_use_words: [], tone_avoid_words: [] })).toBe(
      "(não cadastrado)",
    )
    expect(resolveVocabulario(undefined)).toBe("(não cadastrado)")
  })
})

describe("renderTopProducts", () => {
  it("numera com nome, preço e link", () => {
    expect(
      renderTopProducts([
        { name: "EnergySave Pro", price: 199, url: "https://innovabay.site/products/energysave" },
      ]),
    ).toBe("1. EnergySave Pro — 199 — https://innovabay.site/products/energysave")
  })

  // Produto sem link não vira "Nome — undefined": o modelo leria o
  // separador vazio como valor e trataria o slot como endereçável.
  it("preço ou link ausente somem, sem separador vazio", () => {
    expect(renderTopProducts([{ name: "Só nome" }])).toBe("1. Só nome")
    expect(renderTopProducts([{ name: "Sem link", price: "89,90" }])).toBe(
      "1. Sem link — 89,90",
    )
  })

  it("sem produtos → ausência declarada", () => {
    expect(renderTopProducts([])).toBe("(sem produtos cadastrados)")
    expect(renderTopProducts(null)).toBe("(sem produtos cadastrados)")
  })
})
