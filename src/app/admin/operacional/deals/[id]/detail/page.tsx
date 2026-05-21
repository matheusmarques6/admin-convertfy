import { Suspense } from "react"
import { DealDetailView } from "@/components/crm/deal-detail-view"

export const dynamic = "force-dynamic"

/**
 * Pagina full-page do deal de CS (espelho de /admin/comercial/deals/[id]/detail).
 *
 * O componente DealDetailView e scope-agnostico — infere a partir do
 * pipeline.scope se o deal e de vendas ou customer success. As 5 abas
 * (historico, atividades, negocios, arquivos, atendimentos) funcionam
 * para ambos.
 */
export default async function CsDealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <DealDetailView dealId={id} />
    </Suspense>
  )
}
