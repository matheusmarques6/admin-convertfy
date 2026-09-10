/**
 * Varredura da biblioteca — imagem embutida sai do HTML e vai para o Storage.
 *
 * GET  = prévia: o que cada variante (e cada referência montada) perde de
 *        peso, sem gravar nada. É a revisão humana antes de aplicar.
 * POST = aplica, subindo os arquivos e trocando os `data:` por URL pública.
 *
 * Molde do `normalize-width`, com uma diferença que importa: aqui o alvo
 * não é só `email_component_variants`. A montagem COPIA o html da variante
 * para `store_email_references`, então limpar só a biblioteca deixa as 11
 * referências já montadas carregando o base64 para sempre. `escopo` decide
 * qual dos dois lados varrer; o padrão é os dois.
 *
 * Ver `lib/email-workspace/email-base64.ts` para o porquê (o corte de
 * 102 KB do Gmail e o Outlook que não renderiza `data:`).
 */
import { NextRequest } from "next/server"
import { z } from "zod"

import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { auditarBase64 } from "@/lib/email-workspace/email-base64"
import { extrairBase64ParaStorage } from "@/lib/email-workspace/base64-para-storage.service"
import { logger } from "@/lib/logger"

const log = logger.child("ComponentsExtractBase64")

export const dynamic = "force-dynamic"
export const maxDuration = 300

type Escopo = "variantes" | "referencias" | "ambos"

interface Alvo {
  tabela: "email_component_variants" | "store_email_references"
  id: string
  rotulo: string
  html: string | null
  /** Só variantes têm a proposta do Taguedor. */
  htmlTagged?: string | null
}

async function carregarAlvos(
  admin: ReturnType<typeof createAdminClient>,
  escopo: Escopo,
  ids?: string[],
): Promise<Alvo[]> {
  const out: Alvo[] = []

  if (escopo !== "referencias") {
    let q = admin
      .from("email_component_variants")
      .select("id, name, block_type, html, html_tagged")
      .eq("is_active", true)
      .order("block_type")
      .order("name")
    if (ids?.length) q = q.in("id", ids)
    const { data, error } = await q
    if (error) throw error
    for (const r of (data ?? []) as Array<{
      id: string
      name: string
      block_type: string
      html: string | null
      html_tagged: string | null
    }>) {
      out.push({
        tabela: "email_component_variants",
        id: r.id,
        rotulo: `${r.block_type} · ${r.name}`,
        html: r.html,
        htmlTagged: r.html_tagged,
      })
    }
  }

  if (escopo !== "variantes") {
    let q = admin
      .from("store_email_references")
      .select("id, store_id, flow_type, email_number, html")
      .order("created_at", { ascending: false })
    if (ids?.length) q = q.in("id", ids)
    const { data, error } = await q
    if (error) throw error
    for (const r of (data ?? []) as Array<{
      id: string
      store_id: string
      flow_type: string
      email_number: number
      html: string | null
    }>) {
      out.push({
        tabela: "store_email_references",
        id: r.id,
        rotulo: `referência · ${r.flow_type} #${r.email_number}`,
        html: r.html,
      })
    }
  }

  return out
}

const escopoSchema = z
  .enum(["variantes", "referencias", "ambos"])
  .optional()
  .default("ambos")

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const escopo = escopoSchema.parse(
      request.nextUrl.searchParams.get("escopo") ?? undefined,
    )
    const alvos = await carregarAlvos(admin, escopo)
    const items = alvos
      .map((a) => {
        const audit = auditarBase64(a.html ?? "")
        return {
          tabela: a.tabela,
          id: a.id,
          rotulo: a.rotulo,
          html_chars: (a.html ?? "").length,
          ...audit,
        }
      })
      .filter((i) => i.extraiveis > 0)
      .sort((a, b) => b.charsEconomizados - a.charsEconomizados)

    return successResponse(request, {
      items,
      summary: {
        varridos: alvos.length,
        com_base64: items.length,
        arquivos_a_extrair: items.reduce((s, i) => s + i.extraiveis, 0),
        bytes: items.reduce((s, i) => s + i.bytesExtraiveis, 0),
        chars_economizados: items.reduce((s, i) => s + i.charsEconomizados, 0),
      },
    })
  } catch (error) {
    log.error("components.extract_base64.get", error)
    return errorResponse(request, error, "components-extract-base64-get")
  }
}

const postSchema = z.object({
  ids: z.array(z.string().uuid()).max(500).optional(),
  escopo: escopoSchema,
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = postSchema.parse(await request.json().catch(() => ({})))
    const alvos = await carregarAlvos(admin, body.escopo, body.ids)

    const aplicados: Array<{
      id: string
      rotulo: string
      trocados: number
      arquivos: number
      chars_antes: number
      chars_depois: number
    }> = []
    const falhas: Array<{ id: string; rotulo: string; erro: string }> = []

    for (const alvo of alvos) {
      const html = alvo.html ?? ""
      if (auditarBase64(html).ok && !alvo.htmlTagged) continue

      try {
        const r = await extrairBase64ParaStorage(html)
        const tagged = alvo.htmlTagged
          ? await extrairBase64ParaStorage(alvo.htmlTagged)
          : null
        if (r.trocados === 0 && !tagged?.trocados) continue

        const patch: Record<string, unknown> = {}
        if (r.trocados > 0) patch.html = r.html
        if (tagged && tagged.trocados > 0) patch.html_tagged = tagged.html

        const { error } = await admin
          .from(alvo.tabela)
          .update(patch)
          .eq("id", alvo.id)
        if (error) throw new Error(error.message)

        aplicados.push({
          id: alvo.id,
          rotulo: alvo.rotulo,
          trocados: r.trocados + (tagged?.trocados ?? 0),
          arquivos: r.arquivos + (tagged?.arquivos ?? 0),
          chars_antes: html.length,
          chars_depois: r.html.length,
        })

        // Upload que falhou deixa o payload embutido — reportar é o que
        // impede a varredura de parecer completa quando não foi.
        for (const f of [...r.falhas, ...(tagged?.falhas ?? [])]) {
          falhas.push({ id: alvo.id, rotulo: alvo.rotulo, erro: f.erro })
        }
      } catch (e) {
        falhas.push({
          id: alvo.id,
          rotulo: alvo.rotulo,
          erro: e instanceof Error ? e.message : String(e),
        })
      }
    }

    log.info("components.extract_base64.apply", {
      by: user.id,
      aplicados: aplicados.length,
      falhas: falhas.length,
    })
    return successResponse(request, {
      aplicados,
      falhas,
      resumo: {
        itens: aplicados.length,
        arquivos: aplicados.reduce((s, a) => s + a.arquivos, 0),
        chars_economizados: aplicados.reduce(
          (s, a) => s + (a.chars_antes - a.chars_depois),
          0,
        ),
      },
    })
  } catch (error) {
    log.error("components.extract_base64.post", error)
    return errorResponse(request, error, "components-extract-base64-post")
  }
}
