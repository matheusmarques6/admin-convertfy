import { Skeleton, SkeletonMetric } from "@/components/ui/skeleton"

export default function StoreDetailLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6" role="status" aria-label="Carregando conteudo">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-4 w-44 rounded-[4px]" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-[4px]" />
        <Skeleton className="h-8 w-24 rounded-[4px]" />
        <Skeleton className="h-8 w-24 rounded-[4px]" />
      </div>
      <Skeleton className="h-28 w-full rounded-[8px]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonMetric key={i} />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-lg rounded-[4px]" />
      <Skeleton className="h-96 w-full rounded-[8px]" />
    </div>
  )
}
