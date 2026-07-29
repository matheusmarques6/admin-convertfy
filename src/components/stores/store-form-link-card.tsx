"use client"

/**
 * Link do formulario de onboarding da loja, no detalhe da loja.
 *
 * Estados possiveis (vindos de `/api/admin/stores/[id]/form-link`):
 *   none    → loja sem onboarding; botao gera o link (cria o onboarding
 *             por tras, porque o form publico resolve por form_token)
 *   expired → token vencido; botao renova
 *   active  → mostra a URL com copiar / abrir / regenerar
 */

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"

type FormLinkStatus = "active" | "expired" | "none"

interface StoreFormLink {
  store_id: string
  onboarding_id: string | null
  token: string | null
  url: string | null
  expires_at: string | null
  status: FormLinkStatus
  briefing_status: string | null
  awaiting_response: boolean
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export function StoreFormLinkCard({ storeId }: { storeId: string }) {
  const toast = useToast()
  const [link, setLink] = useState<StoreFormLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/form-link`)
      const json = await res.json()
      // successResponse espalha os campos no topo — sem envelope `data`.
      if (res.ok) setLink(json as StoreFormLink)
    } catch {
      /* silencioso: o card so nao aparece preenchido */
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void load()
  }, [load])

  // Gera (loja sem onboarding) ou renova (token vencido).
  async function ensureLink() {
    setWorking(true)
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
      const payload = json as { link: StoreFormLink; created: boolean }
      setLink(payload.link)
      toast.toast({
        title: payload.created ? "Link gerado" : "Link renovado",
        description: payload.link.url ?? "",
      })
    } finally {
      setWorking(false)
    }
  }

  async function regenerate() {
    if (
      !window.confirm(
        "Gerar um link novo invalida o atual na hora. Quem já recebeu o antigo perde o acesso. Continuar?",
      )
    ) {
      return
    }
    setWorking(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/form-link/regenerate`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        toast.toast({
          title: "Não foi possível regenerar",
          description: typeof json.error === "string" ? json.error : "Tente novamente.",
        })
        return
      }
      setLink(json as StoreFormLink)
      toast.toast({ title: "Link regenerado", description: "O anterior deixou de valer." })
    } finally {
      setWorking(false)
    }
  }

  function copy(url: string) {
    void navigator.clipboard.writeText(url)
    toast.toast({ title: "Link copiado", description: url })
  }

  if (loading) {
    return (
      <div className="rounded-[6px] border border-slate-200 dark:border-white/10 p-3">
        <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-white/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando link do formulário...
        </div>
      </div>
    )
  }

  if (!link) return null

  const expiresLabel = formatExpiry(link.expires_at)
  const answered = !link.awaiting_response

  return (
    <div className="rounded-[6px] bg-brand-50/60 dark:bg-brand-500/[0.05] border border-brand-200 dark:border-brand-500/20 p-3">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 dark:text-brand-300">
          Link do formulário
        </p>
        {link.status === "expired" && (
          <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            Expirado
          </span>
        )}
        {link.status === "active" && answered && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Respondido
          </span>
        )}
        {link.status === "active" && !answered && (
          <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
            Aguardando resposta
          </span>
        )}
        {expiresLabel && link.status === "active" && (
          <span className="text-[10px] text-slate-500 dark:text-white/55">
            · expira {expiresLabel}
          </span>
        )}
      </div>

      {link.status === "none" ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] text-slate-600 dark:text-white/70">
            Esta loja ainda não tem link. Gere para enviar ao cliente.
          </p>
          <button
            type="button"
            onClick={ensureLink}
            disabled={working}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-white bg-brand-500 rounded-[5px] hover:bg-brand-600 disabled:opacity-60"
          >
            {working ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Gerar link
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] font-mono text-slate-700 dark:text-white/80 truncate min-w-0 flex-1">
            {link.url}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {link.status === "expired" ? (
              <button
                type="button"
                onClick={ensureLink}
                disabled={working}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-white bg-brand-500 rounded-[5px] hover:bg-brand-600 disabled:opacity-60"
              >
                {working ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Renovar link
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => link.url && copy(link.url)}
                  className="h-8 px-3 text-[12px] font-semibold text-brand-500 dark:text-brand-300 bg-white dark:bg-brand-500/10 rounded-[5px] border border-brand-300 dark:border-brand-500/30 hover:bg-brand-50"
                >
                  Copiar link
                </button>
                <a
                  href={link.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-8 px-3 text-[12px] font-semibold text-brand-500 dark:text-brand-300 hover:underline"
                >
                  Abrir
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={working}
                  title="Gera um link novo e invalida o atual"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-[5px] text-slate-500 dark:text-white/55 hover:bg-white dark:hover:bg-white/5 disabled:opacity-60"
                >
                  {working ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only">Regenerar link</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
