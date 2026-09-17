/**
 * Regras de coluna da prospecção ativa: o que a etapa exige pra SAIR e
 * o que ela dispara ao ENTRAR.
 *
 * `pipeline_stages.required_fields` já cobre o que a etapa exige pra
 * ENTRAR, e continua sendo o lugar certo pra isso — é configuração, não
 * código. Aqui mora só o que aquele mecanismo não expressa: condição de
 * SAÍDA, destino permitido conforme a resposta, confirmação humana e os
 * efeitos de ganho/perda.
 *
 * Duas famílias de regra, e a diferença importa:
 *
 * - **Estruturais** (`stage_type` won/lost): valem em QUALQUER pipeline
 *   e não quebram se alguém renomear a coluna.
 * - **Por NOME de etapa**: valem só onde a coluna existe com aquele
 *   nome exato. Renomear desliga a regra em silêncio — por isso
 *   `regrasSemEtapa()` existe, pra tela poder mostrar a lacuna em vez
 *   de a operação descobrir na hora de perder um lead.
 */

import { normalizeForCompare } from "@/lib/tracking/normalizar-comparacao"

/** Coluna em que o lead está travado em negociação com o parceiro. */
export const ETAPA_AGUARDANDO = "Aguardando liberação Luan"
/** Coluna em que o lead respondeu e falta dizer o estágio da loja. */
export const ETAPA_QUALIFICAR = "Respondeu · qualificar"
/** Coluna de nutrição de quem ainda não vende. */
export const ETAPA_NUTRIR = "Nutrir · loja sem vendas"
/** Coluna da call de 20 min. */
export const ETAPA_DIAGNOSTICO = "Diagnóstico agendado"

/** Etapas que as regras por NOME governam. */
export const ETAPAS_COM_REGRA = [
  ETAPA_AGUARDANDO,
  ETAPA_QUALIFICAR,
] as const

/** Campo que diz em que pé está a loja do lead. */
export const CAMPO_MATURIDADE = "maturidade_loja"
/** O único valor de maturidade que libera a venda agora. */
export const MATURIDADE_VENDENDO = "Vendendo"

/** Motivo que, escolhido, marca o lead como fora de alcance pra sempre. */
export const MOTIVO_NAO_CONTATAR = "Pediu para não ser contatado"
export const TAG_NAO_CONTATAR = "nao-contatar"

export interface EtapaDaRegra {
  name: string
  stage_type: string | null
}

export interface ContextoDaMudanca {
  etapaAtual: EtapaDaRegra | null
  etapaDestino: EtapaDaRegra
  custom_fields?: Record<string, unknown> | null
  /** Motivo de perda informado no corpo do move. */
  lostReason?: string | null
  /** Motivos cadastrados em `crm_lost_reasons` da org. */
  motivosValidos?: string[]
  /**
   * Resposta a uma pergunta de saída, quando a tela já perguntou.
   * Chave = `codigo` da pergunta.
   */
  confirmacoes?: Record<string, string | boolean | null | undefined>
}

export interface Impedimento {
  codigo: string
  mensagem: string
}

/** Pergunta que a tela faz ANTES de deixar o card sair da coluna. */
export interface PerguntaDeSaida {
  codigo: string
  pergunta: string
  /** Quando true, a resposta vira uma nota na timeline. */
  viraNota: boolean
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

/**
 * Qual motivo da lista este texto de perda representa. `null` = nenhum.
 *
 * `deals.lost_reason` é TEXT livre de propósito (histórico nunca
 * corrompe), e o diálogo de perda grava `"Motivo — comentário"`. Comparar
 * a string INTEIRA recusaria toda perda comentada; por isso o casamento
 * é por PREFIXO, e o mais longo vence — senão "Preço" engoliria um
 * "Preço do concorrente" que existisse na lista.
 */
export function motivoCanonico(
  lostReason: string | null | undefined,
  motivosValidos: string[],
): string | null {
  const alvo = normalizeForCompare(texto(lostReason))
  if (!alvo) return null
  let melhor: string | null = null
  for (const m of motivosValidos) {
    const n = normalizeForCompare(m)
    if (!n) continue
    // Igual, ou o texto começa com o motivo e o que vem depois é
    // separador/comentário — nunca o meio de outra palavra.
    const casa = alvo === n || (alvo.startsWith(n) && /^[\s\-—–:,.]/.test(alvo.slice(n.length)))
    if (casa && (melhor == null || n.length > normalizeForCompare(melhor).length)) {
      melhor = m
    }
  }
  return melhor
}

/**
 * Perguntas que a etapa ATUAL faz antes de liberar a saída.
 *
 * Hoje só "Aguardando liberação Luan": tirar o card de lá sem o parceiro
 * ter liberado é abordar quem ele está negociando, e o custo disso é a
 * relação com ele, não um lead.
 */
export function perguntasDeSaida(ctx: ContextoDaMudanca): PerguntaDeSaida[] {
  const atual = ctx.etapaAtual?.name ?? null
  if (atual !== ETAPA_AGUARDANDO) return []
  // Voltar pra própria coluna não é saída.
  if (ctx.etapaDestino.name === ETAPA_AGUARDANDO) return []
  return [
    {
      codigo: "luan_liberou",
      pergunta: "O Luan liberou este lead?",
      viraNota: true,
    },
  ]
}

/**
 * O que impede a mudança agora. Lista vazia = pode mover.
 *
 * Cada item é um BLOQUEIO, não um conselho: a sugestão de mandar pra
 * "Nutrir" quem não vende sai por `sugestoes()`, porque um vendedor que
 * quer mesmo levar o card pra outro lugar tem de conseguir — travar
 * isso o faria arrastar o card pra qualquer coluna só pra escapar.
 */
export function impedimentosDaMudanca(ctx: ContextoDaMudanca): Impedimento[] {
  const out: Impedimento[] = []
  const atual = ctx.etapaAtual?.name ?? null
  const destino = ctx.etapaDestino
  const custom = ctx.custom_fields ?? {}

  // ── Estrutural: perder exige motivo, e da lista da org ────────────
  if (destino.stage_type === "lost") {
    const motivo = texto(ctx.lostReason)
    if (!motivo) {
      out.push({
        codigo: "lost_reason_ausente",
        mensagem: `Para mover para "${destino.name}", informe o motivo da perda.`,
      })
    } else if (ctx.motivosValidos?.length) {
      // Compara normalizado e por prefixo: quem digita erra acento e
      // caixa, e o diálogo de perda grava "Motivo — comentário".
      if (!motivoCanonico(motivo, ctx.motivosValidos)) {
        out.push({
          codigo: "lost_reason_desconhecido",
          mensagem: `"${motivo}" não está na lista de motivos de perda da organização.`,
        })
      }
    }
  }

  // ── Por nome: sair de "Respondeu · qualificar" ────────────────────
  if (atual === ETAPA_QUALIFICAR && destino.name !== ETAPA_QUALIFICAR) {
    if (!texto(custom[CAMPO_MATURIDADE])) {
      out.push({
        codigo: "maturidade_ausente",
        mensagem:
          'Preencha "Maturidade da loja" antes de tirar o card de "Respondeu · qualificar" — é ela que decide se o lead vira diagnóstico ou nutrição.',
      })
    }
  }

  // ── Por nome: sair de "Aguardando liberação Luan" ─────────────────
  for (const p of perguntasDeSaida(ctx)) {
    const r = ctx.confirmacoes?.[p.codigo]
    const respondeu = typeof r === "string" ? r.trim().length > 0 : r === true
    if (!respondeu) {
      out.push({ codigo: `confirmacao:${p.codigo}`, mensagem: p.pergunta })
    }
  }

  return out
}

export interface Sugestao {
  codigo: string
  mensagem: string
}

/**
 * Conselho, nunca bloqueio. Quem não vende agora não vira venda em
 * novembro; mandar o card pra "Nutrir" é o certo — mas é decisão do
 * vendedor, que pode ter ouvido algo que o campo não captura.
 */
export function sugestoes(ctx: ContextoDaMudanca): Sugestao[] {
  const out: Sugestao[] = []
  const atual = ctx.etapaAtual?.name ?? null
  const destino = ctx.etapaDestino
  const maturidade = texto((ctx.custom_fields ?? {})[CAMPO_MATURIDADE])

  if (atual !== ETAPA_QUALIFICAR || !maturidade) return out
  if (destino.name === ETAPA_QUALIFICAR) return out

  const vendendo = normalizeForCompare(maturidade) === normalizeForCompare(MATURIDADE_VENDENDO)
  const terminal = destino.stage_type === "won" || destino.stage_type === "lost"

  if (vendendo) {
    // Loja vendendo é o lead que a Black Friday quer. Mandá-lo pra
    // nutrição é jogar fora o único perfil com fit.
    if (destino.name === ETAPA_NUTRIR) {
      out.push({
        codigo: "vendendo_para_nutrir",
        mensagem:
          'A loja está vendendo — "Nutrir" adia o único perfil com fit para a Black Friday. Diagnóstico agendado costuma ser o destino.',
      })
    } else if (destino.name !== ETAPA_DIAGNOSTICO && !terminal) {
      out.push({
        codigo: "vendendo_sem_diagnostico",
        mensagem: `A loja está vendendo: o passo natural é "${ETAPA_DIAGNOSTICO}".`,
      })
    }
  } else if (destino.name !== ETAPA_NUTRIR && !terminal) {
    out.push({
      codigo: "sem_vendas_para_nutrir",
      mensagem: `"${maturidade}" não tem fit agora — "${ETAPA_NUTRIR}" guarda o lead pra reabordar em janeiro.`,
    })
  }

  return out
}

/**
 * Tags que a mudança acrescenta. Hoje só a de não contatar, e ela é
 * permanente de propósito: o pedido da pessoa não expira com a
 * campanha, e é ela que bloqueia o botão de abordagem pra sempre.
 */
export function tagsAoMudar(ctx: ContextoDaMudanca): string[] {
  if (ctx.etapaDestino.stage_type !== "lost") return []
  const motivo = texto(ctx.lostReason)
  if (!motivo) return []
  // Mesma régua do bloqueio: "Pediu para não ser contatado — sumiu do
  // WhatsApp" tem de marcar a tag igual, senão o comentário do vendedor
  // desliga a proteção que a pessoa pediu.
  const canonico = motivoCanonico(motivo, [MOTIVO_NAO_CONTATAR])
  return canonico ? [TAG_NAO_CONTATAR] : []
}

/**
 * Regras por NOME que não têm etapa correspondente nesta pipeline.
 *
 * Renomear uma coluna desliga a regra dela sem erro nenhum — este é o
 * detector que torna isso visível na tela de configuração, em vez de
 * aparecer como "o card saiu sem pedir a maturidade".
 */
export function regrasSemEtapa(nomesDasEtapas: string[]): string[] {
  const existentes = new Set(nomesDasEtapas.map((n) => normalizeForCompare(n)))
  return ETAPAS_COM_REGRA.filter((n) => !existentes.has(normalizeForCompare(n)))
}
