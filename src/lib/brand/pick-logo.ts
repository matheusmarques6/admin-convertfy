/**
 * Seletor de logo com fallback por variante e por formato.
 *
 * Contexto: `store_brand_identity` tem 8 colunas de logo (main/alt/monogram/
 * reverse × svg/png), TODAS nullable. Historicamente os agentes so liam
 * `logo_main_*` — uma marca com a logo em QUALQUER outro slot (ex: so
 * `logo_alt_png`) ficava sem logo no pipeline. Este helper varre as 4 variantes
 * NA ORDEM [main, alt, monogram, reverse] e, em cada uma, tenta o formato
 * `prefer` e cai pro outro; devolve a 1a logo com URL nao-vazia (ou null).
 *
 * Nao-regressao: uma marca com `logo_main` continua devolvendo a MESMA url
 * (main e' o 1o da cadeia) — o fallback so ADICIONA cobertura pras demais.
 */
import type { StoreBrandIdentity } from "@/types/email-workspace"

export type LogoFormat = "svg" | "png"

type LogoCols = Pick<
  StoreBrandIdentity,
  | "logo_main_svg"
  | "logo_main_png"
  | "logo_alt_svg"
  | "logo_alt_png"
  | "logo_monogram_svg"
  | "logo_monogram_png"
  | "logo_reverse_svg"
  | "logo_reverse_png"
>

export type LogoVariant = "main" | "alt" | "monogram" | "reverse"

export interface PickedLogo {
  url: string
  format: LogoFormat
  variant: LogoVariant
}

/** Ordem de preferencia das variantes. Nao mexer sem revisar nao-regressao. */
const VARIANTS: LogoVariant[] = ["main", "alt", "monogram", "reverse"]

/** URL nao-vazia apos trim, ou null. */
function cleanUrl(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * Devolve a 1a logo disponivel varrendo [main, alt, monogram, reverse]; em cada
 * variante prefere `prefer` e cai pro outro formato. `null` se nao houver
 * nenhuma logo (todas as 8 colunas vazias/ausentes).
 */
export function pickBrandLogo(
  brand: Partial<LogoCols> | null | undefined,
  prefer: LogoFormat = "png",
): PickedLogo | null {
  if (!brand) return null
  const other: LogoFormat = prefer === "png" ? "svg" : "png"

  for (const variant of VARIANTS) {
    const preferred = cleanUrl(brand[`logo_${variant}_${prefer}` as keyof LogoCols])
    if (preferred) return { url: preferred, format: prefer, variant }
    const fallback = cleanUrl(brand[`logo_${variant}_${other}` as keyof LogoCols])
    if (fallback) return { url: fallback, format: other, variant }
  }

  return null
}
