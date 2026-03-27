"use client"

import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FilterSelect } from "@/components/ui/filter-select"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer"

interface FilterOption {
  value: string
  label: string
}

interface MobileFiltersSheetProps {
  clientFilter: string
  onClientFilterChange: (v: string) => void
  clientOptions: FilterOption[]
  typeFilter: string
  onTypeFilterChange: (v: string) => void
  typeOptions: FilterOption[]
  statusFilter: string
  onStatusFilterChange: (v: string) => void
  statusOptions: FilterOption[]
  monthFilter: string
  onMonthFilterChange: (v: string) => void
  monthOptions: FilterOption[]
  onClear: () => void
  hasActiveFilters: boolean
}

export function MobileFiltersSheet({
  clientFilter,
  onClientFilterChange,
  clientOptions,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  monthFilter,
  onMonthFilterChange,
  monthOptions,
  onClear,
  hasActiveFilters,
}: MobileFiltersSheetProps) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary" size="icon" className="md:hidden h-9 w-9">
          <Filter className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filtros</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-[#8B92A5]">Mês</label>
            <FilterSelect value={monthFilter} onValueChange={onMonthFilterChange} options={monthOptions} placeholder="Mês" className="w-full" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-[#8B92A5]">Cliente</label>
            <FilterSelect value={clientFilter} onValueChange={onClientFilterChange} options={clientOptions} placeholder="Cliente" className="w-full" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-[#8B92A5]">Tipo</label>
            <FilterSelect value={typeFilter} onValueChange={onTypeFilterChange} options={typeOptions} placeholder="Tipo" className="w-full" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-[#8B92A5]">Status</label>
            <FilterSelect value={statusFilter} onValueChange={onStatusFilterChange} options={statusOptions} placeholder="Status" className="w-full" />
          </div>
        </div>
        <DrawerFooter>
          {hasActiveFilters && (
            <DrawerClose asChild>
              <Button variant="secondary" className="w-full" onClick={onClear}>
                Limpar filtros
              </Button>
            </DrawerClose>
          )}
          <DrawerClose asChild>
            <Button className="w-full">Aplicar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
