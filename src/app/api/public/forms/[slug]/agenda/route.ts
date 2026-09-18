/**
 * A agenda pública do formulário.
 *
 * `GET`  — os horários livres.
 * `POST` — marca (ou remarca) a call da sessão.
 *
 * Quem decide QUALQUER coisa aqui é o servidor. O corpo traz só o par
 * sessão+token — o mesmo que o submit já confere — e o instante
 * escolhido; lead, negócio, organizador e duração saem do banco. Aceitar
 * `deal_id` ou `duracao` do browser deixaria alguém pendurar uma call de
 * três horas no negócio de outra pessoa.
 *
 * O `GET` não exige token de propósito: ele não revela nada além de
 * "estes horários estão livres" — é o que qualquer página de
 * agendamento mostra antes de saber quem é você. O que ele NÃO faz é ler
 * evento nenhum do Google (`freeBusy` devolve só início e fim), então
 * título, convidado e descrição da agenda não passam por esta rota.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { verificarTokenSessao } from "@/lib/forms/session-token"
import {
  agendarDaSessao,
  carregarAgenda,
  horariosDisponiveis,
  type FalhaDoAgendamento,
} from "@/lib/services/agendamento-publico.service"

const log = logger.child("FormAgenda")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params
    const limite = await checkRateLimit(request, `form-agenda:${slug}`, {
      limit: 60,
      windowSeconds: 60,
    })
    if (limite) return limite

    const agenda = await carregarAgenda(slug)
    // 200 com `disponivel: false`, e não 404: a tela final decide entre
    // mostrar o seletor e mostrar o texto de sempre, e um 404 a faria
    // exibir "algo deu errado" num formulário que está certo.
    if (!agenda) return successResponse(request, { disponivel: false })

    const horarios = await horariosDisponiveis(agenda)
    return successResponse(request, { disponivel: true, ...horarios })
  } catch (error) {
    return errorResponse(request, error, "form-agenda-get")
  }
}

const entradaSchema = z.object({
  session_id: z.string().uuid(),
  token: z.string().max(300),
  /** Início do slot, ISO em UTC — exatamente como o GET o devolveu. */
  inicio: z.string().min(10).max(40),
})

/** O que dizer a quem clicou, por motivo. */
const MOTIVO: Record<FalhaDoAgendamento, string> = {
  sessao_invalida: "Não consegui identificar a sua aplicação. Recarregue a página e tente de novo.",
  final_sem_agenda: "Esta aplicação não tem agenda para marcar.",
  fora_da_grade: "Esse horário não está mais na agenda. Escolha outro.",
  cedo_demais: "Esse horário é cedo demais. Escolha um mais para frente.",
  ocupado: "Alguém acabou de pegar esse horário. Escolha outro.",
  instante_invalido: "Horário inválido. Escolha um da lista.",
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params
    const limite = await checkRateLimit(request, `form-agenda-post:${slug}`, {
      limit: 20,
      windowSeconds: 60,
    })
    if (limite) return limite

    const entrada = entradaSchema.parse(await request.json())

    const token = verificarTokenSessao(entrada.token)
    if (!token.valido || token.sessionId !== entrada.session_id) {
      log.warn("agenda.token_recusado", { slug, motivo: token.motivo })
      return successResponse(request, { agendado: false, motivo: "sessao_invalida", mensagem: MOTIVO.sessao_invalida })
    }

    const agenda = await carregarAgenda(slug)
    if (!agenda) {
      return successResponse(request, { agendado: false, motivo: "final_sem_agenda", mensagem: MOTIVO.final_sem_agenda })
    }

    const r = await agendarDaSessao({
      agenda,
      sessionId: entrada.session_id,
      inicio: entrada.inicio,
    })
    if (!r.ok) {
      // 200 com o motivo: a tela precisa RE-LISTAR os horários e pedir
      // outro clique, e um 409 cru cairia no "confira a conexão".
      return successResponse(request, { agendado: false, motivo: r.motivo, mensagem: MOTIVO[r.motivo] })
    }

    return successResponse(request, { agendado: true, ...r.reuniao })
  } catch (error) {
    return errorResponse(request, error, "form-agenda-post")
  }
}
