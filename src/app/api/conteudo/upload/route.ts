/**
 * POST /api/conteudo/upload — imagem do Estúdio (slot, avatar, referência)
 * para o Storage da org. FormData: `file` (PNG/JPG/WebP ≤ 15 MB) e `kind`
 * (`slide` | `avatar`). Redimensiona no servidor (≤ 1350px; avatar 256px) e
 * devolve a URL servida pelo admin (`/api/ai/convertia/imagem/...`), que não
 * expira e só abre para a org dona — a mesma régua das imagens da ConvertIA.
 */

import sharp from "sharp"
import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { CONVERTIA_IMAGE_BUCKET, convertiaImageUrl } from "@/lib/ai/convertia-image-url"
import { logger } from "@/lib/logger"

const log = logger.child("ConteudoUpload")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"]

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const form = await request.formData()
    const file = form.get("file")
    const kind = form.get("kind") === "avatar" ? "avatar" : "slide"
    if (!(file instanceof File)) throw new AppError("Arquivo obrigatório (campo file)", 400)
    if (!ALLOWED.includes(file.type)) throw new AppError("Use PNG, JPG, WebP ou GIF.", 400)
    if (file.size > 15 * 1024 * 1024) throw new AppError("Imagem maior que 15 MB", 400)

    const entrada = Buffer.from(await file.arrayBuffer())
    const img = sharp(entrada, { animated: false }).rotate()
    const meta = await img.metadata()
    const temAlpha = Boolean(meta.hasAlpha)
    let saida: Buffer
    let ext: "png" | "jpg"
    if (kind === "avatar") {
      saida = await img.resize(256, 256, { fit: "cover" }).png().toBuffer()
      ext = "png"
    } else if (temAlpha && file.type !== "image/jpeg") {
      saida = await img.resize(1350, 1350, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
      ext = "png"
    } else {
      saida = await img.resize(1350, 1350, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      ext = "jpg"
    }

    const admin = createAdminClient()
    const path = `stores/org-${orgId}/email-assets/${kind === "avatar" ? "avatar-" : "slide-"}${crypto.randomUUID()}.${ext}`
    const { error } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).upload(path, saida, { contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: false })
    if (error) {
      log.error("upload falhou", { path, error: error.message })
      throw new AppError(`Erro no upload: ${error.message}`, 500)
    }
    return successResponse(request, { url: convertiaImageUrl(path), path, bytes: saida.length })
  } catch (error) {
    return errorResponse(request, error, "conteudo-upload")
  }
}
