import { describe, it, expect } from "vitest"

import type { EmailComponentVariant } from "@/types/email-generation"
import {
  buildCatalog,
  buildTypeIndex,
  similaridadeDeDescricao,
} from "./catalog-builder"
import type { CatalogVaultExtra } from "./catalog-builder"

function v(
  id: string,
  blockType: string,
  name: string,
  extra: Partial<EmailComponentVariant> = {},
): EmailComponentVariant {
  return {
    id,
    block_type: blockType,
    name,
    html: "<tr><td>{{X}}</td></tr>",
    description: null,
    when_use: null,
    when_not_use: null,
    objectives: [],
    tones: [],
    density: null,
    product_slots: 0,
    copy_guidance: null,
    long_description: null,
    output_schema: [],
    ...extra,
  } as unknown as EmailComponentVariant
}

describe("buildCatalog", () => {
  it("agrupa por tipo e ordena por nome dentro de cada tipo", () => {
    const r = buildCatalog([
      v("3", "hero", "Zebra"),
      v("1", "body", "Alpha"),
      v("2", "hero", "Abacate"),
    ])
    expect(r.types).toEqual(["body", "hero"])
    expect(r.sections[0].section).toBe("body")
    expect(r.sections[1].variantes.map((x) => x.name)).toEqual([
      "Abacate",
      "Zebra",
    ])
    expect(r.total).toBe(3)
  })

  // O catálogo vai no system para ser cacheado, e cache é endereçado por
  // conteúdo: ordem instável entre lojas mataria o cache.
  it("é estável: mesma entrada em outra ordem gera o MESMO json", () => {
    const a = buildCatalog([v("1", "hero", "A"), v("2", "hero", "B"), v("3", "body", "C")])
    const b = buildCatalog([v("3", "body", "C"), v("2", "hero", "B"), v("1", "hero", "A")])
    expect(a.json).toBe(b.json)
  })

  it("carrega os metadados que o Curador usa para rankear", () => {
    const r = buildCatalog([
      v("1", "hero", "H", {
        description: "hero com faixa",
        when_use: "quando a marca é premium",
        when_not_use: "quando não há imagem",
        objectives: ["Promoção"],
        tones: ["Premium"],
        density: "rich",
        product_slots: 3,
        copy_guidance: "headline curta",
        long_description: "usa VML no Outlook",
      }),
    ])
    const e = r.sections[0].variantes[0]
    expect(e).toEqual({
      variant_id: "1",
      name: "H",
      description: "hero com faixa",
      quando_usar: "quando a marca é premium",
      quando_nao_usar: "quando não há imagem",
      objectives: ["Promoção"],
      tones: ["Premium"],
      density: "rich",
      product_slots: 3,
      orientacao_copy: "headline curta",
      notas_implementacao: "usa VML no Outlook",
    })
  })

  // O schema é insumo exclusivo do Montador (CM-4): mandá-lo aqui dobraria o
  // prefixo sem melhorar o ranking.
  it("NÃO inclui output_schema nem html", () => {
    const r = buildCatalog([
      v("1", "hero", "H", {
        output_schema: [{ key: "headline", label: "H", type: "text_short" }],
        html: "<tr><td>{{HERO_HEADLINE}}</td></tr>",
      } as Partial<EmailComponentVariant>),
    ])
    expect(r.json).not.toContain("output_schema")
    expect(r.json).not.toContain("campos_copy")
    expect(r.json).not.toContain("HERO_HEADLINE")
  })

  it("catálogo vazio → json de array vazio", () => {
    const r = buildCatalog([])
    expect(r.total).toBe(0)
    expect(r.types).toEqual([])
    expect(JSON.parse(r.json)).toEqual([])
  })

  it("texto ausente vira string vazia; só density admite null", () => {
    const r = buildCatalog([v("1", "hero", "H")])
    expect(r.json).not.toContain("undefined")
    const e = r.sections[0].variantes[0]
    expect(e.description).toBe("")
    expect(e.quando_usar).toBe("")
    expect(e.quando_nao_usar).toBe("")
    expect(e.orientacao_copy).toBe("")
    expect(e.notas_implementacao).toBe("")
    expect(e.objectives).toEqual([])
    expect(e.product_slots).toBe(0)
    // `density` é tri-estado no cadastro (minimal/balanced/rich ou não
    // definida) — null aqui é informação, não campo faltando.
    expect(e.density).toBeNull()
  })
})

describe("buildTypeIndex", () => {
  it("mapeia id → block_type", () => {
    const idx = buildTypeIndex([v("1", "hero", "A"), v("2", "footer", "B")])
    expect(idx.get("1")).toBe("hero")
    expect(idx.get("2")).toBe("footer")
    expect(idx.get("x")).toBeUndefined()
  })
})

// ── Vault × banco (01/09) ───────────────────────────────────────────────
//
// O caso real: o doc `body-4-tutorial-de-uso` do vault descreve um tutorial
// em passos numerados, e o `variant_id` que ele carrega aponta, no banco,
// para um comparativo contra a concorrência. Como `toEntry` sobrepõe a
// prosa do vault e o prompt diz que o vault vence, o Curador decidia sobre
// uma peça e o pipeline montava outra — sem registro em lugar nenhum.
const VAULT_BODY4 =
  "Tutorial de uso em 2 colunas paralelas: foto circular do produto, título do modo e passos numerados em badges, com Pro Tip compartilhado e CTA de aprofundamento."
const BANCO_BODY4 =
  'Bloco de comparação direta contra a concorrência. Duas colunas lado a lado — a marca de um lado, "os outros" do outro — cada uma com foto circular, título e uma lista de atributos marcados item a item.'
// A MESMA peça, dita com outro vocabulário ("gift card" × "vale-presente").
const VAULT_BODY3 =
  "Pitch de gift card digital com headline anti-objeção, dois parágrafos curtos e CTA, assinado por faixa de 3 selos circulares com valores da marca."
const BANCO_BODY3 =
  "Bloco de venda de vale-presente. Título, dois parágrafos curtos e o botão resolvem a oferta; abaixo, três selos circulares com os valores da marca fecham a peça."

function extra(id: string, slug: string, descricao: string) {
  return new Map<string, CatalogVaultExtra>([
    [id, { slug, descricao_curta: descricao }],
  ])
}

describe("similaridadeDeDescricao", () => {
  it("texto idêntico é 1; sem palavra de conteúdo é 1 (nada a comparar)", () => {
    expect(similaridadeDeDescricao(VAULT_BODY3, VAULT_BODY3)).toBe(1)
    expect(similaridadeDeDescricao("de a o", "para com que")).toBe(1)
  })

  // O número que a doutrina do módulo cita. Ele ORDENA, não julga: oito
  // centésimos separam "outro vocabulário" de "outra peça".
  it("os dois casos reais ficam perto demais para um corte julgar", () => {
    const mesmaPeca = similaridadeDeDescricao(VAULT_BODY3, BANCO_BODY3)
    const outraPeca = similaridadeDeDescricao(VAULT_BODY4, BANCO_BODY4)
    expect(outraPeca).toBeLessThan(mesmaPeca)
    expect(mesmaPeca - outraPeca).toBeLessThan(0.15)
  })
})

describe("buildCatalog — divergência vault × banco", () => {
  it("serve as DUAS descrições e registra o par", () => {
    const r = buildCatalog(
      [v("id-4", "body", "body 4 - bridge fundo cards", { description: BANCO_BODY4 })],
      extra("id-4", "body-4-tutorial-de-uso", VAULT_BODY4),
    )
    const entrada = r.sections[0].variantes[0]
    // A prosa do vault continua vencendo o campo `description` (é o
    // julgamento curado); o cadastro do banco viaja JUNTO, marcado.
    expect(entrada.description).toBe(VAULT_BODY4)
    expect(entrada.description_no_banco).toBe(BANCO_BODY4)
    expect(r.divergentes).toHaveLength(1)
    expect(r.divergentes[0]).toMatchObject({
      variant_id: "id-4",
      slug: "body-4-tutorial-de-uso",
      name: "body 4 - bridge fundo cards",
    })
    expect(r.json).toContain("description_no_banco")
  })

  it("descrições que combinam não viram divergência nem poluem o catálogo", () => {
    const iguais = "Bloco de diferenciação para quando o cliente já entendeu a categoria e está decidindo entre marcas."
    const r = buildCatalog(
      [v("id-5", "body", "body 5", { description: iguais })],
      extra("id-5", "body-5-comparacao-nos-vs-eles", iguais),
    )
    expect(r.divergentes).toEqual([])
    expect(r.sections[0].variantes[0].description_no_banco).toBeUndefined()
  })

  it("um dos lados vazio não é contradição", () => {
    const semBanco = buildCatalog(
      [v("id-x", "body", "x", { description: null })],
      extra("id-x", "body-x", VAULT_BODY4),
    )
    expect(semBanco.divergentes).toEqual([])
    const semVault = buildCatalog([
      v("id-y", "body", "y", { description: BANCO_BODY4 }),
    ])
    expect(semVault.divergentes).toEqual([])
  })

  it("ordena da mais divergente para a menos", () => {
    const extras = new Map<string, CatalogVaultExtra>([
      ["id-3", { slug: "body-3-pitch-de-gift-card", descricao_curta: VAULT_BODY3 }],
      ["id-4", { slug: "body-4-tutorial-de-uso", descricao_curta: VAULT_BODY4 }],
    ])
    const r = buildCatalog(
      [
        v("id-3", "body", "body 3", { description: BANCO_BODY3 }),
        v("id-4", "body", "body 4", { description: BANCO_BODY4 }),
      ],
      extras,
    )
    expect(r.divergentes.map((d) => d.variant_id)).toEqual(["id-4", "id-3"])
  })
})
