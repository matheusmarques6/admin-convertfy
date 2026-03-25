import { cn } from '@/lib/utils'

interface CountBadgeProps {
  count: number
  active?: boolean
  className?: string
}

export function CountBadge({ count, active = false, className }: CountBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded',
      'text-[11px] font-mono font-semibold tabular-nums',
      'transition-colors duration-150',
      active
        ? 'bg-[#EEF0FB] text-[#4E62D8] dark:bg-[rgba(123,140,234,0.12)] dark:text-[#7B8CEA]'
        : 'bg-gray-100 text-gray-500 dark:bg-[#242836] dark:text-[#5C6378]',
      className,
    )}>
      {count}
    </span>
  )
}
