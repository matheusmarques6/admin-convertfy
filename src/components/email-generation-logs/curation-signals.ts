/**
 * Sinais de curadoria de um run (story CM-7) — lógica pura.
 *
 * Nada aqui é falha: o email foi entregue. São sinais de que a BIBLIOTECA
 * precisa de atenção — seção sem variante, componente impreenchível, exemplo
 * de acabamento velho, ranking sendo corrigido pelo Montador.
 *
 * Separado do componente porque o vitest do projeto não transforma JSX: a
 * regra que decide os selos é o que precisa de teste, o `.tsx` é casca.
 *
 * Leitura defensiva por design: run gravado antes destas stories não tem os
 * campos, e o objeto pode vir malformado do banco. Campo ausente → selo não
 * renderiza, sem erro no console.
 */

/** O que a API projeta por run. Todos opcionais — runs antigos não têm. */
export interface CurationSignals {
  skipped_blocks?: number | null
  excluded_untagged?: number | null
  rank_deviations?: number | null
  rendered_stale?: boolean | null
}

export type Tone = "warn" | "info"

export interface Signal {
  key: string
  label: string
  tone: Tone
  title: string
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0

/**
 * Traduz os sinais em selos. Âmbar = pressão de curadoria (alguém precisa
 * mexer na biblioteca); azul = informação (o pipeline se ajustou sozinho).
 *
 * Pura e exportada: o filtro da listagem usa a mesma regra, então "tem selo
 * âmbar" nunca diverge entre a linha e o filtro.
 */
export function curationSignals(
  curation: CurationSignals | null | undefined,
): Signal[] {
  if (!curation || typeof curation !== "object") return []
  const out: Signal[] = []

  const skipped = num(curation.skipped_blocks)
  if (skipped > 0) {
    out.push({
      key: "skipped",
      label: `${skipped} ${skipped === 1 ? "seção pulada" : "seções puladas"}`,
      tone: "warn",
      title:
        "Posições que saíram do email por não ter variante adequada na biblioteca. O email foi entregue com menos seções.",
    })
  }

  const untagged = num(curation.excluded_untagged)
  if (untagged > 0) {
    out.push({
      key: "untagged",
      label: `${untagged} fora do pool`,
      tone: "warn",
      title:
        "Variantes ativas sem {{PLACEHOLDER}} no HTML: o pipeline não consegue preenchê-las, então ficam fora da escolha até serem tagueadas.",
    })
  }

  if (curation.rendered_stale === true) {
    out.push({
      key: "stale",
      label: "Renderizado desatualizado",
      tone: "info",
      title:
        "O exemplo renderizado da variante não corresponde mais ao HTML dela. O agente seguiu o HTML.",
    })
  }

  const deviations = num(curation.rank_deviations)
  if (deviations > 0) {
    out.push({
      key: "deviations",
      label: `${deviations} ${deviations === 1 ? "desvio" : "desvios"} do ranking`,
      tone: "info",
      title:
        "Posições em que o Montador não ficou com a 1ª indicação do Curador, por coerência do conjunto, viabilidade de dados ou histórico.",
    })
  }

  return out
}

/** true quando há pressão de curadoria (algum selo âmbar). */
export function hasCurationPressure(
  curation: CurationSignals | null | undefined,
): boolean {
  return curationSignals(curation).some((s) => s.tone === "warn")
}

