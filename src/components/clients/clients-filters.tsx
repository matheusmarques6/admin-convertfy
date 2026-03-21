"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Filter, X } from "lucide-react"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"

const statusOptions = [
  { value: "all", label: "Todos os status" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "prospect", label: "Prospects" },
  { value: "onboarding", label: "Em Onboarding" },
  { value: "churned", label: "Churned" },
]

const healthOptions = [
  { value: "all", label: "Todas as saúdes" },
  { value: "good", label: "Saudável (70-100)" },
  { value: "warning", label: "Atenção (40-69)" },
  { value: "critical", label: "Crítico (0-39)" },
]

export function ClientsFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [status, setStatus] = useState(searchParams.get("status") || "all")
  const [health, setHealth] = useState(searchParams.get("health") || "all")

  const activeFilters = [
    status !== "all" && { key: "status", value: statusOptions.find((s) => s.value === status)?.label },
    health !== "all" && { key: "health", value: healthOptions.find((h) => h.value === health)?.label },
  ].filter(Boolean)

  function applyFilters() {
    const params = new URLSearchParams()
    if (search.trim()) params.set("search", search.trim())
    if (status !== "all") params.set("status", status)
    if (health !== "all") params.set("health", health)
    // Nao inclui page — sempre volta para pagina 1
    const qs = params.toString()
    router.push(qs ? `/admin/clients?${qs}` : "/clients")
  }

  function clearFilter(key: string) {
    if (key === "status") setStatus("all")
    if (key === "health") setHealth("all")
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)
    params.delete("page") // Reset para pagina 1
    const qs = params.toString()
    router.push(qs ? `/admin/clients?${qs}` : "/clients")
  }

  function clearAllFilters() {
    setSearch("")
    setStatus("all")
    setHealth("all")
    router.push("/admin/clients")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Icon icon={Search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            className="pl-9"
          />
        </div>

        {/* Filters Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <Icon icon={Filter} size={16} className="mr-2" />
              Filtros
              {activeFilters.length > 0 && (
                <Badge variant="neutral" className="ml-2">
                  {activeFilters.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Saúde do Cliente</Label>
                <Select value={health} onValueChange={setHealth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {healthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={applyFilters} className="flex-1">
                  Aplicar
                </Button>
                <Button variant="outline" onClick={clearAllFilters}>
                  Limpar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter) => filter && (
            <Badge
              key={filter.key}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {filter.value}
              <button
                onClick={() => clearFilter(filter.key)}
                className="ml-1 hover:text-foreground"
              >
                <Icon icon={X} customSize={12} />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
