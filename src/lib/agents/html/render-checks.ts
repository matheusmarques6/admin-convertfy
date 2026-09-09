/**
 * Render checks — validações determinísticas (sem LLM, custo zero) do HTML
 * final do email.
 *
 * Contexto: o QA agent (LLM) está DESLIGADO por decisão de produto
 * (outrora `EMAIL_QA_ENABLED != 'true'`; agora `EMAIL_QA_MODE=off`). Com isso o
 * pipeline gravava `qa_issues: []` sempre e problemas visíveis de formatação
 * (sem link de unsubscribe, links "#", imagem sem alt, layout sem tabela)
 * chegavam ao designer sem nenhum aviso.
 *
 * Cada resultado declara se é warning ou blocking. Links sem destino são
 * bloqueantes; os demais achados continuam disponíveis para revisão.
 */

import type { QaIssue } from "@/types/email-generation"
import { auditContrast } from "./color-contrast"

// Padrões de unsubscribe aceitos: merge tags dos ESPs + âncora com texto.
// Cobre Klaviyo/Liquid ({% unsubscribe %}, {{ unsubscribe }}), Mailchimp
// (*|UNSUB|*), genérico ([unsubscribe_link], [unsubscribe]) e a palavra em
// si (href ou texto do link, "descadastr..." em pt).
const UNSUBSCRIBE_RE =
  /unsubscribe|descadastr|\*\|UNSUB\|\*|\{%\s*unsubscribe\s*%\}/i

export interface RenderCheckOptions {
  /** Locale da loja (ex.: "pt-BR"). Usado só para mensagens. */
  locale?: string
}

/**
 * Roda as checagens estruturais no HTML final e retorna QaIssue[] (vazio =
 * tudo ok). Nunca lança.
 */
export function computeRenderChecks(
  html: string,
  _opts: RenderCheckOptions = {},
): QaIssue[] {
  const issues: QaIssue[] = []
  if (!html || !html.trim()) return issues

  // 1. Unsubscribe ausente — ESPs (Klaviyo) bloqueiam envio sem o link, e
  //    é requisito de compliance (CAN-SPAM/LGPD).
  if (!UNSUBSCRIBE_RE.test(html)) {
    issues.push({
      type: "compliance",
      severity: "medium",
      disposition: "warning",
      message:
        "Sem link de unsubscribe no HTML — Klaviyo/ESP pode bloquear o envio.",
      location: "footer",
    })
  }

  // 2. Links placeholder href="#" — CTA que não leva a lugar nenhum.
  const emptyHrefs =
    html.match(/href\s*=\s*["'](?:\s*|#|javascript:\s*void\s*\(\s*0\s*\))["']/gi)
      ?.length ?? 0
  if (emptyHrefs > 0) {
    issues.push({
      type: "links_quebrados",
      severity: "high",
      disposition: "blocking",
      message: `${emptyHrefs} link(s) com destino vazio/placeholder — preencher URL antes de publicar.`,
    })
  }

  // 2b. Botão que perdeu o destino: <a> SEM href nenhum. É a assinatura que
  //     o `neutralizeDeadLinks` deixa quando `href="{{CTA_URL}}"` não foi
  //     preenchido — o rótulo veio, a URL não. Sem este aviso o designer vê
  //     um botão com cara de pronto e nada indica que ele não clica.
  //     Severidade acima do href="#": aquele é placeholder assumido de
  //     template, este é copy entregue com destino perdido.
  const hrefless = (html.match(/<a\b[^>]*>/gi) ?? []).filter(
    (tag) => !/\shref\s*=/i.test(tag),
  ).length
  if (hrefless > 0) {
    issues.push({
      type: "links_quebrados",
      severity: "medium",
      disposition: "blocking",
      message: `${hrefless} botão(ões)/link(s) sem destino — a URL não foi preenchida na geração.`,
    })
  }

  // 3. <img> sem alt — acessibilidade + render quebrado quando a imagem
  //    não carrega (comum em clients de email com imagens bloqueadas).
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? []
  const imgsWithoutAlt = imgTags.filter(
    (tag) => !/\salt\s*=\s*["'][^"']+["']/i.test(tag),
  ).length
  if (imgsWithoutAlt > 0) {
    issues.push({
      type: "alt_text_faltando",
      severity: "low",
      disposition: "warning",
      message: `${imgsWithoutAlt} imagem(ns) sem atributo alt descritivo.`,
    })
  }

  // 4. Layout sem tabela de apresentação — email HTML "sendable" usa
  //    table-based layout; div-only quebra no Outlook/Gmail. Sinaliza que o
  //    agente regenerou em vez de repintar a referência.
  if (!/<table[^>]*role\s*=\s*["']presentation["']/i.test(html)) {
    issues.push({
      type: "html_invalido",
      severity: "medium",
      disposition: "warning",
      message:
        'HTML sem <table role="presentation"> — layout não table-based pode quebrar em Outlook/Gmail.',
    })
  }

  // 5. Contraste texto/fundo abaixo do mínimo AA. Aritmética de luminância
  //    (WCAG), custo zero. Sem isto, um botão com texto branco sobre fundo
  //    quase branco (1,05:1) chegava ao designer sem uma linha de aviso —
  //    foi o que aconteceu na Luxe Lift (22/08). Só entram pares que dá
  //    para medir: fundo em foto fica de fora (a hero tem outro caminho).
  const contraste = auditContrast(html).filter((f) => f.ratio != null)
  if (contraste.length > 0) {
    const pior = contraste.reduce((a, b) =>
      (a.ratio as number) <= (b.ratio as number) ? a : b,
    )
    issues.push({
      type: "contraste_baixo",
      severity: "medium",
      disposition: "warning",
      message:
        `${contraste.length} trecho(s) com contraste abaixo do mínimo legível. ` +
        `Pior caso: texto ${pior.textHex} sobre ${pior.bgHex} ` +
        `(${(pior.ratio as number).toFixed(2)}:1, mínimo ${pior.min}:1).`,
    })
  }

  return issues
}
