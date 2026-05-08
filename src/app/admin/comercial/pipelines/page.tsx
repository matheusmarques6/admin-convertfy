"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { GitBranch, Plus, ArrowRight } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineSummary {
  id: string
  name: string
  description: string | null
  scope: string
  color: string | null
  deals_count: number
  is_default?: boolean
}

/**
 * Pagina raiz de /admin/comercial/pipelines.
 *
 * Quando há pipelines: redireciona para o primeiro (default ou
 * primeiro listado). UX: usuário sempre cai num board ao invés de
 * tela "lista".
 *
 * Quando não há pipelines: mostra empty state com CTA pra criar.
 *
 * A sidebar de navegação (PipelinesNavSidebar) fica visível em ambos
 * os casos por causa do layout 2-paineis.
 */
export default function ComercialPipelinesIndexPage() {
  const router = useRouter()
  const { data, isLoading } = useSWR<{ pipelines: PipelineSummary[] }>(
    "/api/crm/pipelines?scope=sales",
    fetcher,
  )

  const pipelines = data?.pipelines ?? []
  const firstId =
    pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id ?? null

  // Auto-redirect pro primeiro pipeline disponível.
  useEffect(() => {
    if (!isLoading && firstId) {
      router.replace(`/admin/comercial/pipelines/${firstId}`)
    }
  }, [isLoading, firstId, router])

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-[#0B0E15] p-6">
      {isLoading ? (
        <div className="text-[13px] text-slate-500 dark:text-white/55">
          Carregando pipelines...
        </div>
      ) : pipelines.length === 0 ? (
        <PipelinesEmptyHero
          title="Crie seu primeiro pipeline comercial"
          description="Pipelines organizam prospecção, qualificação e fechamento por estagios. Comece com um padrão (Inbound, Outbound) ou monte do zero."
          ctaLabel="Novo pipeline comercial"
        />
      ) : firstId ? (
        // Estado fugaz enquanto o useEffect dispara o replace
        <div className="text-[13px] text-slate-500 dark:text-white/55">
          Abrindo {pipelines[0].name}...
        </div>
      ) : (
        <PipelinesEmptyHero
          title="Selecione um pipeline"
          description="Use a barra lateral para abrir um pipeline existente."
          ctaLabel="Novo pipeline"
        />
      )}
    </div>
  )
}

function PipelinesEmptyHero({
  title,
  description,
  ctaLabel,
}: {
  title: string
  description: string
  ctaLabel: string
}) {
  return (
    <div className="max-w-md text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 mb-4">
        <GitBranch className="h-5 w-5" />
      </div>
      <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white mb-2 tracking-tight">
        {title}
      </h2>
      <p className="text-[13px] text-slate-600 dark:text-white/65 leading-relaxed mb-5">
        {description}
      </p>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-semibold shadow-[0_1px_2px_rgba(37,99,235,0.25)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
      </button>
    </div>
  )
}
