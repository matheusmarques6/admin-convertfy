"use client"

/**
 * ConvertIA · Limite diário — card do dashboard de Custo de IA.
 * Edita `settings.convertia_limits.daily_user_cost_cents` (US$ por
 * usuário por dia) sem deploy. O chat relê o valor em até 60 s.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Loader2, Wallet } from "lucide-react"

interface Payload {
  daily_user_cost_cents: number
  today_cost_cents: number
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j
  })

export function ConvertiaLimitCard() {
  const { data, error, mutate } = useSWR<{ data?: Payload } | Payload>("/api/ai/convertia/limits", fetcher)
  const p: Payload | undefined =
    data && "daily_user_cost_cents" in data ? (data as Payload) : (data as { data?: Payload } | undefined)?.data
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (p && value === "") setValue((p.daily_user_cost_cents / 100).toFixed(2))
    // só preenche o campo na primeira carga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p])

  if (error) return null

  const save = async () => {
    const usd = Number(value.replace(",", "."))
    if (!Number.isFinite(usd) || usd < 0.5) {
      setMsg("Informe um valor em US$ (mínimo 0,50).")
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch("/api/ai/convertia/limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_user_cost_usd: usd }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
      setMsg(`Limite salvo: US$ ${usd.toFixed(2)} por usuário por dia. O chat aplica em até 60 s.`)
      await mutate()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">
          <Wallet className="h-3.5 w-3.5" /> ConvertIA · Limite diário por usuário
        </h3>
        {p && (
          <span className="text-[11px] text-slate-500 dark:text-white/50">
            você gastou hoje US$ {(p.today_cost_cents / 100).toFixed(2)} de US$ {(p.daily_user_cost_cents / 100).toFixed(2)}
          </span>
        )}
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-slate-700 dark:text-white/75">
          US$
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            className="h-7 w-[90px] rounded-[6px] border border-slate-200 dark:border-white/[0.1] bg-transparent px-2 text-[12px] text-slate-900 dark:text-white outline-none"
          />
          / dia
        </label>
        <button
          onClick={() => void save()}
          disabled={busy || !p}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-slate-900 dark:bg-white px-2.5 text-[11.5px] font-semibold text-white dark:text-slate-900 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Salvar
        </button>
      </div>
      {msg && <p className="mt-2 text-[11.5px] text-slate-600 dark:text-white/60">{msg}</p>}
      <p className="mt-1 text-[11px] text-slate-400 dark:text-white/40">
        Vale para todos os usuários. Ao bater o limite, a ConvertIA para de responder até o dia seguinte (horário de São Paulo).
      </p>
    </div>
  )
}
