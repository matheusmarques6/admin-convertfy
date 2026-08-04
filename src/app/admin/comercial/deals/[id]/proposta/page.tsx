"use client"

/**
 * Proposta comercial imprimível do negócio.
 *
 * Documento limpo com cliente, itens de produto (qtd × preço − desc.),
 * subtotais único/recorrente e condições — pronto para Cmd/Ctrl+P →
 * "Salvar como PDF" e mandar pro cliente. Sem lib de PDF: o print CSS
 * do browser gera um A4 fiel e o botão some na impressão.
 */

import { use, useMemo } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { dealTotals } from "@/lib/services/crm-deal-products"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface DealPayload {
  deal?: {
    id: string
    title: string
    value: number | null
    expected_close_date: string | null
    owner?: { name: string } | null
    client?: { name: string; company?: string | null; email?: string | null; phone?: string | null } | null
    lead?: { name: string; email?: string | null; phone?: string | null } | null
    notes?: string | null
  }
}

interface ItemsPayload {
  items?: Array<{
    id: string
    name: string
    quantity: number
    unit_price: number
    discount_pct: number
    billing_type: string
    note?: string | null
  }>
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export default function DealProposalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: dealData } = useSWR<DealPayload>(`/api/crm/deals/${id}`, fetcher)
  const { data: itemsData } = useSWR<ItemsPayload>(
    `/api/crm/deals/${id}/products`,
    fetcher,
  )

  const deal = dealData?.deal
  const items = useMemo(() => itemsData?.items ?? [], [itemsData])
  const totals = useMemo(() => dealTotals(items), [items])
  const contactName = deal?.client?.name ?? deal?.lead?.name ?? "Cliente"
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
  // Validade padrão: 15 dias — âncora de urgência comum em proposta.
  const validUntil = new Date(Date.now() + 15 * 86_400_000).toLocaleDateString("pt-BR")

  return (
    <div style={{ background: "#F4F5F7", minHeight: "100vh", padding: "24px 16px" }}>
      <style>{`
        @media print {
          .proposal-controls { display: none !important; }
          body { background: white !important; }
          nav, aside, header[data-app-header] { display: none !important; }
          .proposal-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      {/* Controles (fora da impressão) */}
      <div
        className="proposal-controls"
        style={{
          maxWidth: 760,
          margin: "0 auto 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link
          href={`/admin/comercial/deals/${id}/detail`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#475569",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={15} />
          Voltar ao negócio
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 36,
            padding: "0 16px",
            borderRadius: 6,
            border: 0,
            background: "#1F1F1F",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Printer size={15} />
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* Documento */}
      <div
        className="proposal-sheet"
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          padding: "48px 56px",
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#0F172A",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "2px solid #0F172A",
            paddingBottom: 20,
            marginBottom: 28,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#64748B",
              }}
            >
              Proposta comercial
            </p>
            <h1 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
              {deal?.title ?? "Carregando..."}
            </h1>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "#64748B", lineHeight: 1.7 }}>
            <div>{today}</div>
            <div>
              Válida até <strong style={{ color: "#0F172A" }}>{validUntil}</strong>
            </div>
          </div>
        </header>

        <section style={{ display: "flex", gap: 40, marginBottom: 30, fontSize: 13 }}>
          <div>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
              Preparada para
            </p>
            <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{contactName}</p>
            {deal?.client?.company && (
              <p style={{ margin: "1px 0 0", color: "#475569" }}>{deal.client.company}</p>
            )}
            {(deal?.client?.email ?? deal?.lead?.email) && (
              <p style={{ margin: "1px 0 0", color: "#475569" }}>
                {deal?.client?.email ?? deal?.lead?.email}
              </p>
            )}
          </div>
          {deal?.owner?.name && (
            <div>
              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
                Responsável
              </p>
              <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{deal.owner.name}</p>
            </div>
          )}
        </section>

        {/* Itens */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #E2E8F0", textAlign: "left" }}>
              <th style={{ padding: "8px 0", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
                Item
              </th>
              <th style={{ padding: "8px 6px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", textAlign: "right" }}>
                Qtd
              </th>
              <th style={{ padding: "8px 6px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", textAlign: "right" }}>
                Valor unit.
              </th>
              <th style={{ padding: "8px 6px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", textAlign: "right" }}>
                Desc.
              </th>
              <th style={{ padding: "8px 0", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", textAlign: "right" }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "18px 0", color: "#94A3B8" }}>
                  Nenhum produto lançado neste negócio — adicione itens na seção
                  Produtos para compor a proposta.
                  {deal?.value ? ` Valor registrado: ${fmtBRL(Number(deal.value))}.` : ""}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const total =
                  Math.round(
                    item.quantity * item.unit_price * (1 - item.discount_pct / 100) * 100,
                  ) / 100
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "10px 0" }}>
                      <div style={{ fontWeight: 600 }}>
                        {item.name}
                        {item.billing_type === "recurring" && (
                          <span style={{ color: "#64748B", fontWeight: 400 }}> — mensal</span>
                        )}
                      </div>
                      {item.note && (
                        <div style={{ marginTop: 2, fontSize: 12, color: "#64748B", whiteSpace: "pre-wrap" }}>
                          {item.note}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {item.quantity}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtBRL(item.unit_price)}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: item.discount_pct > 0 ? "#0F172A" : "#94A3B8" }}>
                      {item.discount_pct > 0 ? `${item.discount_pct}%` : "—"}
                    </td>
                    <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {fmtBRL(total)}
                      {item.billing_type === "recurring" && (
                        <span style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>/mês</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Totais */}
        {items.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <div style={{ minWidth: 260, fontSize: 13 }}>
              {totals.oneTime > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#475569" }}>
                  <span>Investimento único</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totals.oneTime)}</span>
                </div>
              )}
              {totals.recurring > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#475569" }}>
                  <span>Assinatura mensal</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totals.recurring)}/mês</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0 0",
                  marginTop: 6,
                  borderTop: "2px solid #0F172A",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                <span>Total</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totals.total)}</span>
              </div>
            </div>
          </div>
        )}

        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #E2E8F0", fontSize: 11.5, color: "#94A3B8", lineHeight: 1.6 }}>
          Proposta válida até {validUntil}. Valores em reais (BRL). Itens
          recorrentes são cobrados mensalmente a partir da contratação.
        </footer>
      </div>
    </div>
  )
}
