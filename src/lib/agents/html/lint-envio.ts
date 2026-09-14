/**
 * Lint de renderização do HTML final — módulo PURO (Trilha B2, set/2026).
 *
 * Roda depois do pós-processador (`pos-processador.ts`) e ANTES do QA por
 * modelo, sobre o documento já sem marcadores `cfy:block`. Cada regra
 * devolve um `Achado` com id, severidade, evidência e se o pós-processador
 * consegue corrigi-la sozinho. Quem decide o que fazer com `bloqueia` é o
 * runner, pelo `lint_mode` (`off | shadow | enforce`).
 *
 * Por que existe: o batch 6249aef2 (Hero Boxers · Welcome 1, 11/09) saiu
 * com `var(--bg)` em três lugares (o Gmail ignora e o fundo vira branco),
 * SEIS `<style>`, 91 comentários de desenvolvimento, seis `<img src="">`
 * (o Outlook mostra o ícone de imagem quebrada) e © 2025 — nada disso era
 * visto por nenhum agente, porque cada um lia a própria fatia. O lint lê a
 * peça inteira do jeito que o cliente de e-mail vai ler.
 *
 * Severidade é o custo do erro no destino:
 * - `bloqueia` — o cliente de e-mail renderiza ERRADO ou o leitor vê
 *   texto de exemplo (var(--x), img sem src, âncora sem destino, texto de
 *   example, placeholder, contraste ilegível do botão, largura ≠ 600).
 * - `aviso` — degrada sem quebrar, e quase sempre o pós-processador já
 *   corrigiu (vários <style>, comentário dev, MSO divergente, line-height,
 *   alt, ano, tabela desbalanceada, fonte fora da whitelist).
 *
 * Reusa as réguas que já existem em vez de reinventar: `enderecoUtil` e os
 * placeholders de `content-checks`, `pareceExemplo` de `anchor-match`,
 * `extrairCtas` de `color-faixas` (o contraste do botão), `EMAIL_WIDTH` de
 * `email-width` e `findWhitelistFont`.
 */

import { EMAIL_WIDTH } from "@/lib/email-workspace/email-width"
import { findWhitelistFont } from "../refiner/font-whitelist"
import { orphanTextFragments, pareceExemplo } from "./anchor-match"
import { PLACEHOLDER_RE, TOKEN_OK_RE, enderecoUtil } from "./content-checks"
import { extrairCtas, extrairFaixas } from "./color-faixas"
import { AA_NORMAL } from "./color-contrast"

export type LintId =
  | "css_var_em_uso"
  | "style_blocks_multiplos"
  | "comentario_dev"
  | "mso_diverge_do_anchor"
  | "img_sem_src"
  | "anchor_sem_href"
  | "texto_de_example"
  | "placeholder_colchete"
  | "contraste_botao_container"
  | "line_height_menor_que_fonte"
  | "alt_ausente_ou_generico"
  | "ano_copyright_desatualizado"
  | "largura_container"
  | "tabela_desbalanceada"
  | "fonte_fora_da_whitelist"

export type LintSeveridade = "bloqueia" | "aviso"

export interface Achado {
  id: LintId
  severidade: LintSeveridade
  /** O que foi visto, em uma linha (cabe em telemetria e em tela). */
  evidencia: string
  /** O pós-processador corrige sozinho. */
  auto_fix: boolean
  /** Quantas ocorrências. */
  n: number
}

export interface LintContexto {
  /** Ano corrente (default: o do relógio). Parametrizado para o teste. */
  ano?: number
  /** Famílias da identidade da loja — contam como permitidas. */
  fontesDaLoja?: string[]
}

export interface LintResultado {
  itens: Achado[]
  bloqueia: boolean
  /** Ids bloqueantes, na ordem — o primeiro vira o `failure_reason`. */
  bloqueantes: LintId[]
}

/** A régua de severidade e de auto-fix, id a id — fonte única. */
export const REGRAS: Record<LintId, { severidade: LintSeveridade; auto_fix: boolean }> = {
  css_var_em_uso: { severidade: "bloqueia", auto_fix: true },
  style_blocks_multiplos: { severidade: "aviso", auto_fix: true },
  comentario_dev: { severidade: "aviso", auto_fix: true },
  mso_diverge_do_anchor: { severidade: "aviso", auto_fix: true },
  img_sem_src: { severidade: "bloqueia", auto_fix: true },
  anchor_sem_href: { severidade: "bloqueia", auto_fix: false },
  texto_de_example: { severidade: "bloqueia", auto_fix: false },
  placeholder_colchete: { severidade: "bloqueia", auto_fix: false },
  contraste_botao_container: { severidade: "bloqueia", auto_fix: false },
  line_height_menor_que_fonte: { severidade: "aviso", auto_fix: true },
  alt_ausente_ou_generico: { severidade: "aviso", auto_fix: true },
  ano_copyright_desatualizado: { severidade: "aviso", auto_fix: true },
  largura_container: { severidade: "bloqueia", auto_fix: false },
  tabela_desbalanceada: { severidade: "aviso", auto_fix: false },
  fonte_fora_da_whitelist: { severidade: "aviso", auto_fix: false },
}

// ── Utilidades compartilhadas com o pós-processador ────────────────────

/** Comentário condicional do Outlook (`<!--[if mso]>`, `<![endif]-->`, `<!--<![endif]-->`). */
export function ehComentarioCondicional(comentario: string): boolean {
  const c = comentario.trim()
  return /^<!--\s*\[if\b/i.test(c) || /^<!--\s*<!\[endif\]/i.test(c) || /^<!\[endif\]/i.test(c)
}

/** Marcador interno do pipeline (`<!-- cfy:... -->`) — sai no persistStage, mas o lint não o pune. */
export function ehMarcadorInterno(comentario: string): boolean {
  return /^<!--\s*cfy:/i.test(comentario.trim())
}

export const COMENTARIO_RE = /<!--[\s\S]*?-->/g

/** Todos os `<style>` do documento, com o range e o corpo. */
export function blocosDeStyle(html: string): Array<{ start: number; end: number; corpo: string; abertura: string }> {
  const out: Array<{ start: number; end: number; corpo: string; abertura: string }> = []
  const re = /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi
  for (const m of html.matchAll(re)) {
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, corpo: m[2], abertura: m[1] })
  }
  return out
}

/** Pares `v:roundrect` ⇄ `<a>` seguinte: o texto do `<center>` e o do link. */
export interface ParMso {
  /** Range do texto DENTRO do `<center>` (para reescrever). */
  centerRange: { start: number; end: number }
  centerTexto: string
  /** Texto visível do `<a>` que vem logo depois do bloco MSO; null = só Outlook. */
  anchorTexto: string | null
}

export function paresMsoAnchor(html: string): ParMso[] {
  const out: ParMso[] = []
  const re = /<!--\s*\[if\s+mso\]>([\s\S]*?)<!\[endif\]\s*-->/gi
  for (const m of html.matchAll(re)) {
    const bloco = m[1]
    if (!/v:roundrect/i.test(bloco)) continue
    const c = /<center\b[^>]*>([\s\S]*?)<\/center>/i.exec(bloco)
    if (!c) continue
    const blocoStart = (m.index ?? 0) + m[0].indexOf(bloco)
    const centerInner = blocoStart + (c.index ?? 0) + c[0].indexOf(c[1])
    const centerTexto = textoVisivel(c[1])
    // O `<a>` que o MSO espelha vem logo depois (ramo `<!--[if !mso]><!-->`
    // ou direto), e ANTES do próximo bloco MSO — o botão seguinte não é
    // este. `<a>` vazio conta como ausente: no batch 6249aef2 o ramo
    // não-Outlook tinha `<a></a>` sem texto e o primeiro link com texto era
    // o card de produto logo abaixo; sincronizar por ele escreveria
    // "BAMBOO BOXERS" num botão de gift card.
    // A janela fecha no fim do ramo não-Outlook (`<![endif]`), no fim da
    // linha (`</tr>`) ou no próximo bloco MSO — o que vier primeiro.
    const fimBloco = (m.index ?? 0) + m[0].length
    const resto = html.slice(fimBloco, fimBloco + 2500)
    const cortes = [/<!\[endif\]/i, /<\/tr\s*>/i, /<!--\s*\[if\s+mso\]>/i]
      .map((re) => resto.search(re))
      .filter((i) => i >= 0)
    const janela = cortes.length > 0 ? resto.slice(0, Math.min(...cortes)) : resto
    const a = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(janela)
    const anchorTexto = a ? textoVisivel(a[1]) : ""
    out.push({
      centerRange: { start: centerInner, end: centerInner + c[1].length },
      centerTexto,
      anchorTexto: anchorTexto || null,
    })
  }
  return out
}

export function textoVisivel(fragmento: string): string {
  return fragmento
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

const WEB_SAFE = new Set([
  "arial", "helvetica", "helvetica neue", "georgia", "verdana", "tahoma", "trebuchet ms", "times new roman", "times",
  "courier new", "courier", "segoe ui", "roboto", "system-ui", "-apple-system", "blinkmacsystemfont", "sans-serif", "serif",
  "monospace", "cursive",
])

const ALT_GENERICO_RE = /^(?:image|imagem|img|photo|foto|picture|banner|icon|ícone|icone|logo|hero|product|produto|placeholder)?\s*\d*$/i

// ── As regras ───────────────────────────────────────────────────────────

export function lintEnvio(html: string, ctx: LintContexto = {}): LintResultado {
  const itens: Achado[] = []
  const push = (id: LintId, n: number, evidencia: string) => {
    if (n <= 0) return
    itens.push({ id, ...REGRAS[id], evidencia, n })
  }
  if (!html || !html.trim()) return { itens, bloqueia: false, bloqueantes: [] }

  // css_var_em_uso — em style inline ou em <style>, tanto faz: Gmail ignora.
  const vars = Array.from(html.matchAll(/var\(\s*(--[a-z0-9_-]+)/gi)).map((m) => m[1])
  push("css_var_em_uso", vars.length, `var() em uso: ${Array.from(new Set(vars)).join(", ")}`)

  // style_blocks_multiplos
  const styles = blocosDeStyle(html)
  push("style_blocks_multiplos", styles.length > 1 ? styles.length : 0, `${styles.length} blocos <style>`)

  // comentario_dev
  const comentarios = Array.from(html.matchAll(COMENTARIO_RE)).map((m) => m[0])
  const dev = comentarios.filter((c) => !ehComentarioCondicional(c) && !ehMarcadorInterno(c))
  push("comentario_dev", dev.length, `${dev.length} comentário(s) de desenvolvimento (ex.: ${dev[0]?.slice(4, 44).trim() ?? ""})`)

  // mso_diverge_do_anchor
  const pares = paresMsoAnchor(html)
  const divergentes = pares.filter((p) => p.anchorTexto != null && norm(p.anchorTexto) !== norm(p.centerTexto))
  const soOutlook = pares.filter((p) => p.anchorTexto == null)
  push(
    "mso_diverge_do_anchor",
    divergentes.length + soOutlook.length,
    [
      ...divergentes.map((p) => `Outlook "${p.centerTexto}" ≠ "${p.anchorTexto}"`),
      ...soOutlook.map((p) => `botão "${p.centerTexto}" existe SÓ no ramo do Outlook`),
    ].join(" · "),
  )

  // img_sem_src
  const imgs = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0])
  const semSrc = imgs.filter((t) => !/\bsrc\s*=\s*["'][^"']+["']/i.test(t))
  push("img_sem_src", semSrc.length, `${semSrc.length} <img> sem src (ex.: ${semSrc[0]?.slice(0, 60) ?? ""})`)

  // anchor_sem_href
  const anchors = Array.from(html.matchAll(/<a\b[^>]*>/gi)).map((m) => m[0])
  const semHref = anchors.filter((t) => {
    const h = /\bhref\s*=\s*["']([^"']*)["']/i.exec(t)
    return !h || !enderecoUtil(h[1])
  })
  push(
    "anchor_sem_href",
    semHref.length,
    `${semHref.length} <a> sem destino útil: ${Array.from(new Set(semHref.map((t) => /\bhref\s*=\s*["']([^"']*)["']/i.exec(t)?.[1] ?? "(sem href)"))).slice(0, 5).join(", ")}`,
  )

  // texto_de_example + placeholder_colchete — sobre o texto VISÍVEL.
  const textos = orphanTextFragments(html, []).map((f) => f.texto)
  const exemplos = textos.filter((t) => pareceExemplo(t))
  push("texto_de_example", exemplos.length, `texto de exemplo visível: ${exemplos.slice(0, 3).map((t) => `"${t.slice(0, 40)}"`).join(", ")}`)
  const placeholders: string[] = []
  for (const t of textos) {
    for (const m of t.matchAll(PLACEHOLDER_RE)) if (!TOKEN_OK_RE.test(m[0])) placeholders.push(m[0])
  }
  push("placeholder_colchete", placeholders.length, `placeholder visível: ${Array.from(new Set(placeholders)).slice(0, 5).join(", ")}`)

  // contraste_botao_container — label × fundo do botão preenchido.
  const faixas = safe(() => extrairFaixas(html), [])
  const ctas = safe(() => extrairCtas(html, faixas), [])
  const ilegiveis = ctas.filter((c) => c.tipo === "preenchido" && c.contraste != null && c.contraste < AA_NORMAL)
  push(
    "contraste_botao_container",
    ilegiveis.length,
    ilegiveis.map((c) => `"${c.texto}" ${c.label} sobre ${c.fundo} = ${c.contraste}:1`).join(" · "),
  )

  // line_height_menor_que_fonte — na mesma declaração de estilo.
  let lh = 0
  const lhEx: string[] = []
  for (const m of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) {
    const fs = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i.exec(m[1])
    const l = /line-height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(m[1])
    if (fs && l && Number(l[1]) < Number(fs[1])) {
      lh++
      if (lhEx.length < 3) lhEx.push(`${fs[1]}px/${l[1]}px`)
    }
  }
  push("line_height_menor_que_fonte", lh, `line-height menor que a fonte: ${lhEx.join(", ")}`)

  // alt_ausente_ou_generico — só imagem real (com src e maior que 1px).
  const altRuim = imgs.filter((t) => {
    if (!/\bsrc\s*=\s*["'][^"']+["']/i.test(t)) return false
    const w = /\bwidth\s*=\s*["']?(\d+)/i.exec(t)
    if (w && Number(w[1]) <= 1) return false
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(t)
    return !alt || ALT_GENERICO_RE.test(alt[1].trim())
  })
  push("alt_ausente_ou_generico", altRuim.length, `${altRuim.length} imagem(ns) sem alt descritivo`)

  // ano_copyright_desatualizado
  const ano = ctx.ano ?? new Date().getFullYear()
  const anos = Array.from(html.matchAll(/(?:©|&copy;|&#169;)\s*(?:[A-Za-z ,.]{0,30}?)(20\d\d)/g)).map((m) => Number(m[1]))
  const desatualizados = anos.filter((a) => a !== ano)
  push("ano_copyright_desatualizado", desatualizados.length, `© ${desatualizados.join(", ")} (ano corrente ${ano})`)

  // largura_container — no DOCUMENTO final o wrapper de 100% é a calha e o
  // container é a tabela de 600. `auditEmailWidth` julga BLOCOS de
  // biblioteca (reprova calha em 100%), então aqui a régua é: existe um
  // container numérico e todo container "perto de 600" (560–640, a
  // assinatura de quem errou o número) é exatamente 600.
  {
    const larguras = Array.from(html.matchAll(/<table\b[^>]*\bwidth\s*=\s*["']?(\d+)(?![\d%])/gi)).map((m) => Number(m[1]))
    const perto = larguras.filter((w) => w >= 560 && w <= 640)
    const erradas = Array.from(new Set(perto.filter((w) => w !== EMAIL_WIDTH)))
    if (larguras.length > 0 && perto.length === 0) {
      push("largura_container", 1, `nenhuma tabela declara o container de ${EMAIL_WIDTH}px (larguras vistas: ${Array.from(new Set(larguras)).slice(0, 6).join(", ")})`)
    } else if (erradas.length > 0) {
      push("largura_container", erradas.length, `container em ${erradas.join(", ")}px em vez de ${EMAIL_WIDTH}`)
    }
  }

  // tabela_desbalanceada
  const contar = (re: RegExp) => (html.match(re) ?? []).length
  const desb: string[] = []
  for (const [tag, abre, fecha] of [
    ["table", /<table\b/gi, /<\/table\s*>/gi],
    ["tr", /<tr\b/gi, /<\/tr\s*>/gi],
    ["td", /<td\b/gi, /<\/td\s*>/gi],
  ] as const) {
    const a = contar(abre)
    const f = contar(fecha)
    if (a !== f) desb.push(`<${tag}> ${a} abre × ${f} fecha`)
  }
  push("tabela_desbalanceada", desb.length, desb.join(" · "))

  // fonte_fora_da_whitelist — a PRIMEIRA família de cada declaração.
  const daLoja = new Set((ctx.fontesDaLoja ?? []).map((f) => norm(f.replace(/["']/g, ""))))
  const fora = new Set<string>()
  for (const m of html.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) {
    const primeira = m[1].split(",")[0].replace(/["']/g, "").trim()
    if (!primeira) continue
    const k = norm(primeira)
    if (WEB_SAFE.has(k) || daLoja.has(k) || findWhitelistFont(primeira)) continue
    fora.add(primeira)
  }
  push("fonte_fora_da_whitelist", fora.size, `família fora da whitelist: ${Array.from(fora).join(", ")}`)

  const bloqueantes = itens.filter((i) => i.severidade === "bloqueia").map((i) => i.id)
  return { itens, bloqueia: bloqueantes.length > 0, bloqueantes }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** Resumo de uma linha para log e `error_message`. */
export function resumoDoLint(r: LintResultado): string {
  if (r.itens.length === 0) return "limpo"
  return r.itens.map((i) => `${i.id}×${i.n}${i.severidade === "bloqueia" ? "!" : ""}`).join(", ")
}
