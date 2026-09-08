/**
 * A próxima call de uma loja: o que está AGENDADO × o que está PREVISTO.
 *
 * Hoje a carteira e a pipeline de calls do CS leem `next_feedback_date`, uma
 * data que o trigger calcula a partir da última call ("mês que vem"). Isso é
 * uma PREVISÃO, e a tela a mostra com a mesma cara de um compromisso marcado —
 * a etapa 2 da pipeline chega a se chamar "Aguardando (presumido enviado
 * convite)". Ninguém sabe, olhando, se o cliente foi convidado.
 *
 * Este módulo separa as duas coisas e é explícito sobre qual é qual. A regra
 * que não pode ser quebrada: **previsão nunca é apresentada como agendamento,
 * e a falta de reunião nunca esvazia a tela**. Se não há reunião, a previsão
 * continua aparecendo — marcada como previsão. Trocar uma pela outra às cegas
 * faria a carteira ficar vazia no dia em que isto subisse, porque hoje
 * nenhuma reunião tem loja vinculada.
 */

export type OrigemDaCall = "agendada" | "prevista" | "nenhuma"

export interface ReuniaoDaLoja {
  id: string
  scheduled_at: string
  status: string
  title?: string | null
  /** Alguém do lado do cliente foi convidado? É o que a pipeline presumia. */
  tem_convidado_do_cliente?: boolean
}

export interface ProximaCall {
  origem: OrigemDaCall
  /** ISO. null quando não há nem reunião nem previsão. */
  quando: string | null
  meetingId?: string
  titulo?: string | null
  /**
   * Só faz sentido em origem 'agendada': a reunião existe mas ninguém do
   * cliente está convidado. É o furo silencioso que a fase 1 conserta na
   * criação — aqui ele fica visível para o que já existe.
   */
  semConvidadoDoCliente?: boolean
}

/** Status que contam como compromisso de pé. */
const ATIVOS = new Set(["scheduled", "confirmed", "rescheduled"])

function ehFutura(iso: string, agora: Date): boolean {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= agora.getTime()
}

/**
 * Decide o que a tela mostra como "próxima call".
 *
 * Precedência: reunião agendada futura > previsão > nada. A reunião vence
 * porque é um fato (existe evento, existe convite); a previsão é uma conta.
 * Entre duas reuniões futuras vence a MAIS PRÓXIMA — é a próxima, não a
 * última marcada.
 */
export function resolverProximaCall(params: {
  reunioes?: ReuniaoDaLoja[]
  nextFeedbackDate?: string | null
  agora?: Date
}): ProximaCall {
  const agora = params.agora ?? new Date()

  const candidatas = (params.reunioes ?? [])
    .filter((r) => ATIVOS.has(r.status) && ehFutura(r.scheduled_at, agora))
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    )

  const proxima = candidatas[0]
  if (proxima) {
    return {
      origem: "agendada",
      quando: proxima.scheduled_at,
      meetingId: proxima.id,
      titulo: proxima.title ?? null,
      semConvidadoDoCliente: proxima.tem_convidado_do_cliente === false,
    }
  }

  // Previsão vencida não é "próxima call" — é atraso, e chamá-la de próxima
  // esconderia exatamente a loja que precisa de atenção.
  const previsto = params.nextFeedbackDate
  if (previsto && ehFutura(previsto, agora)) {
    return { origem: "prevista", quando: previsto }
  }

  return { origem: "nenhuma", quando: null }
}

/**
 * Rótulo curto para a tela. A palavra carrega a diferença: "Agendada" é um
 * compromisso com convite; "Prevista" é uma conta a partir da cadência.
 */
export function rotuloDaProximaCall(call: ProximaCall): string {
  switch (call.origem) {
    case "agendada":
      return "Agendada"
    case "prevista":
      return "Prevista pela cadência"
    default:
      return "Sem call marcada"
  }
}

/**
 * A loja precisa de ação de agendamento?
 *
 * Sim quando não há reunião de verdade — inclusive quando existe previsão,
 * porque previsão não avisa ninguém. É o gatilho do botão "Agendar call".
 */
export function precisaAgendar(call: ProximaCall): boolean {
  return call.origem !== "agendada"
}

/**
 * Contagem para o topo da carteira.
 *
 * `presumidas` é o número que justifica esta feature existir: lojas que a
 * tela dizia ter próxima call e que, na verdade, não têm reunião nenhuma
 * marcada com ninguém.
 */
export function resumirCarteira(
  calls: ProximaCall[],
): { agendadas: number; presumidas: number; sem_call: number } {
  return {
    agendadas: calls.filter((c) => c.origem === "agendada").length,
    presumidas: calls.filter((c) => c.origem === "prevista").length,
    sem_call: calls.filter((c) => c.origem === "nenhuma").length,
  }
}
