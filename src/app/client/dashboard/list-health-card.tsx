import { Shield } from "lucide-react"
import { Icon } from "@/components/ui/icon"

interface ListHealthCardProps {
  bounceRate: number
  unsubscribeRate: number
}

export function ListHealthCard({ bounceRate, unsubscribeRate }: ListHealthCardProps) {
  const bounceScore = Math.max(0, 100 - (bounceRate * 20))
  const unsubScore = Math.max(0, 100 - (unsubscribeRate * 100))
  const score = Math.round((bounceScore * 0.5 + unsubScore * 0.5))

  const status = score > 80
    ? { label: "Tudo certo", color: "text-emerald-600", ringColor: "stroke-emerald-500", bgColor: "bg-emerald-50 dark:bg-emerald-500/10", iconBg: "bg-emerald-50 dark:bg-emerald-500/10", iconColor: "text-emerald-600" }
    : score > 50
      ? { label: "Requer atenção", color: "text-amber-600", ringColor: "stroke-amber-500", bgColor: "bg-amber-50 dark:bg-amber-500/10", iconBg: "bg-amber-50 dark:bg-amber-500/10", iconColor: "text-amber-600" }
      : { label: "Ação necessária", color: "text-red-600", ringColor: "stroke-red-500", bgColor: "bg-red-50 dark:bg-red-500/10", iconBg: "bg-red-50 dark:bg-red-500/10", iconColor: "text-red-600" }

  const radius = 36
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-7 h-7 rounded-lg ${status.iconBg} flex items-center justify-center`}>
          <Icon icon={Shield} customSize={14} className={status.iconColor} />
        </div>
        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Saúde da Lista</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Circle Progress */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r={radius}
              fill="none"
              className="stroke-slate-100 dark:stroke-slate-700"
              strokeWidth="6"
            />
            <circle
              cx="40" cy="40" r={radius}
              fill="none"
              className={status.ringColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${status.color}`}>{score}%</span>
          </div>
        </div>

        <div className="flex-1">
          <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.bgColor} ${status.color} mb-2`}>
            {status.label}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Bounce rate</span>
              <span className="text-slate-700 dark:text-slate-200 font-medium">{bounceRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Unsub rate</span>
              <span className="text-slate-700 dark:text-slate-200 font-medium">{unsubscribeRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
