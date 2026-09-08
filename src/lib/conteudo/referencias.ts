/**
 * Referências no prompt — quais entram e como aparecem.
 *
 * A ConvertIA escrevia só com regra: nunca tinha visto um carrossel bom da
 * casa. Aqui a referência vira exemplo de ESTILO no pedido. Três decisões
 * que este módulo fixa, porque errá-las estraga o conteúdo em silêncio:
 *
 * 1. **Exemplo de estilo, nunca fonte de dado.** As referências carregam
 *    números reais de OUTROS posts ("41%", "R$ 31K"). O system prompt
 *    proíbe inventar dado, e servir um número alheio sem aviso é o jeito
 *    mais fácil de a IA "citar" um resultado que não é deste carrossel. O
 *    bloco declara isso em cima e embaixo.
 * 2. **Seleção por afinidade, não por ordem de cadastro.** Mesmo molde
 *    vale mais que mesmo pilar, que vale mais que o peso escolhido pelo
 *    humano; empate resolve pelo peso e depois pela métrica. Com 30
 *    referências na base, a de Turbo é a que ensina a escrever um Turbo.
 * 3. **Teto em itens E em caracteres.** Cada referência tem até 10 slides
 *    de copy mais legenda; quatro delas já são 6–8 mil caracteres. Sem
 *    teto o exemplo engole o pedido e o modelo passa a repetir a
 *    referência em vez de escrever a pauta.
 *
 * Puro: sem I/O. O serviço carrega do banco e a rota decide o contexto.
 */

import type { MoldeKey, Pilar, Referencia } from "./types"

export const REFERENCIAS_MAX_ITENS = 4
export const REFERENCIAS_MAX_CHARS = 7000
/** Corpo de slide e legenda são cortados neste tamanho ao renderizar. */
const CORPO_MAX = 220
const LEGENDA_MAX = 900

export interface ContextoSelecao {
  molde?: MoldeKey | string | null
  pilar?: Pilar | string | null
}

/** Tudo que o modelo recebe de uma referência (sem imagem). */
export type ReferenciaParaPrompt = Pick<Referencia, "nome" | "slides" | "legenda" | "palavraChave" | "pilar" | "molde" | "porQueFunciona" | "metricas" | "peso" | "ativa" | "transcricao">

function afinidade(r: ReferenciaParaPrompt, ctx: ContextoSelecao): number {
  let s = 0
  if (ctx.molde && r.molde && r.molde.toLowerCase() === String(ctx.molde).toLowerCase()) s += 100
  if (ctx.pilar && r.pilar && r.pilar.toLowerCase() === String(ctx.pilar).toLowerCase()) s += 40
  s += (r.peso ?? 1) * 10
  // Desempate por resultado real: salvamento é o sinal mais forte de "vale
  // guardar", e é o que se quer reproduzir.
  s += Math.min(9, Math.floor((r.metricas?.saved ?? 0) / 5))
  return s
}

/** Só referências ativas e já transcritas servem de exemplo. */
export function utilizavel(r: ReferenciaParaPrompt): boolean {
  return r.ativa && r.transcricao === "lida" && r.slides.some((s) => (s.titulo ?? "").trim() || (s.corpo ?? "").trim())
}

/**
 * Escolhe as referências que entram no prompt, na ordem em que entram.
 * Respeita o teto de itens e o de caracteres — o segundo pode deixar de
 * fora uma referência longa mesmo com vaga em itens.
 */
export function selecionarReferencias(
  todas: ReferenciaParaPrompt[],
  ctx: ContextoSelecao = {},
  limites: { maxItens?: number; maxChars?: number } = {},
): ReferenciaParaPrompt[] {
  const maxItens = limites.maxItens ?? REFERENCIAS_MAX_ITENS
  const maxChars = limites.maxChars ?? REFERENCIAS_MAX_CHARS
  const ordenadas = todas
    .filter(utilizavel)
    .map((r, i) => ({ r, i, a: afinidade(r, ctx) }))
    .sort((x, y) => y.a - x.a || x.i - y.i)
    .map((x) => x.r)

  const out: ReferenciaParaPrompt[] = []
  let usados = 0
  for (const r of ordenadas) {
    if (out.length >= maxItens) break
    const tam = renderizarReferencia(r, out.length + 1).length
    if (usados + tam > maxChars) continue
    out.push(r)
    usados += tam
  }
  return out
}

function cortar(s: string | null | undefined, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function metricasTexto(m: ReferenciaParaPrompt["metricas"]): string {
  if (!m) return ""
  const partes: string[] = []
  if (m.reach != null) partes.push(`alcance ${m.reach}`)
  if (m.saved != null) partes.push(`${m.saved} salvamentos`)
  if (m.shares != null) partes.push(`${m.shares} compartilhamentos`)
  if (m.follows != null && m.follows > 0) partes.push(`${m.follows} seguidores ganhos`)
  return partes.length ? ` · resultado real: ${partes.join(", ")}` : ""
}

/** Uma referência em texto compacto, numerada. */
export function renderizarReferencia(r: ReferenciaParaPrompt, n: number): string {
  const cab = [`### Referência ${n}: "${cortar(r.nome, 90)}"`, [r.molde && `molde ${r.molde}`, r.pilar && `pilar ${r.pilar}`].filter(Boolean).join(" · ") + metricasTexto(r.metricas)]
    .filter(Boolean)
    .join("\n")
  const slides = r.slides
    .filter((s) => (s.titulo ?? "").trim() || (s.corpo ?? "").trim())
    .map((s) => {
      const t = cortar(s.titulo, 120)
      const c = cortar(s.corpo, CORPO_MAX)
      return `${String(s.ordem).padStart(2, "0")} [${s.tipo ?? "slide"}] ${t}${c ? ` — ${c}` : ""}`
    })
    .join("\n")
  const legenda = r.legenda ? `Legenda: ${cortar(r.legenda, LEGENDA_MAX)}` : ""
  const kw = r.palavraChave ? `Palavra-chave do comment gate: ${r.palavraChave}` : ""
  const porque = r.porQueFunciona.length ? `Por que funciona: ${r.porQueFunciona.map((p) => cortar(p, 160)).join(" / ")}` : ""
  return [cab, slides, legenda, kw, porque].filter(Boolean).join("\n")
}

/**
 * Bloco completo para o pedido. Vazio quando não há referência utilizável
 * — o chamador não adiciona nada e o comportamento é o de antes.
 */
export function blocoDeReferencias(selecionadas: ReferenciaParaPrompt[]): string {
  if (!selecionadas.length) return ""
  const corpo = selecionadas.map((r, i) => renderizarReferencia(r, i + 1)).join("\n\n")
  return `## Referências da casa (exemplos de ESTILO — leia antes de escrever)
Estes são carrosséis que o time considera bons. Aprenda deles o ritmo, o tamanho das frases, o tipo de gancho da capa, como a prova é apresentada e como a legenda fecha no comment gate. NÃO copie frases, e os números que aparecem aqui são dos posts ORIGINAIS: não os reutilize como dado deste carrossel — dado só o que vier na pauta, senão [confirmar].

${corpo}

Fim das referências. Escreva a peça pedida abaixo no mesmo padrão de qualidade, com o conteúdo da pauta.`
}
