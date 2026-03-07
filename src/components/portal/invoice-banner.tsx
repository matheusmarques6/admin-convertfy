"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertCircle, Clock, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface InvoiceStatus {
  show: boolean
  pendingCount?: number
  overdueCount?: number
  totalPending?: number
  totalOverdue?: number
  earliestDueDate?: string
  oldestOverdueDate?: string
  revenueGenerated?: number
  showRevenue?: boolean
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function getDaysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + "T12:00:00")
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function InvoiceBanner() {
  const pathname = usePathname()
  const [status, setStatus] = useState<InvoiceStatus | null>(null)

  useEffect(() => {
    // Don't fetch if already on invoices page
    if (pathname?.startsWith("/portal/invoices")) return

    const controller = new AbortController()

    fetch("/api/portal/invoices/status", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data: InvoiceStatus | null) => {
        if (data) {
          setStatus(data)
          // Dispatch event so sidebar badge can react
          window.dispatchEvent(
            new CustomEvent("invoice-status-loaded", { detail: data })
          )
        }
      })
      .catch(() => {
        // Silently ignore (AbortError, network error, 403)
      })

    return () => controller.abort()
  }, [pathname])

  // Don't render on invoices page or when nothing to show
  if (pathname?.startsWith("/portal/invoices")) return null
  if (!status?.show) return null

  const hasOverdue = (status.overdueCount ?? 0) > 0
  const hasPending = (status.pendingCount ?? 0) > 0
  const totalAmount = (status.totalPending ?? 0) + (status.totalOverdue ?? 0)

  // Determine variant: overdue takes priority
  const isOverdueVariant = hasOverdue

  // Build text
  let mainText = ""
  if (hasOverdue && hasPending) {
    const total = (status.overdueCount ?? 0) + (status.pendingCount ?? 0)
    mainText = `Voce tem ${total} fatura${total > 1 ? "s" : ""} pendente${total > 1 ? "s" : ""} totalizando ${formatCurrency(totalAmount)}`
  } else if (hasOverdue) {
    const count = status.overdueCount ?? 0
    const days = status.oldestOverdueDate
      ? Math.abs(getDaysFromToday(status.oldestOverdueDate))
      : 0
    mainText = `Voce tem ${count} fatura${count > 1 ? "s" : ""} vencida${count > 1 ? "s" : ""} ${days > 0 ? `ha ${days} dia${days > 1 ? "s" : ""}` : ""} totalizando ${formatCurrency(status.totalOverdue ?? 0)}`
  } else if (hasPending) {
    const count = status.pendingCount ?? 0
    const days = status.earliestDueDate
      ? getDaysFromToday(status.earliestDueDate)
      : 0
    const dueText =
      days === 0
        ? "vence hoje"
        : days === 1
          ? "vence amanha"
          : `vence em ${days} dias`
    mainText = `Voce tem ${count} fatura${count > 1 ? "s" : ""} pendente${count > 1 ? "s" : ""} totalizando ${formatCurrency(status.totalPending ?? 0)} — ${dueText}`
  }

  const ctaText = isOverdueVariant ? "Pagar agora" : "Ver faturas"

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        sticky top-14 z-20 mx-6 mt-4 lg:mx-8 rounded-xl border p-4 shadow-sm
        motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300
        ${isOverdueVariant
          ? "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20"
          : "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20"
        }
      `}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: icon + text */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {isOverdueVariant ? (
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-medium ${isOverdueVariant ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
              {mainText}
            </p>

            {/* Revenue block */}
            {status.showRevenue && status.revenueGenerated && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-3 py-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  <span className="font-medium">Receita gerada pela Convertfy:</span>{" "}
                  <span className="font-bold">{formatCurrency(status.revenueGenerated)}</span>
                  <span className="text-emerald-600/70 dark:text-emerald-400/70 ml-1 text-xs">ultimos 30 dias</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: CTA */}
        <div className="flex-shrink-0 lg:ml-4">
          <Button
            asChild
            size="sm"
            className={
              isOverdueVariant
                ? "bg-red-600 hover:bg-red-700 text-white shadow-sm"
                : "bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            }
          >
            <Link href="/portal/invoices">{ctaText}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
