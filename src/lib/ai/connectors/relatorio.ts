/**
 * Conector "Relatório da loja" da ConvertIA — gera o relatório mensal
 * OFICIAL pelo mesmo sistema da aba Relatório (client_monthly_reports):
 * a tool chama `POST /api/admin/stores/[id]/reports` (agregação real de
 * KPIs/campanhas/flows, ~30-60s) e depois o `ai-fill` (insights por
 * slide), devolvendo os links do editor e do deck apresentável.
 *
 * Por que via HTTP interno e não import direto: o snapshot precisa do
 * COOKIE da sessão (fetchSnapshotSources faz fan-out autenticado aos
 * endpoints de integração) — por isso o builder recebe origin+cookie
 * da request do chat.
 */

import type { ConnectorTool, ResolvedConnector } from "./types"

/** Mês CIVIL anterior completo (default do período do relatório). */
export function previousFullMonth(now: Date = new Date()): {
  period_start: string
  period_end: string
} {
  const firstOfThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const endPrev = new Date(firstOfThis.getTime() - 24 * 3600 * 1000)
  const startPrev = new Date(Date.UTC(endPrev.getUTCFullYear(), endPrev.getUTCMonth(), 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { period_start: iso(startPrev), period_end: iso(endPrev) }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function postJson(
  url: string,
  cookie: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: resp.ok, status: resp.status, json }
  } finally {
    clearTimeout(timer)
  }
}

export function buildRelatorioConnector(opts: {
  origin: string
  cookie: string
}): ResolvedConnector {
  const gerar: ConnectorTool = {
    label: "Gerar relatório da loja",
    write: true,
    def: {
      type: "function",
      function: {
        name: "gerar_relatorio_loja",
        description:
          "EXECUTA: gera o relatório mensal OFICIAL da loja selecionada pelo sistema de relatórios da Convertfy (KPIs reais, campanhas, flows — o mesmo da aba Relatório da loja) e devolve os links do editor e do deck apresentável. Use quando o usuário pedir 'gera o relatório da loja', 'relatório de agosto' etc. Sem período informado, usa o mês civil anterior completo. Se já existir relatório do mesmo mês, a tool avisa — só chame de novo com substituir=true depois que o usuário confirmar a substituição.",
        parameters: {
          type: "object",
          properties: {
            period_start: {
              type: "string",
              description: "Início do período, YYYY-MM-DD. Default: dia 1º do mês anterior.",
            },
            period_end: {
              type: "string",
              description: "Fim do período, YYYY-MM-DD. Default: último dia do mês anterior.",
            },
            substituir: {
              type: "boolean",
              description:
                "true substitui um relatório já existente do mesmo mês. Só use após confirmação explícita do usuário.",
            },
            preencher_com_ia: {
              type: "boolean",
              description: "Gerar também os insights de IA por slide (default true).",
            },
          },
        },
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.storeId) {
        return {
          content:
            "Nenhuma loja selecionada na conversa — o relatório é POR LOJA. Peça ao usuário para escolher a loja no seletor do composer.",
          summary: "sem loja",
        }
      }
      const defaults = previousFullMonth()
      const periodStart =
        typeof args.period_start === "string" && DATE_RE.test(args.period_start)
          ? args.period_start
          : defaults.period_start
      const periodEnd =
        typeof args.period_end === "string" && DATE_RE.test(args.period_end)
          ? args.period_end
          : defaults.period_end
      if (periodEnd < periodStart) {
        return { content: "Período inválido: fim antes do início.", summary: "período inválido" }
      }

      const create = await postJson(
        `${opts.origin}/api/admin/stores/${ctx.storeId}/reports`,
        opts.cookie,
        {
          period_start: periodStart,
          period_end: periodEnd,
          tone: "editorial",
          ai_filled: false,
          ...(args.substituir === true ? { replace: true } : {}),
        },
        150_000,
      )

      if (create.status === 409) {
        const existingId = create.json.existing_report_id
        const label = create.json.month_label ?? "esse mês"
        return {
          content: `Já existe um relatório de ${label} para esta loja${
            existingId ? ` — editor: /admin/stores/relatorios/${existingId} · deck: /print/relatorios/${existingId}` : ""
          }. Pergunte ao usuário se quer SUBSTITUIR (aí chame de novo com substituir=true) ou usar o existente.`,
          summary: "já existe",
        }
      }
      if (!create.ok) {
        const msg = typeof create.json.error === "string" ? create.json.error : `HTTP ${create.status}`
        return { content: `Falha ao gerar o relatório: ${msg}`, summary: "falhou" }
      }

      const reportId = String(create.json.id ?? "")
      const monthLabel = String(create.json.month_label ?? "")
      if (!reportId) {
        return { content: "Relatório criado mas sem id na resposta — verifique na aba Relatório da loja.", summary: "sem id" }
      }

      let aiNote = ""
      if (args.preencher_com_ia !== false) {
        try {
          const fill = await postJson(
            `${opts.origin}/api/admin/stores/reports/${reportId}/ai-fill`,
            opts.cookie,
            {},
            70_000,
          )
          aiNote = fill.ok
            ? "Insights de IA preenchidos por slide."
            : "Relatório pronto, mas os insights de IA falharam — dá pra refazer pelo botão 'Refazer com IA' no editor."
        } catch {
          aiNote =
            "Relatório pronto, mas os insights de IA falharam — dá pra refazer pelo botão 'Refazer com IA' no editor."
        }
      }

      return {
        content: [
          `Relatório de ${monthLabel} gerado com os dados reais da loja (período ${periodStart} a ${periodEnd}).`,
          aiNote,
          `Links (apresente como markdown):`,
          `- Editor: /admin/stores/relatorios/${reportId}`,
          `- Deck apresentável: /print/relatorios/${reportId}?present=1`,
          `- PDF: abrir /print/relatorios/${reportId}?autoprint=1 e salvar como PDF.`,
          `Os links exigem login no admin (não são públicos).`,
        ]
          .filter(Boolean)
          .join("\n"),
        summary: monthLabel || "gerado",
      }
    },
  }

  return { key: "relatorio", name: "Relatório da loja", tools: [gerar] }
}
