/**
 * upload-email-asset — sobe um PNG gerado para o bucket dos assets de email
 * e devolve a URL assinada (365 dias; pública como fallback).
 *
 * Extraído de `chains/image.chain.ts` (02/09) para que a composição do
 * fundo (`compose-background.ts`) suba pelo MESMO caminho da geração:
 * mesmo bucket, mesmo prefixo, mesma validade.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("UploadEmailAsset")

export const EMAIL_ASSETS_BUCKET = "onboarding-visual-assets"

export function emailAssetPath(storeId: string): string {
  return `stores/${storeId}/email-assets/${crypto.randomUUID()}.png`
}

export async function uploadEmailAsset(
  storeId: string,
  buffer: Buffer,
): Promise<{ url: string; path: string }> {
  const admin = createAdminClient()
  const path = emailAssetPath(storeId)

  const { error: uploadErr } = await admin.storage
    .from(EMAIL_ASSETS_BUCKET)
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: false,
    })

  if (uploadErr) {
    log.error("image.upload.failed", { storeId, path, error: uploadErr.message })
    throw new Error(`Falha ao fazer upload da imagem: ${uploadErr.message}`)
  }

  const { data: signedData, error: signErr } = await admin.storage
    .from(EMAIL_ASSETS_BUCKET)
    .createSignedUrl(path, 365 * 24 * 60 * 60)

  if (signErr || !signedData?.signedUrl) {
    const { data: publicData } = admin.storage
      .from(EMAIL_ASSETS_BUCKET)
      .getPublicUrl(path)
    log.warn("image.signed_url.fallback_public", { storeId, path })
    return { url: publicData.publicUrl, path }
  }

  return { url: signedData.signedUrl, path }
}
