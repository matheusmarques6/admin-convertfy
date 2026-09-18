/**
 * POST /api/crm/forms/[id]/media — sobe a imagem ou o vídeo de uma tela.
 *
 * Devolve a URL PÚBLICA do Storage. É o ponto central desta rota: quem
 * carrega o arquivo é o visitante do formulário, que não tem sessão no
 * admin. Reusar o upload do Estúdio (que devolve `/api/ai/convertia/
 * imagem/...`, autenticado e escopado por org) entregaria uma prova que
 * abre para quem edita e falha para todo lead — e `lib/forms/midia`
 * recusa esse endereço justamente para o engano não passar daqui.
 *
 * A imagem é redimensionada no servidor; o vídeo sobe como veio (o
 * runtime não transcodifica) e por isso tem teto menor de duração
 * prática — 25 MB é o limite do bucket.
 */

import sharp from "sharp"
import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("FormMedia")

export const dynamic = "force-dynamic"
export const maxDuration = 60

export const BUCKET_DA_MIDIA = "form-media"

const IMAGENS = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const VIDEOS = ["video/mp4", "video/webm"]
const TETO_BYTES = 25 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    const admin = createAdminClient()
    // O formulário tem de ser da org de quem sobe: o caminho no Storage
    // é derivado da org, e sem esta checagem alguém subiria a mídia de
    // um formulário alheio para dentro da própria pasta.
    const { data: form, error: formErr } = await admin
      .from("crm_forms")
      .select("id, org_id")
      .eq("id", id)
      .maybeSingle()
    if (formErr) throw new AppError(`Não foi possível ler o formulário: ${formErr.message}`, 500)
    if (!form || form.org_id !== orgId) throw new AppError("Formulário não encontrado", 404)

    const body = await request.formData()
    const file = body.get("file")
    if (!(file instanceof File)) throw new AppError("Arquivo obrigatório (campo file)", 400)
    if (file.size > TETO_BYTES) {
      throw new AppError("Arquivo maior que 25 MB. Comprima antes de subir.", 400)
    }

    const ehImagem = IMAGENS.includes(file.type)
    const ehVideo = VIDEOS.includes(file.type)
    if (!ehImagem && !ehVideo) {
      throw new AppError("Use PNG, JPG, WebP, GIF, MP4 ou WebM.", 400)
    }

    let corpo: Buffer
    let ext: string
    let contentType: string
    if (ehImagem) {
      const entrada = Buffer.from(await file.arrayBuffer())
      // `rotate()` aplica a orientação do EXIF: print tirado no celular
      // sobe deitado sem isso, e só o lead vê.
      const img = sharp(entrada, { animated: file.type === "image/gif" }).rotate()
      const meta = await img.metadata()
      if (file.type === "image/gif") {
        corpo = entrada
        ext = "gif"
        contentType = "image/gif"
      } else if (meta.hasAlpha) {
        corpo = await img
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer()
        ext = "png"
        contentType = "image/png"
      } else {
        corpo = await img
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer()
        ext = "jpg"
        contentType = "image/jpeg"
      }
    } else {
      corpo = Buffer.from(await file.arrayBuffer())
      ext = file.type === "video/webm" ? "webm" : "mp4"
      contentType = file.type
    }

    const path = `org-${orgId}/${id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await admin.storage
      .from(BUCKET_DA_MIDIA)
      .upload(path, corpo, { contentType, upsert: false })
    if (upErr) throw new AppError(`Falha ao subir: ${upErr.message}`, 500)

    const { data: pub } = admin.storage.from(BUCKET_DA_MIDIA).getPublicUrl(path)
    log.info("form.media.upload", { form: id, tipo: ehVideo ? "video" : "imagem", bytes: corpo.length })

    return successResponse(request, {
      url: pub.publicUrl,
      tipo: ehVideo ? "video" : "imagem",
      path,
    })
  } catch (error) {
    return errorResponse(request, error)
  }
}
