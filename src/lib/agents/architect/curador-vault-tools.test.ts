import { describe, it, expect, vi, beforeEach } from "vitest"

// Banco em memória: as 4 tabelas do vault + a biblioteca de variantes.
const h = vi.hoisted(() => ({
  notas: [] as Array<Record<string, unknown>>,
  variantesInativas: [] as string[],
  erroNaChecagem: false,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "email_component_variants") {
        // A checagem: quais destes ids estão is_active = false.
        const q = {
          _ids: [] as string[],
          select: () => q,
          in: (_col: string, ids: string[]) => {
            q._ids = ids
            return q
          },
          eq: () =>
            h.erroNaChecagem
              ? Promise.resolve({ data: null, error: { message: "boom" } })
              : Promise.resolve({
                  data: q._ids
                    .filter((id) => h.variantesInativas.includes(id))
                    .map((id) => ({ id })),
                  error: null,
                }),
        }
        return q
      }
      // Tabelas do vault: só email_vault_docs tem notas nas fixtures.
      const linhas = tabela === "email_vault_docs" ? h.notas : []
      const q = {
        _prefixo: null as string | null,
        _path: null as string | null,
        _ids: null as string[] | null,
        select: () => q,
        eq: (col: string, val: unknown) => {
          if (col === "file_path") q._path = String(val)
          return q
        },
        like: (_col: string, padrao: string) => {
          q._prefixo = padrao.replace(/%$/, "")
          return q
        },
        in: (_col: string, ids: string[]) => {
          q._ids = ids
          return Promise.resolve({
            data: linhas.filter((r) => ids.includes(String(r.variant_id ?? ""))),
            error: null,
          })
        },
        order: () => q,
        limit: () =>
          Promise.resolve({
            data: linhas.filter((r) =>
              String(r.file_path).startsWith(q._prefixo ?? ""),
            ),
            error: null,
          }),
        maybeSingle: () =>
          Promise.resolve({
            data: linhas.find((r) => r.file_path === q._path) ?? null,
            error: null,
          }),
      }
      return q
    },
  }),
  createClient: () => ({}),
}))

import { extratoParaDecisao, listarPasta, lerNota, loadFinalistNotes } from "./curador-vault-tools"

const nota = (
  file_path: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  file_path,
  body_md: `corpo de ${file_path}`,
  kind: "variante",
  variant_id: null,
  ...extra,
})

beforeEach(() => {
  h.erroNaChecagem = false
  h.variantesInativas = ["id-offer-4"]
  h.notas = [
    nota("componentes/variantes/offer/offer-3-lembrete-de-cupom.md", { variant_id: "id-offer-3" }),
    nota("componentes/variantes/offer/offer-4-manifesto-antes-do-cupom.md", { variant_id: "id-offer-4" }),
    nota("componentes/secoes/offer.md", { kind: "secao", variant_id: null }),
  ]
})

// Incidente 07/09: as ferramentas filtravam is_active da NOTA e nunca da
// VARIANTE. O Curador leu a nota da offer-4, escolheu o bloco — que está
// desativado e fora do catálogo servido — e a escolha morreu em
// invalid_ids, deixando a posição vazia.
describe("ferramentas do vault — variante desativada não é servida", () => {
  it("listar_pasta omite a nota da variante desativada", async () => {
    const saida = await listarPasta("componentes/variantes/offer")
    expect(saida).toContain("offer-3-lembrete-de-cupom.md")
    expect(saida).not.toContain("offer-4-manifesto-antes-do-cupom.md")
  })

  it("ler_nota recusa a variante desativada dizendo o motivo", async () => {
    const saida = await lerNota("componentes/variantes/offer/offer-4-manifesto-antes-do-cupom.md")
    expect(saida).toContain("desativada")
    expect(saida).not.toContain("corpo de")
  })

  it("variante ativa continua servida inteira", async () => {
    const saida = await lerNota("componentes/variantes/offer/offer-3-lembrete-de-cupom.md")
    expect(saida).toContain("corpo de componentes/variantes/offer/offer-3")
  })

  it("nota que não é de variante nunca é filtrada", async () => {
    // Seção, eixo, requisito, lacuna: não têm variant_id e não são escolhíveis.
    h.variantesInativas = []
    const saida = await lerNota("componentes/secoes/offer.md")
    expect(saida).toContain("corpo de componentes/secoes/offer.md")
  })

  it("erro na checagem serve demais em vez de calar o vault", async () => {
    h.erroNaChecagem = true
    const saida = await listarPasta("componentes/variantes/offer")
    // Esconder as 36 boas para proteger contra 4 seria pior: o parser ainda
    // recusa o id inválido no fim da linha.
    expect(saida).toContain("offer-4-manifesto-antes-do-cupom.md")
  })

  it("pasta sem nota devolve texto, não erro", async () => {
    const saida = await listarPasta("componentes/inexistente")
    expect(saida).toContain("nenhuma nota sincronizada")
  })
})

describe("notas das finalistas em lote", () => {
  it("deduplica ids e distingue nota aberta de ausente", async () => {
    const result = await loadFinalistNotes(["id-offer-3", "sem-nota", "id-offer-3"])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ variant_id: "id-offer-3", status: "opened" })
    expect(result[1]).toEqual({ variant_id: "sem-nota", status: "missing", file_path: null, body: null })
  })

  // A propriedade "adicionar variante custa pouco" (15/09). Abaixo do
  // limiar de shortlist TODAS as elegíveis viram finalistas, então sem teto
  // um grupo de 5 servia 32.620 chars por posição — na CAUDA, que paga
  // preço cheio em toda geração.
  it("o orçamento da cauda corta as PIORES colocadas, nunca a primeira", async () => {
    const grande = "x".repeat(2_900)
    h.notas = Array.from({ length: 12 }, (_, i) =>
      nota(`componentes/variantes/body/b${i}.md`, { variant_id: `v${i}`, body_md: grande }),
    )
    const ids = Array.from({ length: 12 }, (_, i) => `v${i}`)
    const result = await loadFinalistNotes(ids)
    expect(result[0].status).toBe("opened")
    const cortadas = result.filter((r) => r.status === "sem_orcamento")
    expect(cortadas.length).toBeGreaterThan(0)
    // Quem foi cortada é a do FIM da lista, que é a pior do ranking.
    expect(cortadas.map((r) => r.variant_id)).toEqual(
      ids.slice(ids.length - cortadas.length),
    )
    const servido = result.reduce((acc, r) => acc + (r.body?.length ?? 0), 0)
    expect(servido).toBeLessThanOrEqual(18_000)
  })

  it("cortada por orçamento NÃO é o mesmo que sem nota: o caminho fica", async () => {
    // Ela segue escolhível pela linha do catálogo, que carrega eixos e
    // forma — dizer "sem nota sincronizada" mandaria corrigir o vault.
    h.notas = Array.from({ length: 8 }, (_, i) =>
      nota(`componentes/variantes/body/b${i}.md`, { variant_id: `v${i}`, body_md: "x".repeat(2_900) }),
    )
    const result = await loadFinalistNotes(Array.from({ length: 8 }, (_, i) => `v${i}`))
    const cortada = result.find((r) => r.status === "sem_orcamento")!
    expect(cortada.file_path).toContain(".md")
    expect(cortada.body).toBeNull()
  })

  it("uma finalista sozinha SEMPRE cabe: o teto por nota a corta antes", async () => {
    // Não existe posição em que a única finalista chegue ao modelo sem
    // nota — isso seria o teto de custo criando a lacuna que ele deveria
    // evitar.
    h.notas = [nota("componentes/variantes/body/b0.md", { variant_id: "v0", body_md: "x".repeat(30_000) })]
    const [r] = await loadFinalistNotes(["v0"])
    expect(r.status).toBe("opened")
    expect(r.body).toContain("nota truncada")
    expect(r.body!.length).toBeLessThan(3_100)
  })
})

// ── O extrato da nota (15/09) ───────────────────────────────────────────
//
// Medido nas 40 notas ativas: 6.524 chars em média, sete seções, e 67% do
// texto (design system 2.218 · direção fotográfica 1.349 · orientações de
// copy 796) serve a OUTROS agentes e já está no banco. Essa parte fica na
// CAUDA do prompt, depois do último marcador de cache, e é paga inteira em
// toda geração.
describe("extratoParaDecisao", () => {
  const nota = `---
status: aprovada
variant_id: abc
objecao: [preco-valor]
---

# Hero 3 — cupom de captação

## Descrição curta
Hero com cupom em destaque.

## Descrição detalhada
Dois parágrafos sobre a peça.

## Quando usar
Quando a loja abre com incentivo.

## Quando não usar
Quando não há cupom ativo.

## Design system
Tipografia condensada, 48px, tracking -2%. Duas colunas no desktop.

## Direção fotográfica
Flat-lay de kit, luz dura, nenhuma mão.

## Orientações de copy para a IA
Headline em até 6 palavras.
`

  it("mantém frontmatter, título e as quatro seções de decisão", () => {
    const e = extratoParaDecisao(nota)
    expect(e).toContain("objecao: [preco-valor]")
    expect(e).toContain("# Hero 3 — cupom de captação")
    expect(e).toContain("## Descrição curta")
    expect(e).toContain("## Descrição detalhada")
    expect(e).toContain("## Quando usar")
    expect(e).toContain("## Quando não usar")
  })

  it("descarta o que é de outro agente — e já está no banco", () => {
    const e = extratoParaDecisao(nota)
    expect(e).not.toContain("Design system")
    expect(e).not.toContain("Direção fotográfica")
    expect(e).not.toContain("Orientações de copy")
    expect(e).not.toContain("Flat-lay")
    expect(e.length).toBeLessThan(nota.length)
  })

  it("corta ~2/3 numa nota com as proporções REAIS das 40 do vault", () => {
    // Médias medidas em 15/09, por seção: design system 2.218 · direção
    // fotográfica 1.349 · descrição detalhada 969 · orientações de copy 796
    // · quando não usar 469 · quando usar 396 · descrição curta 288.
    const enche = (n: number) => "x".repeat(n)
    const real = [
      "---\nstatus: aprovada\n---",
      "# Peça",
      `## Descrição curta\n${enche(288)}`,
      `## Descrição detalhada\n${enche(969)}`,
      `## Quando usar\n${enche(396)}`,
      `## Quando não usar\n${enche(469)}`,
      `## Design system\n${enche(2218)}`,
      `## Direção fotográfica\n${enche(1349)}`,
      `## Orientações de copy para a IA\n${enche(796)}`,
    ].join("\n\n")
    const e = extratoParaDecisao(real)
    const reducao = 1 - e.length / real.length
    expect(reducao).toBeGreaterThan(0.6)
    expect(reducao).toBeLessThan(0.75)
  })

  it("fail-open: nota em formato desconhecido volta inteira", () => {
    // Formato novo no vault não pode virar finalista sem nota nenhuma.
    const outra = "# Peça X\n\nTexto corrido, sem seções."
    expect(extratoParaDecisao(outra)).toBe(outra)
  })

  it("nota vazia continua vazia", () => {
    expect(extratoParaDecisao("")).toBe("")
    expect(extratoParaDecisao("   ")).toBe("")
  })

  it("aceita os títulos sem acento", () => {
    const semAcento = "## Descricao curta\nTexto.\n\n## Quando nao usar\nNunca.\n\n## Design system\nX."
    const e = extratoParaDecisao(semAcento)
    expect(e).toContain("Descricao curta")
    expect(e).toContain("Quando nao usar")
    expect(e).not.toContain("Design system")
  })
})
