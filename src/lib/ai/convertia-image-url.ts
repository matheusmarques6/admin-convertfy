/**
 * URL das imagens que a ConvertIA gera (puro, client-safe).
 *
 * As imagens vão para o bucket PRIVADO `onboarding-visual-assets` e
 * eram entregues ao chat como *signed URL* de 365 dias. Isso quebrou
 * de verdade: numa imagem real gerada em 04/09, o token assinava
 * `.../796e9c7c7ca3eb/...` enquanto o objeto gravado é
 * `.../796e9c7ca3eb/...` — o path do token e o path da URL divergiam,
 * o Storage recusava, e a `<img>` do chat mostrava erro.
 *
 * A cura não é caçar de onde saiu o caractere a mais: é parar de
 * depender do token. O chat passa a apontar para uma rota nossa
 * (`/api/ai/convertia/imagem/<path>`), que autentica o usuário, confere
 * a org e transmite o objeto pelo service role. De quebra, o link do
 * histórico não expira e não vira um bearer que funciona fora do admin.
 */

export const CONVERTIA_IMAGE_ROUTE = "/api/ai/convertia/imagem/"

/** Bucket dos assets gerados (mesmo dos emails). */
export const CONVERTIA_IMAGE_BUCKET = "onboarding-visual-assets"

/**
 * Caminho aceito dentro do bucket: `stores/<pasta>/email-assets/<arquivo>`.
 * A pasta é o id da loja ou `org-<uuid>` (conversa sem loja). Estrito de
 * propósito — a rota usa o service role, então o path é a fronteira:
 * sem `..`, sem barra dupla, só a árvore dos assets gerados.
 */
const OBJECT_PATH_RE =
  /^stores\/(?:org-)?[0-9a-fA-F-]{36}\/email-assets\/[0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp)$/

export function isConvertiaImagePath(path: string): boolean {
  return OBJECT_PATH_RE.test(path)
}

/** Path do objeto → URL servida pelo admin (relativa, serve em `<img>`). */
export function convertiaImageUrl(path: string): string {
  return `${CONVERTIA_IMAGE_ROUTE}${path.split("/").map(encodeURIComponent).join("/")}`
}

/**
 * Extrai o path do objeto de uma URL do Supabase Storage — assinada
 * (`/object/sign/<bucket>/<path>?token=…`), pública
 * (`/object/public/<bucket>/<path>`) ou autenticada (`/object/<bucket>/…`).
 * Devolve null para qualquer outra coisa.
 */
export function storagePathFromUrl(url: string): string | null {
  const m = new RegExp(
    `/storage/v1/object/(?:sign/|public/|authenticated/)?${CONVERTIA_IMAGE_BUCKET}/([^?#]+)`,
  ).exec(url)
  if (!m) return null
  let path: string
  try {
    path = decodeURIComponent(m[1])
  } catch {
    path = m[1]
  }
  return isConvertiaImagePath(path) ? path : null
}

/**
 * Reescreve o `src` de uma imagem para a rota do admin quando ele
 * aponta para o bucket. É o que conserta o HISTÓRICO: as respostas já
 * salvas carregam a signed URL quebrada, e reescrever na renderização
 * evita migration em cima do texto das mensagens. Qualquer outra URL
 * passa intacta.
 */
export function rewriteStorageImageSrc(src: string): string {
  const path = storagePathFromUrl(src)
  return path ? convertiaImageUrl(path) : src
}
