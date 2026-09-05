/**
 * GET /api/transcricoes/[id]/export?formato=txt|srt|md
 *
 * Montado no servidor: o texto inteiro de uma aula de 47 min não precisa
 * viajar até o navegador só para ser concatenado lá. O SRT usa o `s` e o
 * `fim` de cada bloco; o Markdown leva os tópicos como cabeçalhos.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { carregarDetalhe } from "@/lib/services/transcricoes.service"
import { exportar, MIME, nomeArquivo, type FormatoExport } from "@/lib/transcricoes/export"

export const dynamic = "force-dynamic"

const FORMATOS: FormatoExport[] = ["txt", "srt", "md"]

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const bruto = request.nextUrl.searchParams.get("formato") ?? "txt"
    const formato = FORMATOS.includes(bruto as FormatoExport) ? (bruto as FormatoExport) : "txt"

    const t = await carregarDetalhe(admin, orgId, id)
    if (!t) throw new AppError("Transcrição não encontrada.", 404)
    if (!t.blocos.length) throw new AppError("Esta transcrição ainda não tem texto para exportar.", 409)

    const conteudo = exportar(formato, {
      titulo: t.titulo,
      canal: t.canal,
      urlOriginal: t.urlOriginal,
      publicadoEm: t.publicadoEm,
      duracaoSeg: t.duracaoSeg,
      blocos: t.blocos,
      locutores: t.locutores,
      topicos: t.topicos,
    })

    return new NextResponse(conteudo, {
      headers: {
        "Content-Type": MIME[formato],
        "Content-Disposition": `attachment; filename="${nomeArquivo(t.titulo, formato)}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return errorResponse(request, error, "transcricao-export")
  }
}
