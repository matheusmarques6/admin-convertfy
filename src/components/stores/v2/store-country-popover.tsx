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
import { COUNTRIES, type CountryValue } from "@/lib/constants/onboarding"

type Props = {
  storeId: string
  /** Lista completa de países (Central de Campanhas itera sobre ela). */
  countries?: string[] | null
  /** País principal (= countries[0]). Fallback quando `countries` ausente. */
  country?: string | null
}

const COUNTRY_BY_VALUE = new Map<string, string>(COUNTRIES.map((c) => [c.value, c.label]))
const VALID_VALUES = new Set<string>(COUNTRIES.map((c) => c.value))

/** Normaliza + filtra só valores válidos de COUNTRIES, sem duplicar. */
function sanitize(input: Array<string | null | undefined>): CountryValue[] {
  const out: CountryValue[] = []
  for (const raw of input) {
    if (typeof raw !== "string") continue
    const code = raw.trim().toUpperCase()
    if (VALID_VALUES.has(code) && !out.includes(code as CountryValue)) {
      out.push(code as CountryValue)
    }
  }
  return out
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

  const initial = sanitize(
    countries && countries.length ? countries : [country],
  )

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<CountryValue[]>(initial)
  const [saving, setSaving] = useState(false)

  const labels = initial.map((v) => COUNTRY_BY_VALUE.get(v) ?? v)
  const tone = labels.length ? "info" : "neg"
  const display =
    labels.length === 0
      ? "Sem país"
      : labels.length <= 2
        ? labels.join(", ")
        : `${labels.length} países`

  function toggle(value: CountryValue) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
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
        <div className="max-h-56 overflow-y-auto rounded-[6px] border border-slate-300 bg-white divide-y divide-slate-100">
          {COUNTRIES.map((c) => {
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
              </label>
            )
          })}
        </div>
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
