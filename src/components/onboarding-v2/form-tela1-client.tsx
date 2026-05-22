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

import { useEffect, useRef, useState } from "react"
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
  Pencil,
  Type,
  Image as ImageIcon,
  MessageSquare,
  Zap,
  Megaphone,
  FileText,
  ChevronLeft,
  ChevronRight,
  Package,
  TrendingUp,
  ShieldAlert,
  Calendar,
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

  async function saveCurrentResponses(completedSectionSlug?: string) {
    await fetch(`/api/forms/${token}/submit-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responses: values,
        // Slug da secao que o cliente acabou de finalizar — backend usa pra
        // marcar items AUTO·CLIENTE do checklist da Etapa 02.
        ...(completedSectionSlug ? { completed_section_slug: completedSectionSlug } : {}),
      }),
    })
  }

  // Autosave debounced — salva o draft 1.5s apos a ultima alteracao em
  // `values`. Sem completedSectionSlug (so persiste responses, nao avanca
  // checklist). Evita perda de dados se cliente recarrega na metade de uma
  // secao (especialmente Materiais, ultima secao, onde uploads podem
  // demorar).
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved"
  >("idle")
  useEffect(() => {
    // Skip antes do primeiro load (ctx null) ou apos enviar
    if (!ctx || submitted || loading) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      setAutosaveStatus("saving")
      fetch(`/api/forms/${token}/submit-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: values }),
      })
        .then(() => {
          setAutosaveStatus("saved")
          // Volta pra idle apos 2s pra nao ficar permanente na UI
          setTimeout(() => setAutosaveStatus("idle"), 2000)
        })
        .catch(() => {
          // Silencioso — proximo "Proximo" tenta de novo
          setAutosaveStatus("idle")
        })
    }, 1500)
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, ctx, submitted, loading, token])

  async function next() {
    const err = validateCurrentSection()
    if (err) {
      setError(err)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setError(null)

    const finishingSlug = isReviewStep ? undefined : SECTIONS[stepIdx]?.id

    if (stepIdx === SECTIONS.length - 1) {
      setSubmitting(true)
      try {
        await saveCurrentResponses(finishingSlug)
        setStepIdx(SECTIONS.length)
      } finally {
        setSubmitting(false)
      }
      return
    }

    void saveCurrentResponses(finishingSlug)
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
      fd.append("field_key", qKey)
      // Endpoint publico — sem requireAuth, valida via form_token na URL.
      // O /api/upload/onboarding antigo exigia auth e quebrava o cliente
      // externo (resposta 401 "Nao autorizado" durante o preenchimento).
      const res = await fetch(`/api/forms/${token}/upload`, {
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
        autosaveStatus={autosaveStatus}
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
  autosaveStatus,
  children,
}: {
  progress: number
  stepIdx: number
  totalSteps: number
  sections: SidebarSection[]
  onSelectStep: (i: number) => void
  autosaveStatus: "idle" | "saving" | "saved"
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
            <div className="flex items-center gap-2">
              <AutosaveBadge status={autosaveStatus} />
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                {stepIdx + 1}/{totalSteps}
              </span>
            </div>
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
        <div className="hidden lg:block relative">
          <div className="h-[3px] bg-slate-100">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #4E62D8 0%, #2137B6 100%)",
              }}
            />
          </div>
          {/* Autosave badge fixo no canto superior direito (desktop) */}
          <div className="absolute top-3 right-6">
            <AutosaveBadge status={autosaveStatus} />
          </div>
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

const BRIEFING_GRADIENT = "linear-gradient(90deg, #4E62D8, #2137B6, #041366)"

interface TopProduct {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  image_url: string | null
  external_id: string | null
}

interface AdsReview {
  score: number
  summary: string | null
  sub_scores: Record<string, number> | null
  strengths: Array<{ what: string; body: string }> | null
  opportunities: Array<{ what: string; body: string }> | null
  risks: Array<{ what: string; body: string }> | null
  reviewed_at: string | null
}

interface StoreContext {
  top_products: TopProduct[] | null
  ads_review: AdsReview | null
}

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

  // Edição inline: campo ativo + valor draft + atalhos
  const [activeField, setActiveField] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState<string>("")
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set())

  // Save bar (toast com contagem de alterações)
  const [savedCount, setSavedCount] = useState(0)
  const [saveBarVisible, setSaveBarVisible] = useState(false)

  // Modal de confirmação final
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Contexto adicional da loja (BLOCO 02 Top produtos + BLOCO 03 Ads).
  // Não entra no prompt da IA — só renderiza na página se existir.
  const [storeContext, setStoreContext] = useState<StoreContext | null>(null)

  // Detecção de geração travada (>60s sem resposta)
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // Track do generated_at da última versão renderizada. Quando muda,
  // detectamos que o briefing foi regenerado (cliente voltou e alterou
  // respostas) e refrescamos editable + resetamos edições stale.
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null)
  // Budget server-side: T1 40s + T2 20s + T3 ~0s = 60s.
  // Cliente espera 75s (buffer pra rede / 1 ciclo de poll).
  const POLL_TIMEOUT_MS = 75_000
  const POLL_INTERVAL_MS = 2_000

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
          const incomingGeneratedAt: string | null = j.generated_at ?? null
          // Briefing novo? (primeira vez OU regenerado com generated_at diferente)
          const isNewBriefing =
            !editable ||
            (incomingGeneratedAt !== null &&
              incomingGeneratedAt !== lastGeneratedAt)
          if (isNewBriefing) {
            setEditable(j.briefing)
            setClientAdditions(j.briefing.client_additions ?? "")
            setEditedFields(new Set())
            setLastGeneratedAt(incomingGeneratedAt)
          }
        }
        if (j.confirmed) {
          onConfirmed()
          return
        }
        const isWaiting = [
          "generating",
          "form_partially_filled",
          "not_started",
        ].includes(j.status)
        if (isWaiting) {
          // Marca início da espera na primeira iteração desse status
          if (pollStartedAt === null) {
            setPollStartedAt(Date.now())
          } else if (Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
            // Passou de 60s — provavelmente travou. Para o polling
            // e mostra UI de retry.
            setTimedOut(true)
            return
          }
          timer = setTimeout(poll, POLL_INTERVAL_MS)
        } else {
          // Status saiu da espera (generated_pending_review/approved)
          if (pollStartedAt !== null) setPollStartedAt(null)
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
  }, [token, editable, onConfirmed, pollStartedAt, lastGeneratedAt])

  async function handleRetry() {
    setRetrying(true)
    setTimedOut(false)
    setError(null)
    setPollStartedAt(Date.now())
    try {
      const res = await fetch(`/api/forms/${token}/retry-briefing`, {
        method: "POST",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? "Falha ao tentar novamente")
        setTimedOut(true)
        return
      }
      setStatus("generating")
    } finally {
      setRetrying(false)
    }
  }

  // ── Helpers de edição ──────────────────────────────────────────────────
  function startEdit(fieldId: string, currentValue: string) {
    setActiveField(fieldId)
    setDraftValue(currentValue ?? "")
  }
  function cancelEdit() {
    setActiveField(null)
    setDraftValue("")
  }
  function commitEdit() {
    if (!activeField || !editable) return
    const trimmed = draftValue.trim()
    if (!trimmed) {
      cancelEdit()
      return
    }
    setEditable((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      switch (activeField) {
        case "about_brand":
          next.about_brand = trimmed
          break
        case "audience":
          next.audience = trimmed
          break
        case "language_tone":
          next.language_tone = trimmed
          break
        case "offers_and_differentials":
          next.offers_and_differentials = trimmed
          break
        case "visual_palette":
          next.visual_identity = { ...next.visual_identity, palette: trimmed }
          break
        case "visual_fonts":
          next.visual_identity = { ...next.visual_identity, fonts: trimmed }
          break
        case "visual_references":
          next.visual_identity = {
            ...next.visual_identity,
            references: trimmed,
          }
          break
      }
      return next
    })
    setEditedFields((prev) => new Set(prev).add(activeField))
    setSavedCount((c) => c + 1)
    setSaveBarVisible(true)
    setActiveField(null)
    setDraftValue("")
  }

  // Esconde save bar 3.5s após última edição
  useEffect(() => {
    if (!saveBarVisible) return
    const t = setTimeout(() => setSaveBarVisible(false), 3500)
    return () => clearTimeout(t)
  }, [savedCount, saveBarVisible])

  // Busca contexto da loja (top produtos + análise de ads) com polling.
  // Se faltar ads OU catálogo no primeiro fetch, dispara o workflow n8n
  // "Analisador de ADS" — n8n processa async e popula os dados via
  // /api/webhooks/n8n/ads-analyzer/*. Polling continua até ter ambos OU
  // timeout (3min). Falha silenciosa: blocos somem se nada chegar.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let triggered = false
    const STORE_CTX_POLL_MS = 5_000
    const STORE_CTX_TIMEOUT_MS = 180_000
    const startedAt = Date.now()

    async function pollStoreContext() {
      try {
        const res = await fetch(`/api/forms/${token}/store-context`)
        if (cancelled) return
        const data = res.ok ? await res.json() : null
        if (cancelled || !data) return

        if (data.has_top_products || data.has_ads_review) {
          setStoreContext({
            top_products: data.has_top_products ? data.top_products : null,
            ads_review: data.has_ads_review ? data.ads_review : null,
          })
        }

        // Dispara o trigger apenas uma vez, no primeiro fetch que detectar
        // dados faltantes. n8n é idempotente — sobrescreve dados anteriores.
        if (!triggered && (!data.has_ads_review || !data.has_top_products)) {
          triggered = true
          fetch(`/api/forms/${token}/trigger-ads-analyzer`, {
            method: "POST",
          }).catch(() => {
            /* silencioso — polling continua mesmo se trigger falhar */
          })
        }

        const complete = data.has_ads_review && data.has_top_products
        const expired = Date.now() - startedAt > STORE_CTX_TIMEOUT_MS
        if (!complete && !expired) {
          timer = setTimeout(pollStoreContext, STORE_CTX_POLL_MS)
        }
      } catch {
        /* silencioso — esconde blocos se falhar */
      }
    }

    void pollStoreContext()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [token])

  // Modal: lock scroll do body + Esc fecha
  useEffect(() => {
    if (!showConfirmModal) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowConfirmModal(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [showConfirmModal])

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
        <SimpleHeader
          onBack={onBack}
          eyebrow={
            timedOut ? "Etapa final · demorou demais" : "Etapa final · gerando briefing"
          }
        />
        <div className="max-w-[680px] mx-auto px-5 sm:px-8 py-10 sm:py-16">
          <div
            className={
              "rounded-2xl border p-8 sm:p-10 text-center " +
              (timedOut
                ? "border-amber-200 bg-gradient-to-b from-amber-50/60 to-white"
                : "border-slate-200 bg-gradient-to-b from-brand-50/40 to-white")
            }
          >
            <div className="relative mx-auto w-16 h-16 mb-5">
              {!timedOut && (
                <div
                  className="absolute inset-0 rounded-2xl animate-ping opacity-70"
                  style={{ background: "#4E62D8" }}
                />
              )}
              <div
                className="relative flex items-center justify-center h-16 w-16 rounded-2xl text-white shadow-lg"
                style={{
                  background: timedOut
                    ? "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)"
                    : "linear-gradient(135deg, #4E62D8 0%, #2137B6 100%)",
                }}
              >
                {timedOut ? (
                  <AlertTriangle className="h-7 w-7" strokeWidth={2} />
                ) : (
                  <Sparkles className="h-7 w-7" strokeWidth={2} />
                )}
              </div>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-slate-900 mb-2">
              {timedOut
                ? "A IA demorou mais que o esperado"
                : "Estamos montando seu briefing"}
            </h1>
            <p className="text-[14px] text-slate-600 leading-relaxed max-w-md mx-auto">
              {timedOut
                ? "Algo travou na geração. Clique em tentar novamente — costuma resolver na segunda tentativa."
                : "A IA está estruturando suas respostas. Costuma levar entre 5 e 30 segundos. Esta página atualiza sozinha."}
            </p>
            {error && (
              <p className="mt-5 text-[12.5px] text-rose-600">{error}</p>
            )}
            {timedOut && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-xl text-white text-[14px] font-semibold disabled:opacity-60 transition-all hover:-translate-y-0.5"
                style={{
                  background: BRIEFING_GRADIENT,
                  backgroundSize: "200% 100%",
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.8), 0 4px 12px -4px rgba(33,55,182,0.4)",
                }}
              >
                {retrying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" strokeWidth={2.4} />
                )}
                {retrying ? "Reiniciando..." : "Tentar novamente"}
              </button>
            )}
          </div>
          {!timedOut && (
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
          )}
        </div>
      </div>
    )
  }

  const b = editable ?? briefing

  return (
    <div className="min-h-screen relative bg-white overflow-x-hidden">
      {/* Atmosfera: aurora suave + dot pattern com mask radial */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div
          className="absolute -inset-[20%]"
          style={{
            background:
              "radial-gradient(50% 40% at 25% 15%, rgba(78,98,216,0.10) 0%, transparent 60%), radial-gradient(45% 40% at 80% 25%, rgba(33,55,182,0.07) 0%, transparent 65%), radial-gradient(70% 60% at 50% 95%, rgba(199,205,239,0.30) 0%, transparent 55%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(78,98,216,0.10) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            WebkitMaskImage:
              "radial-gradient(ellipse 55% 45% at 50% 25%, black 30%, transparent 70%)",
            maskImage:
              "radial-gradient(ellipse 55% 45% at 50% 25%, black 30%, transparent 70%)",
          }}
        />
      </div>

      <SimpleHeader onBack={onBack} eyebrow="Etapa final · revise e confirme" />

      <div className="relative z-10 max-w-[920px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-32">
        {/* Mini hero */}
        <div className="text-center mb-10 sm:mb-12">
          <span
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border bg-white/60 backdrop-blur-sm text-[10.5px] font-semibold uppercase tracking-[0.06em] mb-5"
            style={{ borderColor: "#C7CDEF" }}
          >
            <Sparkles
              className="h-3 w-3 text-brand-500"
              strokeWidth={2.4}
            />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #4E62D8, #041366, #2137B6, #4E62D8)",
                backgroundSize: "200% auto",
              }}
            >
              AI · Briefing
            </span>
          </span>
          <h1 className="text-[32px] sm:text-[44px] font-bold tracking-tight text-slate-900 leading-[1.05] mb-3">
            Revise e{" "}
            <em
              className="not-italic bg-clip-text text-transparent"
              style={{ backgroundImage: BRIEFING_GRADIENT }}
            >
              confirme
            </em>
          </h1>
          <p className="text-[15px] sm:text-[16px] text-slate-500 leading-relaxed max-w-[560px] mx-auto">
            Dá uma olhada no que a IA montou a partir das suas respostas. Clique
            em qualquer campo pra editar.
          </p>
        </div>

        {/* Card principal — briefing */}
        <div
          className="relative bg-white rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(0,0,0,0.08)" }}
        >
          {/* highlight superior */}
          <div
            className="absolute top-0 left-6 right-6 h-px opacity-50 z-[3]"
            style={{
              background:
                "linear-gradient(90deg, transparent, #A8B2EE, transparent)",
            }}
          />

          {/* Header do bloco */}
          <div
            className="relative px-6 sm:px-9 pt-9 pb-6 text-center"
            style={{
              background:
                "linear-gradient(180deg, #FCFCFD 0%, transparent 100%)",
            }}
          >
            <div className="inline-flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-500 mb-3.5">
              <span className="font-mono text-slate-400 text-[11px]">
                01 · BRIEFING
              </span>
              <span>Identidade da marca</span>
            </div>
            <h2 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-slate-900 leading-[1.15] mb-2">
              O que conhecemos sobre a sua marca
            </h2>
            <p className="text-[13.5px] text-slate-500 leading-relaxed max-w-[560px] mx-auto">
              Resumo narrativo construído a partir do questionário. Clique em
              qualquer campo pra editar.
            </p>
            <div
              className="absolute left-9 right-9 bottom-0 h-px opacity-60"
              style={{
                background:
                  "linear-gradient(90deg, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)",
              }}
            />
          </div>

          {/* Body com fields */}
          <div className="px-6 sm:px-9 py-6">
            <EditableField
              fieldId="about_brand"
              label="Sobre a marca"
              value={b.about_brand}
              edited={editedFields.has("about_brand")}
              isActive={activeField === "about_brand"}
              draft={draftValue}
              onDraftChange={setDraftValue}
              onStart={startEdit}
              onSave={commitEdit}
              onCancel={cancelEdit}
            />
            <EditableField
              fieldId="audience"
              label="Público / Audiência"
              value={b.audience}
              edited={editedFields.has("audience")}
              isActive={activeField === "audience"}
              draft={draftValue}
              onDraftChange={setDraftValue}
              onStart={startEdit}
              onSave={commitEdit}
              onCancel={cancelEdit}
            />
            <EditableField
              fieldId="language_tone"
              label="Tom e linguagem"
              value={b.language_tone}
              edited={editedFields.has("language_tone")}
              isActive={activeField === "language_tone"}
              draft={draftValue}
              onDraftChange={setDraftValue}
              onStart={startEdit}
              onSave={commitEdit}
              onCancel={cancelEdit}
            />

            {/* Identidade visual com 3 sub-campos */}
            <div className="relative p-4 sm:p-[18px] rounded-[10px] mt-1.5">
              <div className="flex items-center justify-between mb-2 min-h-[22px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                  Identidade visual
                </span>
              </div>
              <div
                className="grid sm:grid-cols-3 gap-px rounded-lg overflow-hidden"
                style={{ background: "#E5E7EB", border: "1px solid rgba(0,0,0,0.08)" }}
              >
                <SubFieldEditable
                  fieldId="visual_palette"
                  label="Paleta"
                  icon={Palette}
                  value={b.visual_identity?.palette ?? ""}
                  edited={editedFields.has("visual_palette")}
                  isActive={activeField === "visual_palette"}
                  draft={draftValue}
                  onDraftChange={setDraftValue}
                  onStart={startEdit}
                  onSave={commitEdit}
                  onCancel={cancelEdit}
                />
                <SubFieldEditable
                  fieldId="visual_fonts"
                  label="Fontes"
                  icon={Type}
                  value={b.visual_identity?.fonts ?? ""}
                  edited={editedFields.has("visual_fonts")}
                  isActive={activeField === "visual_fonts"}
                  draft={draftValue}
                  onDraftChange={setDraftValue}
                  onStart={startEdit}
                  onSave={commitEdit}
                  onCancel={cancelEdit}
                />
                <SubFieldEditable
                  fieldId="visual_references"
                  label="Referências"
                  icon={ImageIcon}
                  value={b.visual_identity?.references ?? ""}
                  edited={editedFields.has("visual_references")}
                  isActive={activeField === "visual_references"}
                  draft={draftValue}
                  onDraftChange={setDraftValue}
                  onStart={startEdit}
                  onSave={commitEdit}
                  onCancel={cancelEdit}
                />
              </div>
            </div>

            <EditableField
              fieldId="offers_and_differentials"
              label="Ofertas e diferenciais"
              value={b.offers_and_differentials}
              edited={editedFields.has("offers_and_differentials")}
              isActive={activeField === "offers_and_differentials"}
              draft={draftValue}
              onDraftChange={setDraftValue}
              onStart={startEdit}
              onSave={commitEdit}
              onCancel={cancelEdit}
            />
          </div>
        </div>

        {/* BLOCO 02 — Top produtos (esconde se loja não tem dados) */}
        {storeContext?.top_products && storeContext.top_products.length > 0 && (
          <TopProductsBlock products={storeContext.top_products} />
        )}

        {/* BLOCO 03 — Análise de ads (esconde se loja não tem dados) */}
        {storeContext?.ads_review && (
          <AdsReviewBlock review={storeContext.ads_review} />
        )}

        {/* Free input */}
        <div
          className="mt-5 p-6 sm:p-7 rounded-2xl bg-white"
          style={{ border: "1px solid rgba(0,0,0,0.08)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-slate-900">
              <MessageSquare
                className="h-3.5 w-3.5 text-brand-500"
                strokeWidth={2.2}
              />
              Algo que faltou ou que você quer destacar?
            </span>
            <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              Opcional
            </span>
          </div>
          <textarea
            value={clientAdditions}
            onChange={(e) => setClientAdditions(e.target.value)}
            placeholder="Esse texto vai junto pra equipe — qualquer informação extra ajuda a personalizar ainda mais."
            className="w-full min-h-[72px] px-3.5 py-3 text-[14px] leading-relaxed text-slate-900 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/10 transition-all placeholder:text-slate-400 resize-y"
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-[12.5px] text-rose-700">
            {error}
          </div>
        )}

        {/* CTA */}
        <div className="mt-7">
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={submitting}
            className="group relative w-full h-[60px] rounded-[14px] text-white text-[16px] font-semibold tracking-[-0.01em] inline-flex items-center justify-center gap-2.5 overflow-hidden disabled:opacity-60 transition-all duration-[400ms] hover:-translate-y-0.5"
            style={{
              background: BRIEFING_GRADIENT,
              backgroundSize: "200% 100%",
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.8), 0 6px 20px -6px rgba(33,55,182,0.4)",
            }}
          >
            {/* shine effect ao hover */}
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"
              style={{
                background:
                  "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)",
              }}
            />
            {submitting && (
              <Loader2 className="h-5 w-5 animate-spin relative z-10" />
            )}
            <span className="relative z-10">
              {submitting ? "Confirmando..." : "Confirmar e finalizar onboarding"}
            </span>
            {!submitting && (
              <ArrowRight className="h-5 w-5 relative z-10" strokeWidth={2.5} />
            )}
          </button>
          <div className="mt-3.5 text-center text-[12px] text-slate-500 inline-flex items-center justify-center gap-1.5 w-full">
            <CheckCircle2
              className="h-3 w-3 text-emerald-500"
              strokeWidth={2.5}
            />
            Sua loja entra na fila de design em até 1 hora após confirmação.
          </div>
        </div>
      </div>

      {/* Save bar fixa no rodapé */}
      <div
        className={
          "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-200 ease-out " +
          (saveBarVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-[120px] opacity-0 pointer-events-none")
        }
      >
        <div className="flex items-center gap-3.5 pl-4 pr-2 py-2 bg-slate-900 text-white rounded-full shadow-[0_12px_24px_rgba(0,0,0,0.18)]">
          <Check
            className="h-4 w-4 text-emerald-300"
            strokeWidth={2.6}
          />
          <span className="text-[13px] font-medium">
            <span className="font-mono font-semibold text-brand-300">
              {savedCount}
            </span>{" "}
            {savedCount === 1 ? "alteração salva" : "alterações salvas"}
          </span>
          <button
            type="button"
            onClick={() => setSaveBarVisible(false)}
            className="h-8 px-3.5 text-[13px] font-semibold rounded-full bg-white text-slate-900 hover:bg-slate-100 transition-colors"
          >
            OK
          </button>
        </div>
      </div>

      {/* Modal de confirmação final */}
      <ConfirmBriefingModal
        open={showConfirmModal}
        submitting={submitting}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          setShowConfirmModal(false)
          void confirm()
        }}
      />
    </div>
  )
}

// ─── Modal de confirmação do briefing ─────────────────────────────────────

function ConfirmBriefingModal({
  open,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [open])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
      aria-hidden={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={
        "fixed inset-0 z-[100] flex items-center justify-center p-6 transition-opacity duration-200 ease-out " +
        (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
      }
      style={{
        background: "rgba(17, 24, 39, 0.45)",
        backdropFilter: "blur(8px) saturate(120%)",
        WebkitBackdropFilter: "blur(8px) saturate(120%)",
      }}
    >
      <div
        className={
          "relative w-full max-w-[440px] bg-white rounded-2xl overflow-hidden transition-all duration-300 ease-out " +
          (open ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-3")
        }
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.8), 0 1px 3px rgba(0,0,0,0.04), 0 24px 48px -12px rgba(0,0,0,0.18)",
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors z-[2]"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        {/* Hero icon com anéis decorativos */}
        <div className="px-8 pt-8 flex justify-center">
          <div
            className="relative w-14 h-14 rounded-[14px] flex items-center justify-center"
            style={{
              background:
                "linear-gradient(180deg, #EEF0FB 0%, #FFFFFF 100%)",
              border: "1px solid #C7CDEF",
              boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.8)",
            }}
          >
            <span
              className="absolute -inset-1.5 rounded-[18px] pointer-events-none"
              style={{ border: "1px solid #C7CDEF", opacity: 0.5 }}
              aria-hidden
            />
            <span
              className="absolute -inset-3 rounded-[22px] pointer-events-none"
              style={{ border: "1px solid #C7CDEF", opacity: 0.25 }}
              aria-hidden
            />
            <FileText
              className="h-6 w-6 text-brand-500 relative z-[1]"
              strokeWidth={2}
            />
          </div>
        </div>

        {/* Head */}
        <div className="px-8 pt-5 text-center">
          <h2
            id="confirm-modal-title"
            className="text-[18px] font-bold tracking-tight text-slate-900 mb-2 leading-[1.3]"
          >
            Confirmar briefing?
          </h2>
          <p
            id="confirm-modal-desc"
            className="text-[14px] leading-relaxed text-slate-600 max-w-[340px] mx-auto"
          >
            Esse briefing será usado como base tanto para os{" "}
            <b className="text-slate-900">flows</b> quanto para as{" "}
            <b className="text-slate-900">campanhas</b> da sua loja.
          </p>
        </div>

        {/* Uses */}
        <div
          className="mx-6 mt-6 p-1.5 rounded-xl flex flex-col gap-0.5"
          style={{ background: "#F8FAFC", border: "1px solid rgba(0,0,0,0.08)" }}
        >
          <UseRow
            icon={Zap}
            title="Flows automatizados"
            desc="Boas-vindas, carrinho abandonado, pós-compra"
          />
          <UseRow
            icon={Megaphone}
            title="Campanhas de email"
            desc="Promocionais, sazonais, lançamentos"
          />
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 p-6 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-[42px] rounded-[10px] bg-white text-slate-700 text-[14px] font-semibold border border-slate-200 hover:bg-slate-50 hover:border-slate-300 active:translate-y-px transition-all"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.8)" }}
          >
            Voltar e revisar
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="group relative flex-1 h-[42px] rounded-[10px] text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 overflow-hidden disabled:opacity-60 hover:-translate-y-0.5 transition-all duration-200"
            style={{
              background: BRIEFING_GRADIENT,
              backgroundSize: "200% 100%",
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.8), 0 4px 12px -4px rgba(33,55,182,0.4)",
            }}
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[600ms]"
              style={{
                background:
                  "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)",
              }}
            />
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" />
            ) : (
              <span className="relative z-10">Sim, confirmar</span>
            )}
            {!submitting && (
              <Check
                className="h-3.5 w-3.5 relative z-10"
                strokeWidth={2.5}
              />
            )}
          </button>
        </div>
      </div>

    </div>
  )
}

function UseRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  desc: string
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 bg-white rounded-lg transition-colors hover:border-slate-300"
      style={{ border: "1px solid rgba(0,0,0,0.08)" }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-brand-500"
        style={{ background: "#EEF0FB", border: "1px solid #C7CDEF" }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-900 leading-tight mb-0.5">
          {title}
        </p>
        <p className="text-[11px] text-slate-500 leading-snug">{desc}</p>
      </div>
      <div
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: "#ECFDF5",
          border: "1px solid #A7F3D0",
          color: "#059669",
        }}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </div>
    </div>
  )
}

// ─── EditableField: campo de briefing com clique-pra-editar ───────────────

function EditableField({
  fieldId,
  label,
  value,
  edited,
  isActive,
  draft,
  onDraftChange,
  onStart,
  onSave,
  onCancel,
}: {
  fieldId: string
  label: string
  value: string
  edited: boolean
  isActive: boolean
  draft: string
  onDraftChange: (v: string) => void
  onStart: (id: string, currentValue: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  if (isActive) {
    return (
      <article
        className="relative p-4 sm:p-[18px] rounded-[10px] bg-white mt-1.5 first:mt-0"
        style={{ boxShadow: "0 0 0 2px #4E62D8" }}
      >
        <div className="flex items-center justify-between mb-2 min-h-[22px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-700 inline-flex items-center gap-2">
            {label}
            {edited && <EditedBadge />}
          </span>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              onCancel()
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              onSave()
            }
          }}
          className="w-full min-h-[80px] px-3.5 py-3 rounded-lg text-[14px] leading-relaxed text-slate-900 bg-slate-50 border border-brand-200 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/10 transition-all resize-y"
        />
        <div className="flex justify-end items-center gap-2 mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            Cancelar
            <kbd className="font-mono text-[10px] font-medium px-1 py-0.5 border border-slate-200 rounded text-slate-500 bg-white">
              Esc
            </kbd>
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[13px] font-medium text-white bg-brand-500 hover:bg-brand-600 transition-colors"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.8)" }}
          >
            Salvar alterações
            <kbd className="font-mono text-[10px] font-medium px-1 py-0.5 border border-white/20 rounded text-white/75 bg-white/10">
              ⌘↵
            </kbd>
          </button>
        </div>
      </article>
    )
  }
  return (
    <article
      onClick={() => onStart(fieldId, value)}
      className="group relative p-4 sm:p-[18px] rounded-[10px] mt-1.5 first:mt-0 cursor-text hover:bg-slate-50 transition-colors"
      style={{ boxShadow: "inset 0 0 0 1px transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "inset 0 0 0 1px rgba(0,0,0,0.08)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "inset 0 0 0 1px transparent"
      }}
    >
      <div className="flex items-center justify-between mb-2 min-h-[22px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 inline-flex items-center gap-2 group-[.is-edited]:text-slate-700">
          {label}
          {edited && <EditedBadge />}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStart(fieldId, value)
          }}
          className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
        >
          <Pencil className="h-2.5 w-2.5" strokeWidth={2} />
          Editar
        </button>
      </div>
      <div className="text-[14px] leading-[1.65] text-slate-700 whitespace-pre-wrap">
        {value}
      </div>
    </article>
  )
}

function SubFieldEditable({
  fieldId,
  label,
  icon: Icon,
  value,
  edited,
  isActive,
  draft,
  onDraftChange,
  onStart,
  onSave,
  onCancel,
}: {
  fieldId: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  value: string
  edited: boolean
  isActive: boolean
  draft: string
  onDraftChange: (v: string) => void
  onStart: (id: string, currentValue: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  if (isActive) {
    return (
      <div className="bg-white p-3.5 sm:p-4">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-1.5">
          <Icon className="h-2.5 w-2.5 text-brand-400" strokeWidth={2} />
          {label}
          {edited && <EditedBadge />}
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={() => onSave()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              onCancel()
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              onSave()
            }
          }}
          rows={3}
          className="w-full min-h-[60px] px-3 py-2 rounded-lg text-[13px] leading-relaxed text-slate-900 bg-slate-50 border border-brand-200 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/10 transition-all resize-y"
        />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onStart(fieldId, value)}
      className="text-left w-full bg-white p-3.5 sm:p-4 cursor-text hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-1">
        <Icon className="h-2.5 w-2.5 text-brand-400" strokeWidth={2} />
        {label}
        {edited && <EditedBadge />}
      </div>
      <div className="text-[13px] leading-[1.55] text-slate-700 whitespace-pre-wrap">
        {value || (
          <span className="text-slate-400 italic">Clique pra preencher</span>
        )}
      </div>
    </button>
  )
}

function EditedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-md text-[10px] font-semibold text-brand-700 border"
      style={{
        background: "#EEF0FB",
        borderColor: "#C7CDEF",
        letterSpacing: 0,
        textTransform: "none",
      }}
    >
      <Check className="h-2 w-2" strokeWidth={3} />
      Editado
    </span>
  )
}

// ─── AutosaveBadge: feedback visual sutil do autosave ───────────────────
// 'idle' = nada / 'saving' = spinner verde / 'saved' = check verde
function AutosaveBadge({
  status,
}: {
  status: "idle" | "saving" | "saved"
}) {
  if (status === "idle") return null
  return (
    <span
      className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-md text-[10px] font-medium"
      style={{
        background: "#ECFDF5",
        color: "#065F46",
        border: "1px solid #A7F3D0",
        letterSpacing: 0,
        textTransform: "none",
      }}
      aria-live="polite"
    >
      {status === "saving" ? (
        <>
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: "#10B981" }}
            aria-hidden
          />
          Salvando…
        </>
      ) : (
        <>
          <Check className="h-2 w-2" strokeWidth={3} />
          Salvo
        </>
      )}
    </span>
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

// ─── BLOCO 02 — Top produtos (read-only) ─────────────────────────────────

function TopProductsBlock({ products }: { products: TopProduct[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  function scroll(dir: "prev" | "next") {
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>("[data-card]")
    const step = card ? card.offsetWidth + 12 : 220
    el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" })
  }

  function formatPrice(price: number | null, currency: string | null): string {
    if (price === null || price === undefined) return "—"
    const code = currency || "BRL"
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }).format(price)
    } catch {
      return `${code} ${price.toFixed(2)}`
    }
  }

  return (
    <div
      className="mt-5 relative bg-white rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(0,0,0,0.08)" }}
    >
      <div
        className="absolute top-0 left-6 right-6 h-px opacity-50 z-[3]"
        style={{
          background:
            "linear-gradient(90deg, transparent, #A8B2EE, transparent)",
        }}
      />

      <div
        className="relative px-6 sm:px-9 pt-7 pb-5 text-center"
        style={{
          background:
            "linear-gradient(180deg, #FCFCFD 0%, transparent 100%)",
        }}
      >
        <div className="inline-flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-500 mb-3">
          <span className="font-mono text-slate-400 text-[11px]">
            02 · DADOS DA LOJA
          </span>
          <span>Top produtos</span>
        </div>
        <h2 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-slate-900 leading-[1.2] mb-1.5">
          Os {products.length} produtos mais vendidos
        </h2>
        <p className="text-[13px] text-slate-500 leading-relaxed max-w-[520px] mx-auto">
          Capturados diretamente da sua loja. Usaremos como referência pra
          campanhas e flows de produto.
        </p>
        <div
          className="absolute left-9 right-9 bottom-0 h-px opacity-60"
          style={{
            background:
              "linear-gradient(90deg, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)",
          }}
        />
      </div>

      <div className="relative px-4 sm:px-6 py-5">
        {products.length > 2 && (
          <>
            <button
              type="button"
              onClick={() => scroll("prev")}
              aria-label="Anterior"
              className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-[2] h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-all"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={() => scroll("next")}
              aria-label="Próximo"
              className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-[2] h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-all"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </>
        )}

        <div
          ref={scrollerRef}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 px-1"
          style={{ scrollbarWidth: "thin" }}
        >
          {products.map((p) => (
            <article
              key={p.rank}
              data-card
              className="snap-start shrink-0 w-[200px] sm:w-[220px] rounded-xl overflow-hidden bg-white relative flex flex-col"
              style={{ border: "1px solid rgba(0,0,0,0.08)" }}
            >
              <div
                className="absolute top-2.5 left-2.5 z-[2] inline-flex items-center justify-center h-6 min-w-[26px] px-1.5 rounded-full text-[11px] font-bold tabular-nums text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #4E62D8 0%, #2137B6 100%)",
                  boxShadow: "0 2px 6px rgba(33,55,182,0.35)",
                }}
              >
                #{p.rank}
              </div>
              <div
                className="aspect-square w-full flex items-center justify-center"
                style={{ background: "#F8FAFC" }}
              >
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Package
                    className="h-10 w-10 text-slate-300"
                    strokeWidth={1.5}
                  />
                )}
              </div>
              <div className="p-3.5 flex flex-col gap-1.5 flex-1">
                <p
                  className="text-[13px] font-semibold text-slate-900 leading-tight line-clamp-2 min-h-[34px]"
                  title={p.title}
                >
                  {p.title}
                </p>
                <p className="text-[13px] font-mono font-semibold text-brand-600 tabular-nums">
                  {formatPrice(p.price, p.currency)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── BLOCO 03 — Análise de ads (read-only) ───────────────────────────────

function AdsReviewBlock({ review }: { review: AdsReview }) {
  const subScores = review.sub_scores ?? {}
  const subScoreEntries: Array<[string, number, string]> = [
    ["strategy", Number(subScores.strategy ?? 0), "Estratégia"],
    ["creatives", Number(subScores.creatives ?? 0), "Criativos"],
    ["targeting", Number(subScores.targeting ?? 0), "Segmentação"],
    ["diversification", Number(subScores.diversification ?? 0), "Diversificação"],
    ["tracking", Number(subScores.tracking ?? 0), "Tracking & dados"],
  ]

  // Score geral = média das 5 sub-notas (ignora ads_score do banco que pode
  // vir em escala incompatível do webhook do n8n).
  const validSubs = subScoreEntries
    .map(([, v]) => v)
    .filter((v) => Number.isFinite(v) && v > 0)
  const computedScore =
    validSubs.length > 0
      ? validSubs.reduce((s, v) => s + v, 0) / validSubs.length
      : 0
  const score = Math.max(0, Math.min(10, computedScore))
  const scoreColor =
    score >= 7 ? "#10B981" : score >= 4 ? "#F59E0B" : "#EF4444"
  const verdict =
    score >= 7
      ? "Operação saudável"
      : score >= 4
      ? "Atenção em pontos críticos"
      : "Riscos altos — ação imediata"

  // Gauge: arco de 240° (de 150° a 30°, sentido horário).
  const RADIUS = 64
  const CIRC = 2 * Math.PI * RADIUS
  const ARC_FRACTION = 240 / 360
  const ARC_LEN = CIRC * ARC_FRACTION
  const PROGRESS_LEN = ARC_LEN * (score / 10)

  function formatDate(iso: string | null): string | null {
    if (!iso) return null
    try {
      const d = new Date(iso)
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d)
    } catch {
      return null
    }
  }

  const reviewedAt = formatDate(review.reviewed_at)

  return (
    <div
      className="mt-5 relative bg-white rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(0,0,0,0.08)" }}
    >
      <div
        className="absolute top-0 left-6 right-6 h-px opacity-50 z-[3]"
        style={{
          background:
            "linear-gradient(90deg, transparent, #A8B2EE, transparent)",
        }}
      />

      <div
        className="relative px-6 sm:px-9 pt-7 pb-5 text-center"
        style={{
          background:
            "linear-gradient(180deg, #FCFCFD 0%, transparent 100%)",
        }}
      >
        <div className="inline-flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-500 mb-3">
          <span className="font-mono text-slate-400 text-[11px]">
            03 · MÍDIA PAGA
          </span>
          <span>Análise de ads</span>
        </div>
        <h2 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-slate-900 leading-[1.2] mb-1.5">
          Diagnóstico da sua operação de tráfego
        </h2>
        {reviewedAt && (
          <p className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 mt-0.5">
            <Calendar className="h-3 w-3" strokeWidth={2} />
            Avaliada em {reviewedAt}
          </p>
        )}
        <div
          className="absolute left-9 right-9 bottom-0 h-px opacity-60"
          style={{
            background:
              "linear-gradient(90deg, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)",
          }}
        />
      </div>

      <div className="px-6 sm:px-9 py-6 grid sm:grid-cols-[180px_1fr] gap-6 sm:gap-8 items-center">
        {/* Score gauge */}
        <div className="flex flex-col items-center">
          <div className="relative w-[160px] h-[160px]">
            <svg
              viewBox="0 0 160 160"
              className="w-full h-full -rotate-[210deg]"
              aria-hidden
            >
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                fill="none"
                stroke="#F1F5F9"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${ARC_LEN} ${CIRC}`}
              />
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                fill="none"
                stroke={scoreColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${PROGRESS_LEN} ${CIRC}`}
                style={{ transition: "stroke-dasharray 800ms ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-[44px] font-bold tabular-nums leading-none"
                style={{ color: scoreColor }}
              >
                {score.toFixed(1)}
              </span>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-1">
                de 10.0
              </span>
            </div>
          </div>
          <p
            className="mt-3 text-[12.5px] font-semibold text-center"
            style={{ color: scoreColor }}
          >
            {verdict}
          </p>
        </div>

        {/* Summary + sub-scores */}
        <div>
          {review.summary && (
            <p className="text-[13.5px] text-slate-600 leading-relaxed mb-4">
              {review.summary}
            </p>
          )}
          <div className="space-y-2.5">
            {subScoreEntries.map(([key, val, label]) => {
              const pct = Math.max(0, Math.min(100, (val / 10) * 100))
              const barColor =
                val >= 7 ? "#10B981" : val >= 4 ? "#F59E0B" : "#EF4444"
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-slate-700">
                      {label}
                    </span>
                    <span
                      className="text-[12px] font-mono font-semibold tabular-nums"
                      style={{ color: barColor }}
                    >
                      {val.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 3 cards: strengths / opportunities / risks */}
      <div
        className="px-6 sm:px-9 pb-6 pt-2 grid sm:grid-cols-3 gap-3"
        style={{ borderTop: "1px solid #F1F5F9" }}
      >
        <IssueCard
          title="Pontos fortes"
          icon={CheckCircle2}
          color="emerald"
          items={review.strengths ?? []}
        />
        <IssueCard
          title="Oportunidades"
          icon={TrendingUp}
          color="brand"
          items={review.opportunities ?? []}
        />
        <IssueCard
          title="Riscos críticos"
          icon={ShieldAlert}
          color="rose"
          items={review.risks ?? []}
        />
      </div>
    </div>
  )
}

function IssueCard({
  title,
  icon: Icon,
  color,
  items,
}: {
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  color: "emerald" | "brand" | "rose"
  items: Array<{ what: string; body: string }>
}) {
  const palette: Record<typeof color, { bg: string; fg: string; bd: string }> =
    {
      emerald: { bg: "#ECFDF5", fg: "#047857", bd: "#A7F3D0" },
      brand: { bg: "#EEF0FB", fg: "#2137B6", bd: "#C7CDEF" },
      rose: { bg: "#FFF1F2", fg: "#BE123C", bd: "#FECDD3" },
    }
  const c = palette[color]
  const visible = items.slice(0, 3)
  const extra = items.length - visible.length

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2.5"
      style={{ background: c.bg, border: `1px solid ${c.bd}` }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" strokeWidth={2.2} />
        <span
          className="text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: c.fg }}
        >
          {title}
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="text-[12.5px] text-slate-500 italic">Nada listado.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((it, i) => (
            <li key={i} className="text-[12.5px] leading-snug">
              <p className="font-semibold text-slate-900">{it.what}</p>
              {it.body && (
                <p className="text-slate-600 mt-0.5 line-clamp-2">{it.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {extra > 0 && (
        <p
          className="text-[11.5px] font-semibold mt-1"
          style={{ color: c.fg }}
        >
          + {extra} {extra === 1 ? "item" : "itens"}
        </p>
      )}
    </div>
  )
}
