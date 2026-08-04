"use client"

/**
 * Produtos do negócio (estilo Datacrazy/Pipedrive).
 *
 * Seção do drawer/ficha: lista os itens vendidos (qtd × preço − desc.),
 * permite adicionar do catálogo (com cadastro rápido inline) ou item
 * avulso, e edita qtd/preço/desconto inline. Toda mutação recalcula
 * deals.value no servidor — o valor do negócio passa a ser a soma das
 * linhas, e a UI trava a edição manual do valor enquanto houver itens.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Package, Plus, Trash2, X } from "lucide-react"
import { InlineEditField } from "./inline-edit-field"
import { dealTotals } from "@/lib/services/crm-deal-products"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface DealProductItem {
  id: string
  product_id: string | null
  name: string
  quantity: number
  unit_price: number
  discount_pct: number
  billing_type: string
  position: number
}

export interface DealProductsMeta {
  count: number
  total: number
  oneTime: number
  recurring: number
}

interface CatalogProduct {
  id: string
  name: string
  code: string | null
  unit_price: number
  billing_type: string
  recurring_interval: string | null
}

const fmtBRL = (v: number) =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  const raw = body?.error
  return (
    (typeof raw === "string" ? raw : (raw as { message?: string } | null)?.message) ??
    res.statusText
  )
}

// ─── Picker de produto (catálogo + cadastro rápido + item avulso) ───

export function ProductPicker({
  onSelect,
  createPrice,
  autoFocus,
  placeholder = "Buscar produto...",
}: {
  onSelect: (p: {
    id: string | null
    name: string
    unit_price: number
    billing_type: string
  }) => void
  /** Preço usado no cadastro rápido "Criar «q»" (vem do campo preço da linha). */
  createPrice?: number
  autoFocus?: boolean
  placeholder?: string
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const { data } = useSWR<{ products: CatalogProduct[]; schema_missing?: boolean }>(
    open ? `/api/crm/products?q=${encodeURIComponent(q)}&limit=30` : null,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  )
  const products = data?.products ?? []
  const schemaMissing = data?.schema_missing === true
  const trimmed = q.trim()
  const exactMatch = products.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  const pick = (p: CatalogProduct) => {
    onSelect({
      id: p.id,
      name: p.name,
      unit_price: Number(p.unit_price) || 0,
      billing_type: p.billing_type === "recurring" ? "recurring" : "one_time",
    })
    setQ("")
    setOpen(false)
  }

  const quickCreate = async () => {
    if (!trimmed || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, unit_price: createPrice ?? 0 }),
      })
      if (!res.ok) {
        setError(await readApiError(res))
        return
      }
      const json = await res.json()
      const product = (json.product ?? json.data?.product) as CatalogProduct | undefined
      if (product) pick(product)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={rootRef} className="relative" style={{ minWidth: 0, flex: 1 }}>
      <input
        className="crm-input w-full"
        style={{ height: 30, fontSize: 12.5 }}
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
      />
      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden"
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: "var(--crm-radius-md)",
            boxShadow: "var(--crm-shadow-lg)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {schemaMissing ? (
            <p style={{ padding: "10px 12px", fontSize: 12, color: "var(--crm-gray-500)" }}>
              Catálogo indisponível — rode a migration 20261067. Você ainda pode usar
              um item avulso abaixo.
            </p>
          ) : products.length === 0 && !trimmed ? (
            <p style={{ padding: "10px 12px", fontSize: 12, color: "var(--crm-gray-500)" }}>
              Digite para buscar no catálogo — ou crie o primeiro produto.
            </p>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className="flex w-full items-center justify-between gap-2 text-left hover:bg-slate-50"
                style={{ padding: "7px 12px", border: 0, background: "transparent", cursor: "pointer" }}
              >
                <span
                  className="truncate"
                  style={{ fontSize: 12.5, fontWeight: 500, color: "var(--crm-gray-900)" }}
                >
                  {p.name}
                  {p.code && (
                    <span style={{ color: "var(--crm-gray-400)", fontWeight: 400 }}> · {p.code}</span>
                  )}
                </span>
                <span
                  className="crm-tnum shrink-0"
                  style={{ fontSize: 12, color: "var(--crm-gray-600)" }}
                >
                  {fmtBRL(Number(p.unit_price) || 0)}
                  {p.billing_type === "recurring" && (
                    <span style={{ color: "var(--crm-gray-400)" }}>/mês</span>
                  )}
                </span>
              </button>
            ))
          )}

          {trimmed && !exactMatch && (
            <div style={{ borderTop: "1px solid var(--crm-gray-100)" }}>
              {!schemaMissing && (
                <button
                  type="button"
                  onClick={quickCreate}
                  disabled={creating}
                  className="flex w-full items-center gap-1.5 text-left hover:bg-slate-50"
                  style={{
                    padding: "7px 12px",
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 12.5,
                    color: "var(--crm-brand)",
                    fontWeight: 500,
                  }}
                >
                  <Plus className="h-3 w-3" />
                  {creating ? "Criando..." : `Criar produto "${trimmed}"`}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onSelect({
                    id: null,
                    name: trimmed,
                    unit_price: createPrice ?? 0,
                    billing_type: "one_time",
                  })
                  setQ("")
                  setOpen(false)
                }}
                className="flex w-full items-center gap-1.5 text-left hover:bg-slate-50"
                style={{
                  padding: "7px 12px",
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 12.5,
                  color: "var(--crm-gray-600)",
                }}
              >
                Usar &quot;{trimmed}&quot; como item avulso
              </button>
            </div>
          )}
          {error && (
            <p style={{ padding: "6px 12px", fontSize: 11.5, color: "var(--crm-danger-fg)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Seção de produtos do deal ──────────────────────────────────────

export function DealProductsSection({
  dealId,
  canEdit,
  onChanged,
}: {
  dealId: string
  canEdit: boolean
  /** Notifica o pai (drawer) para travar o valor manual + refetch. */
  onChanged?: (meta: DealProductsMeta) => void
}) {
  const { data, mutate } = useSWR<{
    items: DealProductItem[]
    schema_missing?: boolean
  }>(`/api/crm/deals/${dealId}/products`, fetcher, { revalidateOnFocus: false })

  const items = useMemo(() => data?.items ?? [], [data])
  const schemaMissing = data?.schema_missing === true
  const totals = useMemo(() => dealTotals(items), [items])

  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Informa o pai sempre que o conjunto muda (inclusive no load) — é o
  // que trava a edição manual do valor no HeroNumbers.
  const lastMeta = useRef<string>("")
  useEffect(() => {
    if (!data) return
    const key = `${items.length}:${totals.oneTime}:${totals.recurring}`
    if (key === lastMeta.current) return
    lastMeta.current = key
    onChanged?.({
      count: items.length,
      total: totals.total,
      oneTime: totals.oneTime,
      recurring: totals.recurring,
    })
  }, [data, items.length, totals, onChanged])

  const patchItem = async (itemId: string, update: Record<string, unknown>) => {
    setError(null)
    const res = await fetch(`/api/crm/deals/${dealId}/products/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const msg = await readApiError(res)
      setError(msg)
      throw new Error(msg)
    }
    await mutate()
  }

  const removeItem = async (itemId: string) => {
    setError(null)
    const res = await fetch(`/api/crm/deals/${dealId}/products/${itemId}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      setError(await readApiError(res))
      return
    }
    await mutate()
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="flex items-baseline justify-between mb-2">
        <h3
          className="m-0 flex items-center gap-1.5"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Produtos
          {items.length > 0 && (
            <span
              className="crm-tnum"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--crm-gray-500)",
                background: "var(--crm-gray-100)",
                borderRadius: 9999,
                padding: "1px 7px",
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              {items.length}
            </span>
          )}
        </h3>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--crm-brand)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
            }}
          >
            <Plus className="h-3 w-3" />
            Produto
          </button>
        )}
      </div>

      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {schemaMissing ? (
          <p style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--crm-gray-500)" }}>
            Produtos ainda não habilitados no banco — aplique a migration{" "}
            <code style={{ fontFamily: "var(--crm-font-mono)" }}>20261067_crm_products.sql</code>.
          </p>
        ) : items.length === 0 && !adding ? (
          <div
            className="flex items-center gap-2.5"
            style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--crm-gray-500)" }}
          >
            <Package className="h-4 w-4 shrink-0" style={{ color: "var(--crm-gray-400)" }} />
            <span>
              Nenhum produto lançado.
              {canEdit && " Adicione o que foi vendido — o valor do negócio vira a soma."}
            </span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--crm-gray-100)",
                    color: "var(--crm-gray-500)",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <th className="text-left" style={{ padding: "7px 12px", fontWeight: 600 }}>
                    Produto
                  </th>
                  <th className="text-right" style={{ padding: "7px 8px", fontWeight: 600 }}>
                    Qtd
                  </th>
                  <th className="text-right" style={{ padding: "7px 8px", fontWeight: 600 }}>
                    Preço
                  </th>
                  <th className="text-right" style={{ padding: "7px 8px", fontWeight: 600 }}>
                    Desc.
                  </th>
                  <th className="text-right" style={{ padding: "7px 8px", fontWeight: 600 }}>
                    Cobrança
                  </th>
                  <th className="text-right" style={{ padding: "7px 12px", fontWeight: 600 }}>
                    Total
                  </th>
                  {canEdit && <th style={{ width: 32 }} />}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const total =
                    Math.round(
                      item.quantity * item.unit_price * (1 - item.discount_pct / 100) * 100,
                    ) / 100
                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: "1px solid var(--crm-gray-100)" }}
                    >
                      <td
                        style={{
                          padding: "6px 12px",
                          fontWeight: 500,
                          color: "var(--crm-gray-900)",
                          maxWidth: 180,
                        }}
                        className="truncate"
                        title={item.name}
                      >
                        {item.name}
                      </td>
                      <td className="text-right crm-tnum" style={{ padding: "6px 8px" }}>
                        {canEdit ? (
                          <InlineEditField
                            type="number"
                            value={item.quantity}
                            min={0.01}
                            step={1}
                            onSave={(v) => patchItem(item.id, { quantity: parseFloat(v) || 1 })}
                            displayStyle={{ fontSize: 12.5 }}
                          />
                        ) : (
                          item.quantity
                        )}
                      </td>
                      <td className="text-right crm-tnum" style={{ padding: "6px 8px" }}>
                        {canEdit ? (
                          <InlineEditField
                            type="number"
                            value={item.unit_price}
                            min={0}
                            step={50}
                            prefix="R$ "
                            onSave={(v) => patchItem(item.id, { unit_price: parseFloat(v) || 0 })}
                            displayStyle={{ fontSize: 12.5 }}
                          />
                        ) : (
                          fmtBRL(item.unit_price)
                        )}
                      </td>
                      <td className="text-right crm-tnum" style={{ padding: "6px 8px" }}>
                        {canEdit ? (
                          <InlineEditField
                            type="number"
                            value={item.discount_pct}
                            min={0}
                            max={100}
                            step={5}
                            suffix="%"
                            onSave={(v) => patchItem(item.id, { discount_pct: parseFloat(v) || 0 })}
                            displayStyle={{ fontSize: 12.5 }}
                          />
                        ) : (
                          `${item.discount_pct}%`
                        )}
                      </td>
                      <td className="text-right" style={{ padding: "6px 8px" }}>
                        {canEdit ? (
                          <InlineEditField
                            type="select"
                            value={item.billing_type}
                            display={item.billing_type === "recurring" ? "Mensal" : "Único"}
                            options={[
                              { value: "one_time", label: "Único" },
                              { value: "recurring", label: "Mensal" },
                            ]}
                            onSave={(v) => patchItem(item.id, { billing_type: v })}
                            displayStyle={{ fontSize: 12, color: "var(--crm-gray-600)" }}
                          />
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--crm-gray-600)" }}>
                            {item.billing_type === "recurring" ? "Mensal" : "Único"}
                          </span>
                        )}
                      </td>
                      <td
                        className="text-right crm-tnum"
                        style={{ padding: "6px 12px", fontWeight: 600, color: "var(--crm-gray-900)" }}
                      >
                        {fmtBRL(total)}
                        {item.billing_type === "recurring" && (
                          <span style={{ fontSize: 11, color: "var(--crm-gray-500)", fontWeight: 400 }}>
                            /mês
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td style={{ padding: "6px 8px 6px 0" }}>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            title="Remover item"
                            className="flex h-6 w-6 items-center justify-center rounded-[4px]"
                            style={{
                              background: "transparent",
                              border: 0,
                              color: "var(--crm-gray-400)",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--crm-danger-fg)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--crm-gray-400)")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {adding && canEdit && (
          <AddProductRow
            dealId={dealId}
            onDone={async () => {
              setAdding(false)
              await mutate()
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {items.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1"
            style={{
              padding: "8px 12px",
              background: "var(--crm-gray-25)",
              borderTop: "1px solid var(--crm-gray-100)",
              fontSize: 12,
            }}
          >
            {totals.oneTime > 0 && totals.recurring > 0 && (
              <>
                <span style={{ color: "var(--crm-gray-500)" }}>
                  Único: <span className="crm-tnum" style={{ fontWeight: 600, color: "var(--crm-gray-700)" }}>{fmtBRL(totals.oneTime)}</span>
                </span>
                <span style={{ color: "var(--crm-gray-500)" }}>
                  Mensal: <span className="crm-tnum" style={{ fontWeight: 600, color: "var(--crm-gray-700)" }}>{fmtBRL(totals.recurring)}/mês</span>
                </span>
              </>
            )}
            <span style={{ color: "var(--crm-gray-600)" }}>
              Total do negócio:{" "}
              <span
                className="crm-tnum"
                style={{ fontWeight: 700, color: "var(--crm-gray-900)", fontSize: 13 }}
              >
                {fmtBRL(totals.total)}
              </span>
            </span>
          </div>
        )}
      </div>

      {error && (
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--crm-danger-fg)" }}>{error}</p>
      )}
    </div>
  )
}

// ─── Linha de adição ────────────────────────────────────────────────

function AddProductRow({
  dealId,
  onDone,
  onCancel,
}: {
  dealId: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<{
    id: string | null
    name: string
    billing_type: string
  } | null>(null)
  const [qty, setQty] = useState("1")
  const [price, setPrice] = useState("")
  const [discount, setDiscount] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!selected || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selected.id,
          name: selected.name,
          quantity: parseFloat(qty) || 1,
          unit_price: parseFloat(price) || 0,
          discount_pct: parseFloat(discount) || 0,
          billing_type: selected.billing_type === "recurring" ? "recurring" : "one_time",
        }),
      })
      if (!res.ok) {
        setError(await readApiError(res))
        return
      }
      await onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        padding: "10px 12px",
        borderTop: "1px solid var(--crm-gray-100)",
        background: "var(--crm-gray-25)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {selected ? (
          <span
            className="inline-flex items-center gap-1.5 truncate"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              background: "var(--crm-gray-100)",
              borderRadius: 6,
              padding: "4px 8px",
              maxWidth: 220,
            }}
          >
            <span className="truncate">{selected.name}</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--crm-gray-500)", display: "flex" }}
              aria-label="Trocar produto"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <ProductPicker
            autoFocus
            createPrice={parseFloat(price) || 0}
            onSelect={(p) => {
              setSelected({ id: p.id, name: p.name, billing_type: p.billing_type })
              if (!price && p.unit_price > 0) setPrice(String(p.unit_price))
            }}
          />
        )}
        <input
          className="crm-input crm-tnum"
          style={{ height: 30, width: 58, fontSize: 12.5, textAlign: "right" }}
          type="number"
          min={0.01}
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          title="Quantidade"
          aria-label="Quantidade"
        />
        <input
          className="crm-input crm-tnum"
          style={{ height: 30, width: 100, fontSize: 12.5, textAlign: "right" }}
          type="number"
          min={0}
          step="any"
          placeholder="Preço R$"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          title="Preço unitário"
          aria-label="Preço unitário"
        />
        <input
          className="crm-input crm-tnum"
          style={{ height: 30, width: 72, fontSize: 12.5, textAlign: "right" }}
          type="number"
          min={0}
          max={100}
          step="any"
          placeholder="Desc %"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          title="Desconto (%)"
          aria-label="Desconto em porcento"
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="crm-button-ghost"
            style={{ height: 30 }}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="crm-button-primary"
            style={{ height: 30, opacity: !selected || saving ? 0.5 : 1 }}
            disabled={!selected || saving}
            onClick={submit}
          >
            {saving ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </div>
      {error && (
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--crm-danger-fg)" }}>{error}</p>
      )}
    </div>
  )
}
