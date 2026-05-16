"use client"

/**
 * Toolbar interativa do preview de relatório.
 * Aceita acoes: Marcar apresentado, Enviar ao cliente, Baixar PDF, Refazer com IA.
 */

import { useState } from "react"
import { Download, Send, Sparkles, CheckCircle2, Loader2, ExternalLink, Maximize2, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

interface Props {
  reportId: string
  pdfUrl: string | null
  status: "draft" | "sent" | "presented"
}

export function ReportPreviewClient({ reportId, pdfUrl, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  const handleAIFill = async () => {
    setBusy("ai")
    try {
      const res = await fetch(`/api/admin/stores/reports/${reportId}/ai-fill`, {
        method: "POST",
      })
      if (res.ok) router.refresh()
      else alert("Falha ao preencher com IA. Verifique credenciais.")
    } finally {
      setBusy(null)
    }
  }

  const handleResync = async () => {
    setBusy("resync")
    try {
      const res = await fetch(`/api/admin/stores/reports/${reportId}/resync`, {
        method: "POST",
      })
      if (res.ok) {
        router.refresh()
      } else {
        const j = await res.json().catch(() => ({}))
        alert(`Falha ao re-sincronizar: ${j?.error?.message ?? res.statusText}`)
      }
    } finally {
      setBusy(null)
    }
  }

  const handlePDF = async () => {
    setBusy("pdf")
    try {
      if (pdfUrl) {
        window.open(pdfUrl, "_blank")
      } else {
        const res = await fetch(`/api/admin/stores/reports/${reportId}/pdf`, { method: "POST" })
        if (res.ok) {
          const j = await res.json()
          if (j.data?.pdf_url) window.open(j.data.pdf_url, "_blank")
          else router.refresh()
        } else {
          alert("Falha ao gerar PDF.")
        }
      }
    } finally {
      setBusy(null)
    }
  }

  const handleStatus = async (next: "presented" | "sent") => {
    setBusy(next)
    try {
      const res = await fetch(`/api/admin/stores/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const handlePresentMode = () => {
    // Abre a view print em outra janela em fullscreen pseudo (Cmd+P friendly)
    window.open(`/admin/stores/relatorios/${reportId}/print`, "_blank", "noopener")
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={handleResync}
        disabled={busy === "resync"}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border bg-white text-slate-700 hover:bg-slate-50 text-[11.5px] font-semibold disabled:opacity-50"
        style={{ borderColor: "rgba(0,0,0,0.10)" }}
        title="Recalcula KPIs a partir dos dados atuais (Omnisend/Klaviyo/Shopify)"
      >
        {busy === "resync" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Re-sincronizar dados
      </button>
      <button
        onClick={handleAIFill}
        disabled={busy === "ai"}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border bg-white text-slate-700 hover:bg-slate-50 text-[11.5px] font-semibold disabled:opacity-50"
        style={{ borderColor: "rgba(0,0,0,0.10)" }}
      >
        {busy === "ai" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-brand-500" />}
        Refazer com IA
      </button>
      <button
        onClick={handlePresentMode}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border bg-white text-slate-700 hover:bg-slate-50 text-[11.5px] font-semibold"
        style={{ borderColor: "rgba(0,0,0,0.10)" }}
      >
        <Maximize2 className="h-3 w-3" />
        Modo apresentação
      </button>
      <button
        onClick={handlePDF}
        disabled={busy === "pdf"}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border bg-white text-slate-700 hover:bg-slate-50 text-[11.5px] font-semibold disabled:opacity-50"
        style={{ borderColor: "rgba(0,0,0,0.10)" }}
      >
        {busy === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : pdfUrl ? <ExternalLink className="h-3 w-3" /> : <Download className="h-3 w-3" />}
        {pdfUrl ? "Abrir PDF" : "Baixar PDF"}
      </button>
      {status !== "sent" && status !== "presented" && (
        <button
          onClick={() => handleStatus("sent")}
          disabled={busy === "sent"}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-[11.5px] font-semibold disabled:opacity-50"
        >
          {busy === "sent" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Enviar ao cliente
        </button>
      )}
      {status !== "presented" && (
        <button
          onClick={() => handleStatus("presented")}
          disabled={busy === "presented"}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11.5px] font-semibold disabled:opacity-50"
        >
          {busy === "presented" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          Marcar apresentado
        </button>
      )}
    </div>
  )
}
