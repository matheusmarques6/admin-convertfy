/**
 * Job de SLA da prospecção ativa: decide o que fazer com quem não
 * respondeu.
 *
 * **A ETAPA é o sinal de resposta, não a caixa de entrada.** Medido em
 * 17/09: dos 431 negócios da lista, ZERO têm thread ligada, e só 2
 * casam por telefone com alguma conversa (pré-existentes, não respostas
 * à cadência). A abordagem sai por `wa.me` de um número dedicado que
 * não é canal conectado, então a resposta do lead nunca entra no nosso
 * banco. Quem move o card pra "Respondeu · qualificar" é o operador —
 * e é isso que o job lê.
 *
 * Puro porque cada regra decide em cima de tempo e muda a vida de um
 * lead: perder por engano manda pra "Perdido" quem respondeu ontem, e
 * não perder nunca entope a fila com quem sumiu há três semanas.
 */

import { ETAPA_DO_TOQUE, TOQUES, proximoToque, type Toque } from "./cadencia"
import {
  ETAPA_AGUARDANDO,
  ETAPA_PERDIDO_SEM_RESPOSTA,
  ETAPA_QUALIFICAR,
  TAG_NAO_CONTATAR,
  contarTentativas,
} from "./prospeccao"

// Fonte única dos nomes de coluna: `prospeccao.ts`. Re-exportados para
// os importadores deste módulo (a rota do cron) não mudarem de porta.
export { ETAPA_AGUARDANDO, ETAPA_PERDIDO_SEM_RESPOSTA, ETAPA_QUALIFICAR }

/** Motivo gravado nessa perda. Tem de existir em `crm_lost_reasons`. */
export const MOTIVO_SEM_RESPOSTA = "Sem resposta após 3 toques"

/** Horas que a qualificação pode ficar parada antes de virar tarefa. */
export const HORAS_ATE_COBRAR_QUALIFICACAO = 24

export interface NegocioParaSla {
  id: string
  title: string
  stage_name: string
  /** SLA da etapa em que o card está. Sem ele não há prazo a medir. */
  stage_sla_hours: number | null
  last_stage_changed_at: string | null
  custom_fields?: Record<string, unknown> | null
  tags?: string[] | null
  /** Já existe tarefa aberta deste job pra este negócio hoje? */
  tem_tarefa_aberta?: boolean
}

export type AcaoDeSla =
  | {
      tipo: "marcar_vencido"
      dealId: string
      titulo: string
      toqueAtual: Toque
      proximo: Toque
      horasParado: number
      chave: string
    }
  | {
      tipo: "perder"
      dealId: string
      titulo: string
      motivo: string
      horasParado: number
      chave: string
    }
  | {
      tipo: "cobrar_qualificacao"
      dealId: string
      titulo: string
      horasParado: number
      chave: string
    }

export interface ResumoDoSla {
  avaliados: number
  /** Ignorados e por quê — "0 ações" sem isto não distingue nada. */
  ignorados: {
    sem_prazo: number
    dentro_do_prazo: number
    nao_contatar: number
    fora_da_cadencia: number
    ja_tem_tarefa: number
  }
}

export interface PlanoDeSla {
  acoes: AcaoDeSla[]
  resumo: ResumoDoSla
}

/** Data no fuso de São Paulo, YYYY-MM-DD. É ela que chaveia o dia. */
export function diaEmSaoPaulo(agora: Date): string {
  // `sv-SE` dá ISO puro; o fuso é o que importa, porque um job às 8h
  // BRT perto da virada não pode gravar a chave do dia seguinte.
  return agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
}

/** Dia da semana em São Paulo. 1 = segunda. */
export function diaDaSemanaEmSaoPaulo(agora: Date): number {
  const nome = agora.toLocaleDateString("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  })
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome)
}

function horasParado(desde: string | null | undefined, agora: Date): number | null {
  if (!desde) return null
  const t = new Date(desde).getTime()
  if (!Number.isFinite(t)) return null
  return (agora.getTime() - t) / 3_600_000
}

/** Qual toque a etapa em que o card está representa. */
export function toqueDaEtapa(nome: string): Toque | null {
  return TOQUES.find((t) => ETAPA_DO_TOQUE[t] === nome) ?? null
}

/**
 * O que fazer com cada negócio.
 *
 * Três regras, e a assimetria entre elas é deliberada:
 *
 * - **T1/T2 vencidos**: marca `followup_vencido` e cria tarefa. NUNCA
 *   move sozinho — quem manda a mensagem é uma pessoa, e um card que
 *   anda sem ela ter mandado nada faz a cadência mentir.
 * - **T3 vencido**: move pra "Perdido · sem resposta". Aqui mover é o
 *   certo: os três toques saíram e a fila precisa esvaziar.
 * - **"Respondeu · qualificar" parado**: só tarefa. O lead RESPONDEU;
 *   perder quem respondeu por demora nossa é o pior desfecho possível.
 */
export function planejarSla(
  negocios: NegocioParaSla[],
  agora: Date,
  opts?: { horasAteCobrarQualificacao?: number },
): PlanoDeSla {
  const dia = diaEmSaoPaulo(agora)
  const limiteQualificacao =
    opts?.horasAteCobrarQualificacao ?? HORAS_ATE_COBRAR_QUALIFICACAO
  const acoes: AcaoDeSla[] = []
  const ignorados: ResumoDoSla["ignorados"] = {
    sem_prazo: 0,
    dentro_do_prazo: 0,
    nao_contatar: 0,
    fora_da_cadencia: 0,
    ja_tem_tarefa: 0,
  }

  for (const n of negocios) {
    const tags = (n.tags ?? []).map((t) => String(t).trim().toLowerCase())
    if (tags.includes(TAG_NAO_CONTATAR)) {
      ignorados.nao_contatar++
      continue
    }

    const horas = horasParado(n.last_stage_changed_at, agora)
    const toque = toqueDaEtapa(n.stage_name)
    const naQualificacao = n.stage_name === ETAPA_QUALIFICAR

    if (!toque && !naQualificacao) {
      ignorados.fora_da_cadencia++
      continue
    }

    // Sem carimbo de quando entrou, não há prazo a medir. Agir aqui
    // seria inventar atraso sobre dado que não existe.
    if (horas == null) {
      ignorados.sem_prazo++
      continue
    }

    if (naQualificacao) {
      if (horas < limiteQualificacao) {
        ignorados.dentro_do_prazo++
        continue
      }
      if (n.tem_tarefa_aberta) {
        ignorados.ja_tem_tarefa++
        continue
      }
      acoes.push({
        tipo: "cobrar_qualificacao",
        dealId: n.id,
        titulo: n.title,
        horasParado: Math.floor(horas),
        chave: `sla:qualificar:${n.id}:${dia}`,
      })
      continue
    }

    // `toque` é não-nulo aqui: quem não é toque nem qualificação já saiu
    // no primeiro filtro. O TS não enxerga isso através do `&&`.
    if (!toque) continue

    // Etapa de toque sem SLA cadastrado: mesma razão do carimbo.
    if (!n.stage_sla_hours) {
      ignorados.sem_prazo++
      continue
    }
    if (horas < n.stage_sla_hours) {
      ignorados.dentro_do_prazo++
      continue
    }

    if (toque === "T3") {
      acoes.push({
        tipo: "perder",
        dealId: n.id,
        titulo: n.title,
        motivo: MOTIVO_SEM_RESPOSTA,
        horasParado: Math.floor(horas),
        chave: `sla:perder:${n.id}:${dia}`,
      })
      continue
    }

    // O próximo toque sai das TENTATIVAS, não da etapa: card movido à
    // mão pode estar em T1 com dois toques já enviados, e mandar o T2
    // de novo repetiria a mesma mensagem pro lead.
    const proximo = proximoToque(contarTentativas(n.custom_fields?.tentativas_contato))
    if (!proximo) {
      ignorados.fora_da_cadencia++
      continue
    }
    if (n.tem_tarefa_aberta) {
      ignorados.ja_tem_tarefa++
      continue
    }
    acoes.push({
      tipo: "marcar_vencido",
      dealId: n.id,
      titulo: n.title,
      toqueAtual: toque,
      proximo,
      horasParado: Math.floor(horas),
      chave: `sla:vencido:${n.id}:${dia}`,
    })
  }

  return { acoes, resumo: { avaliados: negocios.length, ignorados } }
}

export interface TarefaSemanal {
  conteudo: string
  chave: string
}

/**
 * Lembrete semanal de revisar os travados com o parceiro. UMA tarefa
 * pra coluna inteira, não uma por lead: 23 tarefas iguais na segunda
 * ensinam o time a fechar tudo sem ler.
 *
 * `null` fora de segunda ou com a coluna vazia — tarefa de revisar
 * zero leads é ruído que faz ignorar a da semana que tem.
 */
export function tarefaSemanalDoParceiro(
  orgId: string,
  quantidade: number,
  agora: Date,
): TarefaSemanal | null {
  if (diaDaSemanaEmSaoPaulo(agora) !== 1) return null
  if (quantidade <= 0) return null
  const dia = diaEmSaoPaulo(agora)
  return {
    conteudo: `Revisar liberação com o Luan (${quantidade} lead${quantidade > 1 ? "s" : ""})`,
    chave: `sla:revisar-parceiro:${orgId}:${dia}`,
  }
}
