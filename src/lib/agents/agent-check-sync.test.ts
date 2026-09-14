/**
 * Todo agente do mapa (`AGENT_VISUAL`) precisa estar no CHECK de
 * `email_generation_runs.agent` da migration mais recente que o redefine.
 *
 * Sem isto a run toma 23514, o `logGenerationRun` engole o erro e o nó some
 * da telemetria — foi assim com copy_fit (4 dias sem run), typography e o
 * Seletor. A lição da 20261147: agente novo entra no CHECK no MESMO commit.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { AGENT_VISUAL } from "./agent-visual"

const MIGRATIONS = join(process.cwd(), "supabase", "migrations")

function checkMaisRecente(): { arquivo: string; agentes: Set<string> } {
  const arquivos = readdirSync(MIGRATIONS)
    .filter((f) => /^\d{8}_.*\.sql$/.test(f))
    .sort()
  for (let i = arquivos.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, arquivos[i]), "utf8")
    const m = sql.match(/email_generation_runs_agent_check\s*\n?\s*CHECK \(agent IN \(([\s\S]*?)\)\)/)
    if (!m) continue
    const agentes = new Set(Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map((x) => x[1]))
    return { arquivo: arquivos[i], agentes }
  }
  throw new Error("nenhuma migration define email_generation_runs_agent_check")
}

describe("CHECK de agente × mapa de agentes", () => {
  it("todo agente do AGENT_VISUAL (menos o qavision, que é a run de qa com visão) está no CHECK", () => {
    const { arquivo, agentes } = checkMaisRecente()
    const fora = Object.keys(AGENT_VISUAL).filter((k) => k !== "qavision" && !agentes.has(k))
    expect(fora, `agentes fora do CHECK em ${arquivo}: ${fora.join(", ")}`).toEqual([])
  })
})
