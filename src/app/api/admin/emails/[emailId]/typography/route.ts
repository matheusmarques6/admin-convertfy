/**
 * Tipografia de UM e-mail, editada na tela (modo Editar do Workspace).
 *
 * `GET`  — o inventário das declarações de fonte, as famílias do documento
 *          com contagem, as fontes efetivas da peça e o ajuste já gravado.
 *          É o que o painel precisa para abrir.
 * `POST` — dois modos:
 *          `aplicar`  → troca por CÓDIGO (famílias da peça e/ou ops por
 *                       item). Instantâneo, sem modelo.
 *          `repensar` → chama o agente de Tipografia sobre o documento
 *                       atual, com as fontes DESTA peça.
 *
 * Escreve `html` e `html_marked` JUNTOS, num único UPDATE. Gravar só um é o
 * defeito do `fix-dark-canvas`, que deixa os dois documentos divergentes e
 * faz um `structure-review` posterior reintroduzir o estado antigo. Não usa
 * a RPC `aplicar_estrutura_email`: ela exige partição exata dos blocos e
 * renumera posições — martelo transacional para uma linha só.
 *
 * NUNCA escreve em `store_brand_identity`. A identidade é versionada e
 * aprovada; o ajuste aqui é da peça (migration 20261112).
 *
 * Auth: `requireAuth` (mesma régua das demais rotas de `/api/admin/email*`).
 * RLS sem policies = service-role only; esta rota É o caminho.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  ValidationError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { stripCfyBlockMarkers } from "@/lib/agents/html/post-process"
import { extractTypographyInventory } from "@/lib/agents/typography/inventory"
import { familiasDoDocumento } from "@/lib/agents/typography/swap-fonts"
import {
  fontesEfetivas,
  parseTypographyOverride,
  type TypographyOverride,
} from "@/lib/agents/typography/fontes-efetivas"
import {
  aplicarEdicaoTipografica,
  type OpComEsperado,
} from "@/lib/agents/typography/edit"
import type { TypographyOpHumana } from "@/lib/agents/typography/rules"

const log = logger.child("EmailTypography")

export const dynamic = "force-dynamic"

interface EmailRow {
  id: string
  number: number
  html: string | null
  html_marked: string | null
  typography_override: unknown
  updated_at: string
  flow: { id: string; store_id: string; flow_type: string }
}

async function loadEmail(
  admin: ReturnType<typeof createAdminClient>,
  emailId: string,
): Promise<EmailRow> {
  const { data, error } = await admin
    .from("email_flow_emails")
    .select(
      "id, number, html, html_marked, typography_override, updated_at, flow:email_flows!inner(id, store_id, flow_type)",
    )
    .eq("id", emailId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ValidationError("Email não encontrado")
  return data as unknown as EmailRow
}

/** Última versão da identidade visual — só para LER a fonte da marca. */
async function loadFontesDaMarca(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
) {
  const { data } = await admin
    .from("store_brand_identity")
    .select("font_heading, font_heading_weight, font_body, font_body_weight")
    .eq("store_id", storeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as {
    font_heading?: string | null
    font_heading_weight?: string | null
    font_body?: string | null
    font_body_weight?: string | null
  } | null
}

/**
 * O documento em que se escreve. `html_marked` quando existe (preserva os
 * marcadores de bloco); senão `html`. Tipografia NÃO exige marcado, ao
 * contrário da edição de estrutura: o inventário funciona sobre qualquer
 * HTML — só se perde o rótulo do bloco no painel.
 */
function documentoBase(email: EmailRow): { doc: string; temMarcado: boolean } {
  if (email.html_marked) return { doc: email.html_marked, temMarcado: true }
  if (email.html) return { doc: email.html, temMarcado: false }
  throw new ValidationError("Este e-mail ainda não tem HTML gerado")
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const email = await loadEmail(admin, emailId)
    const marca = await loadFontesDaMarca(admin, email.flow.store_id)
    const override = parseTypographyOverride(email.typography_override)
    const { doc, temMarcado } = documentoBase(email)
    const inventario = extractTypographyInventory(doc)

    return successResponse(request, {
      inventario,
      familias: familiasDoDocumento(inventario),
      fontes: fontesEfetivas(marca, override),
      override,
      /** false = o painel não mostra rótulo de bloco (documento sem marcadores). */
      tem_marcado: temMarcado,
      updated_at: email.updated_at,
    })
  } catch (error) {
    log.error("GET typography error", error)
    return errorResponse(request, error, "email-typography-get")
  }
}

const esperadoSchema = z.object({
  family: z.string().optional(),
  sizePx: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  tag: z.string().optional(),
})

const opSchema = z.object({
  item: z.number().int().min(0),
  familia: z.string().optional(),
  peso: z.number().int().optional(),
  tamanho_px: z.number().int().optional(),
  caixa: z.enum(["alta", "normal"]).optional(),
  tracking: z.string().optional(),
  motivo: z.string().trim().max(400).default("ajuste manual"),
  esperado: esperadoSchema.optional(),
})

const postSchema = z.object({
  modo: z.enum(["aplicar", "repensar"]).default("aplicar"),
  /** Troca de família da peça inteira: família ATUAL → família nova. */
  familias: z
    .array(z.object({ de: z.string().trim().min(1), para: z.string().trim().min(1) }))
    .max(8)
    .optional(),
  /** Fontes da peça, gravadas no override (o que sobrevive a um re-render). */
  fontes: z
    .object({
      heading: z.string().trim().max(60).nullable().optional(),
      heading_weight: z.string().trim().max(20).nullable().optional(),
      body: z.string().trim().max(60).nullable().optional(),
      body_weight: z.string().trim().max(20).nullable().optional(),
    })
    .optional(),
  ops: z.array(opSchema).max(200).optional(),
  /** `updated_at` que a tela viu — trava otimista. */
  base_updated_at: z.string().optional(),
})

/**
 * Junta o que já estava gravado com o que acabou de ser feito. As `fontes`
 * são mescladas campo a campo (trocar só o título não apaga o corpo); as
 * `ops` são indexadas por item, então reeditar o mesmo lugar substitui em
 * vez de empilhar.
 */
function mesclarOverride(
  atual: TypographyOverride | null,
  fontes: TypographyOverride["fontes"] | undefined,
  ops: ReadonlyArray<TypographyOpHumana>,
  userId: string,
): TypographyOverride {
  const porItem = new Map((atual?.ops ?? []).map((o) => [o.item, o]))
  for (const op of ops) porItem.set(op.item, op)
  return {
    fontes: fontes ? { ...(atual?.fontes ?? {}), ...fontes } : (atual?.fontes ?? null),
    ops: [...porItem.values()].sort((a, b) => a.item - b.item),
    atualizado_em: new Date().toISOString(),
    atualizado_por: userId,
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = postSchema.parse(await request.json())
    if (body.modo === "repensar") {
      throw new ValidationError(
        "Repensar tipografia ainda não está ligado nesta rota",
      )
    }

    const email = await loadEmail(admin, emailId)
    if (body.base_updated_at && body.base_updated_at !== email.updated_at) {
      // O documento mudou entre a tela carregar e salvar (re-render, outra
      // aba). Os índices das ops não descrevem mais este HTML.
      return successResponse(request, {
        ok: false,
        motivo: "documento_mudou",
        updated_at: email.updated_at,
      })
    }

    const marca = await loadFontesDaMarca(admin, email.flow.store_id)
    const overrideAtual = parseTypographyOverride(email.typography_override)
    const efetivas = fontesEfetivas(marca, overrideAtual)
    const { doc, temMarcado } = documentoBase(email)

    const resultado = aplicarEdicaoTipografica({
      html: doc,
      familias: body.familias,
      ops: (body.ops ?? []) as OpComEsperado[],
      fonteDeTitulo: body.fontes?.heading || efetivas.heading,
      // A fonte da marca já vem declarada pela montagem: redeclará-la seria
      // pedir o mesmo arquivo duas vezes.
      webfontsDaMontagem: [efetivas.heading, efetivas.body],
    })

    if (resultado.invarianteViolado) {
      log.error("typography.invariante_violado", {
        emailId,
        violacao: resultado.invarianteViolado,
      })
      throw new ValidationError(
        `A mudança alterou a estrutura do e-mail (${resultado.invarianteViolado}) e não foi gravada`,
      )
    }

    const escreveu = resultado.aplicadas > 0 || resultado.familiasTrocadas > 0
    if (escreveu) {
      const override = mesclarOverride(
        overrideAtual,
        body.fontes,
        resultado.aplicadas > 0 ? (body.ops ?? []) : [],
        user.id,
      )
      const { error } = await admin
        .from("email_flow_emails")
        .update({
          html: stripCfyBlockMarkers(resultado.html),
          // Documento sem marcadores continua sem: inventar marcador aqui
          // faria a edição de ESTRUTURA achar que o e-mail é endereçável.
          ...(temMarcado ? { html_marked: resultado.html } : {}),
          typography_override: override,
          updated_at: new Date().toISOString(),
        })
        .eq("id", emailId)
      if (error) throw error
    }

    log.info("typography.aplicada", {
      emailId,
      aplicadas: resultado.aplicadas,
      familiasTrocadas: resultado.familiasTrocadas,
      avisos: resultado.avisos.length,
      descartadas: resultado.descartadas.length,
      desatualizados: resultado.desatualizados.length,
    })

    return successResponse(request, {
      ok: true,
      html_atualizado: escreveu,
      aplicadas: resultado.aplicadas,
      familias_trocadas: resultado.familiasTrocadas,
      avisos: resultado.avisos,
      descartadas: resultado.descartadas,
      desatualizados: resultado.desatualizados,
    })
  } catch (error) {
    log.error("POST typography error", error)
    return errorResponse(request, error, "email-typography-post")
  }
}
