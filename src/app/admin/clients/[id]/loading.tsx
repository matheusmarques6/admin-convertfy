import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton"

export default function ClientDetailLoading() {
  return (
    <div className="space-y-5 p-4 sm:p-6" role="status" aria-label="Carregando conteudo">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-4 w-40 rounded-[4px]" />
      <div className="flex items-center justify-between rounded-[8px] border p-5">
        <div className="flex items-center gap-4">
          <SkeletonCircle size={48} />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48 rounded-[4px]" />
            <Skeleton className="h-3 w-32 rounded-[4px]" />
          </div>
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="ml-auto h-3 w-16 rounded-[4px]" />
          <Skeleton className="ml-auto h-6 w-28 rounded-[4px]" />
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-md rounded-[4px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-[8px]" />
        <Skeleton className="h-64 w-full rounded-[8px]" />
      </div>
    </div>
  )
}
