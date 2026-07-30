/**
 * fragment-fit — encaixe de um fragmento de variante dentro da tabela
 * container de 600px.
 *
 * Um bloco da biblioteca precisa ser uma sequência `<tr>`/`<table>` válida
 * no ponto em que entra no documento:
 *   - fragmento que já começa com <tr>     → usa direto
 *   - documento completo (<!DOCTYPE/<html>)→ tira a casca e reavalia o miolo
 *   - fragmento que começa com <table>     → embrulha em <tr><td>
 *   - qualquer outra coisa (div solto...)  → recusa
 *
 * Nunca "conserta" o fragmento: ou ele encaixa, ou é recusado. Extraído do
 * `hero-graft` (story CM-2) para que o enxerto da hero e a montagem do
 * documento compartilhem UMA matriz de decisão.
 *
 * **Por que a casca de documento entrou nessa matriz.** O `wrapUnknown` foi
 * escrito pensando num `<div>` solto. Uma variante cadastrada como export
 * inteiro (`<!DOCTYPE html PUBLIC ...><html>…`) também caía nele, e o
 * resultado era `<td><!DOCTYPE html><html>…</html></td>` — documento dentro
 * de célula, HTML inválido, que contamina TUDO a jusante. Aconteceu de
 * verdade: o agente de hero recebeu essa região, devolveu-a como recebeu
 * (fazendo o certo — a região é a verdade estrutural) e o parser rejeitou o
 * output com "fragmento contém documento". O agente levou a culpa por um
 * defeito da montagem.
 *
 * Puro (zero I/O) — testável.
 */

import { hasDocumentShell, stripDocumentShell } from "../shared/document-shell"

export interface FitOptions {
  /**
   * Embrulha em `<tr><td>` também o fragmento que não começa com
   * `<tr>`/`<table>` (um `<div>` solto, por exemplo).
   *
   * `false` (default) é o comportamento do **enxerto**: ele substitui uma
   * região existente e um fragmento estranho ali pode quebrar a tabela, então
   * recusa e mantém a região original — degradação segura.
   *
   * `true` é o comportamento da **montagem**: não há região a preservar, o
   * contexto é uma célula nova, e `<td><div>...</div></td>` é HTML de email
   * válido. Pular o bloco deixaria o email sem a seção, o que é pior que
   * embrulhar uma variante cadastrada fora do padrão.
   */
  wrapUnknown?: boolean
}

export type FitKind = "row" | "wrapped_table" | "wrapped_unknown"

export interface FitResult {
  html: string
  kind: FitKind
  /**
   * A variante estava cadastrada como documento completo e a casca foi
   * removida antes do encaixe. É o formato de cadastro DOMINANTE da
   * biblioteca hoje (jul/2026: as 38 variantes ativas), então não é
   * anomalia — é contagem.
   */
  unshelled?: boolean
  /**
   * CSS que estava no `<head>` da variante. Não cabe no fragmento
   * (`<style>` dentro de `<td>` é inválido) e não pode sumir: é onde vive o
   * `@media` da variante. Quem monta o documento reinjeta no head.
   */
  styles?: string[]
}

const wrap = (t: string): string =>
  `<tr>\n<td align="center" style="padding:0;">\n${t}\n</td>\n</tr>`

/**
 * Adapta o fragmento para o contexto de linha da tabela container.
 * Retorna `null` quando o fragmento não encaixa.
 */
export function fitFragment(
  variantHtml: string,
  opts: FitOptions = {},
): FitResult | null {
  const t = variantHtml.trim()
  if (!t) return null
  if (/^<tr[\s>]/i.test(t)) return { html: t, kind: "row" }
  if (/^<table[\s>]/i.test(t)) {
    return { html: wrap(t), kind: "wrapped_table" }
  }
  // Comentário inicial é comum nas variantes — pula e reavalia.
  const afterComment = t.replace(/^(?:<!--[\s\S]*?-->\s*)+/, "")
  if (afterComment !== t) return fitFragment(afterComment, opts)

  // Documento completo: a casca sai e o MIOLO é reavaliado pela mesma
  // matriz. Normalmente o body abre com <table>, então o miolo encaixa
  // sozinho. Isto vem ANTES do wrapUnknown de propósito: embrulhar o
  // documento inteiro numa célula é o defeito que este ramo existe para
  // impedir, não uma degradação aceitável.
  // Recusa é a saída quando o miolo não encaixa (ou não sobrou miolo): o
  // wrapUnknown abaixo NÃO pode receber um documento — é exatamente o
  // caminho que produzia `<td><!DOCTYPE html>…</td>`.
  if (hasDocumentShell(t)) {
    const inner = stripDocumentShell(t)
    if (!inner.stripped || !inner.html || inner.html === t) return null
    const fit = fitFragment(inner.html, opts)
    if (!fit) return null
    return {
      ...fit,
      unshelled: true,
      ...(inner.styles.length > 0 ? { styles: inner.styles } : {}),
    }
  }

  if (opts.wrapUnknown && t) return { html: wrap(t), kind: "wrapped_unknown" }
  return null
}

/** Atalho do enxerto: só o HTML, no modo conservador. */
export function fitFragmentToRow(variantHtml: string): string | null {
  return fitFragment(variantHtml)?.html ?? null
}
