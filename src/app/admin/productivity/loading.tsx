import { Skeleton } from "@/components/ui/skeleton"

export default function ProductivityLoading() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-56 mb-2 rounded-[8px]" />
          <Skeleton className="h-4 w-40 rounded-[8px]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-[8px]" />
          <Skeleton className="h-9 w-28 rounded-[8px]" />
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96 rounded-[8px]" />
        ))}
      </div>
    </div>
  )
}
