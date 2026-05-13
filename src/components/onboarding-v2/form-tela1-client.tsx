"use client"

/**
 * Tela 1 do formulario publico — coleta respostas estruturadas pra gerar
 * o briefing via IA. Sem auth (validacao via form_token).
 *
 * Apos submit, redireciona pra /form/[token]/briefing onde o cliente espera
 * o briefing ser gerado (polling) e depois confirma/edita.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ArrowRight, Sparkles, AlertTriangle } from "lucide-react"

interface OnboardingContext {
  id: string
  briefing_status: string
  form_responses: Record<string, unknown> | null
  client?: { name: string; company: string | null } | null
  store?: { store_name: string; platform: string | null } | null
}

const QUESTIONS: Array<{
  key: string
  label: string
  placeholder: string
  helpText?: string
  type: "textarea" | "text"
  rows?: number
}> = [
  {
    key: "about_brand",
    label: "Conta um pouco sobre a marca",
    placeholder: "Historia, propósito, o que faz a marca ser unica...",
    helpText: "Sem precisar de formalidade. Em 3-5 linhas funciona.",
    type: "textarea",
    rows: 4,
  },
  {
    key: "audience",
    label: "Quem é o público de vocês?",
    placeholder: "Idade, comportamento, dores, desejos...",
    type: "textarea",
    rows: 3,
  },
  {
    key: "language_tone",
    label: "Como vocês falam com o público?",
    placeholder: "Ex: informal, divertido, técnico, premium...",
    helpText: "Se possível, cole exemplos de posts/emails que vocês curtem.",
    type: "textarea",
    rows: 3,
  },
  {
    key: "palette",
    label: "Cores principais da marca",
    placeholder: "Ex: #FF6B00, #1A1A1A, branco",
    type: "text",
  },
  {
    key: "fonts",
    label: "Fontes / Tipografia",
    placeholder: "Ex: Inter (titulos), Roboto (corpo)",
    type: "text",
  },
  {
    key: "references",
    label: "Marcas / referências visuais que admiram",
    placeholder: "Ex: Apple, Patagonia, marca XYZ...",
    helpText: "Pode colar URLs.",
    type: "textarea",
    rows: 2,
  },
  {
    key: "offers_and_differentials",
    label: "Ofertas, diferenciais ou bandeiras importantes",
    placeholder: "Frete grátis, parcelamento, sustentabilidade, garantia...",
    type: "textarea",
    rows: 3,
  },
]

export function FormTela1Client({ token }: { token: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [ctx, setCtx] = useState<OnboardingContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/forms/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) {
          setError(j.error ?? "Link inválido")
        } else {
          setCtx(j.onboarding)
          // Se já foi enviado, manda direto pra Tela 2
          if (j.onboarding.form_responses) {
            const existing = j.onboarding.form_responses as Record<string, string>
            setValues(existing)
            if (
              ["generating", "generated_pending_review", "approved"].includes(
                j.onboarding.briefing_status,
              )
            ) {
              router.replace(`/form/${token}/briefing`)
              return
            }
          }
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [token, router])

  async function submit() {
    if (submitting) return
    // Validacao basica: todas as chaves preenchidas
    const missing = QUESTIONS.filter((q) => !(values[q.key]?.trim()))
    if (missing.length > 0) {
      setError(`Faltam preencher: ${missing.map((m) => m.label).join(", ")}`)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/forms/${token}/submit-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: values }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error ?? "Erro ao enviar respostas")
        setSubmitting(false)
        return
      }
      router.push(`/form/${token}/briefing`)
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error && !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-[18px] font-semibold text-slate-900 mb-1">
            Link inválido
          </h1>
          <p className="text-[13px] text-slate-600">{error}</p>
        </div>
      </div>
    )
  }
  if (!ctx) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-5 py-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-violet-100 text-violet-600">
              <Sparkles className="h-3 w-3" />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
              Formulário de onboarding
            </p>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900">
            Vamos conhecer a {ctx.store?.store_name ?? "sua marca"}
          </h1>
          <p className="text-[13px] text-slate-600 mt-1">
            {ctx.client?.name && `Oi, ${ctx.client.name}! `}
            Em uns 10 minutos a gente coleta tudo que precisa pra montar a
            estratégia. Suas respostas vão alimentar uma IA que monta um briefing
            personalizado.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
        {QUESTIONS.map((q, idx) => (
          <div key={q.key} className="bg-white rounded-[8px] border border-slate-200 p-4">
            <label className="block">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-violet-600 font-mono">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] font-semibold text-slate-900">
                  {q.label}
                </span>
              </div>
              {q.type === "textarea" ? (
                <textarea
                  value={values[q.key] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [q.key]: e.target.value }))
                  }
                  placeholder={q.placeholder}
                  rows={q.rows ?? 3}
                  className="w-full px-3 py-2 text-[13px] rounded-[6px] border border-slate-200 bg-white focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              ) : (
                <input
                  type="text"
                  value={values[q.key] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [q.key]: e.target.value }))
                  }
                  placeholder={q.placeholder}
                  className="w-full h-10 px-3 text-[13px] rounded-[6px] border border-slate-200 bg-white focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              )}
              {q.helpText && (
                <p className="mt-1.5 text-[11.5px] text-slate-500">
                  {q.helpText}
                </p>
              )}
            </label>
          </div>
        ))}

        {error && (
          <div className="rounded-[6px] bg-red-50 border border-red-200 p-3 text-[12px] text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[8px] bg-[#1F1F1F] hover:bg-black text-white text-[14px] font-semibold disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Enviando..." : "Enviar respostas e gerar briefing"}
          {!submitting && <ArrowRight className="h-4 w-4" />}
        </button>

        <p className="text-[11px] text-slate-400 text-center pt-2">
          Suas respostas são privadas. Só sua equipe interna e nosso time tem
          acesso.
        </p>
      </div>
    </div>
  )
}
