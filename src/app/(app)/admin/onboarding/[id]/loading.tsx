import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/ui/page-skeleton"

export default function OnboardingDetailLoading() {
  return (
    <div className="space-y-5 p-4 sm:p-6" role="status" aria-label="Carregando conteudo">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-4 w-28 rounded-[4px]" />
      <Skeleton className="h-36 w-full rounded-[12px]" />
      <PageSkeleton variant="detail" showHeader={false} className="px-0 py-0" />
    </div>
  )
}
