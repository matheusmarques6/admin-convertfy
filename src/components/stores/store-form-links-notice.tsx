"use client"

/**
 * Aviso geral de formularios pendentes, no topo da pagina de Lojas.
 *
 * Junta num lugar so as lojas em que ha algo a fazer com o link:
 *   - sem link      → precisa gerar pra poder enviar
 *   - link expirado → precisa renovar
 *   - sem resposta  → link vale, o cliente e que nao respondeu
 *
 * A intencao e operacional: bater o olho, copiar o link e mandar.
 */

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, Link2, Loader2, MailWarning } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"

interface StoreFormLinkSummary {
  store_id: string
  store_name: string | null
  client_name: string | null
  url: string | null
  status: "active" | "expired" | "none"
  awaiting_response: boolean
}

const REASON_LABEL: Record<string, string> = {
  none: "Sem link",
  expired: "Link expirado",
  awaiting: "Não respondeu",
}

function reasonOf(l: StoreFormLinkSummary): string {
  if (l.status === "none") return "none"
  if (l.status === "expired") return "expired"
  return "awaiting"
}

export function StoreFormLinksNotice() {
  const toast = useToast()
  const [links, setLinks] = useState<StoreFormLinkSummary[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stores/form-links?pending=1")
      const json = await res.json()
      if (res.ok) setLinks((json.links ?? []) as StoreFormLinkSummary[])
    } catch {
      /* aviso e acessorio — falha silenciosa nao quebra a pagina */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function generate(storeId: string) {
    setBusyId(storeId)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/form-link`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        toast.toast({
          title: "Não foi possível gerar o link",
          description: typeof json.error === "string" ? json.error : "Tente novamente.",
        })
        return
      }
      const url = (json.link?.url ?? null) as string | null
      if (url) {
        await navigator.clipboard.writeText(url)
        toast.toast({ title: "Link gerado e copiado", description: url })
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  function copy(url: string) {
    void navigator.clipboard.writeText(url)
    toast.toast({ title: "Link copiado", description: url })
  }

  if (loading || links.length === 0) return null

  return (
    <div className="rounded-[6px] bg-amber-50 dark:bg-amber-500/[0.06] border border-amber-200 dark:border-amber-500/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-3 text-left"
      >
        <MailWarning className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <span className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
          {links.length}{" "}
          {links.length === 1 ? "loja com formulário pendente" : "lojas com formulário pendente"}
        </span>
        <span className="text-[12px] text-amber-800/70 dark:text-amber-200/60">
          — gere ou copie o link para enviar
        </span>
        <ChevronDown
          className={
            "h-4 w-4 ml-auto shrink-0 text-amber-700 dark:text-amber-400 transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <ul className="border-t border-amber-200 dark:border-amber-500/20 divide-y divide-amber-200/60 dark:divide-amber-500/10">
          {links.map((l) => (
            <li
              key={l.store_id}
              className="flex items-center gap-3 px-3 py-2 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-amber-900 dark:text-amber-100 truncate">
                  {l.store_name ?? "Loja sem nome"}
                  {l.client_name && (
                    <span className="font-normal text-amber-800/70 dark:text-amber-200/60">
                      {" "}· {l.client_name}
                    </span>
                  )}
                </p>
                {l.url && (
                  <p className="text-[11px] font-mono text-amber-800/70 dark:text-amber-200/60 truncate">
                    {l.url}
                  </p>
                )}
              </div>

              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 shrink-0">
                {REASON_LABEL[reasonOf(l)]}
              </span>

              {l.status === "active" && l.url ? (
                <button
                  type="button"
                  onClick={() => copy(l.url as string)}
                  className="h-7 px-2.5 text-[11px] font-semibold rounded-[5px] border border-amber-300 dark:border-amber-500/30 bg-white dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:bg-amber-50 shrink-0"
                >
                  Copiar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => generate(l.store_id)}
                  disabled={busyId === l.store_id}
                  className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold rounded-[5px] bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 shrink-0"
                >
                  {busyId === l.store_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Link2 className="h-3 w-3" />
                  )}
                  {l.status === "expired" ? "Renovar" : "Gerar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
