"use client"

/**
 * Países da loja — vários, com presets de mercado e um principal.
 *
 * O banco sempre teve `countries` (TEXT[]); a tela é que oferecia um
 * Select único, então loja que vende para cinco países ficava com um só.
 *
 * **A ordem carrega significado**: `countries[0]` é o que o PATCH grava
 * em `country`, e é `country` que alimenta o mapa país→fuso do sync. Por
 * isso o principal aparece marcado e tem ação própria ("tornar
 * principal") — sem isso, trocar o principal exigiria desmarcar tudo e
 * remarcar na ordem certa, e ninguém adivinharia essa regra.
 */

import { Check, Star } from "lucide-react"
import { COUNTRIES_BY_REGION, countryLabel, type CountryValue } from "@/lib/constants/onboarding"
import {
  alternarPais,
  alternarPreset,
  presetEstaAtivo,
  PRESETS_DE_MERCADO,
  resumoDePaises,
} from "@/lib/stores/mercados"
import { cn } from "@/lib/utils"

interface Props {
  selecionados: CountryValue[]
  onChange: (paises: CountryValue[]) => void
  disabled?: boolean
}

export function CountryMultiSelect({ selecionados, onChange, disabled }: Props) {
  const principal = selecionados[0]

  return (
    <div className="space-y-2">
      {/* Presets: o atalho para "vendemos no Big Five" sem 5 cliques. */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS_DE_MERCADO.map((p) => {
          const ativo = presetEstaAtivo(p, selecionados)
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(alternarPreset(selecionados, p))}
              // O título traz os membros: "Big Five" sozinho é ambíguo, e
              // preset que o operador não sabe o que contém ele aplica errado.
              title={p.descricao}
              className={cn(
                "inline-flex items-center gap-1 rounded-[6px] border px-2 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-50",
                ativo
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-black/[0.12] bg-white text-gray-700 hover:bg-gray-50 dark:bg-[#1A1D27] dark:text-gray-200 dark:hover:bg-white/5",
              )}
            >
              {ativo && <Check className="h-3 w-3" />}
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="max-h-64 overflow-y-auto rounded-[6px] border border-black/[0.1] bg-white dark:bg-[#1A1D27]">
        {COUNTRIES_BY_REGION.map((g) => (
          <div key={g.regiao}>
            <div className="sticky top-0 bg-gray-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:bg-[#242836] dark:text-gray-400">
              {g.regiao}
            </div>
            {g.paises.map((c) => {
              const marcado = selecionados.includes(c.value)
              const ehPrincipal = principal === c.value
              return (
                <div
                  key={c.value}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={disabled}
                      onChange={() => onChange(alternarPais(selecionados, c.value))}
                      className="h-3.5 w-3.5 rounded-[3px] border-gray-300 text-gray-900 focus:ring-gray-300"
                    />
                    <span className={cn(marcado && "font-medium")}>{c.label}</span>
                  </label>
                  {ehPrincipal ? (
                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                      <Star className="h-2.5 w-2.5 fill-current" /> Principal
                    </span>
                  ) : (
                    marcado && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange([c.value, ...selecionados.filter((v) => v !== c.value)])}
                        className="text-[11px] text-gray-500 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-white"
                      >
                        tornar principal
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {selecionados.length === 0 ? (
          "Nenhum país definido."
        ) : (
          <>
            {resumoDePaises(selecionados, countryLabel as (c: string) => string, 3)}
            {" · "}
            <strong>{countryLabel(principal)}</strong> é o principal — é ele que define o fuso
            quando a plataforma não informa.
          </>
        )}
      </p>
    </div>
  )
}
