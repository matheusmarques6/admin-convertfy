"use client"

/**
 * Auditoria dos cards de receita — clica no card, vê loja a loja o que
 * compõe o número, com a soma recalculada NA TELA a partir das linhas
 * (pra conferir na mão) e um selo dizendo se a soma bate com o card.
 * Fonte: o MESMO payload do card (/api/dashboard/total-revenue →
 * storeBreakdown) — auditoria e card nunca podem divergir por fonte.
 * Export CSV incluído (padrão crm-csv: ";" + BOM).
 */

import { useMemo } from "react"
import useSWR from "swr"
import { Download } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { toCsv, downloadCsv, csvNumber } from "@/lib/services/crm-csv"
import { Th, Td, fmtBRLFull, fmtPct, CollectingState } from "./primitives"

export type AuditMode =
  | "atribuida"
  | "campanhas"
  | "automacoes"
  | "taxa"
  | "faturamento"
  | "media"

interface StoreRevenueRow {
  storeId: string
  storeName: string
  clientName: string
  currency: string
  totalRevenueBRL: number
  attributedRevenueBRL: number
  campaignRevenueBRL: number
  flowRevenueBRL: number
}

interface TotalRevenueAudit {
  storeBreakdown: StoreRevenueRow[]
  storesCount: number
  storesWithRevenue: number
}

const MODE_META: Record<AuditMode, { title: string; note: string }> = {
  atribuida: {
    title: "Auditoria · Receita Atribuída",
    note: "Atribuída = campanhas + automações (Klaviyo/Omnisend), convertida pra BRL, por loja no período.",
  },
  campanhas: {
    title: "Auditoria · Receita de Campanhas",
    note: "Receita de campanhas por loja (store_revenue_summary), convertida pra BRL.",
  },
  automacoes: {
    title: "Auditoria · Receita de Automações",
    note: "Receita de flows por loja (store_revenue_summary), convertida pra BRL.",
  },
  taxa: {
    title: "Auditoria · Taxa média Convertfy",
    note: "Taxa = atribuída ÷ faturamento da loja. A taxa global considera só lojas com faturamento > 0.",
  },
  faturamento: {
    title: "Auditoria · Faturamento total",
    note: "Faturamento BRUTO da loja (Shopify/Statistics API), convertido pra BRL, por loja ativa.",
  },
  media: {
    title: "Auditoria · Média por cliente",
    note: "Faturamento das lojas somado por CLIENTE (multi-loja consolida) ÷ nº de clientes ativos.",
  },
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body && body.error) || `Erro ${res.status}`)
  return body as T
}

export function AuditDialog({
  mode,
  q,
  cardValue,
  onClose,
}: {
  mode: AuditMode | null
  q: string
  /** Valor mostrado no card — pra conferência soma × card. */
  cardValue: number | null
  onClose: () => void
}) {
  const { data, error } = useSWR<TotalRevenueAudit>(
    mode ? `/api/dashboard/total-revenue?${q}` : null,
    fetchJson,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  )

  const view = useMemo(() => {
    if (!data || !mode) return null
    const rows = [...(data.storeBreakdown ?? [])]

    if (mode === "media") {
      const byClient = new Map<string, { name: string; total: number; lojas: number }>()
      for (const r of rows) {
        const key = r.clientName || r.storeName
        const c = byClient.get(key) ?? { name: key, total: 0, lojas: 0 }
        c.total += r.totalRevenueBRL
        c.lojas += 1
        byClient.set(key, c)
      }
      const clients = [...byClient.values()].sort((a, b) => b.total - a.total)
      const total = clients.reduce((s, c) => s + c.total, 0)
      return { kind: "clients" as const, clients, total, computed: clients.length > 0 ? total / clients.length : 0 }
    }

    const valueOf = (r: StoreRevenueRow) =>
      mode === "campanhas"
        ? r.campaignRevenueBRL
        : mode === "automacoes"
          ? r.flowRevenueBRL
          : mode === "faturamento"
            ? r.totalRevenueBRL
            : r.attributedRevenueBRL
    rows.sort((a, b) => valueOf(b) - valueOf(a))
    const sumAttr = rows.reduce((s, r) => s + r.attributedRevenueBRL, 0)
    const sumTotal = rows.reduce((s, r) => s + r.totalRevenueBRL, 0)
    // Mesma régua do card de taxa (kpi-series): só lojas com faturamento > 0.
    const withRevenue = rows.filter((r) => r.totalRevenueBRL > 0)
    const rateAttr = withRevenue.reduce((s, r) => s + r.attributedRevenueBRL, 0)
    const rateTotal = withRevenue.reduce((s, r) => s + r.totalRevenueBRL, 0)
    const computed =
      mode === "taxa"
        ? rateTotal > 0
          ? (rateAttr / rateTotal) * 100
          : 0
        : rows.reduce((s, r) => s + valueOf(r), 0)
    return { kind: "stores" as const, rows, valueOf, sumAttr, sumTotal, computed }
  }, [data, mode])

  if (!mode) return null
  const meta = MODE_META[mode]

  // Confere soma recalculada × valor do card (tolerância de arredondamento
  // + formatação compacta do card: 0,5% ou R$ 5k, o que for maior).
  const matches =
    cardValue != null && view
      ? Math.abs(view.computed - cardValue) <=
        Math.max(Math.abs(cardValue) * 0.005, mode === "taxa" ? 0.1 : 5000)
      : null

  const exportCsv = () => {
    if (!view) return
    if (view.kind === "clients") {
      const csv = toCsv(
        ["Cliente", "Lojas", "Faturamento BRL"],
        view.clients.map((c) => [c.name, c.lojas, csvNumber(c.total)]),
      )
      downloadCsv("auditoria-media-por-cliente.csv", csv)
      return
    }
    const csv = toCsv(
      ["Loja", "Cliente", "Moeda", "Faturamento BRL", "Campanhas BRL", "Automações BRL", "Atribuída BRL", "Taxa %"],
      view.rows.map((r) => [
        r.storeName,
        r.clientName,
        r.currency,
        csvNumber(r.totalRevenueBRL),
        csvNumber(r.campaignRevenueBRL),
        csvNumber(r.flowRevenueBRL),
        csvNumber(r.attributedRevenueBRL),
        csvNumber(r.totalRevenueBRL > 0 ? (r.attributedRevenueBRL / r.totalRevenueBRL) * 100 : 0),
      ]),
    )
    downloadCsv(`auditoria-${mode}.csv`, csv)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[880px] p-0 gap-0 overflow-hidden bg-[var(--ops-card)] border-[var(--ops-border)]">
        <div className="px-5 pt-4 pb-3 border-b border-[var(--ops-border)]">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-[15px] font-semibold text-[var(--ops-title)]">
              {meta.title}
            </DialogTitle>
            <div className="flex-1" />
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--ops-border)] text-[11.5px] font-medium text-[var(--ops-text)] hover:bg-[var(--ops-hover)]"
            >
              <Icon icon={Download} customSize={13} /> CSV
            </button>
          </div>
          <p className="mt-1 text-[11.5px] text-[var(--ops-sec)]">{meta.note}</p>
          {view && (
            <div className="mt-2 flex items-center gap-2.5 text-[12px] tabular-nums flex-wrap">
              <span className="text-[var(--ops-text)]">
                Soma das linhas:{" "}
                <strong className="text-[var(--ops-title)]">
                  {mode === "taxa" ? fmtPct(view.computed) : fmtBRLFull(view.computed)}
                </strong>
              </span>
              {cardValue != null && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                    matches
                      ? "text-[var(--ops-pos)] bg-[var(--ops-pos)]/10"
                      : "text-[var(--ops-neg)] bg-[var(--ops-neg)]/10",
                  )}
                >
                  {matches ? "✓ confere com o card" : "≠ diverge do card — investigar"}
                </span>
              )}
              {data && (
                <span className="text-[var(--ops-mut)] text-[11px]">
                  {data.storesCount} lojas · {data.storesWithRevenue} com receita
                </span>
              )}
            </div>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {error ? (
            <CollectingState label={`Erro ao carregar: ${String(error.message || error)}`} />
          ) : !view ? (
            <CollectingState label="Carregando o detalhamento por loja…" />
          ) : view.kind === "clients" ? (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-[var(--ops-card)]">
                <tr>
                  <Th>Cliente</Th>
                  <Th right>Lojas</Th>
                  <Th right>Faturamento</Th>
                </tr>
              </thead>
              <tbody>
                {view.clients.map((c, i) => (
                  <tr key={c.name}>
                    <Td last={i === view.clients.length - 1} className="font-medium text-[var(--ops-title)]">{c.name}</Td>
                    <Td right last={i === view.clients.length - 1}>{c.lojas}</Td>
                    <Td right last={i === view.clients.length - 1}>{fmtBRLFull(c.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-[var(--ops-card)]">
                <tr>
                  <Th>Loja</Th>
                  <Th>Cliente</Th>
                  <Th right>Moeda</Th>
                  {mode === "taxa" || mode === "faturamento" ? <Th right>Fat. loja</Th> : null}
                  {mode !== "faturamento" && (
                    <>
                      <Th right>Campanhas</Th>
                      <Th right>Automações</Th>
                      <Th right>Atribuída</Th>
                    </>
                  )}
                  {mode === "taxa" && <Th right>Taxa</Th>}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r, i) => {
                  const last = i === view.rows.length - 1
                  const taxa = r.totalRevenueBRL > 0 ? (r.attributedRevenueBRL / r.totalRevenueBRL) * 100 : null
                  return (
                    <tr key={r.storeId}>
                      <Td last={last} className="font-medium text-[var(--ops-title)]">{r.storeName}</Td>
                      <Td last={last} className="text-[var(--ops-sec)]">{r.clientName}</Td>
                      <Td right last={last} className="text-[var(--ops-mut)]">{r.currency}</Td>
                      {mode === "taxa" || mode === "faturamento" ? (
                        <Td right last={last}>{fmtBRLFull(r.totalRevenueBRL)}</Td>
                      ) : null}
                      {mode !== "faturamento" && (
                        <>
                          <Td right last={last}>{fmtBRLFull(r.campaignRevenueBRL)}</Td>
                          <Td right last={last}>{fmtBRLFull(r.flowRevenueBRL)}</Td>
                          <Td
                            right
                            last={last}
                            className={cn(mode === "atribuida" && "font-semibold text-[var(--ops-title)]")}
                          >
                            {fmtBRLFull(r.attributedRevenueBRL)}
                          </Td>
                        </>
                      )}
                      {mode === "taxa" && (
                        <Td right last={last} className="font-semibold">
                          {taxa == null ? "—" : fmtPct(taxa)}
                        </Td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
