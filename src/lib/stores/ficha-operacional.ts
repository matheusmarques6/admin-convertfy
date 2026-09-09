/**
 * Ficha operacional da loja — módulo PURO (client-safe).
 *
 * O que é: os fatos VERIFICADOS que fazem um e-mail parecer autêntico
 * (incentivo ativo e código, política de troca, prazo de envio, garantia,
 * nº de reviews e nota, pagamento/checkout, canal de suporte). Toda
 * referência do Figma tem esses fatos porque o cliente os forneceu.
 *
 * Por que existe (batch 644d86c5, 08/09): o Seletor proibiu 17 coisas —
 * quase todas "não afirmar X, não encontrado na pesquisa" — e o
 * tratamento pedia justamente X. A cadeia inteira foi forçada à
 * profundidade `afirmacao`, os selos saíram vazios e a hero inventou uma
 * oferta. É lacuna de DADO, não de prompt.
 *
 * Como entra: o Catalogador recebe a ficha como `<ficha_operacional_verificada>`
 * e, depois do modelo, `aplicarFichaAoCatalogo` carimba
 * `lastro_operacional.verificado=true` nas afirmações que a ficha cobre e
 * sobrescreve `incentivo` (a ficha VENCE o modelo — o humano confirmou).
 * A rota de contexto aplica o mesmo carimbo ao catálogo existente ao salvar,
 * sem esperar o Catalogador rodar de novo.
 */

import type { CatalogoDeObjecoes, Incentivo, ObjecaoCatalogada } from "@/lib/agents/objecoes/vocabulario"

export interface FichaIncentivo {
  existe: boolean
  codigo?: string | null
  valor?: string | null
  condicoes?: string | null
  validade?: string | null
}

export interface FichaOperacional {
  incentivo?: FichaIncentivo | null
  troca?: { prazo_dias?: number | null; texto?: string | null } | null
  envio?: { prazo?: string | null; frete_gratis_acima?: string | null; texto?: string | null } | null
  garantia?: { texto?: string | null } | null
  prova?: { n_reviews?: number | null; nota?: number | null; fonte?: string | null } | null
  pagamento?: { metodos?: string[] | null; checkout?: string | null } | null
  suporte?: { canal?: string | null; horario?: string | null } | null
  atualizado_em?: string | null
  atualizado_por?: string | null
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Normaliza qualquer forma gravada. Fail-open: lixo vira null; nunca lança. */
export function normalizarFicha(raw: unknown): FichaOperacional | null {
  const r = obj(raw)
  if (!r) return null
  const inc = obj(r.incentivo)
  const troca = obj(r.troca)
  const envio = obj(r.envio)
  const garantia = obj(r.garantia)
  const prova = obj(r.prova)
  const pagamento = obj(r.pagamento)
  const suporte = obj(r.suporte)
  const out: FichaOperacional = {
    incentivo:
      inc && typeof inc.existe === "boolean"
        ? { existe: inc.existe, codigo: str(inc.codigo), valor: str(inc.valor), condicoes: str(inc.condicoes), validade: str(inc.validade) }
        : null,
    troca: troca ? { prazo_dias: num(troca.prazo_dias), texto: str(troca.texto) } : null,
    envio: envio ? { prazo: str(envio.prazo), frete_gratis_acima: str(envio.frete_gratis_acima), texto: str(envio.texto) } : null,
    garantia: garantia ? { texto: str(garantia.texto) } : null,
    prova: prova ? { n_reviews: num(prova.n_reviews), nota: num(prova.nota), fonte: str(prova.fonte) } : null,
    pagamento: pagamento
      ? { metodos: Array.isArray(pagamento.metodos) ? pagamento.metodos.map(str).filter((x): x is string => !!x) : null, checkout: str(pagamento.checkout) }
      : null,
    suporte: suporte ? { canal: str(suporte.canal), horario: str(suporte.horario) } : null,
    atualizado_em: str(r.atualizado_em),
    atualizado_por: str(r.atualizado_por),
  }
  return fichaVazia(out) ? null : out
}

/** Nenhum campo com valor. */
export function fichaVazia(f: FichaOperacional | null | undefined): boolean {
  if (!f) return true
  return (
    !f.incentivo &&
    !(f.troca && (f.troca.prazo_dias != null || f.troca.texto)) &&
    !(f.envio && (f.envio.prazo || f.envio.frete_gratis_acima || f.envio.texto)) &&
    !f.garantia?.texto &&
    !(f.prova && (f.prova.n_reviews != null || f.prova.nota != null)) &&
    !(f.pagamento && (f.pagamento.metodos?.length || f.pagamento.checkout)) &&
    !(f.suporte && (f.suporte.canal || f.suporte.horario))
  )
}

/**
 * Pré-preenchimento a partir do que a loja JÁ tem (migration 20260520):
 * `frete_prazo`, `frete_gratis_acima_cents`, `devolucao_politica`. É
 * sugestão — quem salva confirma.
 */
export function fichaSugeridaDaLoja(store: {
  frete_prazo?: string | null
  frete_gratis_acima_cents?: number | null
  devolucao_politica?: string | null
}): FichaOperacional | null {
  const out: FichaOperacional = {
    envio:
      store.frete_prazo || store.frete_gratis_acima_cents
        ? {
            prazo: str(store.frete_prazo),
            frete_gratis_acima:
              typeof store.frete_gratis_acima_cents === "number" && store.frete_gratis_acima_cents > 0
                ? (store.frete_gratis_acima_cents / 100).toFixed(2)
                : null,
            texto: null,
          }
        : null,
    troca: store.devolucao_politica ? { prazo_dias: null, texto: str(store.devolucao_politica) } : null,
  }
  return fichaVazia(out) ? null : out
}

/** Bloco `<ficha_operacional_verificada>` do Catalogador. Ausência declarada. */
export function fichaParaPrompt(f: FichaOperacional | null | undefined): string {
  if (!f || fichaVazia(f)) return "(sem ficha operacional — nada verificado pelo time; política, prazo, garantia e incentivo só entram se estiverem literalmente na pesquisa)"
  const l: string[] = []
  if (f.incentivo) {
    l.push(
      f.incentivo.existe
        ? `- incentivo ATIVO (verificado): ${[f.incentivo.valor, f.incentivo.codigo ? `código ${f.incentivo.codigo}` : null, f.incentivo.condicoes, f.incentivo.validade ? `até ${f.incentivo.validade}` : null].filter(Boolean).join(" · ")}`
        : "- incentivo: NÃO há incentivo ativo (verificado pelo time)",
    )
  }
  if (f.troca && (f.troca.prazo_dias != null || f.troca.texto)) l.push(`- troca/devolução (verificado): ${[f.troca.prazo_dias != null ? `${f.troca.prazo_dias} dias` : null, f.troca.texto].filter(Boolean).join(" — ")}`)
  if (f.envio && (f.envio.prazo || f.envio.frete_gratis_acima || f.envio.texto)) l.push(`- envio (verificado): ${[f.envio.prazo ? `prazo ${f.envio.prazo}` : null, f.envio.frete_gratis_acima ? `frete grátis acima de ${f.envio.frete_gratis_acima}` : null, f.envio.texto].filter(Boolean).join(" — ")}`)
  if (f.garantia?.texto) l.push(`- garantia (verificado): ${f.garantia.texto}`)
  if (f.prova && (f.prova.n_reviews != null || f.prova.nota != null)) l.push(`- prova (verificado): ${[f.prova.n_reviews != null ? `${f.prova.n_reviews} avaliações` : null, f.prova.nota != null ? `nota ${f.prova.nota}` : null, f.prova.fonte].filter(Boolean).join(" · ")}`)
  if (f.pagamento && (f.pagamento.metodos?.length || f.pagamento.checkout)) l.push(`- pagamento (verificado): ${[f.pagamento.metodos?.join(", "), f.pagamento.checkout ? `checkout ${f.pagamento.checkout}` : null].filter(Boolean).join(" · ")}`)
  if (f.suporte && (f.suporte.canal || f.suporte.horario)) l.push(`- suporte (verificado): ${[f.suporte.canal, f.suporte.horario].filter(Boolean).join(" · ")}`)
  return l.join("\n")
}

/** Família da ficha que uma afirmação de lastro cobre — ou null. */
const FAMILIAS: Array<{ campo: keyof FichaOperacional; re: RegExp; tem: (f: FichaOperacional) => boolean }> = [
  { campo: "troca", re: /\b(devolu|troca|return|refund|exchange)/i, tem: (f) => !!(f.troca && (f.troca.prazo_dias != null || f.troca.texto)) },
  { campo: "envio", re: /\b(prazo|entrega|frete|shipping|delivery|envio|despach)/i, tem: (f) => !!(f.envio && (f.envio.prazo || f.envio.frete_gratis_acima || f.envio.texto)) },
  { campo: "garantia", re: /\b(garantia|warranty|guarantee)/i, tem: (f) => !!f.garantia?.texto },
  { campo: "prova", re: /\b(avalia|review|nota|rating|estrela|star|depoimento)/i, tem: (f) => !!(f.prova && (f.prova.n_reviews != null || f.prova.nota != null)) },
  { campo: "pagamento", re: /\b(pagamento|payment|checkout|cart[aã]o|pix|parcel|secure|seguro)/i, tem: (f) => !!(f.pagamento && (f.pagamento.metodos?.length || f.pagamento.checkout)) },
  { campo: "suporte", re: /\b(suporte|support|atendimento|whatsapp|sac|contato)\b/i, tem: (f) => !!(f.suporte && (f.suporte.canal || f.suporte.horario)) },
]

export function familiaDaAfirmacao(afirmacao: string, ficha: FichaOperacional): keyof FichaOperacional | null {
  for (const fam of FAMILIAS) if (fam.re.test(afirmacao) && fam.tem(ficha)) return fam.campo
  return null
}

/**
 * Aplica a ficha ao catálogo: `incentivo` da ficha VENCE o do modelo
 * (existe true/false explícito, código/valor), e toda objeção cuja
 * afirmação de lastro é coberta por um campo preenchido ganha
 * `verificado: true` + `campo_de_origem: ficha_operacional.<campo>`.
 * Devolve um NOVO catálogo e o que mudou. Puro.
 */
export function aplicarFichaAoCatalogo(
  c: CatalogoDeObjecoes,
  ficha: FichaOperacional | null | undefined,
): { catalogo: CatalogoDeObjecoes; verificadas: string[]; incentivo_sobrescrito: boolean } {
  if (!ficha || fichaVazia(ficha)) return { catalogo: c, verificadas: [], incentivo_sobrescrito: false }
  const verificadas: string[] = []
  const objecoes: ObjecaoCatalogada[] = c.objecoes.map((o) => {
    const fam = familiaDaAfirmacao(o.lastro_operacional?.afirmacao ?? "", ficha)
    if (!fam) return o
    verificadas.push(o.id)
    return {
      ...o,
      lastro_operacional: { ...o.lastro_operacional, verificado: true, campo_de_origem: `ficha_operacional.${fam}` },
    }
  })
  let incentivo: Incentivo = c.incentivo
  let incentivoSobrescrito = false
  if (ficha.incentivo) {
    incentivoSobrescrito = true
    incentivo = {
      existe: ficha.incentivo.existe,
      valor: ficha.incentivo.valor ?? null,
      codigo: ficha.incentivo.codigo ?? null,
      condicoes: ficha.incentivo.condicoes ?? null,
      prazo: ficha.incentivo.validade ?? null,
      campo_de_origem: "ficha_operacional.incentivo",
      alerta: null,
    }
  }
  return { catalogo: { ...c, objecoes, incentivo }, verificadas, incentivo_sobrescrito: incentivoSobrescrito }
}
