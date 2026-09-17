/**
 * Validador do BLUEPRINT contra a decisão — e a correção por código.
 *
 * `arbitrarCampos` (estruturador-consume) marca `omitir` no campo que
 * colide com `requisitos.cupom === false`. Fica de fora a posição com
 * `cupom: null` numa peça SEM incentivo: o campo de cupom/preço riscado/
 * prazo sobrevive e o n8n o preenche com uma oferta INVENTADA. Aqui a
 * decisão inteira vale: sem incentivo, nenhum campo de oferta é escrito.
 *
 * Correção por código (não por LLM): `omitir` + motivo no campo. O purpose
 * que ainda fala em oferta vira violação `medium` — reescrever prosa por
 * regex é o erro que este repo não repete. Puro.
 */

import { papelDoCampo } from "../field-roles"
import type { DecisaoDoEmail } from "../decisao-do-email"
import { resultado, type ResultadoValidacao, type Violacao } from "./tipos"

export interface CampoDoBlueprint {
  key: string
  nature?: string
  type?: string
  omitir?: boolean
  omitir_motivo?: string
}

export interface BlocoDoBlueprint {
  purpose?: string
  variant_id?: string | null
  fields?: CampoDoBlueprint[]
}

export interface ValidacaoDoBlueprint<B extends BlocoDoBlueprint> extends ResultadoValidacao {
  blocks: B[]
  /** Campos que este validador marcou `omitir` (o que `arbitrarCampos` não alcançou). */
  omitidos: Array<{ block_index: number; key: string; motivo: string }>
}

const RE_OFERTA_NO_PURPOSE =
  /\b(cupom|coupon|c[oó]digo de desconto|discount code|promo code|\d{1,2}\s?% ?off|de\/por|pre[cç]o riscado|countdown|offer ends|oferta (termina|acaba))\b/i

function ehCopy(f: CampoDoBlueprint): boolean {
  if (f.nature === "imagem_gerada" || f.nature === "asset_fixo") return false
  return f.type !== "image"
}

export function validarBlueprint<B extends BlocoDoBlueprint>(
  decisao: DecisaoDoEmail,
  blocks: B[],
  opts: { corrigir: boolean },
): ValidacaoDoBlueprint<B> {
  const violacoes: Violacao[] = []
  const omitidos: ValidacaoDoBlueprint<B>["omitidos"] = []
  const semIncentivo = decisao.incentivo.existe === false
  const alinhado = blocks.length === decisao.posicoes.length

  const out = blocks.map((b, i) => {
    const pos = alinhado ? decisao.posicoes[i] : null
    const base = { block_index: i, section: pos?.section ?? null, variant_id: b.variant_id ?? null }
    let fields = b.fields
    let mudou = false
    if (semIncentivo && fields) {
      fields = fields.map((f) => {
        if (f.omitir || !ehCopy(f)) return f
        const p = papelDoCampo(f.key)
        const motivo = p.cupom
          ? "cupom sem incentivo neste toque (decisão do e-mail)"
          : p.preco_antigo
            ? "preço riscado sem incentivo neste toque (decisão do e-mail)"
            : p.prazo
              ? "prazo de oferta sem incentivo neste toque (decisão do e-mail)"
              : null
        if (!motivo) return f
        violacoes.push({
          ...base,
          tipo: "campo_de_oferta_sem_incentivo",
          severidade: "high",
          campo: f.key,
          evidencia: `campo "${f.key}" a preencher`,
          esperado: `incentivo.existe = false (${decisao.incentivo.origem})`,
        })
        if (!opts.corrigir) return f
        omitidos.push({ block_index: i, key: f.key, motivo })
        mudou = true
        return { ...f, omitir: true, omitir_motivo: motivo }
      })
    }
    if (semIncentivo && b.purpose && RE_OFERTA_NO_PURPOSE.test(b.purpose)) {
      violacoes.push({
        ...base,
        tipo: "purpose_com_oferta",
        severidade: "medium",
        evidencia: b.purpose.match(RE_OFERTA_NO_PURPOSE)?.[0] ?? "",
        esperado: "purpose sem instrução de oferta numa peça sem incentivo",
      })
    }
    // Requisito da posição ignorado pela arbitragem (só com alinhamento).
    if (pos?.requisitos?.cta === false && fields?.some((f) => !f.omitir && ehCopy(f) && papelDoCampo(f.key).cta)) {
      violacoes.push({
        ...base,
        tipo: "cta_negado_com_campo",
        severidade: "high",
        campo: "cta",
        evidencia: "campo de CTA a preencher",
        esperado: "requisitos.cta = false",
      })
    }
    return mudou ? { ...b, fields } : b
  })

  return { ...resultado(violacoes), blocks: out, omitidos }
}
