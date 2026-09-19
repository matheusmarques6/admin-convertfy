/**
 * Contradição do Seletor vira PENDÊNCIA na ficha operacional (S3, 19/09) —
 * módulo PURO, client-safe.
 *
 * O Seletor já media a contradição ("o tratamento pede política de troca e
 * este toque proíbe afirmá-la — falta o dado na loja") e o alerta de dado
 * ("No support channel documented"), e os dois morriam na telemetria da
 * run: quem preenche a ficha nunca via. Aqui a contradição é traduzida no
 * CAMPO da ficha que a resolve, coalescida por (loja, campo) com frequência
 * — é a frequência que ordena o que preencher primeiro —, e o PATCH da
 * ficha a remove quando o campo ganha texto.
 *
 * Campo desconhecido NÃO vira pendência: pendência sem campo é ruído que
 * ninguém consegue fechar.
 */

export const CAMPOS_DA_FICHA = ["incentivo", "troca", "envio", "garantia", "prova", "pagamento", "suporte"] as const
export type CampoDaFicha = (typeof CAMPOS_DA_FICHA)[number]

export interface PendenciaDaFicha {
  campo: CampoDaFicha
  /** A frase que a originou (a mais recente). */
  motivo: string
  /** Quantas runs a pediram. */
  frequencia: number
  primeira_run: string | null
  ultima_run: string | null
  /** ISO da última vez que apareceu. */
  visto_em: string
  /** Flows em que apareceu (welcome, cart…). */
  flows: string[]
}

/**
 * O vocabulário que o `detectarContradicoes` escreve no `detalhe`
 * ("o tratamento pede <família>…") e o que os alertas do modelo dizem.
 * Ordem importa: a primeira família que casar vence — "prazo de devolução"
 * é troca, não envio, então `troca` vem antes de `envio`.
 */
const FAMILIAS: Array<{ campo: CampoDaFicha; re: RegExp }> = [
  { campo: "troca", re: /\b(devolu|troca|return|refund|exchange|política de troca)/i },
  // "delivery guarantee" é envio, não garantia do produto — o lookbehind
  // tira o caso; "warranty" nunca é envio.
  { campo: "garantia", re: /(?<!delivery |shipping )\b(garantia|warranty|guarantee)/i },
  { campo: "incentivo", re: /\b(cupom|coupon|desconto|discount|incentivo|promo code)\b/i },
  { campo: "prova", re: /\b(avalia|review|nota m[eé]dia|rating|estrela|star|depoimento|testimonial|authenticity|quality[- ]control)/i },
  { campo: "envio", re: /\b(prazo de entrega|entrega|frete|shipping|delivery|envio|fulfil+ment|tracking|carrier)/i },
  { campo: "pagamento", re: /\b(pagamento|payment|checkout|cart[aã]o|pix|parcel)/i },
  { campo: "suporte", re: /\b(suporte|support|atendimento|whatsapp|sac|response time)\b/i },
]

export function campoDaPendencia(texto: string): CampoDaFicha | null {
  for (const f of FAMILIAS) if (f.re.test(texto)) return f.campo
  return null
}

export interface EntradaDePendencia {
  texto: string
}

/**
 * Coalesce as pendências desta run com as já gravadas. Mesmo campo → uma
 * linha: frequência +1, `ultima_run`/`visto_em`/`motivo` atualizados,
 * flow adicionado. Campo novo → linha nova. Devolve `mudou` para o I/O
 * não gravar (e não acordar o realtime) quando nada mudou.
 */
export function mesclarPendencias(
  existentes: readonly PendenciaDaFicha[],
  novas: readonly EntradaDePendencia[],
  ctx: { runId: string | null; flow: string; agora: string },
): { pendencias: PendenciaDaFicha[]; mudou: boolean } {
  const porCampo = new Map<CampoDaFicha, PendenciaDaFicha>()
  for (const p of existentes) porCampo.set(p.campo, { ...p, flows: [...p.flows] })
  // Uma run pede cada campo UMA vez, mesmo que três frases apontem para ele.
  const camposDestaRun = new Map<CampoDaFicha, string>()
  for (const n of novas) {
    const campo = campoDaPendencia(n.texto)
    if (!campo || camposDestaRun.has(campo)) continue
    camposDestaRun.set(campo, n.texto.trim())
  }
  let mudou = false
  for (const [campo, motivo] of camposDestaRun) {
    const atual = porCampo.get(campo)
    if (atual) {
      if (atual.ultima_run && atual.ultima_run === ctx.runId) continue
      porCampo.set(campo, {
        ...atual,
        motivo,
        frequencia: atual.frequencia + 1,
        ultima_run: ctx.runId,
        visto_em: ctx.agora,
        flows: atual.flows.includes(ctx.flow) ? atual.flows : [...atual.flows, ctx.flow],
      })
    } else {
      porCampo.set(campo, {
        campo,
        motivo,
        frequencia: 1,
        primeira_run: ctx.runId,
        ultima_run: ctx.runId,
        visto_em: ctx.agora,
        flows: [ctx.flow],
      })
    }
    mudou = true
  }
  return { pendencias: [...porCampo.values()].sort((a, b) => b.frequencia - a.frequencia), mudou }
}

/** Normaliza o que veio do JSONB. Lixo some; nunca lança. */
export function normalizarPendencias(raw: unknown): PendenciaDaFicha[] {
  if (!Array.isArray(raw)) return []
  const out: PendenciaDaFicha[] = []
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const campo = (CAMPOS_DA_FICHA as readonly string[]).includes(String(o.campo)) ? (o.campo as CampoDaFicha) : null
    if (!campo) continue
    out.push({
      campo,
      motivo: typeof o.motivo === "string" ? o.motivo : "",
      frequencia: typeof o.frequencia === "number" && o.frequencia > 0 ? Math.floor(o.frequencia) : 1,
      primeira_run: typeof o.primeira_run === "string" ? o.primeira_run : null,
      ultima_run: typeof o.ultima_run === "string" ? o.ultima_run : null,
      visto_em: typeof o.visto_em === "string" ? o.visto_em : "",
      flows: Array.isArray(o.flows) ? o.flows.filter((f): f is string => typeof f === "string") : [],
    })
  }
  return out
}
