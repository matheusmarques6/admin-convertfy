import { Suspense } from "react"
import { ProductionWorkspace } from "@/components/stores/producao/production-workspace"

export const dynamic = "force-dynamic"

export default async function StoreProductionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ resource?: string; flow?: string; email?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  return (
    <Suspense fallback={null}>
      <ProductionWorkspace
        storeId={id}
        initialResource={sp.resource ?? null}
        initialFlow={sp.flow ?? null}
        initialEmail={sp.email ?? null}
      />
    </Suspense>
  )
}
