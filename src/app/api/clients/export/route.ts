/**
 * GET /api/clients/export?format=meta|full[&status=active]
 *
 * Exporta a carteira inteira em CSV. Dois formatos:
 *   - `meta` (padrão): lista de público personalizado do Meta Ads, com
 *     os cabeçalhos que ela reconhece e os valores normalizados.
 *   - `full`: planilha completa em português para Excel/Sheets.
 *
 * Busca TODOS os clientes, não a página atual: o PostgREST corta em
 * 1.000 linhas por requisição, então percorremos em blocos até o fim.
 * Sem isso, "exportar 100% da base" devolveria silenciosamente só o
 * primeiro milheiro — que é justamente o tipo de perda que ninguém
 * percebe até a campanha rodar com público pela metade.
 *
 * Usa o cliente COM RLS (não o admin): a exportação enxerga exatamente
 * o que a pessoa enxerga na tela.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  buildFullClientsCsv,
  buildMetaAudienceCsv,
  type ExportClient,
} from "@/lib/services/meta-audience-csv"

const log = logger.child("ClientsExport")

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Tamanho do bloco — abaixo do teto do PostgREST. */
const CHUNK = 1000
/** Teto de segurança para não montar um arquivo gigante em memória. */
const MAX_ROWS = 100_000

const VALID_STATUSES = ["active", "prospect", "churned", "paused", "inactive"]

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const sp = request.nextUrl.searchParams
    const format = sp.get("format") === "full" ? "full" : "meta"
    const status = sp.get("status")
    const onlyStatus = status && VALID_STATUSES.includes(status) ? status : null

    const all: ExportClient[] = []
    for (let offset = 0; offset < MAX_ROWS; offset += CHUNK) {
      let q = supabase
        .from("clients")
        .select("id, name, email, phone, company, cpf_cnpj, status, created_at, address")
        .order("created_at", { ascending: false })
        .range(offset, offset + CHUNK - 1)
      if (onlyStatus) q = q.eq("status", onlyStatus)

      const { data, error } = await q
      if (error) {
        // `cpf_cnpj`/`address` vêm de uma migration posterior ao schema
        // inicial: sem elas, exporta o que existe em vez de falhar.
        if (/column .* does not exist/i.test(error.message)) {
          let retry = supabase
            .from("clients")
            .select("id, name, email, phone, company, status, created_at")
            .order("created_at", { ascending: false })
            .range(offset, offset + CHUNK - 1)
          if (onlyStatus) retry = retry.eq("status", onlyStatus)
          const second = await retry
          if (second.error) throw second.error
          all.push(...((second.data ?? []) as ExportClient[]))
          if ((second.data?.length ?? 0) < CHUNK) break
          continue
        }
        throw error
      }

      all.push(...((data ?? []) as ExportClient[]))
      if ((data?.length ?? 0) < CHUNK) break
    }

    const stamp = new Date().toISOString().slice(0, 10)

    if (format === "full") {
      const csv = buildFullClientsCsv(all)
      log.info("export completo", { clients: all.length })
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="clientes-${stamp}.csv"`,
          "Cache-Control": "no-store",
          "X-Total-Clients": String(all.length),
        },
      })
    }

    const res = buildMetaAudienceCsv(all)
    log.info("export meta ads", {
      clients: all.length,
      rows: res.rows,
      skipped: res.skipped,
    })
    return new Response(res.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clientes-meta-ads-${stamp}.csv"`,
        "Cache-Control": "no-store",
        // Lidos pelo botão para informar o resultado sem abrir o arquivo.
        "X-Total-Clients": String(all.length),
        "X-Exported-Rows": String(res.rows),
        "X-Skipped-Rows": String(res.skipped),
        "X-With-Email": String(res.withEmail),
        "X-With-Phone": String(res.withPhone),
      },
    })
  } catch (error) {
    log.error("clients export error:", error)
    return errorResponse(request, error, "clients-export")
  }
}
