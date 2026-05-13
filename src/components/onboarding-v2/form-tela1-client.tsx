"use client"

/**
 * Formulário publico unificado — Ficha de Onboarding (versão final).
 *
 * Wizard multi-step com 5 secoes enxutas + uploads + briefing IA inline +
 * tela "Proximos passos" com timeline. Total: 19 perguntas + 3 uploads.
 *
 * Cruzou com a ficha do Notion (Convertfy operacional) e tirou
 * redundancias com o que o admin ja cadastra no modal "Novo onboarding".
 *
 * Acessivel por token publico em /form/[token]. Apos completar etapas:
 *   1. Quem e voce (contato)        — nome, whatsapp, email
 *   2. Sua empresa                  — CNPJ, pais
 *   3. Sua loja                     — pre-preenchido editavel
 *   4. Sua marca                    — posicionamento, tom, sensibilidade
 *   5. Seu cliente                  — persona, objecao, motivador
 *   6. Historico & objetivos        — fez email antes, objetivo, sazonais
 *   7. Materiais                    — logo (upload), manual, design refs, OBS
 *   8. Confirme o briefing          — IA gera, cliente revisa
 *   9. Proximos passos              — timeline 6 etapas + CSM avatar
 */

import { useEffect, useState } from "react"
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Upload,
  X,
  ShieldCheck,
  Mail,
  Clock,
} from "lucide-react"
import type { BriefingContent } from "@/types/onboarding-pipeline"

interface OnboardingContext {
  id: string
  briefing_status: string
  briefing: BriefingContent | null
  briefing_confirmed_by_client: boolean
  form_responses: Record<string, unknown> | null
  client?: { name: string; company: string | null } | null
  store?: { store_name: string; platform: string | null; store_url: string | null } | null
}

interface Question {
  key: string
  label: string
  placeholder?: string
  helpText?: string
  type: "text" | "textarea" | "url" | "select" | "email" | "tel" | "file"
  options?: string[]
  required?: boolean
  rows?: number
  /** Aparece so se essa condicao for true */
  showIf?: (values: Record<string, string>) => boolean
  /** Pre-fill com dado do cadastro */
  prefill?: (ctx: OnboardingContext | null) => string | undefined
  /** Upload multi-arquivo (so type=file) */
  multiple?: boolean
}

interface Section {
  id: string
  title: string
  subtitle: string
  questions: Question[]
}

const SECTIONS: Section[] = [
  {
    id: "contato",
    title: "Quem é você",
    subtitle: "Pra gente saber quem fala pela loja.",
    questions: [
      {
        key: "contact_name",
        label: "Seu nome completo",
        type: "text",
        required: true,
        placeholder: "Ex: Maria Silva",
      },
      {
        key: "contact_whatsapp",
        label: "WhatsApp com DDD",
        type: "tel",
        required: true,
        placeholder: "(11) 91234-5678",
        helpText: "Vamos te adicionar no grupo do projeto.",
      },
      {
        key: "contact_email",
        label: "E-mail principal",
        type: "email",
        required: true,
        placeholder: "voce@empresa.com",
      },
    ],
  },
  {
    id: "empresa",
    title: "Sua empresa",
    subtitle: "Dados fiscais e localização.",
    questions: [
      {
        key: "cnpj",
        label: "CNPJ",
        type: "text",
        required: true,
        placeholder: "00.000.000/0000-00",
      },
      {
        key: "country",
        label: "País da loja",
        type: "select",
        required: true,
        options: ["Brasil", "Portugal", "Estados Unidos", "México", "Outro"],
      },
    ],
  },
  {
    id: "loja",
    title: "Sua loja",
    subtitle: "Confira o que a gente já sabe e complete o resto.",
    questions: [
      {
        key: "store_name",
        label: "Nome da loja",
        type: "text",
        required: true,
        prefill: (ctx) => ctx?.store?.store_name ?? "",
      },
      {
        key: "store_url",
        label: "URL da loja",
        type: "url",
        required: true,
        placeholder: "https://...",
        prefill: (ctx) => ctx?.store?.store_url ?? "",
      },
      {
        key: "platform_ecommerce",
        label: "Plataforma de e-commerce",
        type: "select",
        required: true,
        options: ["Shopify", "Nuvemshop", "WooCommerce", "VTEX", "Tray", "Dupla estrutura", "Outra"],
        prefill: (ctx) => {
          const p = ctx?.store?.platform?.toLowerCase() ?? ""
          if (p === "shopify") return "Shopify"
          if (p === "nuvemshop") return "Nuvemshop"
          if (p === "woocommerce") return "WooCommerce"
          if (p === "vtex") return "VTEX"
          if (p === "tray") return "Tray"
          return ""
        },
      },
      {
        key: "shopify_collaborator_code",
        label: "Código de colaborador Shopify",
        type: "text",
        required: true,
        placeholder: "Ex: ABC123",
        helpText:
          "Encontre em Configurações > Usuários e permissões > Solicitações de colaborador.",
        showIf: (v) => v.platform_ecommerce === "Shopify",
      },
      {
        key: "vertical",
        label: "Nicho / Vertical",
        type: "text",
        required: true,
        placeholder: "Moda feminina, suplementos, etc.",
      },
      {
        key: "shipping_type",
        label: "Como funciona seu frete?",
        type: "select",
        required: true,
        options: ["Grátis", "Fixo", "Personalizado (varia por região/produto)"],
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
        rows: 2,
        placeholder: "Best-sellers ou linhas principais",
      },
    ],
  },
  {
    id: "marca",
    title: "Sua marca",
    subtitle: "Personalidade e identidade que vamos seguir.",
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
        options: ["Formal", "Casual / amigável", "Divertido / irreverente", "Técnico", "Inspirador"],
      },
      {
        key: "price_vs_quality",
        label: "Seu público é mais sensível a preço ou qualidade?",
        type: "select",
        required: true,
        options: [
          "Preço — busca melhor oferta",
          "Qualidade — busca produto premium",
          "Equilibrado — depende da categoria",
        ],
      },
    ],
  },
  {
    id: "cliente",
    title: "Seu cliente",
    subtitle: "Quem é a pessoa que compra de você.",
    questions: [
      {
        key: "primary_persona",
        label: "Persona principal",
        type: "textarea",
        rows: 3,
        required: true,
        placeholder: "Idade, gênero, comportamento, onde mora, como compra…",
      },
      {
        key: "main_motivator",
        label: "O que faz seu cliente comprar?",
        type: "textarea",
        rows: 2,
        required: true,
        placeholder: "Maior motivador de compra",
      },
      {
        key: "main_objection",
        label: "O que segura seu cliente de comprar?",
        type: "textarea",
        rows: 2,
        required: true,
        placeholder: "Maior objeção (preço, frete, dúvida, etc.)",
      },
    ],
  },
  {
    id: "objetivos",
    title: "Histórico & objetivos",
    subtitle: "Pra calibrarmos a estratégia certa.",
    questions: [
      {
        key: "did_email_marketing",
        label: "Já fez email marketing antes?",
        type: "select",
        required: true,
        options: ["Sim, faço regularmente", "Sim, mas pouco", "Não, é a primeira vez"],
      },
      {
        key: "main_goal",
        label: "Principal objetivo nos próximos 90 dias",
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
        key: "seasonal_priorities",
        label: "Datas críticas / campanhas sazonais próximas",
        type: "textarea",
        rows: 2,
        placeholder: "Black Friday, Dia das Mães, Natal, lançamento X em junho…",
      },
    ],
  },
  {
    id: "materiais",
    title: "Materiais & observações",
    subtitle: "Quanto mais materiais, melhor a primeira entrega.",
    questions: [
      {
        key: "logo_url",
        label: "Logo da marca (PNG sem fundo)",
        type: "file",
        required: true,
        helpText: "PNG transparente é o ideal. Pode mandar SVG também.",
      },
      {
        key: "brand_manual_url",
        label: "Manual da marca (caso possua)",
        type: "file",
        helpText: "PDF, Figma export, etc. Opcional.",
      },
      {
        key: "design_refs_url",
        label: "Referências visuais que admiram",
        type: "file",
        helpText: "Print de marcas/emails que vocês curtem o visual.",
        multiple: true,
      },
      {
        key: "obs",
        label: "Algo mais que devemos saber?",
        type: "textarea",
        rows: 3,
        placeholder: "Restrições, preferências, histórico de outras agências…",
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
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

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
        // Pre-fill com responses existentes
        const existing = (j.onboarding.form_responses ?? {}) as Record<
          string,
          string
        >
        const initialValues: Record<string, string> = { ...existing }
        // Pre-fill com dados do cadastro pra cada question com prefill
        for (const section of SECTIONS) {
          for (const q of section.questions) {
            if (
              q.prefill &&
              !initialValues[q.key]
            ) {
              const v = q.prefill(j.onboarding)
              if (v) initialValues[q.key] = v
            }
          }
        }
        setValues(initialValues)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [token])

  const totalSteps = SECTIONS.length + 1 // +1 = briefing review
  const isReviewStep = stepIdx === SECTIONS.length
  const currentSection = SECTIONS[stepIdx]
  const progress = Math.round(((stepIdx + 1) / totalSteps) * 100)

  // Filtra perguntas visiveis baseado em showIf
  const visibleQuestions = isReviewStep
    ? []
    : currentSection.questions.filter(
        (q) => !q.showIf || q.showIf(values),
      )

  function validateCurrentSection(): string | null {
    if (isReviewStep) return null
    const missing = visibleQuestions
      .filter((q) => q.required)
      .filter((q) => !(values[q.key] ?? "").trim())
    if (missing.length > 0) {
      return `Faltam: ${missing.map((m) => m.label).join(", ")}`
    }
    return null
  }

  async function saveCurrentResponses() {
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

    if (stepIdx === SECTIONS.length - 1) {
      setSubmitting(true)
      try {
        await saveCurrentResponses()
        setStepIdx(SECTIONS.length)
      } finally {
        setSubmitting(false)
      }
      return
    }

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

  async function uploadFile(qKey: string, file: File, multi: boolean) {
    if (!ctx) return
    setUploadingKey(qKey)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("scope", "deliverable")
      fd.append("ref_id", ctx.id)
      const res = await fetch("/api/upload/onboarding", {
        method: "POST",
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      const data = j.data ?? j
      if (res.ok && (data.url || data.path)) {
        const url = data.url ?? data.path
        if (multi) {
          const existing = values[qKey] ? values[qKey].split("\n") : []
          setValues((v) => ({ ...v, [qKey]: [...existing, url].join("\n") }))
        } else {
          setValues((v) => ({ ...v, [qKey]: url }))
        }
      } else {
        setError(j.error ?? "Falha no upload")
      }
    } finally {
      setUploadingKey(null)
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
    return <NextStepsScreen storeName={ctx.store?.store_name ?? "sua loja"} />
  }

  if (isReviewStep) {
    return (
      <BriefingReviewInline
        token={token}
        onBack={() => setStepIdx(stepIdx - 1)}
        onConfirmed={() => setSubmitted(true)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top: brand band */}
      <div className="bg-[#0F1117]">
        <div className="max-w-2xl mx-auto px-5 py-5 flex items-center gap-3">
          <div
            className="h-7 w-7 rounded flex items-center justify-center"
            style={{
              background:
                "linear-gradient(90deg, #4E62D8, #2137B6, #041366)",
            }}
          >
            <span className="text-white font-bold text-[13px]">C</span>
          </div>
          <span className="text-white font-semibold text-[15px]">Convertfy</span>
        </div>
      </div>

      {/* Progress bar fixa */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="h-1 bg-slate-100">
          <div
            className="h-full transition-all"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #4E62D8, #2137B6)",
            }}
          />
        </div>
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500">
              Etapa {stepIdx + 1} de {totalSteps}
            </p>
            <h1 className="text-[15px] font-semibold text-slate-900 truncate">
              {currentSection.title}
            </h1>
          </div>
          <span
            className="text-[11px] font-mono text-slate-500 shrink-0"
            style={{
              fontVariantNumeric: "tabular-nums lining-nums",
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}
          >
            {progress}%
          </span>
        </div>
      </div>

      {/* Header de boas-vindas (so na primeira etapa) */}
      {stepIdx === 0 && (
        <div className="max-w-2xl mx-auto px-5 pt-6 pb-2">
          <div className="rounded-md border border-brand-200 bg-brand-50 p-4 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13.5px] font-semibold text-slate-900 mb-0.5">
                Bem-vindo {ctx.client?.name ? `, ${ctx.client.name.split(" ")[0]}` : ""}!
              </p>
              <p className="text-[12.5px] text-slate-700 leading-relaxed">
                Em <strong>menos de 5 minutos</strong> a gente coleta tudo que
                precisa pra montar sua estratégia. As respostas vão direto pra
                IA que monta um briefing personalizado pra você revisar no fim.
                <br />
                <span className="text-slate-500">
                  Implementação completa em 3-7 dias úteis depois.
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header da seção */}
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-3">
        <h2 className="text-[22px] font-semibold tracking-tight text-slate-900">
          {currentSection.title}
        </h2>
        <p className="text-[13px] text-slate-600 mt-1">
          {currentSection.subtitle}
        </p>
      </div>

      {/* Questions */}
      <div className="max-w-2xl mx-auto px-5 pb-6 space-y-3">
        {visibleQuestions.map((q, idx) => (
          <QuestionCard
            key={q.key}
            q={q}
            idx={idx}
            value={values[q.key] ?? ""}
            uploading={uploadingKey === q.key}
            onChange={(v) => setValues((s) => ({ ...s, [q.key]: v }))}
            onUpload={(file) => uploadFile(q.key, file, !!q.multiple)}
          />
        ))}

        {error && (
          <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={prev}
            disabled={stepIdx === 0 || submitting}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md text-[13px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <button
            type="button"
            onClick={next}
            disabled={submitting}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-md text-white text-[13.5px] font-semibold disabled:opacity-50"
            style={{ background: "#4E62D8" }}
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

        {/* Trust strip */}
        <div className="flex items-center justify-center gap-4 pt-6 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            Dados privados
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" />
            Salvo automaticamente
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            ~5 min
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── QuestionCard ────────────────────────────────────────────────────────

function QuestionCard({
  q,
  idx,
  value,
  uploading,
  onChange,
  onUpload,
}: {
  q: Question
  idx: number
  value: string
  uploading: boolean
  onChange: (v: string) => void
  onUpload: (file: File) => void
}) {
  return (
    <div className="bg-white rounded-md border border-slate-200 p-4">
      <label className="block">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[10px] font-bold text-brand-500"
            style={{
              fontVariantNumeric: "tabular-nums lining-nums",
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}
          >
            {String(idx + 1).padStart(2, "0")}
          </span>
          <span className="text-[13px] font-semibold text-slate-900">
            {q.label}
            {q.required && <span className="text-rose-500 ml-1">*</span>}
          </span>
        </div>

        {q.type === "textarea" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder}
            rows={q.rows ?? 3}
            className="w-full px-3 py-2 text-[13px] rounded-md border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-50"
          />
        ) : q.type === "select" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-10 px-3 text-[13px] rounded-md border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-50"
          >
            <option value="">— selecione —</option>
            {(q.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : q.type === "file" ? (
          <FileField
            value={value}
            uploading={uploading}
            multiple={!!q.multiple}
            onUpload={onUpload}
            onClear={() => onChange("")}
          />
        ) : (
          <input
            type={
              q.type === "url"
                ? "url"
                : q.type === "email"
                  ? "email"
                  : q.type === "tel"
                    ? "tel"
                    : "text"
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder}
            className="w-full h-10 px-3 text-[13px] rounded-md border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-50"
          />
        )}

        {q.helpText && (
          <p className="mt-1.5 text-[11.5px] text-slate-500">{q.helpText}</p>
        )}
      </label>
    </div>
  )
}

function FileField({
  value,
  uploading,
  multiple,
  onUpload,
  onClear,
}: {
  value: string
  uploading: boolean
  multiple: boolean
  onUpload: (file: File) => void
  onClear: () => void
}) {
  const urls = value ? value.split("\n").filter(Boolean) : []
  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <div className="space-y-1">
          {urls.map((u, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-200 bg-emerald-50/60"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="text-[12px] text-emerald-800 truncate flex-1">
                Arquivo enviado {urls.length > 1 ? `· ${i + 1}` : ""}
              </span>
              {!multiple && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label="Remover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {(multiple || urls.length === 0) && (
        <label className="flex items-center justify-center gap-2 h-12 rounded-md border-2 border-dashed border-slate-300 bg-white cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors">
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <>
              <Upload className="h-4 w-4 text-slate-400" />
              <span className="text-[12.5px] text-slate-600">
                {urls.length > 0
                  ? "Adicionar mais um arquivo"
                  : "Clique pra fazer upload"}
              </span>
            </>
          )}
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
            }}
          />
        </label>
      )}
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-500">
              Etapa final · gerando briefing
            </span>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-5 py-12">
          <div className="bg-white rounded-md border border-slate-200 p-8 text-center">
            <div className="relative mx-auto w-14 h-14 mb-4">
              <div className="absolute inset-0 rounded-full bg-brand-100 animate-ping" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-full text-white" style={{ background: "#4E62D8" }}>
                <Sparkles className="h-6 w-6" />
              </div>
            </div>
            <h1 className="text-[18px] font-bold text-slate-900 mb-2">
              Estamos montando seu briefing
            </h1>
            <p className="text-[13px] text-slate-600 leading-relaxed max-w-md mx-auto">
              A IA está estruturando suas respostas. Costuma levar entre 30
              segundos e 2 minutos. Esta página atualiza sozinha.
            </p>
            {error && <p className="mt-4 text-[12px] text-rose-600">{error}</p>}
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-md border border-slate-200 p-4 animate-pulse"
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
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-500">
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
            Dá uma olhada no que a IA montou. Edite qualquer campo se quiser
            ajustar. Quando confirmar, sua loja avança pra fase de design.
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
        <div className="bg-white rounded-md border border-slate-200 p-4">
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

        <div className="bg-emerald-50/40 rounded-md border border-emerald-200 p-4">
          <label className="block">
            <p className="text-[12px] font-semibold text-emerald-700 mb-1">
              Algo que faltou ou que você quer destacar?
            </p>
            <textarea
              value={clientAdditions}
              onChange={(e) => setClientAdditions(e.target.value)}
              placeholder="Opcional. Esse texto vai junto pra equipe."
              rows={3}
              className="w-full px-3 py-2 text-[13px] rounded-md border border-emerald-200 bg-white"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-semibold disabled:opacity-50"
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
    <div className="bg-white rounded-md border border-slate-200 p-4">
      <label className="block">
        <p className="text-[12px] font-semibold text-slate-900 mb-1.5">
          {label}
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          className="w-full px-3 py-2 text-[13px] rounded-md border border-slate-200 bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-50"
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
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 text-[12.5px] rounded-md border border-slate-200 bg-white"
      />
    </label>
  )
}

// ─── Next Steps Screen (apos confirmar briefing) ─────────────────────────

const NEXT_STEPS = [
  { n: 1, name: "Briefing aprovado", desc: "Acabou de chegar pra equipe", done: true },
  { n: 2, name: "Design em produção", desc: "Designer começa welcome flow", done: false },
  { n: 3, name: "Preview pra você revisar", desc: "Mandamos no seu WhatsApp", done: false },
  { n: 4, name: "Ajustes (se houver)", desc: "1 rodada de revisão", done: false },
  { n: 5, name: "Implementação técnica", desc: "DNS, SPF/DKIM, configuração", done: false },
  { n: 6, name: "Loja ativa", desc: "Monitoramos resultados", done: false },
]

function NextStepsScreen({ storeName }: { storeName: string }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#0F1117]">
        <div className="max-w-2xl mx-auto px-5 py-5 flex items-center gap-3">
          <div
            className="h-7 w-7 rounded flex items-center justify-center"
            style={{
              background:
                "linear-gradient(90deg, #4E62D8, #2137B6, #041366)",
            }}
          >
            <span className="text-white font-bold text-[13px]">C</span>
          </div>
          <span className="text-white font-semibold text-[15px]">Convertfy</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 mb-3">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight">
            Recebido!
          </h1>
          <p className="text-[14px] text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
            Suas respostas e o briefing da <strong>{storeName}</strong> chegaram
            pra equipe. Em 3-7 dias úteis sua estrutura tá no ar.
          </p>
        </div>

        <div className="bg-white rounded-md border border-slate-200 p-5">
          <p
            className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-4"
          >
            O que acontece agora
          </p>
          <ol className="space-y-4">
            {NEXT_STEPS.map((s) => (
              <li key={s.n} className="flex items-start gap-3">
                <div
                  className={
                    "flex h-7 w-7 items-center justify-center rounded-full shrink-0 text-[12px] font-semibold " +
                    (s.done
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500")
                  }
                  style={{
                    fontVariantNumeric: "tabular-nums lining-nums",
                  }}
                >
                  {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      "text-[13.5px] font-medium leading-snug " +
                      (s.done ? "text-slate-500 line-through" : "text-slate-900")
                    }
                  >
                    {s.name}
                  </p>
                  <p className="text-[12px] text-slate-500 mt-0.5">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-5 rounded-md border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-slate-900">
                Acompanhe pelo WhatsApp
              </p>
              <p className="text-[12px] text-slate-700 mt-1 leading-relaxed">
                Vamos te adicionar num grupo com o time pra você acompanhar
                tudo em tempo real. Qualquer dúvida, é só falar lá.
              </p>
            </div>
          </div>
        </div>

        <p className="text-[11.5px] text-center text-slate-400 mt-8">
          Convertfy · Agência especialista em e-mail marketing pra e-commerce
        </p>
      </div>
    </div>
  )
}
