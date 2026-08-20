/**
 * Trava o vocabulário de tokens de atributo no que o inventário de 20/08
 * encontrou nas 38 variantes ativas. Todo token listado aqui EXISTE no HTML
 * real da biblioteca — se um caso destes quebrar, o casamento de imagem
 * quebra em produção junto.
 */

import { describe, expect, it } from "vitest"
import {
  FIXED_ART_SRC,
  isAltToken,
  isAttrToken,
  isResidualUrl,
  isStructuralToken,
  parseAttrToken,
} from "./attr-token-vocabulary"

// ── Inventário real (src/alt colhidos das 38 variantes ativas) ──────
const SRC_TOKENS_REAIS = [
  "URL_DA_IMAGEM_1",
  "URL_DA_IMAGEM_2",
  "URL_DA_IMAGEM_3",
  "URL_DA_IMAGEM_AQUI",
  "URL_DA_IMAGEM_PRINCIPAL",
  "URL_COMPOSICAO_PRODUTO_1",
  "URL_COMPOSICAO_PRODUTO_4",
  "URL_TOPO_COLUNA_A",
  "URL_TOPO_COLUNA_B",
  "URL_FOTO_1",
  "URL_FOTO_3",
  "URL_FOTO_PEQUENA_1A",
  "URL_FOTO_PEQUENA_2C",
  "URL_FOTO_GRANDE_1",
  "URL_FOTO_GRANDE_2",
  "URL_PRODUTO_1",
  "URL_PRODUTO_9",
  "URL_FOTO_POLAROID_2",
  "URL_FOTO_REVIEW_1",
  "URL_SELO_VERIFICADO",
  "URL_DO_LOGO_AQUI",
]

const ALT_TOKENS_REAIS = [
  "ALT_DA_IMAGEM_1",
  "ALT_PRODUTO_3",
  "ALT_COLUNA_B",
  "ALT_FOTO_2B",
  "ALT_FOTO_GRANDE_2",
  "ALT_REVIEW_1",
  "ALT_DEPOIMENTO_3",
]

describe("isAttrToken — reconhecimento por forma", () => {
  it("todo token do inventário real é reconhecido", () => {
    for (const t of [...SRC_TOKENS_REAIS, ...ALT_TOKENS_REAIS, "NOME_DA_MARCA"]) {
      expect(isAttrToken(t), t).toBe(true)
    }
  })

  it("arte fixa base64 NUNCA é slot (ícones sociais do footer, selos)", () => {
    expect(isAttrToken("data:image/png;base64,iVBORw0KGgo")).toBe(false)
    expect(FIXED_ART_SRC.test("data:image/png;base64,x")).toBe(true)
  })

  it("URL real do Figma é resquício de export, não slot", () => {
    expect(
      isAttrToken("https://www.figma.com/api/mcp/asset/d9880f17"),
    ).toBe(false)
    expect(isResidualUrl("https://www.figma.com/api/mcp/asset/x")).toBe(true)
  })

  it("caminho relativo, âncora e valor vazio não são slot", () => {
    expect(isAttrToken("/images/foo.png")).toBe(false)
    expect(isAttrToken("#")).toBe(false)
    expect(isAttrToken("")).toBe(false)
  })

  it("texto comum em caixa alta curta não vira slot (mínimo 3 chars, forma estrita)", () => {
    expect(isAttrToken("OK")).toBe(false)
    expect(isAttrToken("P.S.")).toBe(false) // pontos quebram a forma
    expect(isAttrToken("cta 1")).toBe(false) // minúsculas/espaço
  })
})

describe("parseAttrToken — sufixo de ordem", () => {
  it("sufixo numérico: URL_PRODUTO_3 → ordinal 3", () => {
    expect(parseAttrToken("URL_PRODUTO_3")).toEqual({
      raw: "URL_PRODUTO_3",
      base: "URL_PRODUTO",
      ordinal: 3,
      sub: null,
    })
  })

  it("número + sub-letra de grade: URL_FOTO_PEQUENA_2B → ordinal 2, sub B", () => {
    expect(parseAttrToken("URL_FOTO_PEQUENA_2B")).toEqual({
      raw: "URL_FOTO_PEQUENA_2B",
      base: "URL_FOTO_PEQUENA",
      ordinal: 2,
      sub: "B",
    })
  })

  it("só letra: URL_TOPO_COLUNA_A → sub A sem ordinal", () => {
    expect(parseAttrToken("URL_TOPO_COLUNA_A")).toEqual({
      raw: "URL_TOPO_COLUNA_A",
      base: "URL_TOPO_COLUNA",
      ordinal: null,
      sub: "A",
    })
  })

  it("AQUI tem mais de uma letra — é nome, não ordem", () => {
    expect(parseAttrToken("URL_DO_LOGO_AQUI")).toEqual({
      raw: "URL_DO_LOGO_AQUI",
      base: "URL_DO_LOGO_AQUI",
      ordinal: null,
      sub: null,
    })
  })

  it("token sem sufixo: URL_SELO_VERIFICADO fica inteiro como base", () => {
    expect(parseAttrToken("URL_SELO_VERIFICADO")).toEqual({
      raw: "URL_SELO_VERIFICADO",
      base: "URL_SELO_VERIFICADO",
      ordinal: null,
      sub: null,
    })
  })

  it("valor fora da forma devolve null", () => {
    expect(parseAttrToken("https://cdn.loja.com/x.png")).toBeNull()
    expect(parseAttrToken("data:image/png;base64,abc")).toBeNull()
  })
})

describe("classificação estrutural × alt", () => {
  it("URL_DO_LOGO_AQUI e NOME_DA_MARCA são da plataforma", () => {
    expect(isStructuralToken("URL_DO_LOGO_AQUI")).toBe(true)
    expect(isStructuralToken("NOME_DA_MARCA")).toBe(true)
    expect(isStructuralToken("URL_UNSUBSCRIBE")).toBe(true)
    expect(isStructuralToken("URL_PREFERENCIAS")).toBe(true)
    expect(isStructuralToken("URL_PRODUTO_1")).toBe(false)
    // Destino de campanha não é estrutural — a plataforma não sabe pra onde
    // o CTA aponta.
    expect(isStructuralToken("URL_DO_CTA_AQUI")).toBe(false)
  })

  it("ALT_* é texto alternativo (nesta rodada: só limpo, não preenchido)", () => {
    expect(isAltToken("ALT_PRODUTO_3")).toBe(true)
    expect(isAltToken("NOME_DA_MARCA")).toBe(false)
    expect(isAltToken("URL_DA_IMAGEM_1")).toBe(false)
  })
})
