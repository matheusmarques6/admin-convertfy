/**
 * Naming de arquivos exportados do workspace de emails (.html / .png / zip).
 *
 * Mesma logica de sanitizacao do brand-identity/download-zip (NFD, sem
 * acento, kebab-case), compartilhada aqui por ser isomorfica (usada no
 * client pelo botao de download e no server pelas rotas de export).
 */

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "email"
  )
}

/**
 * Base do nome de arquivo de um email exportado (sem extensao).
 * Ex.: `welcome-01-boas-vindas`.
 */
export function emailExportBasename(
  flow: { flow_type?: string | null; name: string },
  email: { number: number; name: string },
): string {
  const flowSlug = slugify(flow.flow_type || flow.name)
  const emailSlug = slugify(email.name)
  return `${flowSlug}-${String(email.number).padStart(2, "0")}-${emailSlug}`
}
