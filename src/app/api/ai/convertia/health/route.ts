/**
 * GET  /api/ai/convertia/health — saúde da ConvertIA numa resposta só.
 * POST /api/ai/convertia/health — ações: `checar_saldo` | `sincronizar_vault`.
 *
 * Existe porque o padrão de falha desta parte do sistema é a DEGRADAÇÃO
 * SILENCIOSA, e não havia tela nenhuma:
 *
 *   - o saldo do OpenRouter acabou e 4 de 20 respostas morreram em 402;
 *   - os embeddings das 124 notas falharam pela mesma causa, em `log.warn`;
 *   - o sync do vault apontava para uma pasta inexistente e reportava
 *     sucesso com zero nota;
 *   - a porta de entrada do advisor era descartada como "índice gerado".
 *
 * Nenhum desses fatos apareceu em lugar algum: o diagnóstico inteiro passou
 * por SQL. Esta rota é o que transforma isso em 30 segundos de leitura.
 *
 * Auth: canManagePrompts (admin/owner OU tag `dev`) — mesmo gate de
 * /api/admin/knowledge e /admin/ai-usage.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { checarSaldo, ultimoSaldo } from "@/lib/ai/convertia/provider-balance"
import { notifyCreditsExhausted } from "@/lib/agents/generation-notify.service"
import { syncKnowledge } from "@/lib/ai/convertia/knowledge-sync"
import { embeddingsAvailable } from "@/lib/ai/convertia/knowledge-embeddings"
import { friendlyModelError } from "@/lib/ai/convertia/model-errors"
import { buscarNaWeb, escolherProvedor } from "@/lib/ai/web/web-search"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MISSING = new Set(["42P01", "PGRST205"])
const JANELA_DIAS = 7

interface MsgMeta {
  error?: string
  model?: string
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)
    const orgId = await resolveOrgId(user.id)

    const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString()

    const [saldo, falhasRes, syncRes, notasRes, lacunasRes, turnosRes] = await Promise.all([
      ultimoSaldo(admin),
      admin
        .from("ai_chat_messages")
        .select("id, created_at, meta, conversation_id")
        .eq("role", "assistant")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(200),
      admin.from("ai_knowledge_sync_state").select("*").eq("id", "default").maybeSingle(),
      admin.from("ai_knowledge_notes").select("path, title, kind, is_active, embedding").limit(5000),
      admin
        .from("convertia_lacunas")
        .select("id, fonte, consulta_normalizada, consultas, frequencia, ultima_vez_em, ultima_conversa_id")
        .eq("org_id", orgId)
        .eq("status", "aberta")
        .order("frequencia", { ascending: false })
        .order("ultima_vez_em", { ascending: false })
        .limit(20),
      admin
        .from("ai_chat_messages")
        .select("meta")
        .eq("role", "assistant")
        .gte("created_at", desde)
        .limit(500),
    ])

    // ── Falhas agrupadas pela CAUSA, não pela mensagem crua ───────────
    // Vinte linhas de "OpenRouter HTTP 402: {...}" não dizem nada; "3 turnos
    // sem crédito" diz o que fazer.
    const msgs = (falhasRes.data ?? []) as Array<{ id: string; created_at: string; meta: MsgMeta | null; conversation_id: string }>
    const porCausa = new Map<
      string,
      { codigo: string; mensagem: string; hint: string | null; total: number; ultima_em: string; exemplo_cru: string; modelos: string[] }
    >()
    for (const m of msgs) {
      const cru = m.meta?.error
      if (!cru) continue
      const f = friendlyModelError(cru)
      const atual = porCausa.get(f.code)
      if (atual) {
        atual.total += 1
        if (m.meta?.model && !atual.modelos.includes(m.meta.model)) atual.modelos.push(m.meta.model)
      } else {
        porCausa.set(f.code, {
          codigo: f.code,
          mensagem: f.message,
          hint: f.hint,
          total: 1,
          ultima_em: m.created_at,
          exemplo_cru: String(cru).slice(0, 300),
          modelos: m.meta?.model ? [m.meta.model] : [],
        })
      }
    }

    const totalTurnos = (turnosRes.data ?? []).length
    const totalFalhas = [...porCausa.values()].reduce((s, c) => s + c.total, 0)

    // ── Base de conhecimento ──────────────────────────────────────────
    const notas = (notasRes.data ?? []) as Array<{
      path: string
      title: string
      kind: string
      is_active: boolean
      embedding: unknown
    }>
    const ativas = notas.filter((n) => n.is_active)
    const semVetor = ativas.filter((n) => n.embedding === null).length
    const advisors = ativas.filter((n) => n.kind === "advisor").map((n) => ({ titulo: n.title, path: n.path }))

    const sync = syncRes.error && MISSING.has(syncRes.error.code ?? "") ? null : syncRes.data

    return successResponse(request, {
      saldo,
      // Sem chave nem adianta olhar embedding: é a explicação, não o sintoma.
      embeddings_configurados: embeddingsAvailable(),
      // Qual provedor de busca está VALENDO. A variável pode existir no
      // Vercel e não ter chegado a este deploy — sem isto, a única forma de
      // saber se a busca ligou é perguntar à IA e torcer.
      busca_web: { provedor: escolherProvedor() },
      turnos: {
        janela_dias: JANELA_DIAS,
        total: totalTurnos,
        falhas: totalFalhas,
        taxa_falha: totalTurnos > 0 ? Math.round((totalFalhas / totalTurnos) * 1000) / 10 : null,
        por_causa: [...porCausa.values()].sort((a, b) => b.total - a.total),
      },
      vault: sync
        ? {
            repo: (sync as Record<string, unknown>).repo ?? null,
            branch: (sync as Record<string, unknown>).branch ?? null,
            base_path: (sync as Record<string, unknown>).base_path ?? null,
            ultimo_commit: (sync as Record<string, unknown>).last_commit_sha ?? null,
            sincronizado_em: (sync as Record<string, unknown>).last_synced_at ?? null,
            erro: (sync as Record<string, unknown>).last_error ?? null,
            puladas: ((sync as Record<string, unknown>).skipped ?? []) as Array<{ path: string; motivo: string }>,
          }
        : null,
      base: {
        notas_ativas: ativas.length,
        notas_sem_vetor: semVetor,
        advisors,
      },
      lacunas: lacunasRes.error && MISSING.has(lacunasRes.error.code ?? "") ? [] : (lacunasRes.data ?? []),
      schema_missing: Boolean(lacunasRes.error && MISSING.has(lacunasRes.error.code ?? "")),
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-health-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = (await request.json().catch(() => ({}))) as { acao?: string }

    if (body.acao === "checar_saldo") {
      const r = await checarSaldo(admin, {
        notificar: (detalhe) => notifyCreditsExhausted({ provider: "OpenRouter", detail: detalhe }),
      })
      return successResponse(request, { saldo: r })
    }

    if (body.acao === "sincronizar_vault") {
      // `force: true` porque é isto que o botão precisa fazer: o sync
      // curto-circuita pelo SHA do vault, e o motivo de alguém clicar aqui
      // costuma ser mudança de CÓDIGO (regra de kind, de título), que não
      // muda commit nenhum.
      const result = await syncKnowledge({ trigger: "manual", force: true, admin })
      return successResponse(request, { sync: result })
    }

    if (body.acao === "testar_busca") {
      // Busca REAL, com a chave que está valendo neste deploy — é o único
      // teste que responde "a variável chegou?". Gasta 1 crédito do
      // provedor (a UI avisa) e não grava nada: quem registra consulta é o
      // turno da IA, e teste ali sujaria a contagem de lacunas.
      const r = await buscarNaWeb("convertfy email marketing", { limite: 3 })
      return successResponse(request, {
        busca: r.ok
          ? {
              ok: true as const,
              provedor: r.provedor,
              total: r.resultados.length,
              amostra: r.resultados.map((x) => ({ titulo: x.titulo, url: x.url })),
            }
          : { ok: false as const, motivo: r.motivo, naoConfigurado: Boolean(r.naoConfigurado) },
      })
    }

    throw new AppError(
      "Ação desconhecida. Use 'checar_saldo', 'sincronizar_vault' ou 'testar_busca'.",
      400,
      "validation",
    )
  } catch (error) {
    return errorResponse(request, error, "convertia-health-post")
  }
}
