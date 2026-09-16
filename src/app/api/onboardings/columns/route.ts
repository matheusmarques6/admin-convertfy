import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import {
  canPerform,
  requireOnboardingPermission,
} from "@/lib/api/onboarding-permissions"
import { SEED_COLUMNS } from "@/lib/services/onboarding-bootstrap.service"
import {
  VARS_DO_TEMPLATE,
  varsDesconhecidas,
} from "@/lib/onboarding/preview-do-avanco"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingColumns")

/**
 * GET/PUT /api/onboardings/columns
 *
 * O texto de WhatsApp de cada etapa. Ate 16/09/2026 ele so existia no
 * `SEED_COLUMNS` e o re-sync do bootstrap o reescrevia a cada 5 minutos —
 * nao havia como ajustar uma virgula sem deploy.
 *
 * `createAdminClient` e nao acesso direto porque a policy `op_cols_manage`
 * exige `owner|manager|coo|coordinator` e a org nao tem nenhum dos tres do
 * meio: pela RLS so o dono editaria. Quem decide e a matriz de
 * `requireOnboardingPermission`, e o escopo por org e feito aqui, a mao.
 */

export const dynamic = "force-dynamic"

const PADRAO_POR_SLUG = new Map(
  SEED_COLUMNS.map((c) => [c.slug, c.whatsapp_template ?? null]),
)

/**
 * O `SEED_COLUMNS` e da pipeline de ONBOARDING, e o slug NAO e unico entre
 * pipelines: `implementacao` existe nas duas da org (medido em 16/09). Casar o
 * padrao so pelo slug poria a mensagem do tutorial numa etapa de Design de
 * Campanhas no "voltar ao padrao".
 *
 * A tela tambem lista so esta pipeline, e nao por economia: `buildVars` le
 * `onboardings`, entao mensagem de outra pipeline nao teria de onde tirar
 * cliente, loja nem link — seria um campo que nunca manda nada.
 */
const PIPELINE_DO_ONBOARDING = "onboarding"

/** Colunas das pipelines DA ORG — o escopo que a RLS faria por nos. */
async function colunasDaOrg(orgId: string) {
  const admin = createAdminClient()
  const { data: pipes } = await admin
    .from("operational_pipelines")
    .select("id, name, slug")
    .eq("org_id", orgId)
    .eq("slug", PIPELINE_DO_ONBOARDING)
  const pipelines = pipes ?? []
  if (pipelines.length === 0) return { pipelines, colunas: [] as never[] }

  const { data, error } = await admin
    .from("operational_pipeline_columns")
    .select(
      "id, pipeline_id, name, slug, position, whatsapp_template, whatsapp_template_editado_em, whatsapp_template_editado_por",
    )
    .in(
      "pipeline_id",
      pipelines.map((p) => p.id),
    )
    .order("position", { ascending: true })

  // Migration 20261159 aplicada a mao; sem ela, a tela AINDA lista e edita —
  // o que se perde e a guarda do re-sync, e isso a UI declara.
  if (error) {
    log.warn("select com carimbo falhou — listando sem ele", {
      code: error.code,
      msg: error.message,
    })
    const { data: basico } = await admin
      .from("operational_pipeline_columns")
      .select("id, pipeline_id, name, slug, position, whatsapp_template")
      .in(
        "pipeline_id",
        pipelines.map((p) => p.id),
      )
      .order("position", { ascending: true })
    return { pipelines, colunas: (basico ?? []) as never[], semCarimbo: true }
  }
  return { pipelines, colunas: (data ?? []) as never[] }
}

type Linha = {
  id: string
  pipeline_id: string
  name: string
  slug: string
  position: number
  whatsapp_template: string | null
  whatsapp_template_editado_em?: string | null
  whatsapp_template_editado_por?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireOnboardingPermission(user.id, "read")

    const { pipelines, colunas, semCarimbo } = await colunasDaOrg(ctx.orgId)
    const linhas = colunas as unknown as Linha[]

    const autores = linhas
      .map((c) => c.whatsapp_template_editado_por)
      .filter((x): x is string => !!x)
    const admin = createAdminClient()
    const { data: perfis } = autores.length
      ? await admin.from("profiles").select("id, name").in("id", autores)
      : { data: [] }
    const nomePorId = new Map((perfis ?? []).map((p) => [p.id, p.name]))
    const nomePipeline = new Map(pipelines.map((p) => [p.id, p.name]))

    return successResponse(request, {
      // Quem PODE editar e decidido aqui, pela MESMA matriz que o PUT usa —
      // uma segunda lista de papeis divergiria e a tela ofereceria um campo
      // que a gravacao recusa.
      pode_editar: canPerform(ctx.roles, "manage_templates"),
      // Sem a migration a edicao funciona e dura ate 5 minutos. Dizer isso na
      // tela e o minimo: a alternativa e o operador achar que o texto sumiu.
      guarda_ativa: !semCarimbo,
      variaveis: Object.entries(VARS_DO_TEMPLATE).map(([chave, label]) => ({
        chave,
        label,
      })),
      colunas: linhas.map((c) => {
        const padrao = PADRAO_POR_SLUG.get(c.slug) ?? null
        const texto = c.whatsapp_template ?? null
        return {
          id: c.id,
          nome: c.name,
          slug: c.slug,
          posicao: c.position,
          pipeline: nomePipeline.get(c.pipeline_id) ?? null,
          texto,
          padrao,
          /** Existe no seed? Sem isso nao ha "voltar ao padrão" que faça sentido. */
          tem_padrao: PADRAO_POR_SLUG.has(c.slug) && padrao !== null,
          fora_do_padrao: Boolean(c.whatsapp_template_editado_em),
          editado_em: c.whatsapp_template_editado_em ?? null,
          editado_por: c.whatsapp_template_editado_por
            ? (nomePorId.get(c.whatsapp_template_editado_por) ?? null)
            : null,
        }
      }),
    })
  } catch (error) {
    return errorResponse(request, error, "onboarding-columns")
  }
}

const putSchema = z
  .object({
    id: z.string().uuid(),
    texto: z.string().max(4000).optional(),
    /** Limpa o carimbo e devolve a coluna ao seed. */
    restaurar: z.boolean().optional(),
  })
  .refine((v) => v.restaurar === true || typeof v.texto === "string", {
    message: "Informe o texto ou peça a restauração",
  })

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireOnboardingPermission(user.id, "manage_templates")

    const body = putSchema.parse(await request.json())
    const admin = createAdminClient()

    // Escopo por org na mao — o service role bypassa RLS, entao a coluna de
    // outra organizacao seria editavel por id se ninguem conferisse.
    const { colunas } = await colunasDaOrg(ctx.orgId)
    const alvo = (colunas as unknown as Linha[]).find((c) => c.id === body.id)
    if (!alvo) throw new AppError("Etapa não encontrada nesta organização", 404)

    if (body.restaurar) {
      const padrao = PADRAO_POR_SLUG.get(alvo.slug) ?? null
      const { error } = await admin
        .from("operational_pipeline_columns")
        .update({
          whatsapp_template: padrao,
          whatsapp_template_editado_em: null,
          whatsapp_template_editado_por: null,
        })
        .eq("id", alvo.id)
      if (error) throw new AppError(error.message, 500)
      return successResponse(request, { ok: true, texto: padrao })
    }

    const texto = (body.texto ?? "").trim()

    // Variavel que `buildVars` nao produz seria enviada CRUA ao cliente — foi
    // exatamente isso que aconteceu com `{{tutorial_link}}` em 15/09. Recusar
    // aqui e a unica hora em que da pra consertar antes de alguem receber.
    const desconhecidas = varsDesconhecidas(texto)
    if (desconhecidas.length > 0) {
      throw new AppError(
        `Estas variáveis não existem: ${desconhecidas
          .map((v) => `{{${v}}}`)
          .join(", ")}. Disponíveis: ${Object.keys(VARS_DO_TEMPLATE)
          .map((v) => `{{${v}}}`)
          .join(", ")}`,
        422,
      )
    }

    const patch: Record<string, unknown> = {
      whatsapp_template: texto || null,
      whatsapp_template_editado_em: new Date().toISOString(),
      whatsapp_template_editado_por: user.id,
    }
    const { error } = await admin
      .from("operational_pipeline_columns")
      .update(patch)
      .eq("id", alvo.id)

    if (error) {
      // Sem a migration o carimbo nao existe: grava o texto mesmo assim e
      // AVISA, em vez de recusar a edicao. O re-sync vai reverter em ate 5
      // minutos, e e isso que a resposta declara.
      const semColuna = ["42703", "PGRST204", "PGRST205"].includes(
        error.code ?? "",
      )
      if (!semColuna) throw new AppError(error.message, 500)
      log.warn("carimbo ausente — gravando sem a guarda", { code: error.code })
      const { error: err2 } = await admin
        .from("operational_pipeline_columns")
        .update({ whatsapp_template: texto || null })
        .eq("id", alvo.id)
      if (err2) throw new AppError(err2.message, 500)
      return successResponse(request, {
        ok: true,
        texto: texto || null,
        aviso:
          "A migration 20261159 ainda não foi aplicada: este texto volta ao padrão em até 5 minutos.",
      })
    }

    return successResponse(request, { ok: true, texto: texto || null })
  } catch (error) {
    return errorResponse(request, error, "onboarding-columns")
  }
}
