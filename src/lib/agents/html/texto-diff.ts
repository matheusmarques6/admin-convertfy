/**
 * texto-diff — o que mudou no TEXTO VISÍVEL entre dois fragmentos.
 *
 * Os guards da hero (`heroCopyPreserved`, `heroTextoInventado`) medem a
 * copy do merge contra o fragmento do agente e respondem sim/não. O que
 * faltava era o RASTRO: a run dizia "perdeu" ou "inventou" sem mostrar a
 * linha, e o operador abria o HTML para achar. Aqui o diff é por linha de
 * texto visível, normalizado (caixa, acento, espaço), e é o que vai à
 * telemetria e à evidência da issue.
 *
 * Puro (zero I/O) — testável.
 */

import { normalizeForMatch } from "./anchor-match"

export interface DiffDeTexto {
  removidas: string[]
  inseridas: string[]
  /** Linhas iguais nos dois lados. */
  mantidas: number
}

const TEXTO_MIN = 2

/** Linhas de texto visível de um fragmento (sem style/script/comentário). */
export function linhasVisiveis(html: string): string[] {
  const semBlocos = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
  return semBlocos
    .split(/<[^>]+>/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= TEXTO_MIN)
}

export function diffTextoVisivel(antes: string, depois: string): DiffDeTexto {
  const a = linhasVisiveis(antes)
  const d = linhasVisiveis(depois)
  const chave = (t: string) => normalizeForMatch(t).replace(/\s+/g, " ").trim().toLowerCase()
  const contar = (ls: string[]) => {
    const m = new Map<string, { n: number; texto: string }>()
    for (const t of ls) {
      const k = chave(t)
      if (!k) continue
      const cur = m.get(k)
      if (cur) cur.n++
      else m.set(k, { n: 1, texto: t })
    }
    return m
  }
  const ma = contar(a)
  const md = contar(d)
  const removidas: string[] = []
  const inseridas: string[] = []
  let mantidas = 0
  for (const [k, v] of ma) {
    const outro = md.get(k)?.n ?? 0
    mantidas += Math.min(v.n, outro)
    for (let i = outro; i < v.n; i++) removidas.push(v.texto)
  }
  for (const [k, v] of md) {
    const outro = ma.get(k)?.n ?? 0
    for (let i = outro; i < v.n; i++) inseridas.push(v.texto)
  }
  return { removidas, inseridas, mantidas }
}
