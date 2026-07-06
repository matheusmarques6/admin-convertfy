import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6" role="status" aria-label="Carregando conteudo">
      <span className="sr-only">Carregando…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 rounded-[4px]" />
        <Skeleton className="h-4 w-72 rounded-[4px]" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-[6px] border p-5" style={{ opacity: 1 - i * 0.06 }}>
            <Skeleton className="h-5 w-5 rounded-[4px]" />
            <Skeleton className="h-4 w-28 rounded-[4px]" />
            <Skeleton className="h-3 w-full rounded-[4px]" />
          </div>
        ))}
      </div>
    </div>
  )
}
