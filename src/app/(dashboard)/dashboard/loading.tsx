import { Skeleton, SkeletonMetric } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-5 max-w-[1600px]">
      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Revenue Banner */}
      <Skeleton className="h-64 w-full rounded-2xl" />

      {/* Billing Metrics Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Charts + Right Column */}
      <div className="grid gap-5 lg:grid-cols-7">
        <div className="col-span-full lg:col-span-4">
          <Skeleton className="h-[460px] rounded-xl" />
        </div>
        <div className="col-span-full lg:col-span-3 space-y-5">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
