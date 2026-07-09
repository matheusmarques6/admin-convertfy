/**
 * Render checks — validações determinísticas (sem LLM, custo zero) do HTML
 * final do email.
 *
 * Contexto: o QA agent (LLM) está DESLIGADO por decisão de produto
 * (EMAIL_QA_ENABLED != 'true' — reprovava emails legítimos). Com isso o
 * pipeline gravava `qa_issues: []` sempre e problemas visíveis de formatação
 * (sem link de unsubscribe, links "#", imagem sem alt, layout sem tabela)
 * chegavam ao designer sem nenhum aviso.
 *
 * Estas checagens são NÃO-BLOQUEANTES: o email continua indo pra `ready`;
 * os issues são persistidos em `email_flow_emails.qa_issues` apenas para
 * dar visibilidade no workspace do designer.
 */

import type { QaIssue } from "@/types/email-generation"

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
      message:
        "Sem link de unsubscribe no HTML — Klaviyo/ESP pode bloquear o envio.",
      location: "footer",
    })
  }

  // 2. Links placeholder href="#" — CTA que não leva a lugar nenhum.
  const emptyHrefs = html.match(/href\s*=\s*["']#["']/gi)?.length ?? 0
  if (emptyHrefs > 0) {
    issues.push({
      type: "links_quebrados",
      severity: "low",
      message: `${emptyHrefs} link(s) com href="#" (placeholder) — preencher URL antes de publicar.`,
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
      message:
        'HTML sem <table role="presentation"> — layout não table-based pode quebrar em Outlook/Gmail.',
    })
  }

  return issues
}
