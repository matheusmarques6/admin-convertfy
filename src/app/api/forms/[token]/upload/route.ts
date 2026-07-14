/**
 * POST /api/forms/[token]/upload
 *
 * Endpoint publico (sem requireAuth) pra upload de arquivos do form
 * de onboarding. Cliente externo nao esta logado — autenticacao e
 * via form_token que identifica o onboarding alvo.
 *
 * Diferenca pro /api/upload/onboarding: aquele exige requireAuth
 * (admin/CSM) e e usado pelas telas internas. Este aqui e o caminho
 * publico que cliente usa pra anexar logo, manual, refs durante o
 * preenchimento do form-tela1.
 *
 * Body: multipart/form-data com 'file' + opcional 'field_key'.
 * Validacoes: 15MB max, mime allowlist, token valido em onboardings.
 *
 * Retorna: { url, path } — URL publica do bucket onboarding-public.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  ONBOARDING_PUBLIC_BUCKET,
  MAX_FILE_SIZE,
  ALLOWED_MIME,
} from "@/lib/storage/onboarding-buckets"

const log = logger.child("PublicFormUpload")
// Bucket PÚBLICO — cliente não está logado, precisa de getPublicUrl direto.
const BUCKET = ONBOARDING_PUBLIC_BUCKET

export const dynamic = "force-dynamic"
export const maxDuration = 60

let bucketEnsured = false
async function ensureBucket(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  if (bucketEnsured) return
  // A migration declarativa (storage.buckets) é a fonte de verdade; este
  // ensureBucket é apenas defesa extra e idempotente. NÃO engolimos erro
  // silenciosamente: se falhar por motivo != "já existe", logamos pra não
  // mascarar problema real de storage.
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: ALLOWED_MIME,
  })
  if (error && !/already exists|resource already exists/i.test(error.message)) {
    log.warn("createBucket falhou (nao-fatal)", {
      bucket: BUCKET,
      err: error.message,
    })
  }
  bucketEnsured = true
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const admin = createAdminClient()

    // 1. Valida que o token corresponde a um onboarding existente.
    const { data: onb, error: onbErr } = await admin
      .from("onboardings")
      .select("id, org_id, client_id")
      .eq("form_token", token)
      .maybeSingle()
    if (onbErr) {
      log.error("Erro buscando onboarding", { token, err: onbErr.message })
      return NextResponse.json(
        { error: "Erro interno" },
        { status: 500 },
      )
    }
    if (!onb) {
      return NextResponse.json(
        { error: "Token inválido ou expirado" },
        { status: 404 },
      )
    }

    // 2. Parse do multipart
    const form = await request.formData()
    const file = form.get("file") as File | null
    const fieldKey = (form.get("field_key") as string | null) ?? "anexo"

    if (!file) {
      return NextResponse.json(
        { error: "Arquivo obrigatório" },
        { status: 400 },
      )
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande (máx 15MB)" },
        { status: 400 },
      )
    }
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo não permitido: ${file.type}` },
        { status: 400 },
      )
    }

    await ensureBucket(admin)

    // 3. Path do arquivo. Inclui org_id+onboarding_id pra organizacao,
    // field_key pra agrupar por pergunta, e timestamp pra evitar
    // colisao quando o mesmo cliente faz upload multiplo.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const ts = Date.now()
    const safeFieldKey = fieldKey.replace(/[^a-zA-Z0-9_-]/g, "_")
    const path = `${onb.org_id}/form-submissions/${onb.id}/${safeFieldKey}/${ts}-${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // 4. Upload com admin client (bypass RLS)
    const { data: uploadData, error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (uploadErr) {
      log.error("Upload falhou", {
        token,
        path,
        err: uploadErr.message,
      })
      return NextResponse.json(
        { error: "Erro no upload do arquivo" },
        { status: 500 },
      )
    }

    // 5. URL publica do arquivo
    const { data: publicUrlData } = admin.storage
      .from(BUCKET)
      .getPublicUrl(uploadData.path)

    log.info("Upload publico ok", {
      onboarding_id: onb.id,
      path: uploadData.path,
      size: file.size,
    })

    return NextResponse.json({
      success: true,
      url: publicUrlData.publicUrl,
      path: uploadData.path,
      filename: file.name,
      size: file.size,
      mime: file.type,
    })
  } catch (e) {
    log.error("Erro inesperado", {
      err: e instanceof Error ? e.message : String(e),
    })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro desconhecido" },
      { status: 500 },
    )
  }
}
