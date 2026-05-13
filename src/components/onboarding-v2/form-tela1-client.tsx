"use client"

/**
 * Formulário publico unificado (sprint final - PRD).
 *
 * Wizard multi-step que cobre as 6 secoes do PRD:
 *   1. Sobre a loja
 *   2. Sobre a marca
 *   3. Sobre os clientes
 *   4. Sobre o historico
 *   5. Sobre objetivos
 *   6. Confirme seu briefing (gerado pela IA)
 *
 * Acessivel por token publico em /form/[token]. Apos completar etapa 5,
 * dispara generateBriefing e mostra loading skeleton ate briefing chegar.
 * Cliente revisa, edita e confirma -> onboarding avanca pra preview_producao.
 */

import { useEffect, useState } from "react"
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import type { BriefingContent } from "@/types/onboarding-pipeline"

interface OnboardingContext {
  id: string
  briefing_status: string
  briefing: BriefingContent | null
  briefing_confirmed_by_client: boolean
  form_responses: Record<string, unknown> | null
  client?: { name: string; company: string | null } | null
  store?: { store_name: string; platform: string | null } | null
}

interface Question {
  key: string
  label: string
  placeholder?: string
  helpText?: string
  type: "text" | "textarea" | "url" | "select" | "multiline_list"
  options?: string[]
  required?: boolean
  rows?: number
}

interface Section {
  id: string
  title: string
  subtitle: string
  questions: Question[]
}

const SECTIONS: Section[] = [
  {
    id: "loja",
    title: "Sobre a loja",
    subtitle: "Comece com os dados básicos do seu negócio.",
    questions: [
      { key: "store_name", label: "Nome da loja", required: true, type: "text", placeholder: "Ex: Minha Marca" },
      { key: "store_url", label: "URL da loja", required: true, type: "url", placeholder: "https://..." },
      { key: "vertical", label: "Vertical / Nicho", required: true, type: "text", placeholder: "Moda feminina, suplementos, etc." },
      {
        key: "languages",
        label: "Idiomas (principal e secundários)",
        type: "text",
        placeholder: "Ex: pt-BR + en-US",
      },
      {
        key: "ticket_avg",
        label: "Faixa de ticket médio",
        type: "select",
        required: true,
        options: ["< R$ 100", "R$ 100 - 250", "R$ 250 - 500", "R$ 500 - 1.000", "> R$ 1.000"],
      },
      {
        key: "main_products",
        label: "Principais produtos / coleções",
        type: "textarea",
        rows: 3,
        placeholder: "Lista breve dos best-sellers ou linhas principais",
      },
      {
        key: "platform_ecommerce",
        label: "Plataforma de e-commerce",
        type: "select",
        required: true,
        options: ["Shopify", "Nuvemshop", "VTEX", "WooCommerce", "Loja Integrada", "Outra"],
      },
      {
        key: "platform_email",
        label: "Plataforma de email atual",
        type: "select",
        required: true,
        options: ["Klaviyo", "Omnisend", "Mailchimp", "ActiveCampaign", "Nenhuma ainda", "Outra"],
      },
    ],
  },
  {
    id: "marca",
    title: "Sobre a marca",
    subtitle: "Personalidade e identidade visual.",
    questions: [
      {
        key: "positioning",
        label: "Posicionamento da marca",
        type: "select",
        required: true,
        options: ["Premium", "Aspiracional", "Popular / acessível", "Nicho específico", "Outro"],
      },
      {
        key: "tone_of_voice",
        label: "Tom de voz",
        type: "select",
        required: true,
        options: ["Formal", "Casual / amigável", "Divertido / irreverente", "Técnico", "Inspirador", "Outro"],
      },
      {
        key: "brand_colors",
        label: "Cores da marca (até 3 principais)",
        type: "text",
        placeholder: "#FF6B00, #1A1A1A, #FFFFFF",
      },
      {
        key: "logo_url",
        label: "URL do logo (Drive, Dropbox, etc.)",
        type: "url",
        placeholder: "https://...",
      },
      {
        key: "visual_refs",
        label: "3 referências visuais que admiram",
        type: "textarea",
        rows: 3,
        placeholder: "URLs ou descricao breve de cada uma",
      },
      {
        key: "competitors",
        label: "Principais concorrentes (até 3)",
        type: "textarea",
        rows: 2,
      },
    ],
  },
  {
    id: "clientes",
    title: "Sobre os clientes",
    subtitle: "Quem compra da sua loja.",
    questions: [
      {
        key: "primary_persona",
        label: "Persona principal (idade, gênero, comportamento)",
        type: "textarea",
        rows: 3,
        required: true,
      },
      {
        key: "secondary_persona",
        label: "Persona secundária (se houver)",
        type: "textarea",
        rows: 2,
      },
      {
        key: "main_objection",
        label: "Principal objeção de compra",
        type: "textarea",
        rows: 2,
        required: true,
      },
      {
        key: "main_motivator",
        label: "Principal motivador de compra",
        type: "textarea",
        rows: 2,
        required: true,
      },
    ],
  },
  {
    id: "historico",
    title: "Sobre o histórico",
    subtitle: "Números atuais — chuta se nao souber exato.",
    questions: [
      {
        key: "roas_avg_3m",
        label: "ROAS médio nos últimos 3 meses",
        type: "text",
        placeholder: "Ex: 2.8x",
      },
      {
        key: "repurchase_rate",
        label: "Taxa de recompra estimada",
        type: "text",
        placeholder: "Ex: 18%",
      },
      {
        key: "cart_abandonment",
        label: "Taxa de abandono de carrinho atual",
        type: "text",
        placeholder: "Ex: 72%",
      },
      {
        key: "did_email_marketing",
        label: "Já fez email marketing antes?",
        type: "select",
        required: true,
        options: ["Sim, faço regularmente", "Sim, mas pouco", "Não, é a primeira vez"],
      },
      {
        key: "existing_flows",
        label: "Já tem flows configurados? Quais?",
        type: "textarea",
        rows: 2,
      },
    ],
  },
  {
    id: "objetivos",
    title: "Sobre objetivos",
    subtitle: "Onde você quer chegar nos próximos 90 dias.",
    questions: [
      {
        key: "main_goal",
        label: "Principal objetivo com email marketing",
        type: "select",
        required: true,
        options: [
          "Recuperar carrinhos abandonados",
          "Aumentar recompra",
          "Reativar clientes inativos",
          "Construir relacionamento de longo prazo",
          "Outro",
        ],
      },
      {
        key: "revenue_goal_90d",
        label: "Meta de receita atribuída em 90 dias",
        type: "text",
        placeholder: "Ex: R$ 50k mensais via email",
      },
      {
        key: "seasonal_priorities",
        label: "Campanhas sazonais prioritárias",
        type: "textarea",
        rows: 2,
        placeholder: "Black Friday, Dia das Maes, Natal, Ano Novo, etc.",
      },
    ],
  },
]

export function FormTela1Client({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [ctx, setCtx] = useState<OnboardingContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [stepIdx, setStepIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Carrega estado inicial
  useEffect(() => {
    fetch(`/api/forms/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) {
          setError(j.error ?? "Link inválido")
          return
        }
        setCtx(j.onboarding)
        if (j.onboarding.briefing_confirmed_by_client) {
          setSubmitted(true)
          return
        }
        if (j.onboarding.form_responses) {
          setValues(j.onboarding.form_responses as Record<string, string>)
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [token])

  // Pull final ja eh secao 6 (briefing inline)
  const totalSteps = SECTIONS.length + 1 // +1 = briefing review
  const isReviewStep = stepIdx === SECTIONS.length
  const currentSection = SECTIONS[stepIdx]
  const progress = Math.round(((stepIdx + 1) / totalSteps) * 100)

  function validateCurrentSection(): string | null {
    if (isReviewStep) return null
    const missing = currentSection.questions
      .filter((q) => q.required)
      .filter((q) => !(values[q.key] ?? "").trim())
    if (missing.length > 0) {
      return `Faltam preencher: ${missing.map((m) => m.label).join(", ")}`
    }
    return null
  }

  async function saveCurrentResponses() {
    // Salva snapshot (parcial). Submit final acontece quando avanca pra review.
    await fetch(`/api/forms/${token}/submit-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses: values }),
    })
  }

  async function next() {
    const err = validateCurrentSection()
    if (err) {
      setError(err)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setError(null)

    // Se proximo eh o review step (ultima secao acabou), salva e dispara IA
    if (stepIdx === SECTIONS.length - 1) {
      setSubmitting(true)
      try {
        await saveCurrentResponses()
        setStepIdx(SECTIONS.length) // entra no review
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Senao, salva parcial em background e avanca
    void saveCurrentResponses()
    setStepIdx(stepIdx + 1)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function prev() {
    if (stepIdx === 0) return
    setStepIdx(stepIdx - 1)
    setError(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
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
          <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
          <h1 className="text-[18px] font-semibold text-slate-900 mb-1">
            Link inválido
          </h1>
          <p className="text-[13px] text-slate-600">{error}</p>
        </div>
      </div>
    )
  }
  if (!ctx) return null

  if (submitted || ctx.briefing_confirmed_by_client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white rounded-[8px] border border-slate-200 p-8 shadow-sm">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-[20px] font-bold text-slate-900 mb-2">
            Recebido!
          </h1>
          <p className="text-[13.5px] text-slate-600 leading-relaxed">
            Suas respostas e o briefing chegaram pra equipe Convertfy. Em breve
            nosso designer começa a trabalhar no seu welcome flow. Acompanhe
            tudo pelo nosso grupo do WhatsApp.
          </p>
        </div>
      </div>
    )
  }

  // Tela de review do briefing - delega pro componente FormTela2Client
  if (isReviewStep) {
    // Inline render para evitar quebra de fluxo (mesma URL)
    return <BriefingReviewInline token={token} onBack={() => setStepIdx(stepIdx - 1)} onConfirmed={() => setSubmitted(true)} />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Progress bar fixa */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-brand-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-400">
              Etapa {stepIdx + 1} de {totalSteps}
            </p>
            <h1 className="text-[15px] font-semibold text-slate-900 truncate">
              {currentSection.title}
            </h1>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
            {progress}%
          </span>
        </div>
      </div>

      {/* Header da seção */}
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-brand-100 text-brand-400">
            <Sparkles className="h-3 w-3" />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-400">
            Onboarding · {ctx.store?.store_name ?? "sua marca"}
          </p>
        </div>
        <h2 className="text-[22px] font-bold tracking-tight text-slate-900">
          {currentSection.title}
        </h2>
        <p className="text-[13px] text-slate-600 mt-1">
          {currentSection.subtitle}
        </p>
      </div>

      {/* Questions */}
      <div className="max-w-2xl mx-auto px-5 pb-6 space-y-4">
        {currentSection.questions.map((q, idx) => (
          <div
            key={q.key}
            className="bg-white rounded-[8px] border border-slate-200 p-4"
          >
            <label className="block">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-brand-400 font-mono">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] font-semibold text-slate-900">
                  {q.label}
                  {q.required && <span className="text-rose-500 ml-1">*</span>}
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
                  className="w-full px-3 py-2 text-[13px] rounded-[6px] border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              ) : q.type === "select" ? (
                <select
                  value={values[q.key] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [q.key]: e.target.value }))
                  }
                  className="w-full h-10 px-3 text-[13px] rounded-[6px] border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">— selecione —</option>
                  {(q.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={q.type === "url" ? "url" : "text"}
                  value={values[q.key] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [q.key]: e.target.value }))
                  }
                  placeholder={q.placeholder}
                  className="w-full h-10 px-3 text-[13px] rounded-[6px] border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
          <div className="rounded-[6px] bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={prev}
            disabled={stepIdx === 0 || submitting}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[6px] text-[13px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <button
            type="button"
            onClick={next}
            disabled={submitting}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-[6px] bg-[#1F1F1F] hover:bg-black text-white text-[13.5px] font-semibold disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {stepIdx === SECTIONS.length - 1
              ? submitting
                ? "Gerando briefing..."
                : "Gerar briefing"
              : "Próxima etapa"}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center pt-4">
          Suas respostas são privadas. Salvamos o progresso a cada etapa.
        </p>
      </div>
    </div>
  )
}

// ─── Briefing review (passo final inline) ───────────────────────────────

function BriefingReviewInline({
  token,
  onBack,
  onConfirmed,
}: {
  token: string
  onBack: () => void
  onConfirmed: () => void
}) {
  const [briefing, setBriefing] = useState<BriefingContent | null>(null)
  const [status, setStatus] = useState<string>("generating")
  const [error, setError] = useState<string | null>(null)
  const [editable, setEditable] = useState<BriefingContent | null>(null)
  const [clientAdditions, setClientAdditions] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Polling
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function poll() {
      try {
        const res = await fetch(`/api/forms/${token}/briefing-status`)
        const j = await res.json()
        if (stopped) return
        if (!res.ok) {
          setError(j.error ?? "Erro")
          return
        }
        setStatus(j.status)
        if (j.briefing) {
          setBriefing(j.briefing)
          if (!editable) {
            setEditable(j.briefing)
            setClientAdditions(j.briefing.client_additions ?? "")
          }
        }
        if (j.confirmed) {
          onConfirmed()
          return
        }
        if (
          ["generating", "form_partially_filled", "not_started"].includes(
            j.status,
          )
        ) {
          timer = setTimeout(poll, 4000)
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message)
      }
    }
    void poll()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [token, editable, onConfirmed])

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
      onConfirmed()
    } finally {
      setSubmitting(false)
    }
  }

  // Estado: gerando
  if (
    !briefing ||
    ["generating", "form_partially_filled", "not_started"].includes(status)
  ) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="text-[12px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400">
              Etapa final · gerando briefing
            </span>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-5 py-12">
          <div className="bg-white rounded-[8px] border border-slate-200 p-8 text-center">
            <div className="relative mx-auto w-14 h-14 mb-4">
              <div className="absolute inset-0 rounded-full bg-brand-100 animate-ping" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-full bg-brand-500 text-white">
                <Sparkles className="h-6 w-6" />
              </div>
            </div>
            <h1 className="text-[18px] font-bold text-slate-900 mb-2">
              Estamos gerando seu briefing
            </h1>
            <p className="text-[13px] text-slate-600 leading-relaxed max-w-md mx-auto">
              A IA está estruturando suas respostas num briefing personalizado.
              Isso costuma levar entre 30 segundos e 2 minutos. A página atualiza
              sozinha.
            </p>
            {error && (
              <p className="mt-4 text-[12px] text-rose-600">{error}</p>
            )}
          </div>
          {/* Skeleton */}
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-[8px] border border-slate-200 p-4 animate-pulse"
              >
                <div className="h-3 w-32 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-full bg-slate-100 rounded" />
                <div className="h-3 w-3/4 bg-slate-100 rounded mt-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const b = editable ?? briefing

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-[12px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400">
            Etapa final · revise e confirme
          </span>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900">
            Briefing gerado
          </h1>
          <p className="text-[13px] text-slate-600 mt-1">
            Dá uma olhada no que a IA montou. Você pode editar qualquer campo.
            Quando confirmar, sua loja avança pra fase de design.
          </p>
        </div>

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
          onChange={(v) => setEditable((s) => (s ? { ...s, audience: v } : s))}
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
            setEditable((s) => (s ? { ...s, offers_and_differentials: v } : s))
          }
          rows={3}
        />

        <div className="bg-emerald-50/40 rounded-[8px] border border-emerald-200 p-4">
          <label className="block">
            <p className="text-[12px] font-semibold text-emerald-700 mb-1">
              Algo que faltou ou que você quer destacar?
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
          <div className="rounded-[6px] bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[6px] bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-semibold disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Confirmando..." : "Confirmar e finalizar onboarding"}
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
          className="w-full px-3 py-2 text-[13px] rounded-[6px] border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
