import { cn } from "@/lib/utils"

// ─── ProgressBar — DS v3.0 ───────────────────────────────
// Bar: h-1 (4px), rounded-full
// Track: bg-gray-100 dark:bg-[#242836]
// Fill: brand-400 (#4E62D8 / #7B8CEA)
// Label: font-mono tabular-nums text-[11px]

interface ProgressBarProps {
  current: number
  total: number
  className?: string
}

export function ProgressBar({ current, total, className }: ProgressBarProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-[#242836] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#4E62D8] dark:bg-[#7B8CEA] transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[11px] font-mono tabular-nums text-gray-400 dark:text-[#5C6378] shrink-0">
        {current}/{total}
      </span>
    </div>
  )
}
