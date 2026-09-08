"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "./_primitives"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useToast } from "@/lib/hooks/use-toast"
import { COUNTRIES_BY_REGION, countryLabel, type CountryValue } from "@/lib/constants/onboarding"
import {
  alternarPais,
  alternarPreset,
  presetEstaAtivo,
  PRESETS_DE_MERCADO,
  resumoDePaises,
  sanitizarPaises,
} from "@/lib/stores/mercados"

type Props = {
  storeId: string
  /** Lista completa de países (Central de Campanhas itera sobre ela). */
  countries?: string[] | null
  /** País principal (= countries[0]). Fallback quando `countries` ausente. */
  country?: string | null
}

/**
 * Badge clicável com os países da loja — espelho do StoreLanguagePopover,
 * mas MULTI-SELECT (checkboxes). A lista alimenta a Central de Campanhas
 * (datas comemorativas + sugestões) — o primeiro selecionado vira o país
 * PRINCIPAL (`country`) no PATCH.
 *
 * Persiste via PATCH /api/admin/stores/[id] e dispara router.refresh().
 */
export function StoreCountryPopover({ storeId, countries, country }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const initial = sanitizarPaises(
    countries && countries.length ? countries : [country],
  )

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<CountryValue[]>(initial)
  const [saving, setSaving] = useState(false)

  const tone = initial.length ? "info" : "neg"
  const display =
    initial.length === 0
      ? "Sem país"
      : initial.length <= 2
        ? initial.map((v) => countryLabel(v)).join(", ")
        : `${initial.length} países`

  function toggle(value: CountryValue) {
    // `alternarPais` recusa desmarcar o último — loja sem país nenhum é
    // pior que loja com país sobrando.
    setSelected((prev) => alternarPais(prev, value))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries: selected.length ? selected : null }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText)
        throw new Error(msg)
      }
      toast({ title: "Países atualizados" })
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast({
        title: "Falha ao salvar países",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Editar países da loja"
          className="cursor-pointer transition-opacity hover:opacity-80"
        >
          <Badge tone={tone}>{display}</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
          Países da loja
        </label>
        {/* Mesmos presets do diálogo de edição — quem vende no Big Five
            não deveria marcar cinco caixas em duas telas diferentes. */}
        <div className="mb-2 flex flex-wrap gap-1">
          {PRESETS_DE_MERCADO.slice(0, 6).map((p) => {
            const ativo = presetEstaAtivo(p, selected)
            return (
              <button
                key={p.id}
                type="button"
                title={p.descricao}
                disabled={saving}
                onClick={() => setSelected((prev) => alternarPreset(prev, p))}
                className={`rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
                  ativo
                    ? "border-[#1F1F1F] bg-[#1F1F1F] text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="max-h-56 overflow-y-auto rounded-[6px] border border-slate-300 bg-white divide-y divide-slate-100">
          {/* Agrupado por região: a lista foi de 15 para ~50 países e
              corrida ficaria pior de percorrer que a curta de antes. */}
          {COUNTRIES_BY_REGION.map((g) => (
            <div key={g.regiao}>
              <div className="sticky top-0 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {g.regiao}
              </div>
              {g.paises.map((c) => {
                const checked = selected.includes(c.value)
                return (
                  <label
                    key={c.value}
                    className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-slate-900 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={() => toggle(c.value)}
                      className="h-3.5 w-3.5 rounded-[3px] border-slate-300 text-[#1F1F1F] focus:ring-slate-300"
                    />
                    {c.label}
                    {selected[0] === c.value && (
                      <span className="ml-auto text-[10px] font-semibold text-amber-700">principal</span>
                    )}
                  </label>
                )
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {resumoDePaises(selected, countryLabel as (c: string) => string, 2)}
          {selected.length > 0 && ` · principal: ${countryLabel(selected[0])}`}
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-8 px-3 rounded-[6px] bg-[#1F1F1F] text-white text-[12px] font-semibold disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setSelected(initial)
            }}
            disabled={saving}
            className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
