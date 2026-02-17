import { useState, useMemo, useCallback } from "react"

type SortDirection = "asc" | "desc" | null

interface UseTableStateOptions<T> {
  data: T[]
  pageSize?: number
  initialSortKey?: string | null
  initialSortDir?: SortDirection
  searchFields?: (keyof T)[]
}

export function useTableState<T>({
  data,
  pageSize = 10,
  initialSortKey = null,
  initialSortDir = null,
  searchFields = [],
}: UseTableStateOptions<T>) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey)
  const [sortDir, setSortDir] = useState<SortDirection>(initialSortDir)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<Record<string, string>>({})

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc")
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null) }
      else setSortDir("asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(0)
  }, [sortKey, sortDir])

  const setFilter = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(0)
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({})
    setSearch("")
    setPage(0)
  }, [])

  const filteredData = useMemo(() => {
    let result = data

    // Apply search
    if (search && searchFields.length > 0) {
      const term = search.toLowerCase()
      result = result.filter(item =>
        searchFields.some(field => {
          const value = item[field]
          return typeof value === "string" && value.toLowerCase().includes(term)
        })
      )
    }

    return result
  }, [data, search, searchFields])

  const totalPages = Math.ceil(filteredData.length / pageSize)
  const pagedData = filteredData.slice(page * pageSize, (page + 1) * pageSize)

  const hasActiveFilters = search.length > 0 || Object.values(filters).some(v => v && v !== "all")

  return {
    // Search
    search, setSearch,
    // Sort
    sortKey, sortDir, handleSort,
    // Pagination
    page, setPage, totalPages, pageSize,
    // Filters
    filters, setFilter, clearFilters, hasActiveFilters,
    // Data
    filteredData,
    pagedData,
    totalItems: filteredData.length,
  }
}
