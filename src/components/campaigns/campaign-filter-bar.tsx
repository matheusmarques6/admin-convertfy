"use client"

import { Mail, MessageSquare, Filter } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ============================================
// TYPES
// ============================================

export interface CampaignFilterBarProps {
  selectedChannel: string
  selectedStatus: string
  onChannelChange: (value: string) => void
  onStatusChange: (value: string) => void
}

// ============================================
// COMPONENT
// ============================================

export function CampaignFilterBar({
  selectedChannel,
  selectedStatus,
  onChannelChange,
  onStatusChange,
}: CampaignFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Channel Filter */}
      <Select value={selectedChannel} onValueChange={onChannelChange}>
        <SelectTrigger className="w-[140px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
          <Icon icon={Mail} size={16} className="mr-2 text-slate-400 dark:text-slate-500" />
          <SelectValue placeholder="Canal" />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
          <SelectItem value="all" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            Todos os canais
          </SelectItem>
          <SelectItem value="email" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <Icon icon={Mail} size={16} className="text-blue-500" />
              Email
            </div>
          </SelectItem>
          <SelectItem value="sms" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <Icon icon={MessageSquare} size={16} className="text-emerald-500" />
              SMS
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Status Filter */}
      <Select value={selectedStatus} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[150px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
          <Icon icon={Filter} size={16} className="mr-2 text-slate-400 dark:text-slate-500" />
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
          <SelectItem value="all" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            Todos os status
          </SelectItem>
          <SelectItem value="scheduled" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Agendada
            </div>
          </SelectItem>
          <SelectItem value="sent" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Enviada
            </div>
          </SelectItem>
          <SelectItem value="draft" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              Rascunho
            </div>
          </SelectItem>
          <SelectItem value="cancelled" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Cancelada
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
