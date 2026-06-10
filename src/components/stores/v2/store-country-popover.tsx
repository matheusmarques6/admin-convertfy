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
  country: string | null | undefined
}

const COUNTRY_BY_VALUE = new Map<string, string>(COUNTRIES.map((c) => [c.value, c.label]))

function countryLabel(code: unknown): string | null {
  if (typeof code !== "string") return null
  return COUNTRY_BY_VALUE.get(code.trim().toUpperCase()) ?? null
}

/**
 * Badge clicável com o país da loja — espelho do StoreLanguagePopover.
 * Persiste via PATCH /api/admin/stores/[id] e dispara router.refresh()
 * pra atualizar o server component pai sem reload.
 */
export function StoreCountryPopover({ storeId, country }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const initial =
    country && COUNTRY_BY_VALUE.has(country.toUpperCase())
      ? (country.toUpperCase() as CountryValue)
      : ""

  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<CountryValue | "">(initial)
  const [saving, setSaving] = useState(false)

  const label = countryLabel(country)
  const tone = label ? "info" : "neg"
  const display = label ?? "Sem país"

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: value || null }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText)
        throw new Error(msg)
      }
      toast({ title: "País atualizado" })
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast({
        title: "Falha ao salvar país",
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
          title="Editar país da loja"
          className="cursor-pointer transition-opacity hover:opacity-80"
        >
          <Badge tone={tone}>{display}</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
          País da loja
        </label>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as CountryValue | "")}
          disabled={saving}
          className="w-full h-9 px-2 rounded-[6px] border border-slate-300 bg-white text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="">— (não definido)</option>
          {COUNTRIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
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
              setValue(initial)
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
