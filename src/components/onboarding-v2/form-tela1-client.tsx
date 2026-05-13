"use client"

/**
 * Formulário publico unificado — Ficha de Onboarding (versão final).
 *
 * Wizard multi-step com 6 secoes enxutas + uploads + briefing IA inline +
 * tela "Proximos passos" com timeline.
 *
 * Cruzou com a ficha do Notion (Convertfy operacional) e tirou
 * redundancias com o que o admin ja cadastra no modal "Novo onboarding"
 * (cliente, contato, whatsapp ja vem do cadastro).
 *
 * Acessivel por token publico em /form/[token]. Apos completar etapas:
 *   1. Sua empresa                  — CNPJ, pais
 *   2. Sua loja                     — pre-preenchido editavel
 *   3. Sua marca                    — posicionamento, tom, sensibilidade
 *   4. Seu cliente                  — persona, objecao, motivador
 *   5. Historico & objetivos        — fez email antes, objetivo, sazonais
 *   6. Materiais                    — logo (upload), manual, design refs, OBS
 *   7. Confirme o briefing          — IA gera, cliente revisa
 *   8. Proximos passos              — timeline 6 etapas + CSM avatar
 */

import { useEffect, useState } from "react"
import Image from "next/image"
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
  Check,
  Building2,
  Store as StoreIcon,
  Palette,
  Users,
  Target,
  FolderUp,
  FileCheck2,
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
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  questions: Question[]
}

const SECTIONS: Section[] = [
  {
    id: "empresa",
    title: "Sua empresa",
    subtitle: "Dados fiscais e localização.",
    icon: Building2,
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
    icon: StoreIcon,
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
    icon: Palette,
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
    icon: Users,
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
    icon: Target,
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
    icon: FolderUp,
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

  const sectionsForSidebar = [
    ...SECTIONS.map((s, i) => ({
      idx: i,
      title: s.title,
      icon: s.icon,
      done: i < stepIdx,
      active: i === stepIdx,
    })),
    {
      idx: SECTIONS.length,
      title: "Confirmar briefing",
      icon: FileCheck2,
      done: false,
      active: stepIdx === SECTIONS.length,
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <FormShell
        progress={progress}
        stepIdx={stepIdx}
        totalSteps={totalSteps}
        sections={sectionsForSidebar}
        onSelectStep={(i) => {
          if (i <= stepIdx) {
            setStepIdx(i)
            setError(null)
          }
        }}
      >
        {/* Welcome banner (so primeira etapa) */}
        {stepIdx === 0 && (
          <div className="mb-8 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-brand-50/70 via-white to-white p-5 sm:p-6 flex items-start gap-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
              style={{
                background: "linear-gradient(135deg, #4E62D8 0%, #2137B6 100%)",
              }}
            >
              <Sparkles className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] sm:text-[16px] font-semibold text-slate-900 leading-tight">
                Bem-vindo
                {ctx.client?.name
                  ? `, ${ctx.client.name.split(" ")[0]}`
                  : ""}
                .
              </h3>
              <p className="text-[13px] sm:text-[13.5px] text-slate-600 mt-1.5 leading-relaxed">
                Em <strong className="text-slate-900">menos de 5 minutos</strong>{" "}
                coletamos tudo que precisamos. Sua IA monta um briefing
                personalizado pra você revisar no fim — implementação completa em{" "}
                <strong className="text-slate-900">3-7 dias úteis</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Header da secao */}
        <div className="mb-7 sm:mb-9">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-500">
              Etapa {stepIdx + 1} de {totalSteps}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-[10.5px] font-medium text-slate-500">
              {visibleQuestions.length} pergunta
              {visibleQuestions.length === 1 ? "" : "s"}
            </span>
          </div>
          <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-tight text-slate-900 leading-[1.15]">
            {currentSection.title}
          </h1>
          <p className="text-[14px] sm:text-[15px] text-slate-500 mt-2 max-w-[58ch]">
            {currentSection.subtitle}
          </p>
        </div>

        {/* Questions */}
        <div className="space-y-4">
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
        </div>

        {error && (
          <div className="mt-5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Bottom actions (desktop inline + mobile sticky) */}
        <div className="mt-8 hidden sm:flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={stepIdx === 0 || submitting}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <PrimaryButton
            submitting={submitting}
            isLastStep={stepIdx === SECTIONS.length - 1}
            onClick={next}
          />
        </div>

        {/* Sticky bottom bar mobile */}
        <div className="sm:hidden h-20" aria-hidden />
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200">
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={prev}
              disabled={stepIdx === 0 || submitting}
              aria-label="Voltar"
              className="inline-flex items-center justify-center h-11 w-11 rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <PrimaryButton
                submitting={submitting}
                isLastStep={stepIdx === SECTIONS.length - 1}
                onClick={next}
                fullWidth
              />
            </div>
          </div>
        </div>
      </FormShell>
    </div>
  )
}

// ─── PrimaryButton ───────────────────────────────────────────────────────

function PrimaryButton({
  submitting,
  isLastStep,
  onClick,
  fullWidth,
}: {
  submitting: boolean
  isLastStep: boolean
  onClick: () => void
  fullWidth?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitting}
      className={
        "inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl text-white text-[14px] font-semibold disabled:opacity-50 shadow-[0_2px_8px_rgba(78,98,216,0.25)] hover:shadow-[0_4px_14px_rgba(78,98,216,0.35)] transition-shadow " +
        (fullWidth ? "w-full" : "")
      }
      style={{
        background: "linear-gradient(135deg, #4E62D8 0%, #2137B6 100%)",
      }}
    >
      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
      {isLastStep
        ? submitting
          ? "Gerando briefing…"
          : "Gerar briefing"
        : "Próxima etapa"}
      {!submitting && <ArrowRight className="h-4 w-4" />}
    </button>
  )
}

// ─── FormShell: layout split com sidebar steps ──────────────────────────

interface SidebarSection {
  idx: number
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  done: boolean
  active: boolean
}

function FormShell({
  progress,
  stepIdx,
  totalSteps,
  sections,
  onSelectStep,
  children,
}: {
  progress: number
  stepIdx: number
  totalSteps: number
  sections: SidebarSection[]
  onSelectStep: (i: number) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop only) */}
      <aside className="hidden lg:flex w-[300px] xl:w-[320px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/60">
        {/* Logo */}
        <div className="px-7 pt-8 pb-10">
          <Image
            src="/images/logo da convertfy com escrito preto.png"
            alt="Convertfy"
            width={160}
            height={32}
            priority
            className="object-contain"
            style={{ height: 28, width: "auto" }}
          />
        </div>

        {/* Steps list */}
        <nav className="flex-1 px-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-3">
            Onboarding
          </p>
          <ol className="space-y-0.5">
            {sections.map((s) => {
              const clickable = s.idx <= stepIdx
              const Icon = s.icon
              return (
                <li key={s.idx}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => onSelectStep(s.idx)}
                    className={
                      "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors " +
                      (s.active
                        ? "bg-white text-slate-900 font-semibold shadow-[0_1px_3px_rgba(15,23,42,0.06)] border border-slate-200/70"
                        : s.done
                          ? "text-slate-600 hover:bg-white/80 hover:text-slate-900"
                          : "text-slate-400 cursor-not-allowed")
                    }
                  >
                    <span
                      className={
                        "shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg " +
                        (s.done
                          ? "bg-emerald-50 text-emerald-600"
                          : s.active
                            ? "bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[0_2px_6px_rgba(78,98,216,0.35)]"
                            : "bg-slate-100 text-slate-400")
                      }
                    >
                      {s.done ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      ) : (
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                      )}
                    </span>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-[10px] font-mono text-slate-400 tabular-nums shrink-0">
                      {String(s.idx + 1).padStart(2, "0")}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Trust strip */}
        <div className="px-7 py-6 border-t border-slate-200/80 mt-4 space-y-2">
          <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
            Dados privados e criptografados
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
            Salvo automaticamente
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
            <Clock className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
            Você termina em ~5 min
          </div>
        </div>
      </aside>

      {/* Main column */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile/tablet topbar */}
        <header className="lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
            <Image
              src="/images/logo da convertfy com escrito preto.png"
              alt="Convertfy"
              width={140}
              height={26}
              priority
              className="object-contain"
              style={{ height: 24, width: "auto" }}
            />
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              {stepIdx + 1}/{totalSteps}
            </span>
          </div>
          <div className="h-1 bg-slate-100">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #4E62D8 0%, #2137B6 100%)",
              }}
            />
          </div>
        </header>

        {/* Desktop progress bar fina no topo */}
        <div className="hidden lg:block h-[3px] bg-slate-100">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #4E62D8 0%, #2137B6 100%)",
            }}
          />
        </div>

        {/* Content area */}
        <div className="flex-1 flex justify-center">
          <div className="w-full max-w-[680px] px-5 sm:px-8 py-8 sm:py-12 lg:py-14">
            {children}
          </div>
        </div>
      </main>
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
  const hasValue = !!(value || "").trim()

  const inputClass =
    "w-full px-4 text-[14px] text-slate-900 placeholder:text-slate-400 rounded-xl border bg-white transition-all duration-150 " +
    "border-slate-200 hover:border-slate-300 " +
    "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 " +
    "[appearance:none]"

  return (
    <div
      className={
        "group bg-white rounded-2xl border p-5 sm:p-6 transition-all duration-150 " +
        (hasValue
          ? "border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          : "border-slate-200 hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.04)]")
      }
    >
      <label className="block">
        <div className="flex items-start gap-3 mb-3">
          <span
            className={
              "shrink-0 inline-flex items-center justify-center h-6 min-w-[26px] px-1.5 rounded-md text-[10.5px] font-bold tabular-nums tracking-wide " +
              (hasValue
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-500")
            }
          >
            {hasValue ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : (
              String(idx + 1).padStart(2, "0")
            )}
          </span>
          <span className="text-[14px] sm:text-[15px] font-semibold text-slate-900 leading-snug">
            {q.label}
            {q.required && (
              <span className="text-brand-500 ml-1" aria-label="obrigatório">
                *
              </span>
            )}
          </span>
        </div>

        {q.type === "textarea" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder}
            rows={q.rows ?? 3}
            className={inputClass + " py-3 resize-none"}
          />
        ) : q.type === "select" ? (
          <CustomSelect
            value={value}
            options={q.options ?? []}
            onChange={onChange}
          />
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
            className={inputClass + " h-11"}
          />
        )}

        {q.helpText && (
          <p className="mt-2 text-[12px] text-slate-500 leading-relaxed">
            {q.helpText}
          </p>
        )}
      </label>
    </div>
  )
}

// ─── CustomSelect: pill cards (radio-like) pra <=5 opcoes, native select acima ─

function CustomSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  // Se for poucas opcoes curtas, mostra como pill cards (melhor UX Typeform-like).
  // Se for muitas ou textos longos, fallback pra select nativo estilizado.
  const useGrid =
    options.length <= 5 && options.every((o) => o.length <= 40)
  if (useGrid) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => {
          const selected = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={
                "text-left text-[13.5px] font-medium px-4 py-3 rounded-xl border transition-all duration-150 flex items-center gap-2.5 " +
                (selected
                  ? "border-brand-500 bg-brand-50/60 text-slate-900 shadow-[0_0_0_3px_rgba(78,98,216,0.08)]"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")
              }
              aria-pressed={selected}
            >
              <span
                className={
                  "shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full border-2 " +
                  (selected
                    ? "border-brand-500 bg-brand-500"
                    : "border-slate-300 bg-white")
                }
                aria-hidden
              >
                {selected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>
              <span className="flex-1">{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-4 pr-10 text-[14px] text-slate-900 rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all appearance-none"
      >
        <option value="">Selecione uma opção</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ArrowRight
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 rotate-90"
        strokeWidth={2}
      />
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
    <div className="space-y-2.5">
      {urls.length > 0 && (
        <div className="space-y-1.5">
          {urls.map((u, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
              </div>
              <span className="text-[13px] font-medium text-emerald-900 truncate flex-1">
                Arquivo enviado {urls.length > 1 ? `· ${i + 1}` : ""}
              </span>
              {!multiple && (
                <button
                  type="button"
                  onClick={onClear}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white transition-colors"
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
        <label
          className={
            "flex flex-col sm:flex-row items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-150 " +
            (uploading
              ? "border-brand-300 bg-brand-50/40"
              : "border-slate-300 bg-slate-50/40 hover:border-brand-400 hover:bg-brand-50/40")
          }
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              <span className="text-[13px] font-medium text-brand-600">
                Enviando…
              </span>
            </>
          ) : (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200">
                <Upload className="h-4 w-4 text-slate-500" strokeWidth={2} />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[13px] font-semibold text-slate-700">
                  {urls.length > 0
                    ? "Adicionar mais um arquivo"
                    : "Clique pra fazer upload"}
                </p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  PNG, JPG, SVG, PDF — até 25 MB
                </p>
              </div>
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
      <div className="min-h-screen bg-white">
        <SimpleHeader onBack={onBack} eyebrow="Etapa final · gerando briefing" />
        <div className="max-w-[680px] mx-auto px-5 sm:px-8 py-10 sm:py-16">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-brand-50/40 to-white p-8 sm:p-10 text-center">
            <div className="relative mx-auto w-16 h-16 mb-5">
              <div
                className="absolute inset-0 rounded-2xl animate-ping opacity-70"
                style={{ background: "#4E62D8" }}
              />
              <div
                className="relative flex items-center justify-center h-16 w-16 rounded-2xl text-white shadow-lg"
                style={{
                  background:
                    "linear-gradient(135deg, #4E62D8 0%, #2137B6 100%)",
                }}
              >
                <Sparkles className="h-7 w-7" strokeWidth={2} />
              </div>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-slate-900 mb-2">
              Estamos montando seu briefing
            </h1>
            <p className="text-[14px] text-slate-600 leading-relaxed max-w-md mx-auto">
              A IA está estruturando suas respostas. Costuma levar entre 30
              segundos e 2 minutos. Esta página atualiza sozinha.
            </p>
            {error && (
              <p className="mt-5 text-[12.5px] text-rose-600">{error}</p>
            )}
          </div>
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse"
              >
                <div className="h-3 w-32 bg-slate-100 rounded mb-2.5" />
                <div className="h-3 w-full bg-slate-100 rounded" />
                <div className="h-3 w-3/4 bg-slate-100 rounded mt-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const b = editable ?? briefing

  return (
    <div className="min-h-screen bg-white">
      <SimpleHeader onBack={onBack} eyebrow="Etapa final · revise e confirme" />
      <div className="max-w-[680px] mx-auto px-5 sm:px-8 py-8 sm:py-12 space-y-4">
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-500">
              Briefing gerado por IA
            </span>
          </div>
          <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-tight text-slate-900 leading-[1.15]">
            Revise e confirme
          </h1>
          <p className="text-[14px] sm:text-[15px] text-slate-500 mt-2 max-w-[58ch]">
            Dá uma olhada no que a IA montou a partir das suas respostas. Edite
            qualquer campo se quiser ajustar. Quando confirmar, sua loja avança
            pra fase de design.
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
          className="w-full inline-flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[14.5px] font-semibold disabled:opacity-50 shadow-[0_2px_8px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_14px_rgba(16,185,129,0.35)] transition-all"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting
            ? "Confirmando..."
            : "Confirmar e finalizar onboarding"}
          {!submitting && <CheckCircle2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── SimpleHeader: header minimalista pra briefing/next-steps ─────────────

function SimpleHeader({
  onBack,
  eyebrow,
}: {
  onBack?: () => void
  eyebrow?: string
}) {
  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1024px] mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
        <Image
          src="/images/logo da convertfy com escrito preto.png"
          alt="Convertfy"
          width={150}
          height={28}
          priority
          className="object-contain"
          style={{ height: 26, width: "auto" }}
        />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-[12.5px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
        )}
      </div>
      {eyebrow && (
        <div className="max-w-[1024px] mx-auto px-5 sm:px-8 pb-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-500">
            {eyebrow}
          </span>
        </div>
      )}
    </header>
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 transition-colors">
      <label className="block">
        <p className="text-[13px] font-semibold text-slate-900 mb-2">{label}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          className="w-full px-4 py-3 text-[14px] text-slate-900 rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all resize-none"
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1.5">
        {label}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3.5 text-[13.5px] text-slate-900 rounded-lg border border-slate-200 bg-white hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
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
    <div className="min-h-screen bg-white">
      <SimpleHeader />

      <div className="max-w-[680px] mx-auto px-5 sm:px-8 py-10 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="relative inline-flex mb-5">
            <div
              className="absolute inset-0 rounded-3xl opacity-30 blur-xl"
              style={{ background: "#10B981" }}
            />
            <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg">
              <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.4} />
            </div>
          </div>
          <h1 className="text-[28px] sm:text-[36px] font-semibold tracking-tight text-slate-900 leading-[1.1]">
            Recebido!
          </h1>
          <p className="text-[15px] sm:text-[16px] text-slate-600 mt-3 max-w-md mx-auto leading-relaxed">
            Suas respostas e o briefing da{" "}
            <strong className="text-slate-900">{storeName}</strong> chegaram pra
            equipe. Em <strong className="text-slate-900">3-7 dias úteis</strong>{" "}
            sua estrutura tá no ar.
          </p>
        </div>

        {/* Timeline */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-500 mb-5">
            O que acontece agora
          </p>
          <ol className="space-y-4 relative">
            {/* Vertical connecting line */}
            <div
              className="absolute left-[13px] top-3 bottom-3 w-px bg-slate-200"
              aria-hidden
            />
            {NEXT_STEPS.map((s) => (
              <li key={s.n} className="flex items-start gap-3.5 relative">
                <div
                  className={
                    "relative z-10 flex h-7 w-7 items-center justify-center rounded-full shrink-0 text-[12px] font-semibold tabular-nums shadow-sm " +
                    (s.done
                      ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                      : "bg-white border-2 border-slate-200 text-slate-500")
                  }
                >
                  {s.done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    s.n
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p
                    className={
                      "text-[14px] font-semibold leading-snug " +
                      (s.done
                        ? "text-emerald-700"
                        : "text-slate-900")
                    }
                  >
                    {s.name}
                  </p>
                  <p className="text-[12.5px] text-slate-500 mt-0.5 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* WhatsApp banner */}
        <div className="mt-5 rounded-2xl border border-brand-200/70 bg-gradient-to-br from-brand-50/60 via-white to-white p-5 flex items-start gap-3.5">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
            style={{
              background:
                "linear-gradient(135deg, #4E62D8 0%, #2137B6 100%)",
            }}
          >
            <Mail className="h-5 w-5 text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-slate-900">
              Acompanhe pelo WhatsApp
            </p>
            <p className="text-[13px] text-slate-600 mt-1 leading-relaxed">
              Vamos te adicionar num grupo com o time pra você acompanhar tudo
              em tempo real. Qualquer dúvida, é só falar lá.
            </p>
          </div>
        </div>

        <p className="text-[12px] text-center text-slate-400 mt-10">
          Convertfy · Agência especialista em e-mail marketing pra e-commerce
        </p>
      </div>
    </div>
  )
}
