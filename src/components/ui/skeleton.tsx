import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      {...props}
    />
  )
}

function SkeletonShimmer({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "after:absolute after:inset-0 after:translate-x-[-100%]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent",
        "after:animate-shimmer",
        className
      )}
      {...props}
    />
  )
}

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonShimmer
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? "70%" : "100%" }}
        />
      ))}
    </div>
  )
}

function SkeletonCircle({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <SkeletonShimmer
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  )
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <SkeletonCircle size={40} />
        <div className="flex-1 space-y-2">
          <SkeletonShimmer className="h-4 w-1/2" />
          <SkeletonShimmer className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  )
}

function SkeletonMetric({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-5 space-y-3", className)}>
      <SkeletonShimmer className="h-3 w-2/5" />
      <SkeletonShimmer className="h-8 w-3/5" />
      <SkeletonShimmer className="h-3 w-1/2" />
    </div>
  )
}

export { Skeleton, SkeletonShimmer, SkeletonText, SkeletonCircle, SkeletonCard, SkeletonMetric }
