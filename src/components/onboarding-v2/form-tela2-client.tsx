"use client"

/**
 * Tela 2 do form publico:
 * - Faz polling em /api/forms/[token]/briefing-status enquanto status = 'generating'
 * - Quando 'generated_pending_review': mostra briefing editavel, cliente revisa,
 *   adiciona "Adicoes" e confirma
 * - Quando 'approved': mostra mensagem de obrigado
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react"
import type { BriefingContent } from "@/types/onboarding-pipeline"

interface Status {
  status: string
  briefing: BriefingContent | null
  confirmed: boolean
}

export function FormTela2Client({ token }: { token: string }) {
  const [state, setState] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editable, setEditable] = useState<BriefingContent | null>(null)
  const [clientAdditions, setClientAdditions] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const pollTimer = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/forms/${token}/briefing-status`)
      const j = await res.json()
      if (!res.ok) {
        setError(j.error ?? "Erro ao buscar status")
        return
      }
      setState(j)
      if (j.confirmed) {
        setSubmitted(true)
      }
      if (j.briefing && !editable) {
        setEditable(j.briefing)
        setClientAdditions(j.briefing.client_additions ?? "")
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }, [token, editable])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (
      state &&
      ["generating", "form_partially_filled", "not_started"].includes(
        state.status,
      ) &&
      !submitted
    ) {
      pollTimer.current = setInterval(() => {
        void fetchStatus()
      }, 4000)
      return () => {
        if (pollTimer.current) clearInterval(pollTimer.current)
      }
    }
  }, [state, submitted, fetchStatus])

  async function confirm() {
    if (!editable) return
    setSubmitting(true)
    setError(null)
    try {
      const payload: BriefingContent = {
        ...editable,
        client_additions: clientAdditions.trim() || undefined,
      }
      const res = await fetch(`/api/forms/${token}/confirm-briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing: payload }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error ?? "Erro ao confirmar")
        return
      }
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-[18px] font-semibold text-slate-900 mb-1">
            Erro
          </h1>
          <p className="text-[13px] text-slate-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (submitted || state.confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white rounded-[10px] border border-slate-200 p-8 shadow-sm">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-[20px] font-bold text-slate-900 mb-2">
            Briefing confirmado!
          </h1>
          <p className="text-[13.5px] text-slate-600 leading-relaxed">
            Recebemos suas respostas e a confirmação do briefing. Nossa equipe vai
            usar essas informações pra montar a estratégia inicial. Em breve
            entramos em contato com os próximos passos.
          </p>
        </div>
      </div>
    )
  }

  // generating
  if (
    !state.briefing ||
    ["generating", "form_partially_filled", "not_started"].includes(state.status)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white rounded-[10px] border border-slate-200 p-8 shadow-sm">
          <div className="relative mx-auto w-14 h-14 mb-4">
            <div className="absolute inset-0 rounded-full bg-violet-100 animate-ping" />
            <div className="relative flex items-center justify-center h-14 w-14 rounded-full bg-violet-500 text-white">
              <Sparkles className="h-6 w-6" />
            </div>
          </div>
          <h1 className="text-[18px] font-bold text-slate-900 mb-2">
            Estamos gerando seu briefing
          </h1>
          <p className="text-[13px] text-slate-600 leading-relaxed">
            A IA está estruturando suas respostas num briefing personalizado.
            Isso costuma levar entre 30 segundos e 2 minutos. A página atualiza
            sozinha.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Gerando...
          </div>
        </div>
      </div>
    )
  }

  // generated_pending_review
  const b = editable ?? state.briefing

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-violet-100 text-violet-600">
              <Sparkles className="h-3 w-3" />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
              Revise e confirme
            </p>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900">
            Briefing gerado
          </h1>
          <p className="text-[13px] text-slate-600 mt-1">
            Dá uma olhada no que a IA montou com base nas suas respostas. Você
            pode editar qualquer campo. No final tem um espaço pra adicionar o
            que achar que está faltando.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        <BriefingEditField
          label="Sobre a marca"
          value={b.about_brand}
          onChange={(v) =>
            setEditable((s) => (s ? { ...s, about_brand: v } : s))
          }
          rows={4}
        />
        <BriefingEditField
          label="Público / Audiência"
          value={b.audience}
          onChange={(v) =>
            setEditable((s) => (s ? { ...s, audience: v } : s))
          }
          rows={3}
        />
        <BriefingEditField
          label="Tom e linguagem"
          value={b.language_tone}
          onChange={(v) =>
            setEditable((s) => (s ? { ...s, language_tone: v } : s))
          }
          rows={3}
        />
        <div className="bg-white rounded-[8px] border border-slate-200 p-4">
          <p className="text-[12px] font-semibold text-slate-900 mb-2">
            Identidade visual
          </p>
          <div className="space-y-2">
            <BriefingEditSubField
              label="Paleta"
              value={b.visual_identity?.palette ?? ""}
              onChange={(v) =>
                setEditable((s) =>
                  s
                    ? {
                        ...s,
                        visual_identity: { ...s.visual_identity, palette: v },
                      }
                    : s,
                )
              }
            />
            <BriefingEditSubField
              label="Fontes"
              value={b.visual_identity?.fonts ?? ""}
              onChange={(v) =>
                setEditable((s) =>
                  s
                    ? {
                        ...s,
                        visual_identity: { ...s.visual_identity, fonts: v },
                      }
                    : s,
                )
              }
            />
            <BriefingEditSubField
              label="Referências"
              value={b.visual_identity?.references ?? ""}
              onChange={(v) =>
                setEditable((s) =>
                  s
                    ? {
                        ...s,
                        visual_identity: {
                          ...s.visual_identity,
                          references: v,
                        },
                      }
                    : s,
                )
              }
            />
          </div>
        </div>
        <BriefingEditField
          label="Ofertas e diferenciais"
          value={b.offers_and_differentials}
          onChange={(v) =>
            setEditable((s) =>
              s ? { ...s, offers_and_differentials: v } : s,
            )
          }
          rows={3}
        />

        <div className="bg-emerald-50/40 rounded-[8px] border border-emerald-200 p-4">
          <label className="block">
            <p className="text-[12px] font-semibold text-emerald-700 mb-1">
              Tem algo que faltou ou que você quer destacar?
            </p>
            <textarea
              value={clientAdditions}
              onChange={(e) => setClientAdditions(e.target.value)}
              placeholder="Opcional. Esse texto vai junto pra equipe."
              rows={3}
              className="w-full px-3 py-2 text-[13px] rounded-[6px] border border-emerald-200 bg-white"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-[6px] bg-red-50 border border-red-200 p-3 text-[12px] text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-semibold disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Confirmando..." : "Confirmar briefing"}
          {!submitting && <CheckCircle2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function BriefingEditField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div className="bg-white rounded-[8px] border border-slate-200 p-4">
      <label className="block">
        <p className="text-[12px] font-semibold text-slate-900 mb-1.5">
          {label}
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          className="w-full px-3 py-2 text-[13px] rounded-[6px] border border-slate-200 bg-white focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
        />
      </label>
    </div>
  )
}

function BriefingEditSubField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <p className="text-[11px] font-mono uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 text-[12.5px] rounded-[5px] border border-slate-200 bg-white"
      />
    </label>
  )
}
