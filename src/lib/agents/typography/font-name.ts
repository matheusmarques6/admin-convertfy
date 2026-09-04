/**
 * Leitura do NOME de uma fonte — módulo puro e client-safe.
 *
 * Existe separado porque estes dois helpers são precisos nos dois lados: no
 * servidor (guards, prompt do tipógrafo) e no navegador (o painel de
 * tipografia da tela do e-mail). `classifyFontFamily` morava em
 * `html/format-context.ts`, que carrega cliente Supabase, logger e meio
 * pipeline — importá-lo da tela levaria tudo isso para o bundle.
 */

/** Primeira família da cadeia, sem aspas e em minúsculas. */
export function familiaPrincipal(stack: string): string {
  return (stack.split(",")[0] ?? "")
    .replace(/["']/g, "")
    .trim()
    .toLowerCase()
}

/**
 * Classe da fonte pelo NOME. É heurística assumida: o que decide o par que
 * sobrevive ao substituto (regra 7 do especialista — sans + sans vira Arial
 * dos dois lados e a hierarquia some).
 */
export function classifyFontFamily(name: string): "serif" | "sans" | "mono" | "display" {
  const n = (name || "").toLowerCase()
  if (/mono|courier|consol|code|typewriter|plex mono/.test(n)) return "mono"
  if (/serif|georgia|garamond|times|playfair|merriweather|lora|baskerville|didot|bodoni|caslon|prata|marcellus|fraunces|newsreader|bitter|crimson/.test(n)) {
    return "serif"
  }
  if (/display|unbounded|syne|bungee|lobster|impact/.test(n)) return "display"
  return "sans"
}
