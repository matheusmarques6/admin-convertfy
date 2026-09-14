/**
 * Varredura da biblioteca — tokens de identidade (B5).
 *
 * GET  = prévia: para cada variante, o que a tokenização MUDARIA (mapa
 *        de/para, o que ficou sem papel, o HTML tokenizado) e as paletas de
 *        prova (Luxe Lift e Innova Bay, lidas da identidade real quando
 *        existem) para a tela renderizar o resultado nas duas. Nada gravado.
 * POST = aplica em `ids`: grava `html`/`html_tagged` tokenizados, marca
 *        `tokens_de_identidade = true` e guarda o HTML anterior em
 *        `geracao_meta.tokenizacao` — a heurística é reversível por linha.
 *
 * Hash do renderizado (CM-6): mesma regra da varredura de largura — o
 * exemplo continua descrevendo a mesma variante, então um hash em dia com
 * o html antigo acompanha o novo.
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { sourceSha } from "@/lib/agents/shared/rendered-reference"
import { tokenizarIdentidade, type MapaDeToken, type NaoInferido } from "@/lib/agents/html/identity-tokenize"
import { tokensDaLoja } from "@/lib/agents/html/apply-identity-tokens"
import { VALOR_PADRAO, type TokenDeIdentidade, type ValoresDeTokens } from "@/lib/agents/html/identity-tokens"
import { logger } from "@/lib/logger"

const log = logger.child("ComponentsTokenizeIdentity")

export const dynamic = "force-dynamic"

interface VariantRow {
  id: string
  name: string
  block_type: string
  is_active: boolean
  html: string | null
  html_tagged: string | null
  tokens_de_identidade: boolean | null
  rendered_html_source_sha: string | null
  geracao_meta: Record<string, unknown> | null
}

export interface TokenizeItem {
  id: string
  name: string
  block_type: string
  is_active: boolean
  /** A coluna já diz que a variante usa tokens. */
  flag_atual: boolean
  ja_tokenizado: boolean
  mapa: MapaDeToken[]
  nao_inferidos: NaoInferido[]
  tokens_presentes: TokenDeIdentidade[]
  html_changed: boolean
  tagged_changed: boolean
  /** HTML depois da tokenização — a tela aplica as paletas de prova nele. */
  html_tokenizado: string
}

export interface PaletaDeProva {
  nome: string
  origem: "loja" | "padrao"
  tokens: ValoresDeTokens
}

function planFor(row: VariantRow): TokenizeItem {
  const html = row.html ?? ""
  const r = tokenizarIdentidade(html)
  const tagged = row.html_tagged ? tokenizarIdentidade(row.html_tagged) : null
  return {
    id: row.id,
    name: row.name,
    block_type: row.block_type,
    is_active: row.is_active,
    flag_atual: row.tokens_de_identidade === true,
    ja_tokenizado: r.ja_tokenizado,
    mapa: r.mapa,
    nao_inferidos: r.nao_inferidos,
    tokens_presentes: r.tokens_presentes,
    html_changed: !r.inalterado,
    tagged_changed: tagged ? !tagged.inalterado : false,
    html_tokenizado: r.html,
  }
}

async function loadRows(
  admin: ReturnType<typeof createAdminClient>,
  opts: { includeInactive: boolean; ids?: string[] },
): Promise<VariantRow[]> {
  let q = admin
    .from("email_component_variants")
    .select("id, name, block_type, is_active, html, html_tagged, tokens_de_identidade, rendered_html_source_sha, geracao_meta")
    .order("block_type", { ascending: true })
    .order("name", { ascending: true })
  if (opts.ids && opts.ids.length > 0) q = q.in("id", opts.ids)
  else if (!opts.includeInactive) q = q.eq("is_active", true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as VariantRow[]
}

/** Paletas de prova: as duas lojas de teste do plano, senão duas fixas. */
async function paletasDeProva(admin: ReturnType<typeof createAdminClient>): Promise<PaletaDeProva[]> {
  const alvos: Array<{ nome: string; padrao: ValoresDeTokens }> = [
    {
      nome: "Luxe Lift",
      padrao: { ...VALOR_PADRAO, COR_PRINCIPAL: "#3D2820", COR_FUNDO: "#FAF5F3", COR_TEXTO: "#1F1F1F", COR_SUPERFICIE: "#F0E8E4", COR_DESTAQUE: "#6B4A3E", FONTE_TITULO: "'Playfair Display',Georgia,'Times New Roman',serif", FONTE_CORPO: "Lato,Arial,Helvetica,sans-serif" },
    },
    {
      nome: "Innova Bay",
      padrao: { ...VALOR_PADRAO, COR_PRINCIPAL: "#034326", COR_FUNDO: "#FFFFFF", COR_TEXTO: "#1F1F1F", COR_SUPERFICIE: "#F2F2F2", COR_DESTAQUE: "#2E7D4F", FONTE_TITULO: "Poppins,Arial,Helvetica,sans-serif", FONTE_CORPO: "Poppins,Arial,Helvetica,sans-serif" },
    },
  ]
  const out: PaletaDeProva[] = []
  for (const alvo of alvos) {
    try {
      const { data: store } = await admin
        .from("client_stores")
        .select("id, store_name")
        .ilike("store_name", `${alvo.nome}%`)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!store?.id) {
        out.push({ nome: alvo.nome, origem: "padrao", tokens: alvo.padrao })
        continue
      }
      const { data: brand } = await admin
        .from("store_brand_identity")
        .select("colors_primary, colors_secondary, font_heading, font_body, font_heading_weight, font_body_weight")
        .eq("store_id", store.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
      out.push({
        nome: (store.store_name as string) || alvo.nome,
        origem: brand ? "loja" : "padrao",
        tokens: brand ? tokensDaLoja(brand) : alvo.padrao,
      })
    } catch (err) {
      log.warn("components.tokenize_identity.paleta_fallback", { nome: alvo.nome, error: err instanceof Error ? err.message : String(err) })
      out.push({ nome: alvo.nome, origem: "padrao", tokens: alvo.padrao })
    }
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true"
    const [rows, paletas] = await Promise.all([loadRows(admin, { includeInactive }), paletasDeProva(admin)])
    const items = rows.map(planFor)
    const summary = {
      total: items.length,
      to_change: items.filter((i) => i.html_changed || i.tagged_changed || (i.ja_tokenizado && !i.flag_atual)).length,
      already_tokenized: items.filter((i) => i.flag_atual).length,
      nothing_inferred: items.filter((i) => !i.html_changed && !i.ja_tokenizado).length,
    }
    return successResponse(request, { items, summary, paletas })
  } catch (error) {
    log.error("components.tokenize_identity.get", error)
    return errorResponse(request, error, "components-tokenize-identity-get")
  }
}

const postSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = postSchema.parse(await request.json().catch(() => ({})))
    const rows = await loadRows(admin, { includeInactive: true, ids: body.ids })

    const updated: string[] = []
    const failed: Array<{ id: string; error: string }> = []
    for (const row of rows) {
      const html = row.html ?? ""
      const r = tokenizarIdentidade(html)
      const tagged = row.html_tagged ? tokenizarIdentidade(row.html_tagged) : null
      const temTokens = r.tokens_presentes.length > 0
      if (!temTokens) {
        failed.push({ id: row.id, error: "nada inferido — a variante ficou sem token nenhum" })
        continue
      }
      const patch: Record<string, unknown> = { tokens_de_identidade: true }
      if (!r.inalterado) {
        patch.html = r.html
        if (row.rendered_html_source_sha && row.rendered_html_source_sha === sourceSha(html)) {
          patch.rendered_html_source_sha = sourceSha(r.html)
        }
      }
      if (tagged && !tagged.inalterado) patch.html_tagged = tagged.html
      if (!r.inalterado || (tagged && !tagged.inalterado)) {
        // Reversível por linha: o HTML anterior fica na própria variante.
        patch.geracao_meta = {
          ...(row.geracao_meta ?? {}),
          tokenizacao: {
            aplicado_em: new Date().toISOString(),
            por: user.id,
            html_antes: r.inalterado ? null : html,
            html_tagged_antes: tagged && !tagged.inalterado ? row.html_tagged : null,
            mapa: r.mapa,
            nao_inferidos: r.nao_inferidos,
          },
        }
      }
      const { error } = await admin.from("email_component_variants").update(patch).eq("id", row.id)
      if (error) {
        failed.push({ id: row.id, error: error.message })
        continue
      }
      updated.push(row.id)
    }

    log.info("components.tokenize_identity.apply", { by: user.id, updated: updated.length, failed: failed.length })
    return successResponse(request, { updated, failed })
  } catch (error) {
    log.error("components.tokenize_identity.post", error)
    return errorResponse(request, error, "components-tokenize-identity-post")
  }
}
