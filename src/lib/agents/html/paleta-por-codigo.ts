/**
 * paleta-por-codigo — o fallback determinístico do Cores & Botões.
 *
 * Quando o agente falha duas vezes, o runner mantinha o HTML da etapa
 * anterior "porque cor é polimento" (fail-open). Não é: o e-mail saía com
 * os cinzas e o vermelho da variante de OUTRA loja, e o QA reprova por
 * `contraste_baixo`/fora da paleta — falha de um agente virando falha da
 * peça. Aqui o que o código já sabe fazer roda sem o modelo: cor saturada
 * fora da paleta vai para o papel (`coresForaDaPaleta`, a guarda que já
 * existia no caminho de sucesso) e fundo de seção estranho à identidade vai
 * para o papel de fundo (`tonsDeFundo.estranhos` → `bg`/`surface`).
 *
 * Não decide RITMO nem insere botão: isso é decisão, e decisão sem o agente
 * é invenção. Puro (zero I/O) — testável.
 */

import { applyOps, type FormatOp } from "./apply-patches"
import { extrairFaixas, tonsDeFundo } from "./color-faixas"
import { canonicalHex, coresForaDaPaleta } from "./color-inventory"
import { relativeLuminance } from "./color-contrast"

export interface PapeisParaPaleta {
  text: string
  accent: string
  surface: string
  surface_strong?: string
  heading?: string
  bg?: string
  button_bg?: string
  button_text?: string
}

export interface PaletaPorCodigo {
  html: string
  recolors: Array<{ de: string; para: string; onde: string; ocorrencias: number }>
  faixas_corrigidas: Array<{ bloco: number; de: string; para: string }>
  ocorrencias: number
}

/**
 * @param aceitas fundos legítimos da loja (paleta + papéis derivados) —
 *   `fundosLegitimos` de format-context, passado pelo chamador para este
 *   módulo não importar I/O.
 */
export function aplicarPaletaPorCodigo(
  html: string,
  roles: PapeisParaPaleta,
  aceitas: string[],
): PaletaPorCodigo {
  const ops: FormatOp[] = []
  const recolors: PaletaPorCodigo["recolors"] = []
  const faixasCorrigidas: PaletaPorCodigo["faixas_corrigidas"] = []

  for (const c of coresForaDaPaleta(html, roles)) {
    ops.push({ action: "recolor", from: c.valor, to: c.para, where: c.contexto })
    recolors.push({ de: c.valor, para: c.para, onde: c.contexto, ocorrencias: c.ocorrencias })
  }

  const faixas = extrairFaixas(html)
  const tons = tonsDeFundo(faixas, aceitas)
  if (tons.estranhos.length > 0 && roles.bg) {
    const estranhos = new Set(tons.estranhos.map(canonicalHex))
    const claro = canonicalHex(roles.bg)
    const escuroCandidato = roles.surface_strong ?? roles.surface
    for (const f of faixas) {
      if (!f.fundo || f.foto || !f.editavel) continue
      const hex = canonicalHex(f.fundo)
      if (!estranhos.has(hex)) continue
      // Fundo estranho claro vira o fundo da loja; escuro vira a superfície
      // forte (o ritmo claro/escuro que a peça tinha é preservado na
      // direção, não no valor).
      const para = relativeLuminance(hex) > 0.5 ? claro : canonicalHex(escuroCandidato ?? claro)
      if (para === hex) continue
      ops.push({ action: "set_fundo", bloco: f.bloco, para })
      faixasCorrigidas.push({ bloco: f.bloco, de: hex, para })
    }
  }

  if (ops.length === 0) return { html, recolors, faixas_corrigidas: faixasCorrigidas, ocorrencias: 0 }
  const r = applyOps(html, ops, {
    allowHero: true,
    faixas,
    ctas: [],
    surfaces: { surface: roles.surface, surface_strong: roles.surface_strong ?? roles.surface },
  })
  return { html: r.html, recolors, faixas_corrigidas: faixasCorrigidas, ocorrencias: r.recoloredOccurrences }
}
