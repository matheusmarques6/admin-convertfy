"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Coins,
  ArrowRight,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { Badge } from "@/components/ui/badge"
import { ROUTES } from "@/lib/routes"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface AuditRow {
  storeId: string
  storeName: string
  clientName: string | null
  platform: "klaviyo" | "omnisend" | "none"
  configuredCurrency: string | null
  reportedCurrency: string | null
  status: "ok" | "missing-config" | "mismatch" | "no-data" | "default-brl"
  storeRevenueLocal: number
  storeRevenueBRL: number | null
  conversionRatio: number | null
  hint: string
}

interface AuditResponse {
  success: boolean
  data: {
    stores: AuditRow[]
    summary: {
      total: number
      ok: number
      missingConfig: number
      mismatch: number
      defaultBrl: number
      noData: number
      currenciesInUse: string[]
    }
    period: string
  }
}

const STATUS_META: Record<
  AuditRow["status"],
  { label: string; tone: "success" | "warn" | "danger" | "neutral" }
> = {
  ok: { label: "OK", tone: "success" },
  "missing-config": { label: "Sem currency", tone: "danger" },
  mismatch: { label: "Divergencia", tone: "warn" },
  "default-brl": { label: "Default BRL", tone: "warn" },
  "no-data": { label: "Sem dados", tone: "neutral" },
}

const TONE_CLASS: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300",
  neutral: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
}

const fmtBRL = (v: number | null) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }).format(v)

const fmtLocal = (v: number, code: string | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: code || "BRL",
    maximumFractionDigits: 0,
  }).format(v)

export default function CurrencyAuditPage() {
  const [period, setPeriod] = useState("30d")

  const { data, isLoading } = useSWR<AuditResponse>(
    `/api/stores/currency-audit?period=${period}`,
    fetcher,
  )

  const stores = data?.data?.stores ?? []
  const summary = data?.data?.summary

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Auditoria de Moeda"
        description="Verifica se cada loja esta com currency configurado corretamente e sendo convertida para BRL no dashboard."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-[6px] border border-black/[0.08] bg-white p-0.5 dark:bg-[#1A1D27]">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`px-3 py-1.5 text-sm font-medium rounded-[4px] transition-colors ${
                period === p
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
            </button>
          ))}
        </div>

        {summary && (
          <div className="text-xs text-muted-foreground">
            Moedas em uso:{" "}
            {summary.currenciesInUse.length > 0
              ? summary.currenciesInUse.join(", ")
              : "—"}
          </div>
        )}
      </div>

      {isLoading ? (
        <PageSkeleton variant="metrics" showHeader={false} className="px-0 py-0" />
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <SummaryCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone="success"
                label="OK"
                value={summary.ok}
              />
              <SummaryCard
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="danger"
                label="Sem currency"
                value={summary.missingConfig}
              />
              <SummaryCard
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="warn"
                label="Divergencia"
                value={summary.mismatch}
              />
              <SummaryCard
                icon={<Coins className="h-4 w-4" />}
                tone="warn"
                label="Default BRL"
                value={summary.defaultBrl}
              />
              <SummaryCard
                icon={<HelpCircle className="h-4 w-4" />}
                tone="neutral"
                label="Sem dados"
                value={summary.noData}
              />
            </div>
          )}

          <div className="rounded-[6px] border border-black/[0.06] bg-white dark:bg-[#1A1D27] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#242836] border-b border-black/[0.06]">
                  <tr>
                    <Th>Loja</Th>
                    <Th>Cliente</Th>
                    <Th>Plataforma</Th>
                    <Th>Configurado</Th>
                    <Th>Reportado</Th>
                    <Th>Status</Th>
                    <Th align="right">Receita (local)</Th>
                    <Th align="right">Receita (BRL)</Th>
                    <Th align="right">Taxa</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {stores.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        Nenhuma loja encontrada.
                      </td>
                    </tr>
                  ) : (
                    stores.map((s) => {
                      const meta = STATUS_META[s.status]
                      return (
                        <tr
                          key={s.storeId}
                          className="border-b border-black/[0.04] hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            {s.storeName}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                            {s.clientName ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="neutral" className="text-[11px]">
                              {s.platform}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">
                            {s.configuredCurrency ?? "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">
                            {s.reportedCurrency ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}
                              title={s.hint}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                            {s.storeRevenueLocal > 0
                              ? fmtLocal(
                                  s.storeRevenueLocal,
                                  s.reportedCurrency || s.configuredCurrency,
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                            {fmtBRL(s.storeRevenueBRL)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-500 text-[11px]">
                            {s.conversionRatio
                              ? s.conversionRatio === 1
                                ? "1.00"
                                : s.conversionRatio.toFixed(4)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={ROUTES.ADMIN.STORES.DETAIL(s.storeId)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Abrir <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[6px] border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
            <p className="font-semibold mb-1">Como interpretar:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <strong>Sem currency</strong>: loja Omnisend sem
                <code className="mx-1">client_stores.currency</code> — sync cai em fallback BRL
                e nao converte. Edite a loja em <code>/admin/clients/&lt;id&gt;</code>.
              </li>
              <li>
                <strong>Divergencia</strong>: configurado em <code>client_stores</code> difere
                do Klaviyo Account API. Use o reportado pelo Klaviyo (ou ajuste o
                preferred_currency na conta Klaviyo).
              </li>
              <li>
                <strong>Default BRL</strong>: nao foi setado e o sistema assumiu BRL. Confirme
                se realmente e BRL.
              </li>
              <li>
                <strong>Sem dados</strong>: ainda nao sincronizou. Aguarde proximo cron ou
                rode manualmente.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONE_CLASS
  label: string
  value: number
}) {
  return (
    <div
      className={`rounded-[6px] border p-3 ${TONE_CLASS[tone]}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode
  align?: "left" | "right"
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-gray-400 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  )
}
