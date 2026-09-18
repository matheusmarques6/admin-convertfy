/**
 * GET  /api/crm/forms      — lista forms da org
 * POST /api/crm/forms      — cria novo form (com fields opcionais)
 *
 * Autenticacao: requireAuth + resolveOrgId (RLS filtra por org_id).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { normalizarSchema } from "@/lib/forms/schema"
import { contagemDeTelas, type ResumoDoForm } from "@/lib/forms/lista"
import { mapaPorPosicao, remapearRefs } from "@/lib/forms/remapear-refs"

const log = logger.child("CrmForms")

export const dynamic = "force-dynamic"

// ── GET ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const status = sp.get("status")
    const scope = sp.get("scope") // sales | cs

    // As colunas do conversacional (20261144) entram com retry sem elas:
    // migration deste repo é aplicada à mão e escorrega, e a lista não
    // pode sumir por causa de uma pill de versão.
    type Linha = Record<string, unknown> & {
      id: string
      display_mode?: string | null
      has_unpublished_changes?: boolean | null
      published_version_id?: string | null
      fields?: Array<{ count: number }> | null
    }
    const montar = (comNovas: boolean) => {
      const novas = comNovas ? "display_mode, has_unpublished_changes, published_version_id, " : ""
      let q = admin
        .from("crm_forms")
        .select(
          `id, name, slug, description, status, scope, theme, pipeline_id, stage_id,
           submissions_count, views_count, created_at, updated_at, ${novas}
           pipeline:pipelines(id, name, color),
           stage:pipeline_stages!crm_forms_stage_id_fkey(id, name),
           fields:crm_form_fields(count)`,
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
      if (status) q = q.eq("status", status)
      // 'either' aparece em ambas as listagens
      if (scope) q = q.in("scope", [scope, "either"])
      return q.returns<Linha[]>()
    }

    let { data, error } = await montar(true)
    if (error && (error.code === "42703" || /display_mode|has_unpublished|published_version/i.test(error.message))) {
      log.warn("forms.lista_sem_colunas_do_conversacional", { code: error.code })
      ;({ data, error } = await montar(false))
    }
    if (error) throw error

    const linhas: Linha[] = data ?? []

    // Versão no ar (número + schema, para contar telas) e o resumo da
    // janela — as duas leituras são fail-open: a lista existe sem elas.
    const idsPublicados = linhas
      .map((f) => f.published_version_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
    const versoes = new Map<string, { version: number; schema: unknown }>()
    if (idsPublicados.length > 0) {
      const { data: vs, error: vErr } = await admin
        .from("form_versions")
        .select("id, version, schema")
        .in("id", idsPublicados)
      if (vErr) log.warn("forms.lista_sem_versoes", { code: vErr.code })
      for (const v of vs ?? []) versoes.set(v.id as string, { version: v.version as number, schema: v.schema })
    }

    const dias = Number(sp.get("dias") ?? 30)
    const resumos = new Map<string, ResumoDoForm>()
    const { data: resumoRaw, error: rErr } = await admin.rpc("crm_forms_resumo", {
      p_org: orgId,
      p_dias: Number.isFinite(dias) ? dias : 30,
    })
    if (rErr) log.warn("forms.lista_sem_resumo", { code: rErr.code, message: rErr.message })
    for (const r of (Array.isArray(resumoRaw) ? resumoRaw : []) as ResumoDoForm[]) resumos.set(r.form_id, r)

    const forms = linhas.map((f) => {
      const displayMode: "classic" | "conversational" =
        f.display_mode === "conversational" ? "conversational" : "classic"
      const versao = f.published_version_id ? (versoes.get(f.published_version_id) ?? null) : null
      const camposNaTabela = f.fields?.[0]?.count ?? 0
      const schema = versao?.schema ? normalizarSchema(versao.schema) : null
      const { fields: _fields, ...resto } = f
      return {
        ...resto,
        display_mode: displayMode,
        has_unpublished_changes: f.has_unpublished_changes === true,
        versao: versao?.version ?? null,
        telas: contagemDeTelas(schema, camposNaTabela, displayMode),
        resumo: resumos.get(f.id) ?? null,
      }
    })

    return successResponse(request, {
      forms,
      // Quem lê a lista precisa saber se a janela foi medida ou se a RPC
      // caiu — "0 visitas" e "resumo indisponível" pedem ações opostas.
      resumo_disponivel: !rErr,
      dias: Number.isFinite(dias) ? dias : 30,
    })
  } catch (error) {
    log.error("Forms GET error:", error)
    return errorResponse(request, error, "crm-forms-get")
  }
}

// ── POST ─────────────────────────────────────────────────────────

const fieldSchema = z.object({
  /**
   * Endereço provisório do campo no `draft_schema` que vem junto. O
   * banco dá o id no INSERT; o rascunho é regravado com o id real, casado
   * por posição — a mesma mecânica do PATCH do editor.
   */
  temp_ref: z.string().max(64).optional(),
  field_type: z.enum([
    "text", "email", "phone", "number", "textarea",
    "select", "multi_select", "radio", "checkbox",
    "date", "url", "cpf", "cnpj", "cep", "hidden",
    "statement", "yes_no", "nps", "rating", "schedule",
  ]),
  label: z.string().min(1).max(200),
  placeholder: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  required: z.boolean().optional().default(false),
  position: z.number().int().min(0).optional().default(0),
  options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })])).optional().default([]),
  validation: z.record(z.string(), z.unknown()).optional().default({}),
  map_to_lead_field: z
    .string()
    .regex(
      /^(name|first_name|last_name|email|phone|company|source|custom:[a-z][a-z0-9_]*|custom_lead:[a-z][a-z0-9_]*|custom_deal:[a-z][a-z0-9_]*)$/,
      'map_to_lead_field deve ser um campo padrao (name|first_name|last_name|email|phone|company|source) ou ter prefixo "custom:", "custom_lead:" ou "custom_deal:" seguido de uma key snake_case',
    )
    .nullable()
    .optional(),
})

const createFormSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use letras minusculas, numeros e hifens"),
  description: z.string().nullable().optional(),
  pipeline_id: uuid().nullable().optional(),
  stage_id: uuid().nullable().optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  success_message: z.string().nullable().optional(),
  redirect_url: z.string().url().nullable().optional().or(z.literal("")),
  fields: z.array(fieldSchema).optional().default([]),
  scope: z.enum(["sales", "cs", "either"]).optional().default("sales"),
  display_mode: z.enum(["classic", "conversational"]).optional(),
  /** Rascunho do fluxo (abertura, agrupamento, desvios, finais) do modelo. */
  draft_schema: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createFormSchema.parse(body)

    // Verifica unicidade do slug pra dar 409 antes do conflito de DB.
    const { data: existing } = await admin
      .from("crm_forms")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", parsed.slug)
      .maybeSingle()
    if (existing) {
      throw new AppError(
        `Slug "${parsed.slug}" ja esta em uso nesta org.`,
        409,
        "slug-conflict",
      )
    }

    const { fields = [], redirect_url, draft_schema, display_mode, ...formData } = parsed
    const inserir = (comModo: boolean) =>
      admin
        .from("crm_forms")
        .insert({
          org_id: orgId,
          created_by: user.id,
          // string vazia vira NULL pra nao gerar URL invalida
          redirect_url: redirect_url || null,
          ...formData,
          ...(comModo && display_mode ? { display_mode } : {}),
        })
        .select("id, slug")
        .single()

    let { data: form, error } = await inserir(true)
    // Coluna do conversacional ausente (migration atrasada): o formulário
    // nasce clássico em vez de não nascer.
    if (error && display_mode && (error.code === "42703" || error.code === "PGRST204")) {
      log.warn("forms.post_sem_display_mode", { code: error.code })
      ;({ data: form, error } = await inserir(false))
    }
    if (error) throw error
    if (!form) throw new AppError("Falha ao criar o formulário", 500, "forms-insert")

    // Insert dos fields em batch, e os ids de volta na ordem das posições
    // — é com eles que o rascunho troca o `temp_ref` pelo endereço real.
    let idsPorPosicao: string[] = []
    if (fields.length > 0) {
      const fieldsPayload = fields.map((f, idx) => {
        const row = f as Record<string, unknown>
        return {
          form_id: form.id,
          field_type: row.field_type,
          label: row.label,
          placeholder: row.placeholder ?? null,
          description: row.description ?? null,
          required: row.required ?? false,
          position: (row.position as number | undefined) ?? idx,
          options: row.options ?? [],
          validation: row.validation ?? {},
          map_to_lead_field: row.map_to_lead_field ?? null,
        }
      })
      const { error: fErr } = await admin
        .from("crm_form_fields")
        .insert(fieldsPayload)
      if (fErr) {
        log.warn("Failed to insert fields, form created without fields", { fErr })
      } else {
        const { data: persistidos } = await admin
          .from("crm_form_fields")
          .select("id, position")
          .eq("form_id", form.id)
          .order("position", { ascending: true })
        idsPorPosicao = (persistidos ?? []).map((r) => r.id as string)
      }
    }

    // O rascunho do modelo, com os endereços já trocados. Sem o remap a
    // regra "faturamento baixo → final" nasceria apontando para `faturamento`
    // — um ref que nunca existirá — e a publicação a descartaria em silêncio.
    if (draft_schema && idsPorPosicao.length > 0) {
      const mapa = mapaPorPosicao(
        fields
          .map((f, i) => ({ posicao: (f.position ?? i) as number, ref: f.temp_ref ?? "" }))
          .filter((x) => x.ref !== ""),
        idsPorPosicao,
      )
      const rascunho = remapearRefs(normalizarSchema(draft_schema), mapa)
      const { error: dErr } = await admin
        .from("crm_forms")
        .update({ draft_schema: rascunho })
        .eq("id", form.id)
      if (dErr) log.warn("forms.post_sem_draft_schema", { code: dErr.code, message: dErr.message })
    }

    log.info("[Forms] created", { id: form.id, slug: form.slug })
    return successResponse(request, { id: form.id, slug: form.slug })
  } catch (error) {
    log.error("Forms POST error:", error)
    return errorResponse(request, error, "crm-forms-post")
  }
}
