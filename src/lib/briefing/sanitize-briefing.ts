/**
 * Sanitização de briefing: remove URLs internas (Supabase Storage) que a IA
 * eventualmente embute nos textos do briefing — o cliente não pode ver links
 * de storage na tela "revise e confirme".
 *
 * Client-safe: sem dependências de server, importável no form do cliente e na
 * geração server-side.
 */

import type { BriefingContent } from "@/types/onboarding-pipeline"

// URL http(s) genérica (captura até espaço/quebra/fim).
const URL_RE = /https?:\/\/[^\s)]+/gi

/**
 * Heurística de "URL de storage interno" que não deve aparecer pro cliente.
 * Cobre Supabase Storage e o padrão de objeto assinado.
 */
function isStorageUrl(url: string): boolean {
  const u = url.toLowerCase()
  return (
    u.includes("supabase") ||
    u.includes("/storage/v1/object/") ||
    u.includes("form-submissions/")
  )
}

// Fim de sentença = pontuação final seguida de espaço, OU quebra de linha.
// Não quebra nos pontos internos de uma URL (que não têm espaço depois),
// mantendo a URL inteira dentro de uma única sentença.
const SENTENCE_SPLIT = /(?<=[.;!?])\s+|\n+/

/**
 * Remove sentenças que contenham uma URL de storage — evita deixar frases
 * coxas como "disponível em:". Preserva o restante do texto e URLs públicas
 * (ex.: o site da loja). Normaliza espaços/pontuação órfã.
 */
export function stripStorageUrls(text: string): string {
  if (!text) return text
  const kept = text.split(SENTENCE_SPLIT).filter((sentence) => {
    const urls = sentence.match(URL_RE)
    if (!urls) return true
    // Descarta a sentença se QUALQUER URL nela for de storage.
    return !urls.some(isStorageUrl)
  })
  let out = kept.join(" ")
  // Remove qualquer URL de storage solta remanescente (preserva públicas).
  out = out.replace(URL_RE, (m) => (isStorageUrl(m) ? "" : m))
  // Normaliza espaços duplicados e pontuação/espaços órfãos.
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.;,])/g, "$1").trim()
}

/** Aplica stripStorageUrls a todos os campos de texto do briefing. */
export function sanitizeBriefingContent(b: BriefingContent): BriefingContent {
  return {
    ...b,
    about_brand: stripStorageUrls(b.about_brand),
    audience: stripStorageUrls(b.audience),
    language_tone: stripStorageUrls(b.language_tone),
    visual_identity: {
      palette: stripStorageUrls(b.visual_identity.palette),
      fonts: stripStorageUrls(b.visual_identity.fonts),
      references: stripStorageUrls(b.visual_identity.references),
    },
    offers_and_differentials: stripStorageUrls(b.offers_and_differentials),
    ...(b.client_additions !== undefined
      ? { client_additions: stripStorageUrls(b.client_additions) }
      : {}),
  }
}
