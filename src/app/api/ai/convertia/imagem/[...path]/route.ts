/**
 * GET /api/ai/convertia/imagem/<path> — serve uma imagem gerada pela
 * ConvertIA.
 *
 * Existe porque a signed URL do Supabase quebrou: o token assinava um
 * caminho diferente do objeto gravado (um caractere a mais no id da
 * pasta) e o Storage recusava — a imagem aparecia com erro no chat.
 * Aqui o link não carrega credencial nenhuma: quem autoriza é a sessão
 * do admin, e o objeto é lido pelo service role.
 *
 * O escopo é por ORG: a pasta é o id da loja (que precisa ser da org do
 * usuário) ou `org-<uuid>` (que precisa ser a org dele). O bucket
 * guarda asset de todas as orgs — sem essa checagem, um path adivinhado
 * entregaria arte de cliente alheio.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  CONVERTIA_IMAGE_BUCKET,
  isConvertiaImagePath,
} from "@/lib/ai/convertia-image-url"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaImagem")

export const dynamic = "force-dynamic"

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params
    const path = (segments ?? []).map((s) => decodeURIComponent(s)).join("/")
    if (!isConvertiaImagePath(path)) {
      throw new AppError("Imagem não encontrada", 404, "not-found")
    }

    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    // stores/<pasta>/email-assets/<arquivo> — a pasta diz o dono.
    const folder = path.split("/")[1]
    if (folder.startsWith("org-")) {
      if (folder.slice(4) !== orgId) {
        throw new AppError("Imagem não encontrada", 404, "not-found")
      }
    } else {
      const { data: store } = await admin
        .from("client_stores")
        .select("id")
        .eq("id", folder)
        .eq("org_id", orgId)
        .maybeSingle()
      // 404 (e não 403): não confirma sequer que a loja existe.
      if (!store) throw new AppError("Imagem não encontrada", 404, "not-found")
    }

    const { data, error } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).download(path)
    if (error || !data) {
      log.warn("objeto indisponível", { path, error: error?.message })
      throw new AppError("Imagem não encontrada", 404, "not-found")
    }

    const ext = path.split(".").pop()?.toLowerCase() ?? "png"
    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        // privado: o cache é do navegador do usuário, nunca de CDN
        // compartilhada — o conteúdo é de um cliente específico.
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-imagem")
  }
}
