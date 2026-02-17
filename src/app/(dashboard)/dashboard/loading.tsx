import { Skeleton, SkeletonMetric } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonMetric />
        <SkeletonMetric />
        <SkeletonMetric />
        <SkeletonMetric />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-[250px] w-full" />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-[250px] w-full" />
        </div>
      </div>
    </div>
  )
}
