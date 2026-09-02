/**
 * Documento do iframe de preview de um bloco — a 600px, como no email.
 *
 * O preview antigo jogava o HTML da variante solto no `<body>` de um iframe
 * de largura livre (a da coluna, ~470px): bloco desenhado para 600 aparecia
 * cortado ou espremido, e um fragmento `<tr>` fora de tabela era descartado
 * pelo parser. Aqui o CÓDIGO decide o embrulho:
 *
 *  - documento completo (caso das variantes da biblioteca) → vai como está,
 *    ele já tem calha + container;
 *  - `<tr>` → entra direto no tbody de uma tabela de 600px;
 *  - `<table>` ou qualquer outra coisa → entra em `<tr><td>` dessa tabela.
 *
 * Media queries mobile são NEUTRALIZADAS: o viewport do preview é exatamente
 * 600px e `@media (max-width:600px)` dispararia, mostrando a versão celular
 * empilhada em vez do desktop que o operador quer conferir.
 */

import { classifyEmailRoot, EMAIL_WIDTH } from "./email-width"

export interface PreviewDocOptions {
  width?: number
  /** Cor da calha (fora do container). */
  background?: string
}

/**
 * `@media (max-width: Npx)` → `(max-width: 0px)`: a regra continua válida,
 * mas nunca casa. Só toca o prelúdio da media query, nunca o corpo.
 */
export function neutralizeMobileMediaQueries(html: string): string {
  return html.replace(/@media([^{]*)\{/gi, (m, prelude: string) =>
    /max-width\s*:\s*\d+px/i.test(prelude)
      ? `@media${prelude.replace(/max-width\s*:\s*\d+px/gi, "max-width:0px")}{`
      : m,
  )
}

const PLACEHOLDER =
  '<div style="color:#9CA3AF;text-align:center;padding:40px;font-family:Arial">Sem HTML para renderizar</div>'

export function buildEmailPreviewDoc(
  html: string | null | undefined,
  opts: PreviewDocOptions = {},
): string {
  const width = opts.width ?? EMAIL_WIDTH
  const bg = opts.background ?? "#F3F4F6"
  const root = classifyEmailRoot(html)
  const src = html ?? ""

  if (root === "document") return neutralizeMobileMediaQueries(src)

  const inner =
    root === "empty"
      ? `<tr><td style="padding:0">${PLACEHOLDER}</td></tr>`
      : root === "tr"
        ? src
        : `<tr><td style="padding:0">${src}</td></tr>`

  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:0}body{background:${bg};font-family:Arial,Helvetica,sans-serif}` +
    `table{border-collapse:collapse}</style></head><body>` +
    `<table role="presentation" width="${width}" align="center" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:${width}px;min-width:${width}px;max-width:${width}px;margin:0 auto;background:#FFFFFF">` +
    `<tbody>${neutralizeMobileMediaQueries(inner)}</tbody></table></body></html>`
  )
}
