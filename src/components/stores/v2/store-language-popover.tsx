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
import {
  STORE_LANGUAGE_OPTIONS,
  languageCodeToLabel,
  type StoreLanguageCode,
} from "@/lib/i18n/store-language"

type Props = {
  storeId: string
  language: string | null | undefined
}

/**
 * Badge clicavel com o idioma da loja. Quando nao definido (null/
 * invalido), badge vermelho "Sem idioma" forca atencao. Clique abre
 * popover com select dos 15 idiomas canonicos + opcao "(nao definido)".
 *
 * Persiste via PATCH /api/admin/stores/[id]. router.refresh() re-renderiza
 * o server component pai pra refletir o novo valor sem reload manual.
 */
export function StoreLanguagePopover({ storeId, language }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const initialCode =
    language && STORE_LANGUAGE_OPTIONS.some((o) => o.value === language)
      ? (language as StoreLanguageCode)
      : ""

  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<StoreLanguageCode | "">(initialCode)
  const [saving, setSaving] = useState(false)

  const currentLabel = languageCodeToLabel(language)
  const tone = currentLabel ? "info" : "neg"
  const display = currentLabel ?? "Sem idioma"

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: value || null }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText)
        throw new Error(msg)
      }
      toast({ title: "Idioma atualizado" })
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast({
        title: "Falha ao salvar idioma",
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
          title="Editar idioma da loja"
          className="cursor-pointer transition-opacity hover:opacity-80"
        >
          <Badge tone={tone}>{display}</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
          Idioma da loja
        </label>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as StoreLanguageCode | "")}
          disabled={saving}
          className="w-full h-9 px-2 rounded-[6px] border border-slate-300 bg-white text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="">— (não definido)</option>
          {STORE_LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
              setValue(initialCode)
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
