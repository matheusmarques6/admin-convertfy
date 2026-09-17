/**
 * Checks de CONTEÚDO do HTML final — código, custo zero, sem LLM. Rodam
 * nos DOIS caminhos do QA (gate `EMAIL_QA_ENABLED` ligado ou não), como o
 * `computeRenderChecks`: e alimentam um gate obrigatório, independente de `EMAIL_QA_ENABLED`.
 *
 * Por que existem (batch 644d86c5, 08/09): o e-mail saiu com `ICON 1 ·
 * ICON 2 · ICON 3`, `Use code: [WELCOME-CODE]`, `Here's 10% OFF` numa loja
 * SEM incentivo e o mesmo parágrafo do Shopify duas vezes — e nada
 * reprovou, porque o QA está desligado e os render-checks olham forma
 * (unsubscribe, href="#"), não conteúdo.
 *
 * Os checks (nasceram quatro; a lista cresceu com os incidentes):
 *  - `oferta_sem_incentivo` (high): oferta/cupom no texto quando a decisão
 *    da loja diz que NÃO há incentivo. Só roda com a decisão conhecida.
 *  - `placeholder_colchetes` (high): `[WELCOME-CODE]`, `[First Name]` —
 *    token que ninguém vai resolver (merge tag de ESP é `{{ }}`/`*| |*`).
 *  - `codigo_inventado` (high): código promocional que não é o confirmado.
 *  - `texto_de_exemplo` (medium): texto visível que `pareceExemplo`
 *    reconhece como recheio de mockup da biblioteca (`ICON 1`, `Link Here`).
 *  - `label_generico` (high) e `link_sem_endereco` (high): rótulo e href
 *    de exemplo da variante que chegaram ao cliente (11/09).
 *  - `paragrafo_repetido` (medium): o mesmo texto (≥ 60 chars) duas vezes.
 *  - `posicao_sem_variante` (high, Passo 15): a decisão pediu uma posição
 *    e a biblioteca não tinha variante — o e-mail saiu com uma seção a
 *    menos (vem do `slot_map`, Passo 11).
 *  - `traducao_faltante` (medium, Passo 15): o cupom saiu em pt-BR numa
 *    loja de outro idioma (flag gravada pelo Passo 4).
 */

import type { QaIssue } from "@/types/email-generation"
import { normalizeForMatch, orphanTextFragments } from "./anchor-match"
import { computeEditorialChecks } from "./editorial-checks"

export interface ContentCheckOptions {
  /**
   * Decisão de incentivo da loja (`objection_catalog.incentivo.existe`, ou
   * o alvo do Seletor). `true` é a única confirmação aceita; `false`, `null` ou ausente
   * bloqueiam qualquer promessa de oferta.
   */
  incentivoExiste?: boolean | null
  /** Código confirmado literalmente no catálogo. */
  incentivoCodigo?: string | null
  /**
   * Posições decididas que ficaram sem variante (Passo 11): entradas do
   * `slot_map` com `variant_id: null`, com o motivo e o dispositivo pedido.
   */
  posicoesSemVariante?: ReadonlyArray<{
    block_index: number
    section: string
    dispositivo_pedido?: string | null
    motivo?: string | null
  }> | null
  /** `decisao.incentivo.traducao_faltante` — cupom sem tradução no idioma da loja. */
  traducaoFaltante?: boolean | null
  /**
   * `mecanica_do_incentivo` está entre os trabalhos fixos deste toque. Só
   * então se cobra que o texto diga ONDE o cupom se aplica — check que
   * dispara sem a regra pedida é alarme falso, e alarme falso é como se
   * aprende a ignorar o verdadeiro.
   */
  mecanicaPedida?: boolean | null
  /** Assunto e preheader entregues — a régua retórica também olha para eles. */
  assunto?: string | null
  preheader?: string | null
}

const OFERTA_RE =
  /\b\d{1,3}\s?%\s?(?:off|de desconto|discount)\b|\buse (?:the )?code\b|\bc[oó]digo\s*:|\bcupom\b|\bcoupon\b|\bpromo code\b/i
export const PLACEHOLDER_RE = /\[[A-Za-z][A-Za-z0-9 _-]{2,}\]/g
/** Merge tags e tokens que NÃO são placeholder órfão. */
export const TOKEN_OK_RE = /^\[(?:unsubscribe(?:_link)?|preferences|view_in_browser|web_version)\]$/i
const REPETICAO_MIN_CHARS = 60
const CODIGO_RE = /\b(?:use (?:the )?code|c[oó]digo|cupom|coupon(?: code)?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9_-]{2,})\b/gi
const LABEL_GENERICO_RE = /^(?:link here|click here|button|cta|learn more|saiba mais)$/i
/**
 * O texto diz ONDE o cupom se aplica. PT e EN na mesma regex, como a régua
 * de claims: idioma que não está aqui não produz achado, em vez de acusar
 * falta de uma frase que pode estar lá em polonês.
 */
const ONDE_APLICAR_RE =
  /\b(?:no\s+checkout|at\s+checkout|na\s+finaliza[cç][aã]o|no\s+carrinho|in\s+(?:your|the)\s+cart|campo\s+de\s+(?:cupom|desconto)|(?:coupon|discount|promo)\s+(?:code\s+)?(?:field|box)|apply\s+(?:it|the\s+code)|aplique\s+o\s+c[oó]digo|use\s+(?:it|o\s+c[oó]digo)\s+(?:no|at|na))\b/i

/** Todo `href` do documento, com aspas simples ou duplas. */
const HREF_RE = /href\s*=\s*["']([^"']*)["']/gi

/**
 * Endereço que de fato leva a algum lugar, ou merge tag que o ESP resolve.
 *
 * O que NÃO passa aqui é o href de EXEMPLO da variante da biblioteca —
 * `URL_CTA_PRIMARIO`, `URL_DO_SITE_AQUI`, `URL_FACEBOOK`. Eles não são
 * `{{tag}}` nem `[token]`, então nenhum strip de placeholder os alcança e
 * nenhum merge os preenche: chegam ao cliente como clique morto. Foi o que
 * aconteceu com os TRÊS CTAs do hero em 11/09 — a seção mais importante do
 * e-mail, sem um link que funcione.
 */
export function enderecoUtil(href: string): boolean {
  const h = href.trim()
  if (!h) return false
  // Merge tag do ESP, em qualquer dialeto: {{x}}, *|X|*, %%x%%, [token].
  if (/^\{\{.+\}\}$/.test(h) || /^\*\|.+\|\*$/.test(h) || /^%%.+%%$/.test(h)) return true
  if (/^\[[A-Za-z_][A-Za-z0-9 _-]*\]$/.test(h)) return true
  return /^(?:https?:\/\/|mailto:|tel:|sms:|#)/i.test(h)
}

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
      disposition: "blocking",
      message: `Placeholder entre colchetes no texto do e-mail: ${[...placeholders].slice(0, 5).join(", ")} — ninguém vai preencher isso; merge tag de ESP é {{ }}.`,
      location: "html",
    })
  }

  // 2. Oferta sem incentivo CONFIRMADO — `false` e `null` reprovam igual,
  // mas a mensagem não pode afirmar o que não se sabe: "ninguém confirmou"
  // manda preencher a ficha da loja; "não tem" manda tirar a oferta do
  // texto. Ler a mensagem errada custa a ação errada.
  if (opts.incentivoExiste !== true) {
    const ofertas = fragmentos.map((f) => f.texto).filter((t) => OFERTA_RE.test(t))
    if (ofertas.length > 0) {
      const trechos = [...new Set(ofertas)].slice(0, 3).map((t) => `"${t.slice(0, 60)}"`).join(", ")
      issues.push({
        type: "oferta_sem_incentivo",
        severity: "high",
        disposition: "blocking",
        message:
          opts.incentivoExiste === false
            ? `A loja NÃO tem incentivo ativo e o e-mail promete oferta/cupom: ${trechos}.`
            : `Ninguém confirmou se esta loja tem incentivo (catálogo com \`existe: null\`) e o e-mail já promete oferta/cupom: ${trechos}. Confirme na ficha operacional antes de aprovar.`,
        location: "html",
      })
    }
  }

  // 2b. Código promocional precisa existir literalmente no contexto. Mesmo
  // com incentivo=true, um código diferente é fabricação da fase 2.
  const codigos = new Set<string>()
  for (const { texto } of fragmentos) {
    CODIGO_RE.lastIndex = 0
    for (const match of texto.matchAll(CODIGO_RE)) codigos.add(match[1])
  }
  const confirmado = opts.incentivoCodigo?.trim().toLocaleLowerCase()
  const inventados = [...codigos].filter(
    (codigo) => !confirmado || codigo.toLocaleLowerCase() !== confirmado,
  )
  if (inventados.length > 0) {
    issues.push({
      type: "codigo_inventado",
      severity: "high",
      disposition: "blocking",
      message: `Código promocional sem confirmação no contexto: ${inventados.join(", ")}.`,
      location: "html",
    })
  }

  // 3. Texto de exemplo da biblioteca.
  const exemplos = [...new Set(fragmentos.filter((f) => f.suspeito).map((f) => f.texto))]
  if (exemplos.length > 0) {
    issues.push({
      type: "texto_de_exemplo",
      severity: "medium",
      disposition: "blocking",
      message: `Texto de exemplo da biblioteca chegou ao e-mail: ${exemplos.slice(0, 5).map((t) => `"${t.slice(0, 40)}"`).join(", ")}${exemplos.length > 5 ? ` (+${exemplos.length - 5})` : ""}.`,
      location: "html",
    })
  }


  // 3b. Rótulos genéricos de componentes não são copy publicável.
  const labels = [...new Set(fragmentos.map((f) => f.texto).filter((t) => LABEL_GENERICO_RE.test(t.trim())))]
  if (labels.length > 0) {
    issues.push({
      type: "label_generico",
      severity: "high",
      disposition: "blocking",
      message: `Label genérico chegou ao e-mail: ${labels.map((t) => `"${t}"`).join(", ")}.`,
      location: "html",
    })
  }

  // 3c. Link que não leva a lugar nenhum.
  const hrefsMortos = new Set<string>()
  for (const m of html.matchAll(HREF_RE)) {
    if (!enderecoUtil(m[1])) hrefsMortos.add(m[1].trim().slice(0, 40))
  }
  if (hrefsMortos.size > 0) {
    issues.push({
      type: "link_sem_endereco",
      severity: "high",
      disposition: "blocking",
      message: `Link sem endereço real no e-mail: ${[...hrefsMortos].slice(0, 5).map((h) => `"${h}"`).join(", ")}${hrefsMortos.size > 5 ? ` (+${hrefsMortos.size - 5})` : ""} — não é URL nem merge tag de ESP, então ninguém preenche e o clique morre.`,
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
      disposition: "blocking",
      message: `Parágrafo repetido no e-mail: ${repetidos.slice(0, 2).map((t) => `"${t.slice(0, 60)}…"`).join(", ")}.`,
      location: "html",
    })
  }

  // 5. Posição decidida sem variante (Passo 15). Uma issue por lacuna: a
  // seção que falta é o que a curadoria precisa ler, e `location` carrega
  // a posição porque a lacuna não tem `block_id` — o bloco não existe.
  for (const p of opts.posicoesSemVariante ?? []) {
    const dispositivo = p.dispositivo_pedido ? ` (${p.dispositivo_pedido})` : ""
    const motivo =
      p.motivo === "todas_descartadas"
        ? "só havia variante de dispositivo que a decisão descartou"
        : p.motivo === "resgate_recusado"
          ? "a menos incompatível violava a decisão"
          : // Passo 19: o único motivo que nomeia o cadastro que falta — a
            // seção existe, a FORMA pedida não. É o que a curadoria lê.
            p.motivo === "dispositivo_indisponivel"
            ? `a seção não tem variante que realize ${p.dispositivo_pedido ?? "o dispositivo pedido"}`
            : "nenhuma variante elegível na biblioteca"
    issues.push({
      type: "posicao_sem_variante",
      severity: "high",
      disposition: "blocking",
      message: `A posição ${p.block_index} (${p.section}${dispositivo}) ficou sem variante — ${motivo}. O e-mail saiu sem essa seção.`,
      location: `block:${p.block_index}:${p.section}`,
      no_responsavel: "biblioteca",
    })
  }

  // 6. Cupom sem tradução (Passo 15): o código saiu no idioma padrão.
  if (opts.traducaoFaltante === true) {
    issues.push({
      type: "traducao_faltante",
      severity: "medium",
      disposition: "warning",
      message:
        "O cupom deste toque não tem tradução no idioma da loja e saiu em pt-BR (`email_outline_templates.coupon_codes`). Cadastre a tradução ou confirme o código na plataforma.",
      location: "html",
      no_responsavel: "loja",
    })
  }

  // 7. O toque entrega cupom e não diz o que fazer com ele (17/09).
  if (opts.mecanicaPedida === true && opts.incentivoCodigo) {
    const visivel = textoVisivel(html).join(" ")
    if (visivel.includes(opts.incentivoCodigo) && !ONDE_APLICAR_RE.test(visivel)) {
      issues.push({
        type: "mecanica_do_incentivo_ausente",
        severity: "medium",
        disposition: "warning",
        message: `O e-mail entrega o código ${opts.incentivoCodigo} e não diz onde aplicá-lo. Quem está com o código na mão precisa saber o que fazer com ele — é a dúvida daquele segundo, e ela fica sem resposta.`,
        location: "html",
        no_responsavel: "copy",
      })
    }
  }

  // 8. Régua retórica: como a frase está escrita, não o que ela afirma.
  issues.push(
    ...computeEditorialChecks(textoVisivel(html), {
      assunto: opts.assunto,
      preheader: opts.preheader,
      incentivoCodigo: opts.incentivoCodigo,
    }),
  )

  return issues
}
