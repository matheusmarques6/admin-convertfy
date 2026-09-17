/**
 * GET /api/crm/forms/[id]/resultados
 *
 * O funil do formulário, pergunta a pergunta. Uma RPC
 * (`form_funnel_stats`) faz a agregação — dez consultas do PostgREST
 * para montar esta tela seriam dez varreduras.
 *
 * O `field_ref` que a RPC devolve é um id; quem traduz para o texto da
 * pergunta é esta rota, cruzando com o schema publicado. Mandar id cru
 * para a tela faria o operador ler `d1a6405d-…` no lugar de "Qual o
 * faturamento médio mensal da sua loja?".
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import { AppError, errorResponse, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { normalizarSchema, schemaDeCampos, type CampoLegado } from "@/lib/forms/schema"
import { auditarQualificacao, type CampoComOpcoes } from "@/lib/tracking/auditoria-qualificacao"
import { camposParaAuditoria } from "@/lib/forms/derivados"
import { normalizeTrackingConfig } from "@/types/form-tracking"

const log = logger.child("FormResultados")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    // Autenticação pela sessão do usuário: a leitura é do admin, não do
    // público. A RPC é `security definer`, então quem chega aqui sem
    // poder ver o formulário não pode receber o funil dele.
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) throw new AppError("Não autorizado", 401, "UNAUTHORIZED")

    const admin = createAdminClient()
    const { data: form, error: fErr } = await admin
      .from("crm_forms")
      .select("id, org_id, name, slug, published_version_id, display_mode, tracking_config, views_count, submissions_count")
      .eq("id", id)
      .maybeSingle()
    if (fErr) throw fErr
    if (!form) throw new AppError("Formulário não encontrado", 404, "NOT_FOUND")

    // Quem pergunta tem de ser da org do formulário.
    const { data: membro } = await admin
      .from("org_members")
      .select("id")
      .eq("profile_id", auth.user.id)
      .eq("org_id", form.org_id)
      .limit(1)
      .maybeSingle()
    if (!membro) throw new AppError("Sem acesso a este formulário", 403, "FORBIDDEN")

    const dias = Number(request.nextUrl.searchParams.get("dias") ?? 30)
    const desde = new Date(Date.now() - (Number.isFinite(dias) ? dias : 30) * 86_400_000).toISOString()

    const { data: campos } = await admin
      .from("crm_form_fields")
      .select("id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field")
      .eq("form_id", id)
      .order("position", { ascending: true })

    const schema = await carregarSchema(admin, form, (campos ?? []) as CampoLegado[])
    // Rótulo LIMPO (sem os marcadores de recall, que num relatório não
    // significam nada) + se a pergunta é obrigatória: pular um campo
    // opcional é escolha de quem responde, não desistência, e contar as
    // duas coisas como "queda" manda mexer no lugar errado.
    const rotulos = Object.fromEntries(
      schema.blocks.map((b) => [
        b.ref,
        { label: rotuloLegivel(b.label || b.ref), required: Boolean(b.required) },
      ]),
    )

    // O funil. Falha aqui (migration atrasada) NÃO derruba a aba: a
    // auditoria da qualificação continua servindo, e ela é a que o
    // operador precisa antes de subir verba.
    let funil: Record<string, unknown> | null = null
    let funilErro: string | null = null
    const { data: stats, error: sErr } = await admin.rpc("form_funnel_stats", {
      p_form_id: id,
      p_desde: desde,
      p_ate: new Date().toISOString(),
    })
    if (sErr) {
      funilErro = sErr.message
      log.warn("resultados.funil_indisponivel", { formId: id, code: sErr.code, message: sErr.message })
    } else {
      funil = stats as Record<string, unknown>
    }

    // A auditoria: quais respostas do formulário disparam o evento.
    const cfg = normalizeTrackingConfig(form.tracking_config)
    // A lista vem de `camposParaAuditoria`, não do schema cru: a pergunta
    // de faturamento por moeda guarda só a escada declarada, e auditar por
    // ela diria que ninguém pode responder as faixas em dólar que o lead
    // de fora vê na tela.
    const paraAuditoria: CampoComOpcoes[] = camposParaAuditoria(schema)
    const auditoria = auditarQualificacao(cfg.qualified_lead, paraAuditoria)

    return successResponse(request, {
      form: {
        id: form.id,
        name: form.name,
        slug: form.slug,
        display_mode: form.display_mode,
        views_count: form.views_count,
        submissions_count: form.submissions_count,
      },
      funil,
      funil_erro: funilErro,
      // A tradução id → pergunta, para a tela não mostrar uuid.
      rotulos,
      auditoria,
      evento: {
        habilitado: cfg.qualified_lead.enabled,
        nome: cfg.qualified_lead.event_name,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "form-resultados")
  }
}

async function carregarSchema(
  admin: ReturnType<typeof createAdminClient>,
  form: { id: string; published_version_id: string | null; display_mode: string | null },
  campos: CampoLegado[],
) {
  if (form.published_version_id) {
    const { data } = await admin
      .from("form_versions")
      .select("schema")
      .eq("id", form.published_version_id)
      .maybeSingle()
    if (data?.schema) return normalizarSchema(data.schema)
  }
  return schemaDeCampos(campos, {
    display_mode: form.display_mode === "conversational" ? "conversational" : "classic",
  })
}

/**
 * O texto da pergunta como se lê num relatório.
 *
 * `{{nome}}` é endereço de recall: na tela do formulário ele vira o nome
 * de quem responde, e aqui não há ninguém — imprimir o marcador cru
 * ("Prazer, {{nome}}. Para onde…") faz o relatório parecer quebrado, e
 * apagá-lo deixaria "Prazer, . Para onde…". Vira `[nome]`, que se lê e
 * diz o que entra ali.
 */
function rotuloLegivel(texto: string): string {
  return texto.replace(/\{\{\s*([^{}|]+?)\s*(?:\|[^{}]*)?\}\}/g, (_t, chave: string) => `[${chave.trim()}]`)
}
