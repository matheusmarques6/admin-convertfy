/**
 * Chave de comparação de texto do módulo de objeções: minúsculas, sem
 * acento, sem pontuação, espaços colapsados. É a régua do dedupe de
 * proibições (09/09): o Seletor devolvia a MESMA regra em dois idiomas e
 * com pontuação diferente, e o `Set` por igualdade exata deixava passar —
 * 17 proibições no Welcome 1 da Hero Boxers, várias em dobro.
 */
export function chaveDeTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Dedupe preservando a PRIMEIRA forma de cada chave. */
export function dedupePorChave(itens: readonly string[]): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const it of itens) {
    const t = it.trim()
    if (!t) continue
    const k = chaveDeTexto(t)
    if (!k || vistos.has(k)) continue
    vistos.add(k)
    out.push(t)
  }
  return out
}
