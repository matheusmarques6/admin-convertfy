"use client"

/**
 * Filtros de loja compartilhados entre o CopyPanel e a aba Lojas do modal de
 * detalhe. Centraliza os helpers de região/idioma, a função de match e o
 * componente de pills (FilterRow) pra os dois consumidores filtrarem igual.
 */

export interface StoreLike {
  id: string
  store_name: string
  country?: string | null
  language?: string | null
  niche?: string | null
  is_active?: boolean
}

export type StatusFilter = "todas" | "ativas" | "inativas"
export type RegionFilter = "todas" | "BR" | "EU" | "US"
export type LangFilter = "todos" | "pt" | "en" | "es"

export const LANG_LABEL: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
}

/** Mapeia país → região (BR/EU/US). Países fora do mapa não casam nenhuma região. */
export const REGION_OF: Record<string, string> = {
  BR: "BR",
  US: "US",
  PT: "EU",
  UK: "EU",
  ES: "EU",
}

export function langKey(language: string | null | undefined): string {
  return (language ?? "pt-BR").slice(0, 2).toLowerCase()
}

export function countryKey(country: string | null | undefined): string {
  return (country ?? "BR").toUpperCase().slice(0, 2)
}

export interface StoreFilters {
  status: StatusFilter
  region: RegionFilter
  lang: LangFilter
  /** Chave de nicho (lowercase) ou "todos". */
  niche: string
}

/** Aplica os filtros de status/região/idioma/nicho a uma loja. */
export function matchStore(s: StoreLike, f: StoreFilters): boolean {
  if (f.status === "ativas" && !s.is_active) return false
  if (f.status === "inativas" && s.is_active) return false
  if (f.region !== "todas" && REGION_OF[countryKey(s.country)] !== f.region) return false
  if (f.lang !== "todos" && langKey(s.language) !== f.lang) return false
  if (f.niche !== "todos" && (s.niche ?? "").trim().toLowerCase() !== f.niche) return false
  return true
}

/** Nichos únicos das lojas como [key lowercase, label original], ordenados. */
export function deriveNiches(stores: StoreLike[]): Array<[string, string]> {
  const seen = new Map<string, string>()
  for (const s of stores) {
    const raw = s.niche?.trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    if (!seen.has(key)) seen.set(key, raw)
  }
  return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
}

/** Linha de filtro com pills (Status/Região/Idioma). */
export function FilterRow({
  label,
  value,
  options,
  onPick,
}: {
  label: string
  value: string
  options: Array<{ k: string; label: string }>
  onPick: (k: string) => void
}) {
  return (
    <div className="mb-2.5">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o.k
          return (
            <button
              key={o.k}
              onClick={() => onPick(o.k)}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                on
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
