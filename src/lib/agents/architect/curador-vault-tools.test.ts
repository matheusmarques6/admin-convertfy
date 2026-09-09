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
        select: () => q,
        eq: (col: string, val: unknown) => {
          if (col === "file_path") q._path = String(val)
          return q
        },
        like: (_col: string, padrao: string) => {
          q._prefixo = padrao.replace(/%$/, "")
          return q
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

import { executorRestritoAFinalistas, listarPasta, lerNota } from "./curador-vault-tools"

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

describe("leitura sob demanda das finalistas", () => {
  it("bloqueia notas antes da seleção e notas que não pertencem às finalistas", async () => {
    const base = vi.fn(async (_nome: string, args: Record<string, unknown>) => `nota: ${args.caminho}`)
    const acesso = executorRestritoAFinalistas(base, [
      { variant_id: "v1", slug: "hero-1" },
      { variant_id: "v2", slug: "hero-2" },
    ])

    expect(await acesso.executar("ler_nota", { caminho: "componentes/hero-1.md" })).toContain("somente nota")
    await acesso.executar("selecionar_finalistas", { variant_ids: ["v1"] })
    expect(await acesso.executar("ler_nota", { caminho: "componentes/hero-2.md" })).toContain("somente nota")
    expect(await acesso.executar("ler_nota", { caminho: "componentes/hero-1.md" })).toContain("nota: componentes/hero-1.md")
    expect(base).toHaveBeenCalledTimes(1)
    expect(Array.from(acesso.notasAbertas)).toEqual(["v1"])
  })
})
