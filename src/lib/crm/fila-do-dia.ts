/**
 * "Fila de hoje": o que abordar, na ordem, sem escolher no olho.
 *
 * O kanban mostra 431 cards em sete colunas; a pergunta do operador às
 * 9h é outra — "quem eu chamo agora?". A fila responde isso e tem um
 * teto por dia, porque o limite real é o número de WhatsApp, não a
 * vontade: 40 conversas novas por número.
 *
 * Puro porque a ORDEM é a decisão. Mandar o D antes do A gasta o dia
 * com quem nunca conversou, e passar do teto derruba o número.
 */

import { SEGMENTOS, motivoDeBloqueio, sinaisDoNegocio } from "./prospeccao"
import { diaEmSaoPaulo } from "./sla-prospeccao"
import { proximoToque, type Toque } from "./cadencia"

/** Conversas novas por dia, por número de WhatsApp. */
export const TETO_DIARIO_PADRAO = 40

export interface NegocioDaFila {
  id: string
  title: string
  stage_name: string
  position: number
  /** `deals.status`. A rota já filtra `open`, mas a nutrição TAMBÉM é
   * `open` — quem a tira da fila é o nome da etapa. */
  status?: string | null
  custom_fields?: Record<string, unknown> | null
  tags?: string[] | null
  contact_phone?: string | null
  /** Tarefa aberta e vencida (ou pra hoje) deste negócio. */
  tarefa?: { id: string; content: string; due_at: string | null } | null
}

export interface ItemDaFila {
  dealId: string
  titulo: string
  etapa: string
  segmento: string | null
  segmentoCurto: string | null
  prioridade: string | null
  angulo: string | null
  tentativas: number
  proximoToque: Toque | null
  telefone: string | null
  alerta: string | null
  /** Tags do negócio: é com elas que o botão da tela aplica a MESMA
   * régua de bloqueio que o servidor. */
  tags: string[]
  tarefa: { id: string; content: string; due_at: string | null } | null
}

export interface FilaDoDia {
  /** Follow-up vencido ou tarefa do dia: vem ANTES de abrir conversa nova. */
  pendentes: ItemDaFila[]
  /** Abordagens novas, até o teto. */
  novos: ItemDaFila[]
  /** Quantos ficaram de fora do teto — o número que diz se a fila anda. */
  aguardandoVez: number
  excluidos: {
    aguardando_parceiro: number
    nao_contatar: number
    fora_da_cadencia: number
    sem_telefone: number
    cadencia_concluida: number
    /** Já abordado, com a checagem marcada para depois de hoje. */
    aguardando_resposta: number
  }
}

/** Posição do segmento na ordem de ataque. Desconhecido vai pro fim. */
function ordemDoSegmento(segmento: string | null): number {
  if (!segmento) return SEGMENTOS.length
  const i = SEGMENTOS.indexOf(segmento as (typeof SEGMENTOS)[number])
  return i >= 0 ? i : SEGMENTOS.length
}

function paraItem(n: NegocioDaFila): ItemDaFila {
  const s = sinaisDoNegocio(n.custom_fields)
  return {
    dealId: n.id,
    titulo: n.title,
    etapa: n.stage_name,
    segmento: s.segmento,
    segmentoCurto: s.segmentoCurto,
    prioridade: s.prioridade,
    angulo: s.angulo,
    tentativas: s.tentativas,
    proximoToque: proximoToque(s.tentativas),
    telefone: n.contact_phone ?? null,
    alerta: s.alerta,
    tags: n.tags ?? [],
    tarefa: n.tarefa ?? null,
  }
}

/**
 * Monta a fila.
 *
 * Duas listas, e a ordem entre elas importa: quem já foi abordado e
 * está vencido vem ANTES de abrir conversa nova. Um lead que recebeu o
 * T1 e ficou sem o T2 é dinheiro na mesa; um lead que nunca ouviu
 * falar da gente é só mais um.
 *
 * O teto vale só sobre as NOVAS: o follow-up de quem já está na
 * conversa não abre janela nova com o WhatsApp, e cortá-lo pelo teto
 * faria a cadência morrer na metade todo dia.
 */
/**
 * A tarefa está vencendo HOJE (ou antes)?
 *
 * Todo toque agenda "Checar resposta do T1" para daqui a 48h. Tratar
 * qualquer tarefa aberta como pendente põe na lista, no mesmo instante
 * do envio, os 40 leads abordados hoje — e o follow-up que venceu de
 * verdade há três dias se perde no meio. Tarefa SEM prazo conta como
 * vencida: quem a criou à mão queria que fosse feita.
 */
export function tarefaVenceHoje(dueAt: string | null | undefined, agora: Date): boolean {
  if (!dueAt) return true
  const dia = dueAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return true
  return dia <= diaEmSaoPaulo(agora)
}

export function montarFilaDoDia(
  negocios: NegocioDaFila[],
  opts?: { teto?: number; agora?: Date },
): FilaDoDia {
  const teto = Math.max(0, opts?.teto ?? TETO_DIARIO_PADRAO)
  const agora = opts?.agora ?? new Date()
  const pendentes: ItemDaFila[] = []
  const candidatosNovos: Array<{ item: ItemDaFila; ordem: number; position: number }> = []
  const excluidos: FilaDoDia["excluidos"] = {
    aguardando_parceiro: 0,
    nao_contatar: 0,
    fora_da_cadencia: 0,
    sem_telefone: 0,
    cadencia_concluida: 0,
    aguardando_resposta: 0,
  }

  for (const n of negocios) {
    // A MESMA régua do botão (`motivoDeBloqueio`), não uma cópia: três
    // checagens escritas à mão aqui divergiriam da que decide se o
    // toque sai, e a fila ofereceria quem o servidor recusa — ou, pior,
    // esconderia quem ele aceita.
    const bloqueio = motivoDeBloqueio({
      etapa: n.stage_name,
      tags: n.tags,
      telefone: n.contact_phone,
      status: n.status,
    })
    if (bloqueio) {
      excluidos[bloqueio]++
      continue
    }

    const item = paraItem(n)

    // Pendente é quem já entrou na cadência e está DEVENDO: o job de
    // SLA marcou, ou existe tarefa que já venceu.
    const s = sinaisDoNegocio(n.custom_fields)
    if (s.followupVencido || (n.tarefa && tarefaVenceHoje(n.tarefa.due_at, agora))) {
      pendentes.push(item)
      continue
    }

    // Tarefa marcada para depois: o lead está no meio da cadência e a
    // checagem tem data. Não é pendente (não venceu) nem abordagem nova
    // (o T2 é D+2, e mandá-lo hoje atropelaria o T1 de agora).
    if (n.tarefa) {
      excluidos.aguardando_resposta++
      continue
    }

    if (!item.proximoToque) {
      excluidos.cadencia_concluida++
      continue
    }
    candidatosNovos.push({
      item,
      ordem: ordemDoSegmento(item.segmento),
      position: n.position,
    })
  }

  // A → B → C → D, depois pela posição no board (que é como o operador
  // reordena a fila à mão). `id` desempata pra ordem ser estável entre
  // recarregamentos.
  candidatosNovos.sort(
    (a, b) =>
      a.ordem - b.ordem ||
      a.position - b.position ||
      a.item.dealId.localeCompare(b.item.dealId),
  )

  // Pendente mais antigo primeiro: a tarefa vencida há três dias é a
  // que dói.
  pendentes.sort((a, b) => {
    const da = a.tarefa?.due_at ?? ""
    const db = b.tarefa?.due_at ?? ""
    if (da && db) return da.localeCompare(db)
    if (da) return -1
    if (db) return 1
    return a.dealId.localeCompare(b.dealId)
  })

  return {
    pendentes,
    novos: candidatosNovos.slice(0, teto).map((c) => c.item),
    aguardandoVez: Math.max(0, candidatosNovos.length - teto),
    excluidos,
  }
}
