"use client"

import { useState, useMemo, useCallback } from "react"
import { Check, Globe } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SkeletonShimmer } from "@/components/ui/skeleton"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreItem {
  id: string
  store_name: string
  country: string
  language: string
}

export interface StoreSelectorProps {
  stores: StoreItem[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  loading?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAG_MAP: Record<string, string> = {
  BR: "\u{1F1E7}\u{1F1F7}",
  PT: "\u{1F1F5}\u{1F1F9}",
  GB: "\u{1F1EC}\u{1F1E7}",
  UK: "\u{1F1EC}\u{1F1E7}",
  US: "\u{1F1FA}\u{1F1F8}",
  DE: "\u{1F1E9}\u{1F1EA}",
  FR: "\u{1F1EB}\u{1F1F7}",
  ES: "\u{1F1EA}\u{1F1F8}",
  NL: "\u{1F1F3}\u{1F1F1}",
}

function getFlag(code: string): string {
  return FLAG_MAP[code.toUpperCase()] ?? "\u{1F310}"
}

const LANGUAGE_LABELS: Record<string, string> = {
  pt: "Portugues",
  en: "English",
  es: "Espanol",
  de: "Deutsch",
  fr: "Francais",
  nl: "Nederlands",
}

function getLanguageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang.toLowerCase()] ?? lang.toUpperCase()
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function StoreSelectorSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SkeletonShimmer className="h-10 w-36" />
        <SkeletonShimmer className="h-10 w-36" />
        <SkeletonShimmer className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonShimmer key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StoreSelector
// ---------------------------------------------------------------------------

export function StoreSelector({
  stores,
  selectedIds,
  onSelectionChange,
  loading = false,
}: StoreSelectorProps) {
  const [countryFilter, setCountryFilter] = useState("")
  const [languageFilter, setLanguageFilter] = useState("")

  const uniqueCountries = useMemo(
    () => [...new Set(stores.map((s) => s.country))].sort(),
    [stores],
  )

  const uniqueLanguages = useMemo(
    () => [...new Set(stores.map((s) => s.language))].sort(),
    [stores],
  )

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      if (countryFilter && s.country !== countryFilter) return false
      if (languageFilter && s.language !== languageFilter) return false
      return true
    })
  }, [stores, countryFilter, languageFilter])

  const toggleStore = useCallback(
    (id: string) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((sid) => sid !== id)
        : [...selectedIds, id]
      onSelectionChange(next)
    },
    [selectedIds, onSelectionChange],
  )

  const allFilteredSelected = useMemo(
    () =>
      filteredStores.length > 0 &&
      filteredStores.every((s) => selectedIds.includes(s.id)),
    [filteredStores, selectedIds],
  )

  const handleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredStores.map((s) => s.id))
      onSelectionChange(selectedIds.filter((id) => !filteredIds.has(id)))
    } else {
      const existing = new Set(selectedIds)
      const merged = [...selectedIds]
      for (const s of filteredStores) {
        if (!existing.has(s.id)) merged.push(s.id)
      }
      onSelectionChange(merged)
    }
  }, [allFilteredSelected, filteredStores, selectedIds, onSelectionChange])

  if (loading) return <StoreSelectorSkeleton />

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={countryFilter || "__all__"}
          onValueChange={(v) => setCountryFilter(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-40" aria-label="Filtrar por pais">
            <SelectValue placeholder="Pais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os paises</SelectItem>
            {uniqueCountries.map((c) => (
              <SelectItem key={c} value={c}>
                {getFlag(c)} {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={languageFilter || "__all__"}
          onValueChange={(v) => setLanguageFilter(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-40" aria-label="Filtrar por idioma">
            <SelectValue placeholder="Idioma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os idiomas</SelectItem>
            {uniqueLanguages.map((l) => (
              <SelectItem key={l} value={l}>
                {getLanguageLabel(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          aria-label={
            allFilteredSelected ? "Deselecionar todas" : "Selecionar todas"
          }
        >
          {allFilteredSelected ? "Deselecionar todas" : "Selecionar todas"}
        </Button>

        <span className="ml-auto text-sm text-muted-foreground">
          {selectedIds.length} de {stores.length} lojas selecionadas
        </span>
      </div>

      {/* Empty filtered state */}
      {filteredStores.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <Globe className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhuma loja encontrada com os filtros selecionados.
          </p>
        </div>
      )}

      {/* Store grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredStores.map((store) => {
          const isSelected = selectedIds.includes(store.id)
          return (
            <button
              key={store.id}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`${store.store_name} - ${store.country}`}
              onClick={() => toggleStore(store.id)}
              className={cn(
                "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                "bg-card hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected
                  ? "border-primary ring-1 ring-primary"
                  : "border-border",
              )}
            >
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30",
                )}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none" aria-hidden="true">
                    {getFlag(store.country)}
                  </span>
                  <span className="truncate text-sm font-medium">
                    {store.store_name}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {getLanguageLabel(store.language)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {store.country}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Hint when nothing selected */}
      {selectedIds.length === 0 && filteredStores.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Selecione pelo menos uma loja para continuar.
        </p>
      )}
    </div>
  )
}
