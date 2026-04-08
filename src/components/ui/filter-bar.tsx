"use client"

import { Search, X } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface FilterOption {
  value: string
  label: string
}

interface FilterDef {
  key: string
  label: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  allLabel?: string
}

interface FilterBarProps {
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    onSubmit?: () => void
  }
  filters?: FilterDef[]
  onClearAll?: () => void
  className?: string
}

export function FilterBar({ search, filters = [], onClearAll, className }: FilterBarProps) {
  const activeFilters = filters.filter(f => f.value && f.value !== "all")
  const hasActiveFilters = activeFilters.length > 0 || (search?.value && search.value.length > 0)

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        {search && (
          <div className="relative flex-1">
            <Icon icon={Search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={search.placeholder || "Buscar..."}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search.onSubmit?.()}
              className="pl-9"
            />
          </div>
        )}

        {/* Inline Filters */}
        {filters.map((filter) => (
          <Select key={filter.key} value={filter.value} onValueChange={filter.onChange}>
            <SelectTrigger className="w-[180px] shrink-0">
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{filter.allLabel || `Todos`}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {/* Clear All */}
        {hasActiveFilters && onClearAll && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground h-10"
            onClick={onClearAll}
          >
            <Icon icon={X} customSize={12} className="mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {/* Active Filter Pills */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter) => {
            const selectedOption = filter.options.find(o => o.value === filter.value)
            return (
              <Badge key={filter.key} variant="neutral" className="flex items-center gap-1 pr-1">
                <span className="text-muted-foreground mr-1">{filter.label}:</span>
                {selectedOption?.label || filter.value}
                <button
                  onClick={() => filter.onChange("all")}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <Icon icon={X} customSize={12} />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
