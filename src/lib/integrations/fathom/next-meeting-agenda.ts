/**
 * Pauta da próxima reunião a partir do histórico de calls (puro).
 *
 * A pergunta que o CSM faz antes de entrar na call é sempre a mesma:
 * "o que ficou pendente da última vez e o que a gente combinou?". Isso
 * está espalhado pelos itens de ação de cada call — aqui vira uma
 * lista só, sem repetição e com a idade de cada pendência.
 *
 * Regras deliberadas:
 * - Item CONCLUÍDO some da pauta (já foi resolvido) mas conta como
 *   "entregue desde a última call" — é o que se leva de bom pra mesa.
 * - Item repetido em calls seguidas aparece UMA vez, com a data da
 *   PRIMEIRA aparição: o que interessa é há quanto tempo arrasta.
 * - Comparação por texto normalizado (sem acento/caixa/pontuação
 *   final) — o Fathom reescreve levemente o mesmo item entre calls.
 */

import type { FathomActionItem } from "./meeting-digest"

export interface CallForAgenda {
  conducted_at: string
  action_items_json?: FathomActionItem[] | null
  /** Fallback das calls antigas: texto livre, uma linha por item. */
  action_items?: string | null
}

export interface AgendaItem {
  description: string
  /** Desde quando o item está aberto (1ª call em que apareceu). */
  since: string
  days_open: number
  assignee: string | null
}

export interface NextMeetingAgenda {
  pending: AgendaItem[]
  completed_since_last: string[]
  last_call_at: string | null
  calls_considered: number
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function itemsOf(call: CallForAgenda): FathomActionItem[] {
  if (Array.isArray(call.action_items_json) && call.action_items_json.length > 0) {
    return call.action_items_json
  }
  // Calls antigas (ou registradas à mão) só têm o texto livre
  const text = call.action_items?.trim()
  if (!text) return []
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((description) => ({
      description,
      completed: false,
      assignee: null,
      playback_url: null,
      timestamp: null,
    }))
}

export function buildNextMeetingAgenda(
  calls: CallForAgenda[],
  now: Date = new Date(),
): NextMeetingAgenda {
  // Mais antiga → mais nova: a primeira aparição do item é a que vale
  const ordered = [...calls]
    .filter((c) => c.conducted_at)
    .sort((a, b) => a.conducted_at.localeCompare(b.conducted_at))

  const open = new Map<string, AgendaItem>()
  const done = new Map<string, string>()

  for (const call of ordered) {
    for (const item of itemsOf(call)) {
      const key = normalize(item.description)
      if (!key) continue
      if (item.completed) {
        // Concluído sai da pauta e entra na lista de entregues
        open.delete(key)
        done.set(key, item.description)
        continue
      }
      if (done.has(key)) continue // reaberto? o concluído mais recente vence
      if (!open.has(key)) {
        open.set(key, {
          description: item.description,
          since: call.conducted_at,
          days_open: Math.max(
            0,
            Math.round(
              (now.getTime() - new Date(call.conducted_at).getTime()) / 86_400_000,
            ),
          ),
          assignee: item.assignee ?? null,
        })
      } else if (item.assignee) {
        // Responsável definido depois enriquece o item existente
        const prev = open.get(key)!
        if (!prev.assignee) open.set(key, { ...prev, assignee: item.assignee })
      }
    }
  }

  const lastCall = ordered.length > 0 ? ordered[ordered.length - 1].conducted_at : null

  return {
    pending: [...open.values()].sort((a, b) => b.days_open - a.days_open),
    completed_since_last: [...done.values()],
    last_call_at: lastCall,
    calls_considered: ordered.length,
  }
}

/** Pauta em markdown — vai pro drawer, pro relatório e pro prompt. */
export function agendaToMarkdown(agenda: NextMeetingAgenda): string {
  if (agenda.pending.length === 0 && agenda.completed_since_last.length === 0) {
    return "Sem pendências registradas nas calls anteriores."
  }
  const blocks: string[] = []
  if (agenda.pending.length > 0) {
    blocks.push(
      [
        "**Pendências para a próxima call**",
        ...agenda.pending.map(
          (p) =>
            `- ${p.description}${p.assignee ? ` (${p.assignee})` : ""} — aberto há ${p.days_open}d`,
        ),
      ].join("\n"),
    )
  }
  if (agenda.completed_since_last.length > 0) {
    blocks.push(
      ["**Entregue desde então**", ...agenda.completed_since_last.map((d) => `- ${d}`)].join(
        "\n",
      ),
    )
  }
  return blocks.join("\n\n")
}
