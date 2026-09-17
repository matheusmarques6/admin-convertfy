/**
 * Toda rota em `src/app/api/cron/*` precisa de uma entrada em `vercel.json`.
 *
 * O radar editorial custou meses assim: `/api/conteudo/trends` existia,
 * `conteudo_trends` tinha ZERO linhas em produção e nada apontava o defeito —
 * a rota respondia 200 quando alguém a chamava, e ninguém chamava. Cron que
 * nunca dispara não falha: ele simplesmente não acontece, e o sintoma aparece
 * como "a tela está vazia".
 *
 * A checagem vale nos dois sentidos, porque o caminho oposto (agendar um
 * caminho que não existe) devolve 404 dentro da plataforma, onde ninguém lê.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = process.cwd()
const DIR_CRON = join(RAIZ, "src", "app", "api", "cron")

interface CronDaVercel {
  path: string
  schedule: string
}

const config = JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8")) as { crons?: CronDaVercel[] }

/** O caminho sem a querystring — `sync-omnisend` agenda com `?periods=…`. */
const semQuery = (p: string) => p.split("?")[0]

const agendados = (config.crons ?? []).map((c) => semQuery(c.path))
const rotas = readdirSync(DIR_CRON, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `/api/cron/${d.name}`)

describe("crons agendados", () => {
  it("toda rota de cron tem horário em vercel.json", () => {
    const orfas = rotas.filter((r) => !agendados.includes(r))
    expect(orfas, `rotas de cron sem agenda: ${orfas.join(", ")}`).toEqual([])
  })

  it("todo horário de /api/cron aponta para uma rota que existe", () => {
    // Fora de /api/cron a agenda pode apontar para qualquer rota (ex.:
    // /api/reports/cleanup), e essas não são varridas por este diretório.
    const fantasmas = agendados.filter((p) => p.startsWith("/api/cron/") && !rotas.includes(p))
    expect(fantasmas, `agendados sem rota: ${fantasmas.join(", ")}`).toEqual([])
  })

  it("nenhuma entrada é agendada duas vezes", () => {
    // Pelo caminho COMPLETO, com querystring: `sync-omnisend` é agendada duas
    // vezes de propósito — de meia em meia hora nos períodos padrão e às 04h
    // com `?periods=1d,7d,30d,90d`. São rodadas diferentes, não duplicata.
    const vistos = new Set<string>()
    const repetidos = (config.crons ?? []).map((c) => c.path).filter((p) => (vistos.has(p) ? true : (vistos.add(p), false)))
    expect(repetidos, `agendados em duplicata: ${repetidos.join(", ")}`).toEqual([])
  })
})
