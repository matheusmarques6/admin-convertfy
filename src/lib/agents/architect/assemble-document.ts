/**
 * assemble-document — a arquitetura do email montada por CÓDIGO (story CM-2).
 *
 * Substitui o passo B do Montador (LLM). O documento passa a ser a
 * concatenação dos HTMLs CANÔNICOS das variantes escolhidas
 * (`html_tagged` aprovado, senão `html`), na ordem dos slots, dentro do
 * shell de 600px — byte a byte igual à biblioteca, com os
 * `{{PLACEHOLDERS}}` intactos para o merge preencher.
 *
 * Por que sair do LLM: metade do prompt do Montador existia para impedir
 * que ele estragasse o insumo, e ainda assim estragava — havia guard
 * dedicado medindo tags de imagem removidas (`findDroppedImageTags`) e
 * outro descartando marcadores malformados. O caso Luxe Lift (jul/2026)
 * perdeu banda escura de logo, segundo CTA e subtítulo antes de qualquer
 * agente rodar. O `hero-graft` já reenxertava a hero depois do fato; aqui
 * o problema deixa de existir na origem.
 *
 * Puro (zero I/O) — testável.
 */

import { effectiveVariantHtml } from "../shared/component-dimensions"
import { fitFragment } from "../html/fragment-fit"
// normalizeFonts mora no hero-graft por herança (foi escrita lá para o
// enxerto); é genérica e vale para o documento inteiro.
import { normalizeFonts } from "../html/hero-graft"
import type { AssemblySlot } from "./component-assembler.service"

// ── Marcadores de bloco ────────────────────────────────────────────────
// SYNC: mesmo formato replicado em html/hero-locator.ts e
// html/post-process.ts. Antes o Montador (LLM) emitia estes comentários e
// o código validava; agora o código emite, e a validação virou self-check.

export const BLOCK_MARKER_PATTERN =
  /<!--\s*cfy:block:(\d+):([A-Za-z0-9_-]+):(start|end)\s*-->/g

export type BlockMarkerStatus = "ok" | "stripped" | "absent"

/** Remove todos os marcadores cfy:block do documento. Pura. */
export function stripBlockMarkers(html: string): string {
  return html.replace(BLOCK_MARKER_PATTERN, "")
}

/** Bloco que o documento deve conter, na ordem de emissão. */
export interface ExpectedBlock {
  block_index: number
  section: string
}

/**
 * Valida os pares start/end do documento contra os blocos esperados:
 * exatamente 1 par por bloco, índices e sections corretos, na ordem e sem
 * sobreposição.
 *
 * Os `block_index` NÃO são necessariamente 0..n-1: posição pulada deixa
 * lacuna, de propósito (ver `assembleDocument`). Por isso a validação
 * compara com os índices esperados, não com a posição no array.
 *
 * Inválido → strip (o documento segue sem marcadores; a fase 2 cai no
 * tag-locator). Pura, testável.
 */
export function validateBlockMarkers(
  html: string,
  expected: ExpectedBlock[],
): { html: string; status: BlockMarkerStatus } {
  const found = Array.from(html.matchAll(BLOCK_MARKER_PATTERN))
  if (found.length === 0) return { html, status: "absent" }

  const stripped = () => ({
    html: stripBlockMarkers(html),
    status: "stripped" as const,
  })

  if (found.length !== expected.length * 2) return stripped()

  let cursor = -1
  for (let i = 0; i < expected.length; i++) {
    const start = found[i * 2]
    const end = found[i * 2 + 1]
    if (!start || !end) return stripped()
    const idx = expected[i].block_index
    if (Number(start[1]) !== idx || Number(end[1]) !== idx) return stripped()
    if (start[3] !== "start" || end[3] !== "end") return stripped()
    const section = expected[i].section.toLowerCase()
    if (
      start[2].toLowerCase() !== section ||
      end[2].toLowerCase() !== section
    ) {
      return stripped()
    }
    const startIdx = start.index ?? -1
    const endIdx = end.index ?? -1
    if (startIdx <= cursor || endIdx <= startIdx) return stripped()
    cursor = endIdx
  }
  return { html, status: "ok" }
}

// ── Montagem ───────────────────────────────────────────────────────────

/** Por que uma posição não entrou no documento. */
export type SkipReason =
  /** Nenhuma variante escolhida para a posição (biblioteca não cobre). */
  | "missing"
  /** HTML efetivo da variante vazio. */
  | "empty_html"
  /** Fragmento não encaixa como linha da tabela container. */
  | "invalid_fragment"

export interface SkippedBlock {
  block_index: number
  section: string
  label: string
  reason: SkipReason
}

export interface AssembledStats {
  /** Blocos que entraram no documento. */
  blocks: number
  /** Slots com variante escolhida (entraram ou não). */
  variants: number
  /** Posições que ficaram FORA do email. */
  skipped: SkippedBlock[]
  fontsNormalized: number
  chars: number
  /**
   * Seções cuja variante não é table-based e foi embrulhada em `<tr><td>`.
   * Não é erro, mas indica variante cadastrada fora do padrão de email.
   */
  wrappedUnknown: string[]
  /**
   * Seções cuja variante estava cadastrada como DOCUMENTO completo. A casca
   * saiu e o miolo entrou no lugar. Hoje é o formato dominante da
   * biblioteca (jul/2026: as 38 ativas), então isto é contagem, não alarme.
   */
  unshelled: string[]
  /** Blocos de CSS resgatados do `<head>` das variantes e reinjetados. */
  stylesInlined: number
  /** Blocos esperados, na ordem — insumo do self-check de marcadores. */
  expected: ExpectedBlock[]
}

export interface AssembleDocumentInput {
  slots: AssemblySlot[]
  /** Fontes aprovadas da loja. Ausentes → nenhuma normalização. */
  fonts?: { heading?: string | null; body?: string | null }
  lang?: string
}

/**
 * Monta o documento a partir dos slots escolhidos.
 *
 * Posição sem variante — ou cuja variante não encaixa — é **pulada**: o
 * email sai com menos seções e a posição é registrada em `stats.skipped`.
 * Nada é puxado do template curado para preencher a lacuna, e nenhuma nota
 * é injetada no HTML.
 *
 * O `block_index` dos marcadores é o índice ORIGINAL da estrutura, com
 * lacunas — não é reindexado. `slot_map`, `blueprint.blocks` e os
 * marcadores são três representações da mesma sequência; reindexar
 * desalinharia as três.
 */
export function assembleDocument(
  input: AssembleDocumentInput,
): { html: string; stats: AssembledStats } {
  const { slots, fonts, lang = "pt-BR" } = input

  const rows: string[] = []
  const skipped: SkippedBlock[] = []
  const expected: ExpectedBlock[] = []
  const wrappedUnknown: string[] = []
  const unshelled: string[] = []
  // O CSS do <head> de cada variante precisa sobreviver ao desembrulho: é
  // onde vive o @media dela. Dedup por conteúdo — variantes da mesma origem
  // repetem o mesmo bloco, e duplicar CSS só engorda o email.
  const styles = new Set<string>()
  let variants = 0

  slots.forEach((slot, i) => {
    const section = slot.section
    const label = slot.label
    if (slot.kind !== "variant") {
      skipped.push({ block_index: i, section, label, reason: "missing" })
      return
    }
    variants++
    const variantHtml = effectiveVariantHtml(slot.variant)
    if (!variantHtml || !variantHtml.trim()) {
      skipped.push({ block_index: i, section, label, reason: "empty_html" })
      return
    }
    // wrapUnknown: aqui o contexto é uma célula NOVA, então variante fora do
    // padrão table-based é embrulhada em vez de pulada — email sem a seção é
    // pior que uma variante cadastrada torto. O enxerto usa o modo
    // conservador (ver fragment-fit).
    const fit = fitFragment(variantHtml, { wrapUnknown: true })
    if (!fit) {
      skipped.push({
        block_index: i,
        section,
        label,
        reason: "invalid_fragment",
      })
      return
    }
    if (fit.kind === "wrapped_unknown") wrappedUnknown.push(section)
    if (fit.unshelled) unshelled.push(section)
    for (const css of fit.styles ?? []) styles.add(css)
    const marker = `${i}:${section}`
    rows.push(
      `        <!-- cfy:block:${marker}:start -->\n${fit.html}\n        <!-- cfy:block:${marker}:end -->`,
    )
    expected.push({ block_index: i, section })
  })

  const shell = documentShell(rows.join("\n"), lang, [...styles])
  const normalized = normalizeFonts(shell, fonts ?? {})

  return {
    html: normalized.html,
    stats: {
      blocks: rows.length,
      variants,
      skipped,
      fontsNormalized: normalized.replaced,
      chars: normalized.html.length,
      wrappedUnknown,
      unshelled,
      stylesInlined: styles.size,
      expected,
    },
  }
}

/**
 * Shell de 600px. As CSS variables saem com valores neutros: a paleta da
 * loja é aplicada adiante pelo step de cores, que reescreve o `:root`.
 */
function documentShell(
  rows: string,
  lang: string,
  variantStyles: string[] = [],
): string {
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>{{HEADLINE}}</title>
  <style>
    :root {
      --bg: #F4F4F4;
      --text: #333333;
      --heading: #111111;
      --button-bg: #111111;
      --button-text: #FFFFFF;
      --accent: #DDDDDD;
    }

    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      border-collapse: collapse;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
      display: block;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: var(--bg);
    }

    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .stack-pad {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .fluid {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
      }
    }
  </style>
${variantStylesBlock(variantStyles)}</head>
<body style="margin:0;padding:0;background-color:var(--bg);">

  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;mso-hide:all;">{{PREHEADER}}</div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:var(--bg);">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;">
${rows}
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`
}

/**
 * CSS resgatado do `<head>` das variantes desembrulhadas.
 *
 * Vai DEPOIS do bloco base para poder sobrescrevê-lo — o CSS da variante é
 * mais específico que o do shell, e essa é a ordem que preserva a intenção
 * de quem cadastrou. Cada bloco fica separado e identificado para que, na
 * hora de depurar um email, dê para saber de onde o seletor veio.
 *
 * Risco assumido: duas variantes com uma classe de mesmo nome e regras
 * diferentes colidem. Não dá para prefixar sem reescrever os seletores E o
 * HTML da variante, e reescrever CSS de terceiro é pior do que a colisão.
 * A alternativa — descartar — quebra o responsivo, que é certo.
 */
function variantStylesBlock(styles: string[]): string {
  if (styles.length === 0) return ""
  const blocks = styles
    .map((css, i) => `  <style>\n    /* variante ${i + 1} */\n${css}\n  </style>`)
    .join("\n")
  return `${blocks}\n`
}
