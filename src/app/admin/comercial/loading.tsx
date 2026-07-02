import { Skeleton } from "@/components/ui/skeleton"

export default function ComercialLoading() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-56 mb-2 rounded-[8px]" />
          <Skeleton className="h-4 w-40 rounded-[8px]" />
        </div>
        <Skeleton className="h-9 w-36 rounded-[8px]" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-[8px]" />
        ))}
      </div>
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-[8px]" />
        <Skeleton className="h-80 rounded-[8px]" />
      </div>
      <Skeleton className="h-64 w-full rounded-[8px]" />
    </div>
  )
}
