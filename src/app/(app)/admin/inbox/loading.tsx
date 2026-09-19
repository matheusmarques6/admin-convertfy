import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton"

export default function InboxLoading() {
  return (
    <div
      className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-[6px] border"
      role="status"
      aria-label="Carregando conteudo"
    >
      <span className="sr-only">Carregando…</span>
      <div className="hidden w-[320px] shrink-0 flex-col gap-3 border-r p-3 md:flex">
        <Skeleton className="h-9 w-full rounded-[4px]" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-16 rounded-[4px]" />
          <Skeleton className="h-7 w-16 rounded-[4px]" />
          <Skeleton className="h-7 w-16 rounded-[4px]" />
        </div>
        <div className="space-y-3 pt-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.08 }}>
              <SkeletonCircle size={32} />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3 rounded-[4px]" />
                <Skeleton className="h-2.5 w-1/2 rounded-[4px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-12 items-center gap-3 border-b px-4">
          <SkeletonCircle size={28} />
          <Skeleton className="h-4 w-40 rounded-[4px]" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          <Skeleton className="h-14 w-2/3 rounded-[6px]" />
          <Skeleton className="ml-auto h-14 w-1/2 rounded-[6px]" />
          <Skeleton className="h-14 w-3/5 rounded-[6px]" />
        </div>
        <div className="border-t p-3">
          <Skeleton className="h-12 w-full rounded-[6px]" />
        </div>
      </div>
    </div>
  )
}
