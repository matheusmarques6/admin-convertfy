import { redirect } from "next/navigation"
import { GitBranch, Plus, ArrowRight } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/services/admin-auth.service"

export const dynamic = "force-dynamic"

/**
 * Pagina raiz de /admin/comercial/pipelines.
 *
 * Quando há pipelines: redireciona server-side para o primeiro (default ou
 * primeiro listado) — elimina o waterfall client (fetch → router.replace →
 * novo fetch na página destino). Critério de escolha idêntico ao antigo
 * client: mesmo filtro da rota /api/crm/pipelines (scope=sales,
 * is_archived=false, created_at asc) + is_default primeiro.
 *
 * Quando não há pipelines: mostra empty state com CTA pra criar.
 *
 * A sidebar de navegação (PipelinesNavSidebar) fica visível em ambos
 * os casos por causa do layout 2-paineis.
 */
export default async function ComercialPipelinesIndexPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const admin = createAdminClient()
  const { data: pipelines } = await admin
    .from("pipelines")
    .select("id, name, is_default")
    .eq("scope", "sales")
    .eq("is_archived", false)
    .order("created_at", { ascending: true })

  const firstId =
    pipelines?.find((p) => p.is_default)?.id ?? pipelines?.[0]?.id ?? null

  if (firstId) {
    redirect(`/admin/comercial/pipelines/${firstId}`)
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-[#0B0E15] p-6">
      <PipelinesEmptyHero
        title="Crie seu primeiro pipeline comercial"
        description="Pipelines organizam prospecção, qualificação e fechamento por estagios. Comece com um padrão (Inbound, Outbound) ou monte do zero."
        ctaLabel="Novo pipeline comercial"
      />
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
