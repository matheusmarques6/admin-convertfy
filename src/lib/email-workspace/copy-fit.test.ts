import { describe, it, expect } from "vitest"
import {
  aceitarReescrita,
  alvosDeEncurtamento,
  aplicarReescritas,
  limiteDoCampo,
  resumoDeEstouros,
  type BlocoComContrato,
} from "./copy-fit"
import type { BlueprintBlockField } from "@/types/email-generation"

function campo(over: Partial<BlueprintBlockField> = {}): BlueprintBlockField {
  return {
    key: "section_body_1",
    label: "Corpo da seção",
    type: "text_long",
    max_len: 120,
    min_len: null,
    required: false,
    example: "Lorem ipsum",
    guidance: "Um parágrafo curto",
    source: "schema",
    ...over,
  }
}

// O caso real (Innova Welcome 1, 27/08): 190 caracteres num campo de 120.
const BODY: BlocoComContrato = {
  id: "b-body",
  position: 1,
  block_type: "body",
  fields: [
    campo(),
    campo({ key: "section_headline", label: "Headline", max_len: 32, type: "text_short" }),
    campo({ key: "value_seal_1_image", type: "image", max_len: 60 }),
  ],
  content: {
    section_body_1: "x".repeat(190),
    section_headline: "cabe",
    value_seal_1_image: "https://exemplo/img-com-url-muito-longa-que-passa-de-60-caracteres.png",
  },
}

describe("alvosDeEncurtamento", () => {
  it("pega só quem estourou, com o endereço {position}.{key}", () => {
    const alvos = alvosDeEncurtamento([BODY])
    expect(alvos).toHaveLength(1)
    expect(alvos[0].id).toBe("1.section_body_1")
    expect(alvos[0].max).toBe(120)
    expect(alvos[0].texto).toHaveLength(190)
    expect(alvos[0].label).toBe("Corpo da seção")
  })

  // A URL da imagem passa de 60 caracteres e NÃO é copy: mandá-la para o
  // encurtador destruiria o endereço do arquivo.
  it("campo de imagem fica de fora mesmo estourando", () => {
    expect(alvosDeEncurtamento([BODY]).map((a) => a.key)).not.toContain(
      "value_seal_1_image",
    )
  })

  // Encurtador não inventa copy: campo que não voltou é problema do flow.
  it("campo ausente não vira alvo", () => {
    const alvos = alvosDeEncurtamento([
      { ...BODY, content: { section_headline: "cabe" } },
    ])
    expect(alvos).toEqual([])
  })

  it("bloco sem contrato não gera alvo", () => {
    expect(alvosDeEncurtamento([{ ...BODY, fields: [] }])).toEqual([])
    expect(alvosDeEncurtamento([{ ...BODY, fields: null }])).toEqual([])
  })

  it("sem position usa o índice, e o id continua único no email", () => {
    const a = alvosDeEncurtamento([
      { ...BODY, position: null },
      { ...BODY, position: null, id: "b-2" },
    ])
    expect(a.map((x) => x.id)).toEqual(["0.section_body_1", "1.section_body_1"])
  })
})

describe("aceitarReescrita", () => {
  const original = "x".repeat(190)

  it("aceita o que cabe", () => {
    expect(aceitarReescrita(original, "y".repeat(118), { max: 120 })).toEqual({
      ok: true,
    })
  })

  it("recusa vazio, não-string e só espaço", () => {
    expect(aceitarReescrita(original, "", { max: 120 }).motivo).toBe("vazio")
    expect(aceitarReescrita(original, "   ", { max: 120 }).motivo).toBe("vazio")
    expect(aceitarReescrita(original, null, { max: 120 }).motivo).toBe("vazio")
    expect(aceitarReescrita(original, 42, { max: 120 }).motivo).toBe("vazio")
  })

  it("recusa quem continua acima do limite", () => {
    expect(aceitarReescrita(original, "y".repeat(150), { max: 120 }).motivo).toBe(
      "ainda_acima_do_limite",
    )
  })

  // Devolver a mesma frase é o jeito mais comum de um modelo "não fazer
  // nada" — e sem esta recusa contaria como correção.
  it("recusa a frase idêntica", () => {
    expect(aceitarReescrita("cabe demais", "cabe demais", { max: 999 }).motivo).toBe(
      "identico",
    )
    expect(aceitarReescrita("cabe demais", "  cabe demais  ", { max: 999 }).motivo).toBe(
      "identico",
    )
  })

  it("recusa texto que cresceu, mesmo cabendo num limite frouxo", () => {
    expect(aceitarReescrita("curto", "bem mais longo que o original", { max: 999 }).motivo).toBe(
      "cresceu",
    )
  })

  // "OK" cabe em qualquer limite e destrói o bloco.
  it("recusa abaixo do mínimo quando há mínimo", () => {
    expect(aceitarReescrita(original, "ok", { max: 120, min: 40 }).motivo).toBe(
      "abaixo_do_minimo",
    )
    expect(aceitarReescrita(original, "ok", { max: 120, min: null }).ok).toBe(true)
  })

  it("limite 0 (sem limite cadastrado) não reprova por tamanho", () => {
    expect(aceitarReescrita(original, "y".repeat(50), { max: 0 }).ok).toBe(true)
  })
})

describe("aplicarReescritas", () => {
  it("troca só as chaves aceitas e preserva o resto", () => {
    const novo = aplicarReescritas(BODY.content, [
      { key: "section_body_1", texto: "curto agora" },
    ])
    expect(novo.section_body_1).toBe("curto agora")
    expect(novo.section_headline).toBe("cabe")
    expect(Object.keys(novo)).toHaveLength(3)
  })

  it("lista vazia e content nulo não explodem", () => {
    expect(aplicarReescritas(BODY.content, [])).toEqual(BODY.content)
    expect(aplicarReescritas(null, [{ key: "a", texto: "b" }])).toEqual({ a: "b" })
  })
})

describe("resumoDeEstouros", () => {
  it("devolve o que a tela mostra: campo, atual e limite", () => {
    expect(resumoDeEstouros([BODY])).toEqual([
      {
        position: 1,
        type: "body",
        key: "section_body_1",
        label: "Corpo da seção",
        length: 190,
        max_len: 120,
      },
    ])
  })

  it("email inteiro dentro do limite não mostra nada", () => {
    expect(
      resumoDeEstouros([{ ...BODY, content: { section_body_1: "curto" } }]),
    ).toEqual([])
  })

  // Regressão: `alvosDeEncurtamento` passou a incluir o campo que entrou só
  // por travessão, e a tela do email mapeava esse retorno direto. Um campo
  // que CABE na caixa apareceria na pílula "acima do limite".
  it("travessão dentro do limite não conta como estouro", () => {
    expect(
      resumoDeEstouros([
        { ...BODY, content: { section_body_1: "curto — mas cabe" } },
      ]),
    ).toEqual([])
  })

  it("campo com os dois problemas continua aparecendo (o estouro é real)", () => {
    const texto = `${"x".repeat(150)} — fim`
    expect(
      resumoDeEstouros([{ ...BODY, content: { section_body_1: texto } }]),
    ).toEqual([
      {
        position: 1,
        type: "body",
        key: "section_body_1",
        label: "Corpo da seção",
        length: texto.length,
        max_len: 120,
      },
    ])
  })
})

describe("limiteDoCampo", () => {
  it("devolve o limite do campo de copy", () => {
    expect(limiteDoCampo(BODY.fields, "section_headline")).toBe(32)
  })

  it("campo de imagem, desconhecido ou sem limite não tem cobrança", () => {
    expect(limiteDoCampo(BODY.fields, "value_seal_1_image")).toBeNull()
    expect(limiteDoCampo(BODY.fields, "inexistente")).toBeNull()
    expect(limiteDoCampo([campo({ max_len: 0 })], "section_body_1")).toBeNull()
    expect(limiteDoCampo(null, "section_body_1")).toBeNull()
  })
})

describe("travessão como motivo de alvo", () => {
  const campo = (key: string, max: number) => ({
    key,
    label: key,
    type: "text_long" as const,
    max_len: max,
    min_len: null,
    required: false,
    example: "",
    guidance: "",
    source: "schema" as const,
  })

  it("campo DENTRO do limite mas com travessão vira alvo", () => {
    const alvos = alvosDeEncurtamento([
      {
        id: "b1",
        position: 0,
        block_type: "body",
        content: { texto: "Funciona — e sem risco." },
        fields: [campo("texto", 120)],
      },
    ])
    expect(alvos).toHaveLength(1)
    expect(alvos[0].motivos).toEqual(["travessao"])
    expect(alvos[0].tracos).toBe(1)
  })

  // O hífen é parte da palavra. Tocar nele quebraria o nome do produto.
  it("hífen dentro de palavra NÃO vira alvo", () => {
    const alvos = alvosDeEncurtamento([
      {
        id: "b1",
        position: 0,
        block_type: "body",
        content: { texto: "Compatível com OBD-II e e-mail de suporte." },
        fields: [campo("texto", 120)],
      },
    ])
    expect(alvos).toEqual([])
  })

  it("estouro + travessão traz os dois motivos", () => {
    const alvos = alvosDeEncurtamento([
      {
        id: "b1",
        position: 0,
        block_type: "body",
        content: { texto: `Longo — demais. ${"x".repeat(120)}` },
        fields: [campo("texto", 40)],
      },
    ])
    expect(alvos[0].motivos).toEqual(["max_len", "travessao"])
  })

  it("reescrita que mantém o traço é recusada", () => {
    const v = aceitarReescrita("Funciona — e sem risco.", "Funciona — sem risco.", {
      max: 120,
      motivos: ["travessao"],
    })
    expect(v).toEqual({ ok: false, motivo: "traco_permaneceu" })
  })

  // Tirar o traço custa caracteres: para o alvo que entrou SÓ por traço,
  // crescer é legítimo — o teto do max continua valendo.
  it("alvo só-de-traço pode crescer se couber no max", () => {
    const v = aceitarReescrita("Funciona — sem risco.", "Funciona, e é sem risco.", {
      max: 120,
      motivos: ["travessao"],
    })
    expect(v.ok).toBe(true)
  })

  it("alvo só-de-traço que passa do max continua recusado", () => {
    const v = aceitarReescrita("Funciona — sem risco.", "y".repeat(200), {
      max: 120,
      motivos: ["travessao"],
    })
    expect(v).toEqual({ ok: false, motivo: "ainda_acima_do_limite" })
  })

  it("alvo de estouro que cresce continua em cresceu", () => {
    const v = aceitarReescrita("x".repeat(50), "y".repeat(60), {
      max: 120,
      motivos: ["max_len"],
    })
    expect(v).toEqual({ ok: false, motivo: "cresceu" })
  })
})
