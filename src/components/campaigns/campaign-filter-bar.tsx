"use client"

import { Store, Mail, MessageSquare, Filter } from "lucide-react"
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

export interface StoreOption {
  id: string
  store_name: string
}

export interface CampaignFilterBarProps {
  selectedStore: string
  selectedChannel: string
  selectedStatus: string
  stores: StoreOption[]
  onStoreChange: (value: string) => void
  onChannelChange: (value: string) => void
  onStatusChange: (value: string) => void
}

// ============================================
// COMPONENT
// ============================================

export function CampaignFilterBar({
  selectedStore,
  selectedChannel,
  selectedStatus,
  stores,
  onStoreChange,
  onChannelChange,
  onStatusChange,
}: CampaignFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Store Filter */}
      <Select value={selectedStore} onValueChange={onStoreChange}>
        <SelectTrigger className="w-[160px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
          <Store className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
          <SelectValue placeholder="Loja" />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
          <SelectItem value="all" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            Todas as lojas
          </SelectItem>
          {stores.map((store) => (
            <SelectItem
              key={store.id}
              value={store.id}
              className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            >
              {store.store_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Channel Filter */}
      <Select value={selectedChannel} onValueChange={onChannelChange}>
        <SelectTrigger className="w-[140px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
          <Mail className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
          <SelectValue placeholder="Canal" />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
          <SelectItem value="all" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            Todos os canais
          </SelectItem>
          <SelectItem value="email" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" />
              Email
            </div>
          </SelectItem>
          <SelectItem value="sms" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
              SMS
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Status Filter */}
      <Select value={selectedStatus} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[150px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
          <Filter className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
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
