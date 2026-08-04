"use client"

/**
 * Catálogo de produtos do comercial (estilo Datacrazy).
 *
 * O que a org vende — nome, preço padrão e recorrência. Os negócios
 * lançam ITENS a partir daqui (com snapshot de nome/preço), então
 * editar um produto muda apenas as próximas adições; excluir um produto
 * já usado em negócios apenas DESATIVA (histórico de venda não some).
 */

import { useState } from "react"
import useSWR from "swr"
import { Package, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Product {
  id: string
  name: string
  code: string | null
  description: string | null
  unit_price: number
  currency: string
  billing_type: string
  recurring_interval: string | null
  is_active: boolean
}

const fmtBRL = (v: number) =>
  "R$ " +
  Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const BILLING_LABEL: Record<string, string> = {
  one_time: "Único",
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
}

function billingLabel(p: Product): string {
  if (p.billing_type !== "recurring") return "Único"
  return BILLING_LABEL[p.recurring_interval ?? "monthly"] ?? "Recorrente"
}

async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  const raw = body?.error
  return (
    (typeof raw === "string" ? raw : (raw as { message?: string } | null)?.message) ??
    res.statusText
  )
}

export default function ProductsCatalogPage() {
  const [q, setQ] = useState("")
  const { data, mutate } = useSWR<{ products: Product[]; schema_missing?: boolean }>(
    `/api/crm/products?include_inactive=true&q=${encodeURIComponent(q)}`,
    fetcher,
    { keepPreviousData: true },
  )
  const products = data?.products ?? []
  const schemaMissing = data?.schema_missing === true

  const [editing, setEditing] = useState<Product | "new" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleActive = async (p: Product) => {
    setError(null)
    const res = await fetch(`/api/crm/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !p.is_active }),
    })
    if (!res.ok) {
      setError(await readApiError(res))
      return
    }
    mutate()
  }

  const remove = async (p: Product) => {
    if (
      !window.confirm(
        `Excluir "${p.name}"? Se ele já foi usado em negócios, será apenas desativado (o histórico das vendas permanece).`,
      )
    )
      return
    setError(null)
    const res = await fetch(`/api/crm/products/${p.id}`, { method: "DELETE" })
    if (!res.ok) {
      setError(await readApiError(res))
      return
    }
    mutate()
  }

  return (
    <CrmPageShell
      title="Produtos"
      subtitle="O que você vende — preço padrão e recorrência usados ao lançar produtos nos negócios"
      actions={
        <button
          className="crm-button-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
          onClick={() => setEditing("new")}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo produto
        </button>
      }
    >
      <div className="p-6">
        {schemaMissing && (
          <div
            className="crm-card mb-4"
            style={{ borderColor: "var(--crm-warning-fg, #B45309)", fontSize: 13 }}
          >
            Catálogo ainda não habilitado no banco — aplique a migration{" "}
            <code style={{ fontFamily: "var(--crm-font-mono)" }}>
              supabase/migrations/20261067_crm_products.sql
            </code>{" "}
            no Supabase.
          </div>
        )}

        <div className="mb-4" style={{ maxWidth: 320 }}>
          <input
            className="crm-input w-full"
            placeholder="Buscar produto..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error && (
          <p className="mb-3" style={{ fontSize: 13, color: "var(--crm-danger-fg)" }}>
            {error}
          </p>
        )}

        {products.length === 0 && !editing ? (
          <CrmEmptyState
            icon={<Package className="h-5 w-5" />}
            title={q ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
            description={
              q
                ? "Tente outro termo de busca."
                : "Cadastre o que você vende (planos, serviços, implantação). Ao criar um negócio, você escolhe daqui — e o valor do negócio vira a soma dos itens."
            }
            action={
              !q ? (
                <button className="crm-button-primary" onClick={() => setEditing("new")}>
                  Cadastrar primeiro produto
                </button>
              ) : undefined
            }
          />
        ) : (
          products.length > 0 && (
            <div className="crm-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--crm-gray-200)",
                        color: "var(--crm-gray-500)",
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        textAlign: "left",
                      }}
                    >
                      <th style={{ padding: "9px 14px", fontWeight: 600 }}>Produto</th>
                      <th className="text-right" style={{ padding: "9px 10px", fontWeight: 600 }}>
                        Preço
                      </th>
                      <th style={{ padding: "9px 10px", fontWeight: 600 }}>Cobrança</th>
                      <th style={{ padding: "9px 10px", fontWeight: 600 }}>Status</th>
                      <th style={{ width: 120 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: "1px solid var(--crm-gray-100)",
                          opacity: p.is_active ? 1 : 0.55,
                        }}
                      >
                        <td style={{ padding: "9px 14px" }}>
                          <div style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
                            {p.name}
                            {p.code && (
                              <span
                                style={{
                                  color: "var(--crm-gray-400)",
                                  fontWeight: 400,
                                  fontFamily: "var(--crm-font-mono)",
                                  fontSize: 12,
                                }}
                              >
                                {" "}
                                · {p.code}
                              </span>
                            )}
                          </div>
                          {p.description && (
                            <div
                              className="truncate"
                              style={{
                                fontSize: 12,
                                color: "var(--crm-gray-500)",
                                maxWidth: 420,
                              }}
                            >
                              {p.description}
                            </div>
                          )}
                        </td>
                        <td
                          className="text-right crm-tnum"
                          style={{ padding: "9px 10px", fontWeight: 600 }}
                        >
                          {fmtBRL(Number(p.unit_price) || 0)}
                          {p.billing_type === "recurring" && (
                            <span style={{ color: "var(--crm-gray-400)", fontWeight: 400 }}>
                              /{p.recurring_interval === "yearly" ? "ano" : p.recurring_interval === "quarterly" ? "tri" : "mês"}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "9px 10px", color: "var(--crm-gray-600)" }}>
                          {billingLabel(p)}
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: p.is_active
                                ? "var(--crm-success-fg)"
                                : "var(--crm-gray-500)",
                            }}
                          >
                            {p.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn title="Editar" onClick={() => setEditing(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title={p.is_active ? "Desativar" : "Reativar"}
                              onClick={() => toggleActive(p)}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn title="Excluir" danger onClick={() => remove(p)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {editing && (
          <ProductForm
            product={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              mutate()
            }}
          />
        )}
      </div>
    </CrmPageShell>
  )
}

function IconBtn({
  title,
  danger,
  onClick,
  children,
}: {
  title: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-[4px]"
      style={{
        background: "transparent",
        border: 0,
        cursor: "pointer",
        color: danger ? "var(--crm-danger-fg)" : "var(--crm-gray-500)",
      }}
    >
      {children}
    </button>
  )
}

// ─── Form criar/editar ──────────────────────────────────────────────

function ProductForm({
  product,
  onCancel,
  onSaved,
}: {
  product: Product | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(product?.name ?? "")
  const [code, setCode] = useState(product?.code ?? "")
  const [description, setDescription] = useState(product?.description ?? "")
  const [price, setPrice] = useState(
    product ? String(product.unit_price) : "",
  )
  const [billing, setBilling] = useState(
    product?.billing_type === "recurring"
      ? (product.recurring_interval ?? "monthly")
      : "one_time",
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        name,
        code: code.trim() || null,
        description: description.trim() || null,
        unit_price: parseFloat(price) || 0,
        billing_type: billing === "one_time" ? "one_time" : "recurring",
        recurring_interval: billing === "one_time" ? null : billing,
      }
      const res = await fetch(
        product ? `/api/crm/products/${product.id}` : "/api/crm/products",
        {
          method: product ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        setError(await readApiError(res))
        return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 crm-card" style={{ maxWidth: 560 }}>
      <h3
        style={{
          fontSize: "var(--crm-text-md)",
          fontWeight: "var(--crm-weight-medium)",
          color: "var(--crm-gray-900)",
          marginBottom: "var(--crm-space-3)",
        }}
      >
        {product ? `Editar "${product.name}"` : "Novo produto"}
      </h3>
      <div className="space-y-3">
        <Field label="Nome *">
          <input
            className="crm-input w-full"
            placeholder="Ex: Plano Performance"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço (R$) *">
            <input
              className="crm-input w-full crm-tnum"
              type="number"
              min={0}
              step="any"
              placeholder="0,00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </Field>
          <Field label="Cobrança">
            <select
              className="crm-input w-full"
              value={billing}
              onChange={(e) => setBilling(e.target.value)}
            >
              <option value="one_time">Único (setup, projeto)</option>
              <option value="monthly">Mensal (assinatura)</option>
              <option value="quarterly">Trimestral</option>
              <option value="yearly">Anual</option>
            </select>
          </Field>
        </div>
        <Field label="Código / SKU">
          <input
            className="crm-input w-full"
            style={{ fontFamily: "var(--crm-font-mono)" }}
            placeholder="Opcional"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Field label="Descrição">
          <textarea
            className="crm-input w-full"
            rows={2}
            placeholder="Opcional — aparece na busca do catálogo"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {error && (
          <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
            {error}
          </p>
        )}
        {product && (
          <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", lineHeight: 1.5 }}>
            Mudar preço ou nome vale para as PRÓXIMAS adições — negócios que já têm
            este produto mantêm o preço da época (snapshot).
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="crm-button-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="submit"
            className="crm-button-primary"
            disabled={submitting}
            style={{ opacity: submitting ? 0.5 : 1 }}
          >
            {submitting ? "Salvando..." : product ? "Salvar" : "Criar produto"}
          </button>
        </div>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        style={{
          display: "block",
          fontSize: "var(--crm-text-xs)",
          color: "var(--crm-gray-600)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
