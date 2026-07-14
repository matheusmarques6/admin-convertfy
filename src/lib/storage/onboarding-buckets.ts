/**
 * Módulo compartilhado de buckets de storage do onboarding.
 *
 * Contexto: uploads de arquivos do onboarding usam DOIS buckets distintos,
 * com visibilidades diferentes e propositais:
 *
 *  - `onboarding-assets`  → PRIVADO. Deliverables e imagens de tutorial que
 *    circulam internamente (admin/CSM). Acesso sempre via signed URL.
 *  - `onboarding-public`  → PÚBLICO. Uploads que o cliente faz pelo form
 *    público (logo, manual de marca, referências). O cliente não está
 *    logado, então precisa de URL pública direta (getPublicUrl).
 *
 * Historicamente havia UM bucket só (`onboarding-assets`), criado on-demand
 * por dois endpoints com `public` conflitante (`false` no interno, `true` no
 * form público). Quem criava primeiro vencia a corrida; como o interno criava
 * PRIVADO, o `public:true` nunca era aplicado e o `getPublicUrl()` do form
 * retornava 404 ("Bucket not found"). A separação em dois buckets + a migration
 * declarativa (`storage.buckets`) matam essa corrida de vez.
 *
 * Este módulo centraliza as constantes (antes duplicadas nos dois endpoints)
 * e expõe um resolver que gera a URL correta (pública ou assinada) a partir
 * de uma URL/path armazenado.
 */

import type { createAdminClient } from "@/lib/supabase/server"

/** Bucket PRIVADO — deliverables/tutoriais internos. Acesso via signed URL. */
export const ONBOARDING_ASSETS_BUCKET = "onboarding-assets"

/** Bucket PÚBLICO — uploads do form público do cliente (logo, refs, manual). */
export const ONBOARDING_PUBLIC_BUCKET = "onboarding-public"

/** Limite de tamanho por arquivo: 15MB (compartilhado pelos dois endpoints). */
export const MAX_FILE_SIZE = 15 * 1024 * 1024

/**
 * Allowlist de mime types aceitos. Superset dos dois endpoints: imagens,
 * documentos e planilhas (form público + interno) MAIS vídeos (video/mp4,
 * video/webm — hoje só o endpoint interno de tutoriais usa, mas manter num
 * único lugar evita divergência futura).
 */
export const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "video/mp4",
  "video/webm",
]

/** Buckets que o resolver aceita processar (allowlist anti-SSRF). */
const ALLOWED_BUCKETS = new Set<string>([
  ONBOARDING_ASSETS_BUCKET,
  ONBOARDING_PUBLIC_BUCKET,
])

/**
 * Extrai `{ bucket, path }` de uma URL de storage do Supabase ou de um path
 * cru. Aceita os formatos:
 *
 *   - URL pública:   https://xxx/storage/v1/object/public/<bucket>/<path>
 *   - URL assinada:  https://xxx/storage/v1/object/sign/<bucket>/<path>?token=..
 *   - path cru:      <bucket>/<path>   (ex: "onboarding-public/org/...")
 *   - path sem bucket: <org_id>/form-submissions/...  → não resolve bucket
 *
 * Retorna null quando não consegue identificar bucket + path com segurança.
 */
export function parseStorageUrl(
  stored: string,
): { bucket: string; path: string } | null {
  if (!stored || typeof stored !== "string") return null
  const trimmed = stored.trim()
  if (!trimmed) return null

  // 1. URL completa do storage do Supabase (public ou sign).
  //    Captura o segmento após /object/(public|sign)/.
  const objectMatch = trimmed.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/,
  )
  if (objectMatch) {
    const bucket = decodeURIComponent(objectMatch[1])
    // Remove querystring residual e decodifica o path.
    const rawPath = objectMatch[2].split("?")[0]
    const path = rawPath
      .split("/")
      .map((seg) => safeDecode(seg))
      .join("/")
    if (bucket && path) return { bucket, path }
    return null
  }

  // 2. Se for uma URL http(s) mas sem o formato de storage conhecido, não
  //    tentamos adivinhar (evita tratar link externo como storage).
  if (/^https?:\/\//i.test(trimmed)) return null

  // 3. Path cru. Se o primeiro segmento for um bucket conhecido, separa.
  const firstSlash = trimmed.indexOf("/")
  if (firstSlash > 0) {
    const maybeBucket = trimmed.slice(0, firstSlash)
    if (ALLOWED_BUCKETS.has(maybeBucket)) {
      return { bucket: maybeBucket, path: trimmed.slice(firstSlash + 1) }
    }
  }

  // 4. Não deu pra identificar o bucket (path sem prefixo de bucket).
  return null
}

/** Decodifica um segmento de URL sem lançar em input malformado. */
function safeDecode(seg: string): string {
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

/**
 * Resolve a URL final (pública ou assinada) de um asset de onboarding a partir
 * de uma URL/path armazenado.
 *
 * Regras:
 *  - Faz parse do valor armazenado.
 *  - **Allowlist**: só processa buckets `onboarding-assets`/`onboarding-public`
 *    (qualquer outro → null; evita SSRF / uso indevido do resolver).
 *  - Bucket público → retorna `getPublicUrl(path)`.
 *  - Bucket privado → gera `createSignedUrl(path, expiresIn ?? 3600)`.
 *
 * Retorna null quando não consegue resolver (parse falhou, bucket fora da
 * allowlist ou erro ao assinar).
 */
export async function resolveOnboardingAssetUrl(
  admin: ReturnType<typeof createAdminClient>,
  stored: string,
  opts?: { expiresIn?: number },
): Promise<string | null> {
  const parsed = parseStorageUrl(stored)
  if (!parsed) return null

  // Allowlist rígida — nunca resolve bucket fora do escopo do onboarding.
  if (!ALLOWED_BUCKETS.has(parsed.bucket)) return null

  // Bucket público: URL direta, sem assinatura.
  if (parsed.bucket === ONBOARDING_PUBLIC_BUCKET) {
    const { data } = admin.storage
      .from(parsed.bucket)
      .getPublicUrl(parsed.path)
    return data?.publicUrl ?? null
  }

  // Bucket privado: signed URL com expiração (default 1h).
  const { data, error } = await admin.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, opts?.expiresIn ?? 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
