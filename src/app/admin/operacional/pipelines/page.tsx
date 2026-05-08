"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { HeartHandshake, Plus, ArrowRight } from "lucide-react"

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
 * Pagina raiz de /admin/operacional/pipelines.
 * Mesma logica da contraparte comercial: redireciona pro primeiro
 * pipeline ou mostra hero de criacao quando nao ha nenhum.
 */
export default function OperacionalPipelinesIndexPage() {
  const router = useRouter()
  const { data, isLoading } = useSWR<{ pipelines: PipelineSummary[] }>(
    "/api/crm/pipelines?scope=cs",
    fetcher,
  )

  const pipelines = data?.pipelines ?? []
  const firstId =
    pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id ?? null

  useEffect(() => {
    if (!isLoading && firstId) {
      router.replace(`/admin/operacional/pipelines/${firstId}`)
    }
  }, [isLoading, firstId, router])

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-[#0B0E15] p-6">
      {isLoading ? (
        <div className="text-[13px] text-slate-500 dark:text-white/55">
          Carregando pipelines...
        </div>
      ) : pipelines.length === 0 ? (
        <CsPipelinesEmptyHero />
      ) : firstId ? (
        <div className="text-[13px] text-slate-500 dark:text-white/55">
          Abrindo {pipelines[0].name}...
        </div>
      ) : (
        <CsPipelinesEmptyHero />
      )}
    </div>
  )
}

function CsPipelinesEmptyHero() {
  return (
    <div className="max-w-md text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 mb-4">
        <HeartHandshake className="h-5 w-5" />
      </div>
      <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white mb-2 tracking-tight">
        Crie seu primeiro pipeline de Customer Success
      </h2>
      <p className="text-[13px] text-slate-600 dark:text-white/65 leading-relaxed mb-5">
        Acompanhe onboardings, gestão de carteira, tickets e renovações
        em estagios claros. Pipelines podem ser kanban ou state-board.
      </p>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] bg-[#059669] hover:bg-[#047857] text-white text-[13px] font-semibold shadow-[0_1px_2px_rgba(5,150,105,0.25)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Novo pipeline CS
        <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
      </button>
    </div>
  )
}
