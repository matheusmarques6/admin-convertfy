import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>

      {/* Revenue Banner */}
      <Skeleton className="h-64 w-full rounded-xl" />

      {/* Primary Grid: Board + Calendar */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>

      {/* Secondary Grid: 3 columns */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>

      {/* Tertiary Row */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}
