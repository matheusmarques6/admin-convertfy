/**
 * Checks de CONTEÚDO do HTML final — código, custo zero, sem LLM. Rodam
 * nos DOIS caminhos do QA (gate `EMAIL_QA_ENABLED` ligado ou não), como o
 * `computeRenderChecks`: com o gate desligado só persistem em `qa_issues`;
 * ligado, `high` reprova.
 *
 * Por que existem (batch 644d86c5, 08/09): o e-mail saiu com `ICON 1 ·
 * ICON 2 · ICON 3`, `Use code: [WELCOME-CODE]`, `Here's 10% OFF` numa loja
 * SEM incentivo e o mesmo parágrafo do Shopify duas vezes — e nada
 * reprovou, porque o QA está desligado e os render-checks olham forma
 * (unsubscribe, href="#"), não conteúdo.
 *
 * Quatro checks:
 *  - `oferta_sem_incentivo` (high): oferta/cupom no texto quando a decisão
 *    da loja diz que NÃO há incentivo. Só roda com a decisão conhecida.
 *  - `placeholder_colchetes` (high): `[WELCOME-CODE]`, `[First Name]` —
 *    token que ninguém vai resolver (merge tag de ESP é `{{ }}`/`*| |*`).
 *  - `texto_de_exemplo` (medium): texto visível que `pareceExemplo`
 *    reconhece como recheio de mockup da biblioteca (`ICON 1`, `Link Here`).
 *  - `paragrafo_repetido` (medium): o mesmo texto (≥ 60 chars) duas vezes.
 */

import type { QaIssue } from "@/types/email-generation"
import { normalizeForMatch, orphanTextFragments } from "./anchor-match"

export interface ContentCheckOptions {
  /**
   * Decisão de incentivo da loja (`objection_catalog.incentivo.existe`, ou
   * o alvo do Seletor). `false` liga o check de oferta; `null`/ausente
   * = desconhecido, o check não roda.
   */
  incentivoExiste?: boolean | null
}

const OFERTA_RE =
  /\b\d{1,3}\s?%\s?(?:off|de desconto|discount)\b|\buse (?:the )?code\b|\bc[oó]digo\s*:|\bcupom\b|\bcoupon\b|\bpromo code\b/i
const PLACEHOLDER_RE = /\[[A-Za-z][A-Za-z0-9 _-]{2,}\]/g
/** Merge tags e tokens que NÃO são placeholder órfão. */
const TOKEN_OK_RE = /^\[(?:unsubscribe(?:_link)?|preferences|view_in_browser|web_version)\]$/i
const REPETICAO_MIN_CHARS = 60

function textoVisivel(html: string): string[] {
  // `orphanTextFragments` sem ranges reivindicados = TODOS os textos
  // visíveis, já sem <style>/<script>/comentários, com `suspeito` marcado
  // pela MESMA régua da biblioteca (`pareceExemplo`).
  return orphanTextFragments(html, []).map((o) => o.texto)
}

export function computeContentChecks(html: string, opts: ContentCheckOptions = {}): QaIssue[] {
  const issues: QaIssue[] = []
  if (!html || !html.trim()) return issues

  const fragmentos = orphanTextFragments(html, [])

  // 1. Placeholder entre colchetes.
  const placeholders = new Set<string>()
  for (const f of fragmentos) {
    for (const m of f.texto.match(PLACEHOLDER_RE) ?? []) {
      if (!TOKEN_OK_RE.test(m)) placeholders.add(m)
    }
  }
  if (placeholders.size > 0) {
    issues.push({
      type: "placeholder_colchetes",
      severity: "high",
      message: `Placeholder entre colchetes no texto do e-mail: ${[...placeholders].slice(0, 5).join(", ")} — ninguém vai preencher isso; merge tag de ESP é {{ }}.`,
      location: "html",
    })
  }

  // 2. Oferta sem incentivo (só com a decisão conhecida).
  if (opts.incentivoExiste === false) {
    const ofertas = fragmentos.map((f) => f.texto).filter((t) => OFERTA_RE.test(t))
    if (ofertas.length > 0) {
      issues.push({
        type: "oferta_sem_incentivo",
        severity: "high",
        message: `A loja NÃO tem incentivo ativo e o e-mail promete oferta/cupom: ${[...new Set(ofertas)].slice(0, 3).map((t) => `"${t.slice(0, 60)}"`).join(", ")}.`,
        location: "html",
      })
    }
  }

  // 3. Texto de exemplo da biblioteca.
  const exemplos = [...new Set(fragmentos.filter((f) => f.suspeito).map((f) => f.texto))]
  if (exemplos.length > 0) {
    issues.push({
      type: "texto_de_exemplo",
      severity: "medium",
      message: `Texto de exemplo da biblioteca chegou ao e-mail: ${exemplos.slice(0, 5).map((t) => `"${t.slice(0, 40)}"`).join(", ")}${exemplos.length > 5 ? ` (+${exemplos.length - 5})` : ""}.`,
      location: "html",
    })
  }

  // 4. Parágrafo repetido (texto longo idêntico duas vezes).
  const vistos = new Map<string, string>()
  const repetidos: string[] = []
  for (const t of textoVisivel(html)) {
    if (t.length < REPETICAO_MIN_CHARS) continue
    const n = normalizeForMatch(t)
    if (vistos.has(n)) {
      if (!repetidos.includes(vistos.get(n)!)) repetidos.push(vistos.get(n)!)
    } else {
      vistos.set(n, t)
    }
  }
  if (repetidos.length > 0) {
    issues.push({
      type: "paragrafo_repetido",
      severity: "medium",
      message: `Parágrafo repetido no e-mail: ${repetidos.slice(0, 2).map((t) => `"${t.slice(0, 60)}…"`).join(", ")}.`,
      location: "html",
    })
  }

  return issues
}
