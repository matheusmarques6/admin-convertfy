import { cn } from "@/lib/utils"
import {
  SkeletonShimmer,
  SkeletonMetric,
  SkeletonCard,
} from "./skeleton"

/**
 * Skeletons de pagina inteira — presets para reutilizar nas rotas.
 *
 * Usar em `loading.tsx` (Next.js Suspense) ou enquanto SWR/fetch
 * carrega na primeira render.
 *
 * Variantes:
 *   - metrics: 4 KPIs + 2 cards grandes (default p/ dashboards)
 *   - list: header + 8 rows (tabelas / leads / clients)
 *   - kanban: 4 colunas com 3 cards cada
 *   - detail: header + 2 colunas (drawer-like)
 *   - chart: header + um chart grande
 */

export type PageSkeletonVariant =
  | "metrics"
  | "list"
  | "kanban"
  | "detail"
  | "chart"

interface PageSkeletonProps {
  variant?: PageSkeletonVariant
  className?: string
  /** Mostra um placeholder de header (titulo + actions) acima */
  showHeader?: boolean
}

export function PageSkeleton({
  variant = "metrics",
  className,
  showHeader = true,
}: PageSkeletonProps) {
  return (
    <div
      className={cn(
        "w-full space-y-4 px-4 py-4 sm:px-6 sm:py-6",
        className,
      )}
      role="status"
      aria-label="Carregando conteudo"
      aria-live="polite"
    >
      <span className="sr-only">Carregando…</span>

      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonShimmer className="h-5 w-48 rounded-[4px]" />
            <SkeletonShimmer className="h-3 w-72 rounded-[4px]" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonShimmer className="h-8 w-24 rounded-[4px]" />
            <SkeletonShimmer className="h-8 w-32 rounded-[4px]" />
          </div>
        </div>
      )}

      {variant === "metrics" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonMetric key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <SkeletonCard className="h-64" />
            <SkeletonCard className="h-64" />
          </div>
        </>
      )}

      {variant === "list" && (
        <div className="rounded-[6px] border border-black/[0.06] bg-white">
          <div className="flex items-center justify-between border-b border-black/[0.04] px-4 py-3">
            <div className="flex items-center gap-2">
              <SkeletonShimmer className="h-7 w-44 rounded-[4px]" />
              <SkeletonShimmer className="h-7 w-24 rounded-[4px]" />
            </div>
            <SkeletonShimmer className="h-7 w-32 rounded-[4px]" />
          </div>
          <div className="divide-y divide-black/[0.04]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3"
                style={{ opacity: 1 - i * 0.06 }}
              >
                <SkeletonShimmer className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonShimmer className="h-3 w-1/3 rounded-[4px]" />
                  <SkeletonShimmer className="h-2.5 w-1/4 rounded-[4px]" />
                </div>
                <SkeletonShimmer className="h-5 w-16 rounded-[4px]" />
                <SkeletonShimmer className="h-5 w-12 rounded-[4px]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, col) => (
            <div
              key={col}
              className="w-[280px] shrink-0 rounded-[6px] border border-black/[0.06] bg-black/[0.02] p-2"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <SkeletonShimmer className="h-3 w-24 rounded-[4px]" />
                <SkeletonShimmer className="h-3 w-6 rounded-[4px]" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, row) => (
                  <div
                    key={row}
                    className="rounded-[4px] border border-black/[0.06] bg-white p-3 space-y-2"
                  >
                    <SkeletonShimmer className="h-3 w-3/4 rounded-[4px]" />
                    <SkeletonShimmer className="h-2.5 w-1/2 rounded-[4px]" />
                    <div className="flex items-center justify-between pt-1">
                      <SkeletonShimmer className="h-4 w-16 rounded-[4px]" />
                      <SkeletonShimmer className="h-5 w-5 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === "detail" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <SkeletonCard className="h-40" />
            <SkeletonCard className="h-64" />
          </div>
          <div className="space-y-3">
            <SkeletonShimmer className="h-32 w-full rounded-[6px]" />
            <SkeletonShimmer className="h-24 w-full rounded-[6px]" />
            <SkeletonShimmer className="h-24 w-full rounded-[6px]" />
          </div>
        </div>
      )}

      {variant === "chart" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonShimmer key={i} className="h-16 rounded-[6px]" />
            ))}
          </div>
          <SkeletonShimmer className="h-[320px] w-full rounded-[6px]" />
        </>
      )}
    </div>
  )
}
