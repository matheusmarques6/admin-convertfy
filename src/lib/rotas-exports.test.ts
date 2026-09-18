/**
 * Um `route.ts` do Next só pode exportar handlers e campos de configuração.
 *
 * 18/09: o build da Vercel caiu com `"BUCKET_DA_MIDIA" is not a valid Route
 * export field` — uma constante de bucket exportada de dentro de uma rota, sem
 * um único importador. A régua está no arquivo que o próprio Next gera em
 * `.next/types/app/**​/route.ts`, que monta um
 * `checkFields<Diff<{GET?, POST?, …, dynamic?, maxDuration?}, typeof entry>>`:
 * TODO export de valor fora dessa lista vira erro de tipo.
 *
 * **Por que isto é um teste e não o typecheck.** `tsc --noEmit` passa limpo
 * neste repo com o build quebrado: a régua não está no nosso `tsconfig`, ela
 * vive nos arquivos que só existem durante o `next build`. Sem este teste, a
 * única forma de descobrir é esperar o deploy falhar — e o `tsc` para no
 * PRIMEIRO erro, então um segundo arquivo com o mesmo defeito só apareceria
 * no build seguinte, que foi exatamente o caso de `conteudo/templates`.
 *
 * `export interface` e `export type` ficam FORA da conta: tipos são apagados
 * na emissão e não aparecem em `typeof import(...)`, então o Next não os vê.
 * É por isso que meia dúzia de rotas com `export interface` passam hoje.
 *
 * `page.tsx`/`layout.tsx` também são validados pelo Next, com outra lista
 * (`metadata`, `viewport`, `generateMetadata`…). Ficam de fora daqui: a
 * varredura de 18/09 mostrou que estão limpos, e cobrir os dois na mesma
 * régua só aumentaria a chance de falso positivo.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = process.cwd()
const DIR_APP = join(RAIZ, "src", "app")

/** Copiado do arquivo que o Next gera; não é uma lista inventada. */
const CAMPOS_VALIDOS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "config",
  "generateStaticParams",
  "revalidate",
  "dynamic",
  "dynamicParams",
  "fetchCache",
  "preferredRegion",
  "runtime",
  "maxDuration",
])

/**
 * Os exports de VALOR de um módulo — os únicos que o Next enxerga.
 *
 * Linha de comentário é pulada com um rastreador simples de bloco: um
 * `export` citado dentro de um cabeçalho JSDoc (como o desta função) não é
 * um export, e acusá-lo mandaria consertar o que não existe.
 */
export function exportsDeValor(fonte: string): string[] {
  const nomes: string[] = []
  let emBloco = false
  for (const linha of fonte.split("\n")) {
    const t = linha.trim()
    if (emBloco) {
      if (t.includes("*/")) emBloco = false
      continue
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) emBloco = true
      continue
    }
    if (t.startsWith("//") || t.startsWith("*")) continue
    if (!linha.startsWith("export")) continue

    // `export type X` / `export interface X` — apagados na emissão.
    if (/^export\s+(type|interface)\s/.test(linha)) continue

    const decl = linha.match(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/)
    if (decl) {
      nomes.push(decl[1])
      continue
    }
    if (/^export\s+default\b/.test(linha)) {
      nomes.push("default")
      continue
    }
    // `export * from "..."` reexporta valores que ninguém lê aqui.
    if (/^export\s+\*/.test(linha)) {
      nomes.push("*")
      continue
    }
    const chaves = linha.match(/^export\s*\{([^}]*)\}/)
    if (chaves) {
      for (const parte of chaves[1].split(",")) {
        const p = parte.trim()
        if (!p || p.startsWith("type ")) continue
        // `GET as getX` exporta `getX`; o nome que vale é o da direita.
        const alvo = p.split(/\s+as\s+/).pop()!.trim()
        if (alvo) nomes.push(alvo)
      }
    }
  }
  return nomes
}

function rotas(dir: string, achadas: string[] = []): string[] {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, d.name)
    if (d.isDirectory()) rotas(caminho, achadas)
    else if (d.name === "route.ts" || d.name === "route.tsx") achadas.push(caminho)
  }
  return achadas
}

describe("exports de route.ts", () => {
  it("o extrator acha o que tem de achar (e ignora o que não é export)", () => {
    // Sem este caso, um recorte quebrado passaria em TODOS os arquivos por
    // não encontrar nada — a régua diria "tudo certo" sem ter medido.
    const fonte = [
      "/**",
      " * Um cabeçalho que cita `export const ARMADILHA` em prosa.",
      " */",
      '// export const COMENTADA = 1',
      'export const dynamic = "force-dynamic"',
      'export const BUCKET = "x"',
      "export interface Row { id: string }",
      "export type Status = 'a' | 'b'",
      "export function ajuda() {}",
      "export async function GET() {}",
      'export { COLS, type Row as R, GET as getX } from "./outro"',
      "const naoExportada = 1",
    ].join("\n")
    expect(exportsDeValor(fonte)).toEqual(["dynamic", "BUCKET", "ajuda", "GET", "COLS", "getX"])
  })

  it("a varredura encontra as rotas do projeto", () => {
    expect(rotas(DIR_APP).length).toBeGreaterThan(100)
  })

  it("nenhuma rota exporta valor fora dos campos que o Next aceita", () => {
    const ilegais: string[] = []
    for (const arquivo of rotas(DIR_APP)) {
      const extras = exportsDeValor(readFileSync(arquivo, "utf8")).filter((n) => !CAMPOS_VALIDOS.has(n))
      if (extras.length > 0) ilegais.push(`${relative(RAIZ, arquivo)} → ${extras.join(", ")}`)
    }
    expect(
      ilegais,
      `rota só pode exportar handlers e config; mova o resto para src/lib:\n${ilegais.join("\n")}`,
    ).toEqual([])
  })
})
