/**
 * GET    /api/crm/forms/[id]   — form + campos + ultimas submissoes
 * PATCH  /api/crm/forms/[id]   — atualiza metadata, theme, pipeline, fields
 * DELETE /api/crm/forms/[id]   — soft delete (status=archived)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { normalizarMidia } from "@/lib/forms/midia"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { encrypt } from "@/lib/crypto"
import { normalizeTrackingConfig } from "@/types/form-tracking"
import { normalizarSchema } from "@/lib/forms/schema"
import { normalizarDestino } from "@/lib/forms/destino"
import { mapaPorPosicao, remapearRefs } from "@/lib/forms/remapear-refs"
import { logger } from "@/lib/logger"

const log = logger.child("CrmFormDetail")

export const dynamic = "force-dynamic"

// ── GET ──────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const { data: form, error } = await admin
      .from("crm_forms")
      .select(
        `id, name, slug, description, status, theme, logo_url,
         success_message, redirect_url, pipeline_id, stage_id,
         facebook_pixel_id, google_ads_id, google_analytics_id,
         meta_capi_token, meta_test_event_code, google_ads_conversion_label,
         tracking_config, display_mode, draft_schema, published_version_id, has_unpublished_changes,
         settings, locale,
         submissions_count, views_count, created_at, updated_at,
         pipeline:pipelines(id, name, scope, color),
         stage:pipeline_stages!crm_forms_stage_id_fkey(id, name, color)`,
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (error) throw error
    if (!form) throw new AppError("Form nao encontrado", 404, "not-found")

    // Sanitiza: nunca retorna o token da CAPI em claro — so um boolean.
    // Normaliza tracking_config pra a UI receber sempre o shape completo.
    const {
      meta_capi_token,
      tracking_config,
      draft_schema,
      ...formRest
    } = form as Record<string, unknown> & { meta_capi_token?: string | null }
    const sanitizedForm = {
      ...formRest,
      tracking_config: normalizeTrackingConfig(tracking_config),
      has_meta_capi_token: !!meta_capi_token,
    }

    const { data: fields } = await admin
      .from("crm_form_fields")
      .select("*")
      .eq("form_id", id)
      .order("position", { ascending: true })

    /**
     * O fluxo — a camada que a tabela de campos não tem lugar para
     * guardar: saltos, finais e tela de abertura.
     *
     * O rascunho VENCE a versão publicada porque é ele que o editor
     * escreve; sem rascunho, a publicada é o ponto de partida, senão
     * abrir o editor de um formulário que já tem lógica no ar mostraria
     * um fluxo vazio e o primeiro save a apagaria.
     */
    let fluxoBruto: unknown = draft_schema ?? null
    let fluxoOrigem: "rascunho" | "publicado" | "novo" | "indisponivel" = draft_schema
      ? "rascunho"
      : "novo"
    let versaoPublicada = 0
    if (form.published_version_id) {
      const { data: v, error: vErr } = await admin
        .from("form_versions")
        .select("schema, version")
        .eq("id", form.published_version_id as string)
        .maybeSingle()
      versaoPublicada = (v?.version as number | undefined) ?? 0
      if (!fluxoBruto) {
        if (vErr || !v) {
          /**
           * Não dá para dizer que o fluxo está vazio: existe uma versão
           * publicada e não conseguimos lê-la. Devolver schema vazio faria
           * o editor abrir sem os saltos e o primeiro save os apagaria —
           * uma falha passageira de leitura custaria a lógica inteira do
           * formulário. `indisponivel` manda a tela NÃO gravar rascunho.
           */
          fluxoOrigem = "indisponivel"
          log.warn("form.fluxo_indisponivel", { id, code: vErr?.code })
        } else if (v.schema) {
          fluxoBruto = v.schema
          fluxoOrigem = "publicado"
        }
      }
    }

    const { data: submissions } = await admin
      .from("crm_form_submissions")
      .select(
        "id, status, created_at, lead_id, deal_id, utm_source, utm_campaign",
      )
      .eq("form_id", id)
      .order("created_at", { ascending: false })
      .limit(20)

    return successResponse(request, {
      form: sanitizedForm,
      fields: fields || [],
      submissions: submissions || [],
      fluxo: normalizarSchema(fluxoBruto),
      fluxo_origem: fluxoOrigem,
      versao_publicada: versaoPublicada,
    })
  } catch (error) {
    log.error("Form GET error:", error)
    return errorResponse(request, error, "crm-form-get")
  }
}

// ── PATCH ────────────────────────────────────────────────────────

const fieldUpsertSchema = z.object({
  id: uuid().optional(),
  /**
   * Endereço provisório de uma pergunta recém-criada, para que a regra de
   * salto escrita antes do primeiro save sobreviva. Não é gravado: serve
   * só para trocar o `ref` no rascunho depois que o banco dá o id real.
   */
  temp_ref: z.string().max(64).optional(),
  field_type: z.enum([
    "text", "email", "phone", "number", "textarea",
    "select", "multi_select", "radio", "checkbox",
    "date", "url", "cpf", "cnpj", "cep", "hidden",
    // Tela de conteúdo: título, texto e um botão, sem coletar resposta.
    // Ela é um CAMPO como os outros porque `montarVersao` reconstrói os
    // blocos a partir desta tabela — fora daqui, toda publicação apagaria
    // as telas de conteúdo do formulário, sem erro nenhum.
    "statement",
    // Handoff set/2026 (migration 20261174).
    "yes_no", "nps", "rating", "schedule",
  ]),
  label: z.string().min(1).max(200),
  placeholder: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })])).optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
  /** Imagem ou vídeo da tela. Normalizada em `lib/forms/midia`. */
  media: z.record(z.string(), z.unknown()).nullable().optional(),
  map_to_lead_field: z
    .string()
    .regex(
      /^(name|first_name|last_name|email|phone|company|source|custom:[a-z][a-z0-9_]*|custom_lead:[a-z][a-z0-9_]*|custom_deal:[a-z][a-z0-9_]*)$/,
      'map_to_lead_field deve ser um campo padrao (name|first_name|last_name|email|phone|company|source) ou ter prefixo "custom:", "custom_lead:" ou "custom_deal:" seguido de uma key snake_case',
    )
    .nullable()
    .optional(),
})

const qualifiedRuleSchema = z.object({
  field_id: z.string(),
  field_label: z.string().optional(),
  operator: z.enum([
    "equals", "not_equals", "in", "not_in",
    "contains", "gt", "gte", "lt", "lte", "is_set",
  ]),
  value: z
    .union([z.string(), z.array(z.string()), z.number(), z.null()])
    .optional(),
})

const trackingConfigSchema = z.object({
  meta: z.object({ enabled: z.boolean(), browser_pixel: z.boolean() }).optional(),
  google: z.object({ enabled: z.boolean() }).optional(),
  qualified_lead: z
    .object({
      enabled: z.boolean(),
      event_name: z.string().min(1).max(120),
      logic: z.enum(["and", "or"]),
      rules: z.array(qualifiedRuleSchema),
    })
    .optional(),
})

const patchFormSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  logo_url: z.string().url().nullable().optional().or(z.literal("")),
  success_message: z.string().nullable().optional(),
  redirect_url: z.string().url().nullable().optional().or(z.literal("")),
  pipeline_id: uuid().nullable().optional(),
  stage_id: uuid().nullable().optional(),
  facebook_pixel_id: z.string().nullable().optional(),
  google_ads_id: z.string().nullable().optional(),
  google_analytics_id: z.string().nullable().optional(),
  // Tracking de conversao. meta_capi_token so e gravado quando vem uma
  // string nao-vazia (cifrada aqui); vazio/omitido mantem o atual.
  meta_capi_token: z.string().nullable().optional(),
  meta_test_event_code: z.string().nullable().optional(),
  google_ads_conversion_label: z.string().nullable().optional(),
  tracking_config: trackingConfigSchema.optional(),
  // O modo de exibição. Trocar para conversacional NÃO publica sozinho:
  // o público continua vendo a versão publicada até alguém clicar em
  // Publicar — senão uma troca de toggle mudaria o formulário no ar.
  display_mode: z.enum(["classic", "conversational"]).optional(),
  /**
   * O rascunho do fluxo (saltos, finais, tela de abertura). É um
   * `FormSchema` — a MESMA forma da versão publicada, de propósito: uma
   * segunda forma divergiria na primeira mudança e ninguém saberia qual
   * está olhando. Normalizado aqui, então JSON torto nunca chega ao banco.
   */
  draft_schema: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * Para onde vai o lead QUALIFICADO no formato de página única — ele
   * não tem finais, então o destino é do formulário e a régua de
   * qualificação é que decide quem o recebe. Quem não qualifica segue no
   * `success_message`/`redirect_url` de sempre.
   *
   * Campo NOMEADO de propósito: `settings` guarda também o
   * `abandono_stage_id`, e aceitar o objeto inteiro faria um save do
   * editor — que não conhece essa chave — apagá-la em silêncio.
   */
  destino_qualificado: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * O n8n que o submit avisa (`settings.webhook_url/secret`). NOMEADO pelo
   * mesmo motivo do destino: merge na coluna, nunca replace.
   */
  webhook: z
    .object({ url: z.string().url().max(2000), secret: z.string().max(200).nullable().optional() })
    .nullable()
    .optional(),
  locale: z.string().min(2).max(10).regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  // Quando fields fornecido, faz replace total: deleta os antigos e
  // insere os novos. Editor envia o array completo a cada save.
  fields: z.array(fieldUpsertSchema).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchFormSchema.parse(body)
    const { fields, redirect_url, logo_url, meta_capi_token, draft_schema, destino_qualificado, webhook, ...formData } = parsed

    // Coerce empty string -> null pra colunas URL.
    const update: Record<string, unknown> = { ...formData }
    if (redirect_url !== undefined) update.redirect_url = redirect_url || null
    if (logo_url !== undefined) update.logo_url = logo_url || null

    // Destino do qualificado: MERGE em `settings`, nunca replace — a
    // mesma coluna guarda o `abandono_stage_id`, e sobrescrevê-la
    // desligaria a fila do abandono sem nada dizer.
    if (destino_qualificado !== undefined || webhook !== undefined) {
      const { data: atual } = await admin
        .from("crm_forms")
        .select("settings")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle()
      const settings = { ...((atual?.settings as Record<string, unknown>) ?? {}) }
      if (destino_qualificado !== undefined) {
        const limpo = normalizarDestino(destino_qualificado)
        if (limpo) settings.destino_qualificado = limpo
        else delete settings.destino_qualificado
      }
      if (webhook !== undefined) {
        if (webhook) {
          settings.webhook_url = webhook.url
          if (webhook.secret) settings.webhook_secret = webhook.secret
          else delete settings.webhook_secret
        } else {
          delete settings.webhook_url
          delete settings.webhook_secret
        }
      }
      update.settings = settings
    }

    // Token da CAPI: so grava (cifrado) quando vem string nao-vazia. Vazio
    // ou omitido = mantem o atual (a UI so envia quando o usuario altera).
    if (typeof meta_capi_token === "string" && meta_capi_token.trim()) {
      update.meta_capi_token = encrypt(meta_capi_token.trim())
    }

    // Atualiza form.
    if (Object.keys(update).length > 0) {
      const { error } = await admin
        .from("crm_forms")
        .update(update)
        .eq("id", id)
        .eq("org_id", orgId)
      if (error) throw error
    }

    // Mexer nos campos ou no modo deixa o RASCUNHO à frente do que o
    // público vê: o conversacional lê `form_versions`, não esta tabela.
    // Sem esta marca, o operador salva, o formulário no ar continua igual
    // e nada em tela explica por quê.
    if (fields !== undefined || parsed.display_mode !== undefined || draft_schema !== undefined) {
      const { data: temVersao } = await admin
        .from("crm_forms")
        .select("published_version_id")
        .eq("id", id)
        .maybeSingle()
      if (temVersao?.published_version_id) {
        const { error: marcaErr } = await admin
          .from("crm_forms")
          .update({ has_unpublished_changes: true })
          .eq("id", id)
        // Coluna ausente (migration atrasada) não pode custar o save.
        if (marcaErr && marcaErr.code !== "42703" && marcaErr.code !== "PGRST204") {
          log.warn("form.marca_rascunho_falhou", { id, code: marcaErr.code })
        }
      }
    }

    let idsPorPosicao: string[] = []
    let refsRemapeados: Record<string, string> = {}

    // Upsert dos fields PRESERVANDO o id. Regenerar ids (delete+insert)
    // quebra tudo que referencia crm_form_fields.id — regras de tracking e
    // as answers historicas das submissoes. Por isso: mantem ids existentes,
    // insere novos e deleta so os que sumiram do editor.
    if (fields !== undefined) {
      // Garante que o form e da org (RLS bypass com admin client exige check manual).
      const { data: ownForm } = await admin
        .from("crm_forms")
        .select("id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle()
      if (!ownForm) {
        throw new AppError("Form nao encontrado", 404, "not-found")
      }

      // Whitelist explicita (evita campos extras que nao existem no schema).
      const toRow = (f: unknown, idx: number, keepId: boolean) => {
        const row = f as Record<string, unknown>
        const base: Record<string, unknown> = {
          form_id: id,
          field_type: row.field_type,
          label: row.label,
          placeholder: row.placeholder ?? null,
          description: row.description ?? null,
          required: row.required ?? false,
          position: (row.position as number | undefined) ?? idx,
          // options/validation sao NOT NULL no banco; defaulta com [] / {}
          options: row.options ?? [],
          validation: row.validation ?? {},
          map_to_lead_field: row.map_to_lead_field ?? null,
          media: normalizarMidia(row.media),
        }
        if (keepId) base.id = row.id
        return base
      }

      const existing = fields.filter((f) => !!f.id)
      const novos = fields.filter((f) => !f.id)
      const keepIds = existing.map((f) => f.id as string)

      // Deleta os campos removidos no editor (ids atuais que nao voltaram).
      let del = admin.from("crm_form_fields").delete().eq("form_id", id)
      if (keepIds.length > 0) {
        del = del.not("id", "in", `(${keepIds.join(",")})`)
      }
      const { error: delErr } = await del
      if (delErr) throw delErr

      /**
       * `media` é da migration 20261167, e migration deste repo é
       * aplicada à mão. Sem o retry, um ambiente atrasado faria o editor
       * inteiro parar de salvar por causa de uma coluna que quase nenhum
       * campo usa — a tela perde a mídia, não o trabalho.
       */
      const semColuna = (e: { code?: string; message?: string } | null) =>
        !!e && (e.code === "42703" || e.code === "PGRST204" || /media/i.test(e.message ?? ""))
      const gravar = async (linhas: Record<string, unknown>[], modo: "upsert" | "insert") => {
        const enviar = (rows: Record<string, unknown>[]) =>
          modo === "upsert"
            ? admin.from("crm_form_fields").upsert(rows)
            : admin.from("crm_form_fields").insert(rows)
        const { error } = await enviar(linhas)
        if (!error) return
        if (!semColuna(error)) throw error
        log.warn("[Forms] coluna media ausente — gravando sem ela", { form: id })
        const { error: retry } = await enviar(
          linhas.map(({ media: _media, ...resto }) => resto),
        )
        if (retry) throw retry
      }

      if (existing.length > 0) {
        await gravar(existing.map((f, i) => toRow(f, i, true)), "upsert")
      }
      if (novos.length > 0) {
        await gravar(novos.map((f, i) => toRow(f, i, false)), "insert")
      }

      /**
       * Devolver os ids é o que impede a pergunta nova de trocar de
       * identidade a cada save.
       *
       * O editor mantém a pergunta recém-criada sem `id` no estado local.
       * Sem receber o id de volta, o save seguinte a trataria como nova de
       * novo: ela cairia no `delete ... not in (keepIds)` e voltaria com
       * OUTRO id — levando junto a regra de tracking que aponta para o id
       * antigo e desligando as respostas já gravadas daquela pergunta.
       */
      const { data: persistidos } = await admin
        .from("crm_form_fields")
        .select("id, position")
        .eq("form_id", id)
        .order("position", { ascending: true })
      idsPorPosicao = (persistidos ?? []).map((r) => r.id as string)

      refsRemapeados = mapaPorPosicao(
        fields
          .map((f, i) => ({ posicao: (f.position ?? i) as number, ref: f.temp_ref ?? "" }))
          .filter((x) => x.ref !== ""),
        idsPorPosicao,
      )
    }

    /**
     * O rascunho do fluxo é gravado DEPOIS dos campos, e com os endereços
     * já trocados: a regra escrita para uma pergunta criada neste mesmo
     * save aponta para o id que o banco acabou de dar, não para o
     * provisório da tela — que nunca mais existiria.
     */
    if (draft_schema !== undefined) {
      const rascunho =
        draft_schema === null
          ? null
          : remapearRefs(normalizarSchema(draft_schema), refsRemapeados)
      const { error: draftErr } = await admin
        .from("crm_forms")
        .update({ draft_schema: rascunho })
        .eq("id", id)
        .eq("org_id", orgId)
      if (draftErr) throw draftErr
    }

    return successResponse(request, {
      ok: true,
      /** Ids na ordem das posições — o editor os adota nos campos novos. */
      field_ids: idsPorPosicao,
      /** De/para dos endereços provisórios, para a tela alinhar o rascunho. */
      refs_remapeados: refsRemapeados,
    })
  } catch (error) {
    log.error("Form PATCH error:", error)
    return errorResponse(request, error, "crm-form-patch")
  }
}

// ── DELETE ───────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    // Soft delete: status=archived. Mantem submissions ja recebidas.
    const { error } = await admin
      .from("crm_forms")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("org_id", orgId)
    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Form DELETE error:", error)
    return errorResponse(request, error, "crm-form-delete")
  }
}
