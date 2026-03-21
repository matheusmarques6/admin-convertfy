"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Filter, X, CalendarIcon } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import type { MeetingStatus } from "@/types"
import { MEETING_STATUS_CONFIG } from "@/lib/constants/board"

export interface MeetingFiltersState {
  status: MeetingStatus | "all"
  period: "today" | "week" | "month" | "all" | "custom"
  customDateStart?: Date
  customDateEnd?: Date
}

interface AgentOption {
  id: string
  name: string
}

interface MeetingFiltersProps {
  filters: MeetingFiltersState
  onFiltersChange: (filters: MeetingFiltersState) => void
  agents?: AgentOption[]
  selectedAgentId?: string
  onAgentChange?: (agentId: string | undefined) => void
  showAgentFilter?: boolean
}

export function MeetingFilters({
  filters,
  onFiltersChange,
  agents = [],
  selectedAgentId,
  onAgentChange,
  showAgentFilter = false,
}: MeetingFiltersProps) {
  const [showCustomDate, setShowCustomDate] = useState(false)

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.period !== "all" ||
    selectedAgentId

  const clearFilters = () => {
    onFiltersChange({ status: "all", period: "all" })
    onAgentChange?.(undefined)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Icon icon={Filter} size={16} className="text-muted-foreground" />

      {/* Status filter */}
      <Select
        value={filters.status}
        onValueChange={(value) =>
          onFiltersChange({ ...filters, status: value as MeetingStatus | "all" })
        }
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          {(Object.entries(MEETING_STATUS_CONFIG) as [MeetingStatus, { label: string }][]).map(
            ([value, config]) => (
              <SelectItem key={value} value={value}>
                {config.label}
              </SelectItem>
            )
          )}
        </SelectContent>
      </Select>

      {/* Period filter */}
      <Select
        value={filters.period}
        onValueChange={(value) => {
          const period = value as MeetingFiltersState["period"]
          if (period === "custom") {
            setShowCustomDate(true)
          }
          onFiltersChange({ ...filters, period })
        }}
      >
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo período</SelectItem>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="week">Esta semana</SelectItem>
          <SelectItem value="month">Este mês</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom date range */}
      {filters.period === "custom" && (
        <Popover open={showCustomDate} onOpenChange={setShowCustomDate}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <Icon icon={CalendarIcon} customSize={12} />
              {filters.customDateStart && filters.customDateEnd
                ? `${format(filters.customDateStart, "dd/MM")} - ${format(filters.customDateEnd, "dd/MM")}`
                : "Selecionar datas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={
                filters.customDateStart && filters.customDateEnd
                  ? { from: filters.customDateStart, to: filters.customDateEnd }
                  : undefined
              }
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  onFiltersChange({
                    ...filters,
                    customDateStart: range.from,
                    customDateEnd: range.to,
                  })
                  setShowCustomDate(false)
                } else if (range?.from) {
                  onFiltersChange({
                    ...filters,
                    customDateStart: range.from,
                    customDateEnd: undefined,
                  })
                }
              }}
              locale={ptBR}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Agent filter */}
      {showAgentFilter && agents.length > 0 && (
        <Select
          value={selectedAgentId || "_all"}
          onValueChange={(value) => onAgentChange?.(value === "_all" ? undefined : value)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Agente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos os agentes</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Active filters indicator + clear */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-muted-foreground"
          onClick={clearFilters}
        >
          <Icon icon={X} customSize={12} />
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
