/**
 * orphan-spacer — normaliza spacers `<div>` soltos entre linhas de tabela.
 *
 * `<div style="height:Npx"></div>` entre `</tr>` e `<tr>` é HTML inválido
 * dentro de `<table>`: o navegador/cliente de email faz foster parenting e
 * move a div para ANTES da tabela, empilhando um GAP de espaço vazio no
 * TOPO do email (bug Luxe Lift Welcome, jul/2026 — e reincidente via
 * Refinador, que insere spacers nas junções entre seções). Converte cada
 * div-spacer órfã num spacer de TABELA válido no MESMO ponto — o respiro
 * acontece onde foi pedido, sem deslocamento. `mso-line-height-rule:exactly`
 * garante a altura no Outlook.
 *
 * Módulo puro (zero deps) — consumido pelo html.chain (output do HTML
 * agent) e pelo refiner/apply-delta (output do Refinador).
 */
/**
 * Célula-espaçadora de coluna SEM width em tabela `table-layout:fixed`:
 * no layout fixo, colunas sem width dividem IGUALMENTE o espaço restante —
 * um spacer que deveria ter ~24px engole metade da coluna de texto
 * (Luxe Lift carrinho#1: imagem 238 + spacer 151 + texto 151 em 600px,
 * texto quebrando a cada 2 palavras). Adiciona width="24" a toda
 * `<td class="...mobile-spacer...">` sem atributo width.
 */
export function fixSpacerColumnWidths(html: string): string {
  // Token de classe EXATO (delimitado por espaço/início/fim do valor):
  // `\b` casaria também `mobile-spacer-lg` — o `-` conta como boundary.
  return html.replace(
    /<td\b(?![^>]*\bwidth\s*=)([^>]*\bclass="(?:[^"]*\s)?mobile-spacer(?:\s[^"]*)?"[^>]*)>/gi,
    '<td width="24"$1>',
  )
}

const ORPHAN_SPACER_RE =
  /<\/tr>\s*<div\b[^>]*?height\s*:\s*(\d+)\s*px[^>]*>\s*<\/div>/gi

export function fixOrphanSpacerDivs(html: string): string {
  // Itera até estabilizar: divs órfãs CONSECUTIVAS (`</tr><div/><div/>`)
  // precisam de múltiplas passadas — cada replace consome o `</tr>` e a
  // div seguinte só casa quando o `</tr>` do spacer convertido aparece.
  let out = html
  for (let i = 0; i < 8; i++) {
    const next = out.replace(
      ORPHAN_SPACER_RE,
      (_m, px) =>
        `</tr><tr><td style="height:${px}px;line-height:${px}px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`,
    )
    if (next === out) break
    out = next
  }
  return out
}
