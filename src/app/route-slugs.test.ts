/**
 * Guarda contra o conflito de slugs do App Router.
 *
 * O Next exige que segmentos dinâmicos na MESMA posição da árvore tenham o
 * MESMO nome: `api/admin/emails/[id]` ao lado de `api/admin/emails/[emailId]`
 * derruba a árvore de rotas INTEIRA em runtime ("You cannot use different slug
 * names for the same dynamic path"), não só a rota nova. Foi o que tirou toda
 * a API do ar em 14/09 — typecheck, eslint e vitest não olham a árvore de
 * pastas, então passou verde localmente e só apareceu no deploy.
 *
 * Este teste percorre `src/app` e reprova quando um diretório tem dois filhos
 * dinâmicos com nomes diferentes. Catch-all (`[...x]`, `[[...x]]`) entram na
 * comparação: a regra do Next vale para eles também.
 */

import { describe, expect, it } from "vitest"
import { readdirSync } from "node:fs"
import { join } from "node:path"

const APP_DIR = join(__dirname)

export function conflitosDeSlug(raiz: string): string[] {
  const conflitos: string[] = []

  function visitar(dir: string) {
    const filhos = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
    const dinamicos = filhos.filter((d) => d.name.startsWith("[") && d.name.endsWith("]"))
    if (dinamicos.length > 1) {
      const nomes = [...new Set(dinamicos.map((d) => d.name))]
      if (nomes.length > 1) {
        conflitos.push(`${dir}: ${nomes.join(" × ")}`)
      }
    }
    for (const f of filhos) visitar(join(dir, f.name))
  }

  visitar(raiz)
  return conflitos
}

describe("árvore de rotas do App Router", () => {
  it("não tem dois segmentos dinâmicos com nomes diferentes no mesmo diretório", () => {
    const conflitos = conflitosDeSlug(APP_DIR)
    expect(
      conflitos,
      `Segmentos dinâmicos irmãos com nomes diferentes — o Next recusa a árvore inteira:\n${conflitos.join("\n")}`,
    ).toEqual([])
  })
})
