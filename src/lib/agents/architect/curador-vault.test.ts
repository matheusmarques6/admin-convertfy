import { describe, it, expect } from "vitest"

import {
  buildCatalogVaultExtras,
  buildConvivenciaBlock,
  buildEstruturasRefResumo,
  buildMomentoBlock,
  buildProtocoloBlock,
  buildSecaoNotasBlock,
  semExige,
  emptyCuradorVaultKnowledge,
  extractVariantSections,
  indexVaultDocs,
  momentoDoEmail,
  parsePesoRaw,
  type VaultDocRow,
} from "./curador-vault"
import { buildCatalog } from "./catalog-builder"
import type { EmailComponentVariant } from "@/types/email-generation"

const doc = (over: Partial<VaultDocRow>): VaultDocRow => ({
  kind: "variante",
  grupo: null,
  slug: "x",
  variant_id: null,
  frontmatter: {},
  body_md: "",
  ...over,
})

// Corpo real (resumido) de uma nota de variante do vault.
const VARIANTE_BODY = `## Descrição curta

Primeiro e-mail da régua de boas-vindas. Entrega o cupom de captação.

## Descrição detalhada

Uma imagem única de 949px cobre o e-mail inteiro.

## Quando usar

em qualquer nicho com fotografia de produto própria.

## Quando NÃO usar

Sem cupom. A variante inteira gira em torno do código.

## Design system

Container 600px fixo.
`

describe("extractVariantSections", () => {
  it("corta descrição curta, quando usar e quando NÃO usar; ignora o resto", () => {
    const s = extractVariantSections(VARIANTE_BODY)
    expect(s.descricaoCurta).toContain("cupom de captação")
    expect(s.quandoUsar).toContain("fotografia de produto própria")
    expect(s.quandoNaoUsar).toContain("Sem cupom")
    expect(s.quandoNaoUsar).not.toContain("Container 600px")
  })

  it("corpo sem seções devolve vazios", () => {
    const s = extractVariantSections("prosa solta sem headings")
    expect(s.descricaoCurta).toBe("")
    expect(s.quandoUsar).toBe("")
  })
})

describe("parsePesoRaw", () => {
  it("extrai classe e altura da string crua do frontmatter simples", () => {
    expect(parsePesoRaw("{ altura_px: 949, classe: medio, fonte: medido }")).toBe("medio · 949px")
  })
  it("aceita só classe ou só altura", () => {
    expect(parsePesoRaw("{ classe: pesado }")).toBe("pesado")
    expect(parsePesoRaw("{ altura_px: 100 }")).toBe("100px")
  })
  it("não-string ou sem campos → null", () => {
    expect(parsePesoRaw(null)).toBeNull()
    expect(parsePesoRaw("nada aqui")).toBeNull()
  })
})

describe("momentoDoEmail", () => {
  it("faixas do welcome vêm das notas de eixo (1 / 2-4 / 5+)", () => {
    expect(momentoDoEmail("welcome", 1)).toBe("welcome-1")
    expect(momentoDoEmail("welcome", 2)).toBe("welcome-meio")
    expect(momentoDoEmail("welcome", 4)).toBe("welcome-meio")
    expect(momentoDoEmail("welcome", 5)).toBe("welcome-tardio")
    expect(momentoDoEmail("welcome", 8)).toBe("welcome-tardio")
  })
  it("mapeia os demais flows para o vocabulário do eixo", () => {
    expect(momentoDoEmail("abandoned_cart", 1)).toBe("carrinho-abandonado")
    expect(momentoDoEmail("browse_abandonment", 2)).toBe("browse-abandonment")
    expect(momentoDoEmail("site_abandoned", 1)).toBe("browse-abandonment")
    expect(momentoDoEmail("upsell", 1)).toBe("cross-sell")
    expect(momentoDoEmail("win_back", 1)).toBe("reengajamento")
    expect(momentoDoEmail("shipping_stages", 1)).toBe("pos-compra")
  })
  it("flow desconhecido → null (eixo neutro, nunca chute)", () => {
    expect(momentoDoEmail("custom", 1)).toBeNull()
  })
})

describe("indexVaultDocs + buildCatalogVaultExtras", () => {
  const rows: VaultDocRow[] = [
    doc({ kind: "protocolo", slug: "_protocolo-de-selecao", body_md: "eliminar antes de rankear" }),
    doc({ kind: "secao", grupo: "hero", slug: "_hero", body_md: "chave de desempate da hero" }),
    doc({
      kind: "variante",
      grupo: "hero",
      slug: "hero-3-cupom-de-captacao",
      variant_id: "d9e34a1f-7bc7-47e8-9081-53600b104dd2",
      frontmatter: {
        momento: ["welcome-1"],
        momento_vetado: ["transacional"],
        objecao: ["preco-valor"],
        registro: [],
        registro_vetado: ["luxo"],
        paleta: ["claro"],
        papel_na_peca: ["abre"],
        exige: ["cupom-ativo"],
        peso: "{ altura_px: 949, classe: medio, fonte: medido }",
        convivencia: [],
        product_slots: 0,
      },
      body_md: VARIANTE_BODY,
    }),
    doc({
      kind: "variante",
      grupo: "body",
      slug: "body-7-faq",
      variant_id: null,
      frontmatter: { nome_no_banco: "welcome - body FAQ" },
      body_md: "",
    }),
    doc({ kind: "convivencia", slug: "prova-social-nao-duplica-na-peca", body_md: "Prova social não duplica." }),
    doc({ kind: "requisito", slug: "cupom-ativo", body_md: "# Título\n\nExiste um cupom ativo e válido?" }),
    doc({ kind: "eixo", grupo: "momento", slug: "welcome-1", body_md: "Primeiro toque do flow." }),
  ]
  const k = indexVaultDocs(rows)

  it("indexa por categoria", () => {
    expect(k.protocolo?.slug).toBe("_protocolo-de-selecao")
    expect(k.secoes.get("hero")?.body_md).toContain("desempate")
    expect(k.variantes).toHaveLength(2)
    expect(k.convivencias).toHaveLength(1)
    expect(k.requisitos).toHaveLength(1)
    expect(k.eixos.get("momento/welcome-1")?.body_md).toContain("Primeiro toque")
    expect(k.total).toBe(rows.length)
  })

  it("casa por variant_id e, na falta, por nome_no_banco", () => {
    const extras = buildCatalogVaultExtras(k, [
      { id: "d9e34a1f-7bc7-47e8-9081-53600b104dd2", name: "welcome - hero section 3" },
      { id: "id-faq", name: "Welcome - Body FAQ" },
      { id: "id-sem-nota", name: "outra" },
    ])
    expect(extras.size).toBe(2)
    const hero = extras.get("d9e34a1f-7bc7-47e8-9081-53600b104dd2")
    expect(hero?.slug).toBe("hero-3-cupom-de-captacao")
    expect(hero?.momento).toEqual(["welcome-1"])
    // `exige` não é mais lido do frontmatter (01/09): o campo eliminava
    // candidata sobre requisito que o próprio vault declara não verificável.
    expect(hero).not.toHaveProperty("exige")
    expect(hero?.peso).toBe("medio · 949px")
    expect(hero?.quando_nao_usar).toContain("Sem cupom")
    // Capacidade vem do frontmatter (02/09): 0 é declaração, não ausência.
    expect(hero?.product_slots).toBe(0)
    expect(extras.get("id-faq")?.product_slots).toBeNull()
    expect(extras.get("id-faq")?.slug).toBe("body-7-faq")
    expect(extras.has("id-sem-nota")).toBe(false)
  })

  it("os extras entram no catálogo e a prosa do vault vence o cadastro", () => {
    const extras = buildCatalogVaultExtras(k, [
      { id: "d9e34a1f-7bc7-47e8-9081-53600b104dd2", name: "welcome - hero section 3" },
    ])
    const variante = {
      id: "d9e34a1f-7bc7-47e8-9081-53600b104dd2",
      name: "welcome - hero section 3",
      block_type: "hero",
      description: "descrição do banco",
      when_use: "quando usar do banco",
      when_not_use: "quando não usar do banco",
    } as unknown as EmailComponentVariant
    const r = buildCatalog([variante], extras)
    const entry = r.sections[0].variantes[0]
    expect(entry.vault?.slug).toBe("hero-3-cupom-de-captacao")
    expect(entry.vault?.momento_vetado).toEqual(["transacional"])
    expect(entry.quando_nao_usar).toContain("Sem cupom")
    expect(entry.description).toContain("cupom de captação")
    // Sem extras, o catálogo é byte a byte o de antes (retrocompat).
    const semVault = buildCatalog([variante])
    expect(semVault.sections[0].variantes[0].vault).toBeUndefined()
    expect(semVault.sections[0].variantes[0].description).toBe("descrição do banco")
  })

  it("blocos de system declaram presença e ausência", () => {
    expect(buildProtocoloBlock(k)).toContain("eliminar antes de rankear")
    expect(buildProtocoloBlock(emptyCuradorVaultKnowledge())).toContain("não sincronizado")
    expect(buildConvivenciaBlock(k)).toContain("prova-social-nao-duplica-na-peca")
    expect(buildConvivenciaBlock(emptyCuradorVaultKnowledge())).toContain("nenhuma regra")
  })

  it("bloco de momento traz o valor + a nota do eixo quando existe", () => {
    const b = buildMomentoBlock(k, "welcome", 1)
    expect(b).toContain("welcome-1")
    expect(b).toContain("Primeiro toque")
    // Sem nota do eixo, só o valor.
    expect(buildMomentoBlock(k, "welcome", 3)).toBe("welcome-meio")
    // Flow não mapeado declara neutralidade.
    expect(buildMomentoBlock(k, "custom", 1)).toContain("não mapeado")
  })

  it("notas de seção só das seções pedidas; ausência declarada", () => {
    const b = buildSecaoNotasBlock(k, ["hero", "body", "hero"])
    expect(b).toContain("Seção hero")
    expect(b).not.toContain("Seção body")
    expect(buildSecaoNotasBlock(k, ["footer"])).toContain("sem notas de seção")
  })
})

describe("buildEstruturasRefResumo", () => {
  it("uma linha por referência, com origem e sequência", () => {
    const b = buildEstruturasRefResumo([
      { slug: "medicube-ultima-batida", loja: "Medicube", escopo: null, emails: [7, 8], secoes: ["hero", "offer"] },
      { slug: "carta-plain-text", loja: null, escopo: "geral", emails: [], secoes: ["body"] },
    ])
    expect(b).toContain("- medicube-ultima-batida (Medicube) [emails 7,8]: hero → offer")
    expect(b).toContain("- carta-plain-text (geral): body")
  })
  it("vazio é declarado", () => {
    expect(buildEstruturasRefResumo([])).toContain("nenhuma estrutura")
  })
})

// ── `exige` fora das notas de seção (02/09) ─────────────────────────────
describe("semExige", () => {
  // Trecho real da nota `_hero` do vault, como chegou ao prompt em 02/09.
  const NOTA = [
    "# Chave de decisão",
    "",
    "Ordem de leitura, na ordem real do protocolo: momento (filtro) → exige",
    "(requisito duro, inclui o ativo fotográfico) → objeção (1º eixo de",
    "ranking) → registro (2º eixo).",
    "",
    "| Variante | Momento | Exige | Objeção | Registro |",
    "|---|---|---|---|---|",
    "| hero-3 | welcome-1 | cupom-ativo | preco-valor | — |",
    "| hero-6 | welcome-1 | foto-monocromatica | preco-valor | bold |",
    "",
    "**Como ler:** hero-3/4/5/6 **exigem** cupom ativo.",
    "hero-7 veta cupom de fato (as duas coisas não convivem na mesma peça).",
  ].join("\n")

  it("some a palavra, a coluna e as linhas que a citam; o resto fica", () => {
    const r = semExige(NOTA)
    expect(r).not.toMatch(/exig/i)
    expect(r).toContain("| hero-3 | welcome-1 | preco-valor | — |")
    expect(r).toContain("| hero-6 | welcome-1 | preco-valor | bold |")
    expect(r).toContain("|---|---|---|---|")
    expect(r).toContain("hero-7 veta cupom de fato")
    expect(r).toContain("# Chave de decisão")
  })

  it("nota sem a palavra passa intacta", () => {
    expect(semExige("chave de desempate da hero")).toBe("chave de desempate da hero")
  })

  it("buildSecaoNotasBlock serve a nota já limpa", () => {
    const k = emptyCuradorVaultKnowledge()
    k.secoes.set("hero", { slug: "_hero", kind: "secao", body_md: NOTA } as never)
    expect(buildSecaoNotasBlock(k, ["hero"])).not.toMatch(/exig/i)
  })
})
