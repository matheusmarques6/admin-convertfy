/**
 * `onConflict` nunca pode apontar para um índice único PARCIAL.
 *
 * O Postgres só infere um índice parcial quando a statement REPETE o
 * predicado dele, e o `on_conflict=` do PostgREST manda apenas a lista de
 * colunas. O resultado é sempre o mesmo:
 *
 *   ERROR: 42P10: there is no unique or exclusion constraint matching the
 *   ON CONFLICT specification
 *
 * Este repositório já pagou por isso TRÊS vezes, e nenhuma delas apareceu
 * como erro em tela:
 *
 *  - **05/08, `crm_conversion_events`**: o lote morria inteiro e o evento
 *    "Lead" era perdido junto com o qualificado (migration 20261142);
 *  - **17/09, `form_session_events`**: duas sessões reais no banco, com
 *    respostas gravadas, e ZERO eventos — o funil por pergunta da aba
 *    Resultados ficaria vazio para sempre (migration 20261164);
 *  - **`refunds`**, achado por esta varredura: o ramo retroativo do
 *    webhook de reembolso nunca criou registro (mesma migration).
 *
 * Nos três, o único rastro era um log discreto. Por isso a régua é de
 * ARQUIVO: o defeito é silencioso em produção e barato de pegar aqui.
 *
 * Como funciona: lê o estado FINAL de cada índice único das migrations
 * (a última definição vence, e `drop index` remove) e cruza com cada
 * `onConflict: "..."` do código, associando à tabela pelo `.from("...")`
 * mais próximo antes dele.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = process.cwd()
const DIR_MIGRATIONS = join(RAIZ, "supabase", "migrations")
const DIR_SRC = join(RAIZ, "src")

const normalizarColunas = (cols: string) =>
  cols
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .join(",")

interface IndiceUnico {
  tabela: string
  colunas: string
  parcial: boolean
  migration: string
}

/** O estado final dos índices únicos, na ordem em que as migrations rodam. */
function indicesUnicos(): Map<string, IndiceUnico> {
  const mapa = new Map<string, IndiceUnico>()
  const arquivos = readdirSync(DIR_MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  for (const arq of arquivos) {
    // Comentário `--` fora: uma migration que EXPLICA o problema não pode
    // ser lida como se o declarasse.
    const sql = readFileSync(join(DIR_MIGRATIONS, arq), "utf8").replace(/--[^\n]*/g, " ")

    for (const m of sql.matchAll(
      /drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    )) {
      mapa.delete(m[1].toLowerCase())
    }
    for (const m of sql.matchAll(
      /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)([^;]*);/gi,
    )) {
      mapa.set(m[1].toLowerCase(), {
        tabela: m[2].toLowerCase(),
        colunas: normalizarColunas(m[3]),
        parcial: /\bwhere\b/i.test(m[4] ?? ""),
        migration: arq,
      })
    }
  }
  return mapa
}

function arquivosTs(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...arquivosTs(p))
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

interface UsoDeOnConflict {
  arquivo: string
  tabela: string | null
  colunas: string
}

function usosDeOnConflict(): UsoDeOnConflict[] {
  const usos: UsoDeOnConflict[] = []
  for (const arq of arquivosTs(DIR_SRC)) {
    const src = readFileSync(arq, "utf8")
    for (const m of src.matchAll(/onConflict:\s*"([^"]+)"/g)) {
      const antes = src.slice(Math.max(0, (m.index ?? 0) - 1200), m.index)
      const froms = [...antes.matchAll(/\.from\(\s*"([a-z0-9_]+)"/g)]
      usos.push({
        arquivo: arq.replace(`${RAIZ}/`, ""),
        tabela: froms.length ? froms[froms.length - 1][1] : null,
        colunas: normalizarColunas(m[1]),
      })
    }
  }
  return usos
}

describe("onConflict × índice único parcial", () => {
  const parciais = [...indicesUnicos().values()].filter((i) => i.parcial)

  it("a varredura enxerga as migrations e o código", () => {
    // Sem isto, um regex que parou de casar faria o teste passar VAZIO —
    // que é o mesmo silêncio que ele existe para quebrar.
    expect(indicesUnicos().size).toBeGreaterThan(20)
    expect(usosDeOnConflict().length).toBeGreaterThan(5)
  })

  it("nenhum `onConflict` aponta para índice parcial", () => {
    const quebrados = usosDeOnConflict()
      .map((u) => {
        const alvo = parciais.find((i) => i.tabela === u.tabela && i.colunas === u.colunas)
        return alvo ? { ...u, migration: alvo.migration } : null
      })
      .filter(Boolean)

    expect(
      quebrados,
      `42P10 garantido — o índice único de ${quebrados
        .map((q) => `${q!.tabela}(${q!.colunas}) [${q!.migration}]`)
        .join(", ")} é parcial e o PostgREST manda só as colunas`,
    ).toEqual([])
  })
})
