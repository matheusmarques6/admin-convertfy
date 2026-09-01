/**
 * Conector "CRM Convertfy" — pipelines, negócios e atividades do CRM
 * nativo. Leitura ampla + UMA ação de escrita (criar atividade no
 * negócio), que é a execução de menor risco e maior uso no dia a dia
 * comercial. Ações destrutivas (mover etapa, apagar) ficam fora de
 * propósito — o assistente sugere, o humano executa no board.
 */

import { toolJson, type ConnectorTool, type ResolvedConnector } from "./types"

const resumoPipelines: ConnectorTool = {
  label: "Resumo dos pipelines",
  def: {
    type: "function",
    function: {
      name: "crm_resumo_pipelines",
      description:
        "Resumo dos pipelines do CRM: etapas com contagem de negócios e valor somado por etapa. scope 'sales' = comercial, 'cs' = customer success.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["sales", "cs"], description: "Default: sales" },
        },
        required: [],
      },
    },
  },
  execute: async (args, ctx) => {
    const scope = args.scope === "cs" ? "cs" : "sales"
    const { data: pipelines } = await ctx.admin
      .from("pipelines")
      .select("id, name, pipeline_stages(id, name, \"order\", stage_type)")
      .eq("scope", scope)
      .eq("is_archived", false)
      .limit(12)
    const out = []
    for (const p of pipelines ?? []) {
      const { data: deals } = await ctx.admin
        .from("deals")
        .select("stage_id, value, status")
        .eq("pipeline_id", p.id)
        .eq("status", "open")
        .limit(2000)
      const byStage = new Map<string, { count: number; value: number }>()
      for (const d of deals ?? []) {
        const agg = byStage.get(d.stage_id) ?? { count: 0, value: 0 }
        agg.count += 1
        agg.value += Number(d.value) || 0
        byStage.set(d.stage_id, agg)
      }
      const stages = ((p.pipeline_stages as Array<{ id: string; name: string; order: number; stage_type: string }>) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          etapa: s.name,
          tipo: s.stage_type,
          negocios: byStage.get(s.id)?.count ?? 0,
          valor: Math.round(byStage.get(s.id)?.value ?? 0),
        }))
      out.push({ pipeline: p.name, pipeline_id: p.id, etapas: stages })
    }
    return { content: toolJson(out), summary: `${out.length} pipelines · ${scope}` }
  },
}

const buscarNegocios: ConnectorTool = {
  label: "Busca de negócios",
  def: {
    type: "function",
    function: {
      name: "crm_buscar_negocios",
      description:
        "Busca negócios (deals) por texto no título, com filtros de status. Retorna id, título, valor, etapa, dono, cliente e datas.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Trecho do título/nome do cliente" },
          status: { type: "string", enum: ["open", "won", "lost", "archived"] },
          limit: { type: "number", description: "Default 15, máx 40" },
        },
        required: [],
      },
    },
  },
  execute: async (args, ctx) => {
    const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40)
    let q = ctx.admin
      .from("deals")
      .select(
        "id, title, value, status, expected_close_date, created_at, won_at, lost_reason, stage:pipeline_stages!deals_stage_id_fkey(name), pipeline:pipelines(name, scope), owner:profiles!deals_owner_id_fkey(name), client:clients(name)",
      )
      .order("updated_at", { ascending: false })
      .limit(limit)
    if (typeof args.query === "string" && args.query.trim()) {
      q = q.ilike("title", `%${args.query.trim().replace(/[%,]/g, " ")}%`)
    }
    if (typeof args.status === "string" && ["open", "won", "lost", "archived"].includes(args.status)) {
      q = q.eq("status", args.status)
    }
    const { data, error } = await q
    if (error) throw error
    return { content: toolJson(data ?? []), summary: `${data?.length ?? 0} negócios` }
  },
}

const detalheNegocio: ConnectorTool = {
  label: "Detalhe do negócio",
  def: {
    type: "function",
    function: {
      name: "crm_negocio",
      description:
        "Detalhe completo de um negócio pelo id: valor, etapa, histórico de etapas, últimas atividades, produtos e contato.",
      parameters: {
        type: "object",
        properties: { deal_id: { type: "string", description: "UUID do negócio" } },
        required: ["deal_id"],
      },
    },
  },
  execute: async (args, ctx) => {
    const dealId = String(args.deal_id ?? "")
    const [{ data: deal }, { data: activities }, { data: history }] = await Promise.all([
      ctx.admin
        .from("deals")
        .select(
          "id, title, value, currency, status, expected_close_date, probability, notes, lost_reason, source_type, created_at, won_at, stage:pipeline_stages!deals_stage_id_fkey(name, stage_type), pipeline:pipelines(name), owner:profiles!deals_owner_id_fkey(name), client:clients(name, email, phone), lead:crm_leads!deals_lead_id_fkey(name, email, phone)",
        )
        .eq("id", dealId)
        .maybeSingle(),
      ctx.admin
        .from("crm_deal_activities")
        .select("type, content, due_at, completed_at, created_at")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(10),
      ctx.admin
        .from("crm_deal_history")
        .select("field, old_value, new_value, created_at")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(10),
    ])
    if (!deal) return { content: "Negócio não encontrado.", summary: "não encontrado" }
    return {
      content: toolJson({ negocio: deal, atividades: activities ?? [], historico: history ?? [] }),
      summary: (deal as { title?: string }).title ?? "1 negócio",
    }
  },
}

const criarAtividade: ConnectorTool = {
  label: "Criar atividade",
  write: true,
  def: {
    type: "function",
    function: {
      name: "crm_criar_atividade",
      description:
        "EXECUTA: cria uma atividade/tarefa em um negócio do CRM (ex.: follow-up, ligação, envio de proposta). Use quando o usuário pedir para registrar ou agendar algo num negócio.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "UUID do negócio" },
          content: { type: "string", description: "Texto da atividade/tarefa" },
          due_at: {
            type: "string",
            description: "Prazo ISO 8601 (ex.: 2026-09-03T15:00:00-03:00). Opcional.",
          },
        },
        required: ["deal_id", "content"],
      },
    },
  },
  execute: async (args, ctx) => {
    const dealId = String(args.deal_id ?? "")
    const content = String(args.content ?? "").slice(0, 2000)
    if (!dealId || !content) return { content: "deal_id e content são obrigatórios." }
    const { data: deal } = await ctx.admin
      .from("deals")
      .select("id, title")
      .eq("id", dealId)
      .maybeSingle()
    if (!deal) return { content: "Negócio não encontrado — atividade NÃO criada." }
    const { error } = await ctx.admin.from("crm_deal_activities").insert({
      deal_id: dealId,
      type: "task",
      content,
      due_at: typeof args.due_at === "string" ? args.due_at : null,
      created_by: ctx.userId,
    })
    if (error) throw error
    return {
      content: `Atividade criada no negócio "${(deal as { title: string }).title}": ${content}`,
      summary: "atividade criada",
    }
  },
}

export const CRM_CONNECTOR: ResolvedConnector = {
  key: "crm",
  name: "CRM Convertfy",
  tools: [resumoPipelines, buscarNegocios, detalheNegocio, criarAtividade],
}
