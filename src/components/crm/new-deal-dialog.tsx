"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import useSWR from "swr"
import { useAuthStore } from "@/lib/store"
import { TagsSelector } from "./tags-selector"
import { ProductPicker } from "./deal-products-section"
import { DEAL_SOURCE_TYPES } from "@/lib/services/crm-sources"
import {
  centsToNumber,
  dealTotals,
  formatCentsBRL,
  numberToCents,
  parseBRNumber,
} from "@/lib/services/crm-deal-products"

interface ProductRow {
  key: number
  product_id: string | null
  name: string
  quantity: string
  /** Preço em centavos (string de dígitos) — máscara BRL no input. */
  unit_price_cents: string
  discount_pct: string
  billing_type: string
  /** Snapshot do ciclo da recorrência (vem do catálogo; null = mensal). */
  recurring_interval: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Tipos de origem padronizados pra metrificacao — fonte única em
// crm-sources.ts (o drawer edita a origem com o MESMO vocabulário).
const SOURCE_TYPES = DEAL_SOURCE_TYPES

interface NewDealDialogProps {
  open: boolean
  onClose: () => void
  pipelineId: string
  defaultStageId?: string
  stages: Array<{ id: string; name: string }>
  onCreated?: (dealId: string) => void
}

interface ClientLite {
  id: string
  name: string
  email: string | null
  company: string | null
}

interface StoreLite {
  id: string
  store_name: string
  store_url: string | null
  platform: string | null
  mrr_cents: number | null
  health_score: number | null
  client: {
    id: string
    name: string
    company: string | null
    email: string | null
    phone: string | null
  } | null
}

export function NewDealDialog({
  open,
  onClose,
  pipelineId,
  defaultStageId,
  stages,
  onCreated,
}: NewDealDialogProps) {
  const { user } = useAuthStore()

  const [title, setTitle] = useState("")
  const [stageId, setStageId] = useState(defaultStageId || stages[0]?.id || "")
  const [value, setValue] = useState<string>("")
  const [clientId, setClientId] = useState<string>("")
  const [clientSearch, setClientSearch] = useState("")
  const [storeId, setStoreId] = useState<string>("")
  const [storeSearch, setStoreSearch] = useState("")
  const [storeLabel, setStoreLabel] = useState("")
  const [phone, setPhone] = useState("")
  const [source, setSource] = useState("")
  const [sourceType, setSourceType] = useState("")
  const [sourceReferrer, setSourceReferrer] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [productRows, setProductRows] = useState<ProductRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Total das linhas de produto — quando existem, o campo Valor trava e
  // mostra a soma (mesma regra do drawer: produtos vencem valor manual).
  const productsTotal = dealTotals(
    productRows.map((r) => ({
      quantity: parseBRNumber(r.quantity) || 1,
      unit_price: centsToNumber(r.unit_price_cents),
      discount_pct: parseBRNumber(r.discount_pct) || 0,
      billing_type: r.billing_type,
    })),
  )

  // Search clients
  const { data: clientsData } = useSWR<{ clients: ClientLite[] }>(
    open && clientSearch.length >= 2 && !clientId
      ? `/api/clients/search?q=${encodeURIComponent(clientSearch)}`
      : null,
    fetcher,
  )
  const clientOptions = clientsData?.clients || []

  // Search stores — quando aberto e nao tem store selecionada, traz lista
  // (com ou sem query, ate 20 resultados). Selecao auto-preenche
  // title + client_id + phone.
  const { data: storesData } = useSWR<{
    stores: StoreLite[]
    data?: { stores: StoreLite[] }
  }>(
    open && !storeId
      ? `/api/client-stores/search?q=${encodeURIComponent(storeSearch)}&limit=20`
      : null,
    fetcher,
  )
  const storeOptions = storesData?.data?.stores ?? storesData?.stores ?? []

  // Reset SO quando o dialog abre. Antes incluia [defaultStageId, stages]
  // como deps, mas como o parent recriava 'stages' a cada render, o effect
  // re-disparava no meio da interacao e zerava tags/phone/notes selecionados.
  // Bug: usuario clicava em tag -> setTags atualizava -> parent re-renderizava
  // (novo stages array) -> effect rodava -> tags voltava pra []. Fix: depende
  // apenas de `open`, captura defaults dos props no momento da abertura.
  useEffect(() => {
    if (!open) return
    setTitle("")
    setStageId(defaultStageId || stages[0]?.id || "")
    setValue("")
    setProductRows([])
    setClientId("")
    setClientSearch("")
    setStoreId("")
    setStoreSearch("")
    setStoreLabel("")
    setPhone("")
    setSource("")
    setSourceType("")
    setSourceReferrer("")
    setTags([])
    setNotes("")
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selectStore = (s: StoreLite) => {
    setStoreId(s.id)
    setStoreLabel(s.store_name)
    setStoreSearch("")
    // Autopreenche titulo + cliente + phone se vazios
    if (!title.trim()) setTitle(s.store_name)
    if (s.client) {
      setClientId(s.client.id)
      setClientSearch(s.client.name)
      if (!phone.trim() && s.client.phone) setPhone(s.client.phone)
    }
    // Valor sugerido = MRR mensal (cents -> reais -> string em centavos)
    if (!value && s.mrr_cents && s.mrr_cents > 0) {
      setValue(String(s.mrr_cents))
    }
  }

  const clearStore = () => {
    setStoreId("")
    setStoreLabel("")
    setStoreSearch("")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !stageId) return

    setSubmitting(true)
    setError(null)
    try {
      // Tags vem do TagsSelector como array de names
      const tagList = tags

      const numericValue = value ? Number(value.replace(/\D/g, "")) / 100 : 0

      // owner_id e opcional — backend resolve pra current user quando ausente.
      // Mandamos so se o store ja foi populado (caso permissoes futuras
      // permitam delegar pra outro vendedor).
      const body: Record<string, unknown> = {
        pipeline_id: pipelineId,
        stage_id: stageId,
        title: title.trim(),
        value: numericValue,
        client_id: clientId || null,
        store_id: storeId || null,
        source: source || sourceType || null,
        source_type: sourceType || null,
        source_referrer: sourceReferrer.trim() || null,
        tags: tagList,
        notes: notes || null,
      }
      // Itens de produto — o backend recalcula o value pela soma.
      if (productRows.length > 0) {
        body.products = productRows
          .filter((r) => r.name.trim())
          .map((r) => ({
            product_id: r.product_id,
            name: r.name,
            quantity: parseBRNumber(r.quantity) || 1,
            unit_price: centsToNumber(r.unit_price_cents),
            discount_pct: parseBRNumber(r.discount_pct) || 0,
            billing_type: r.billing_type === "recurring" ? "recurring" : "one_time",
            recurring_interval: r.billing_type === "recurring" ? r.recurring_interval : null,
          }))
      }
      // Phone vai em custom_fields.contact_phone (deals nao tem coluna
      // dedicada pra phone — eh atributo de contato/lead, nao de deal).
      if (phone.trim()) {
        body.custom_fields = { contact_phone: phone.trim() }
      }
      if (user?.id) body.owner_id = user.id

      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar deal")
        return
      }
      onCreated?.(json.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-hidden data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-2xl)",
            width: "90vw",
            maxWidth: 560,
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
            boxShadow: "var(--crm-shadow-modal)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div
              className="flex items-start justify-between"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--crm-border)",
              }}
            >
              <div>
                <DialogPrimitive.Title
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--crm-gray-900)",
                    letterSpacing: "-0.01em",
                    margin: 0,
                  }}
                >
                  Novo deal
                </DialogPrimitive.Title>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--crm-gray-500)",
                    marginTop: 3,
                  }}
                >
                  {stages.find((s) => s.id === stageId)?.name ?? "Nova etapa"}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex items-center justify-center cf-focusable"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "var(--crm-radius-md)",
                  color: "var(--crm-gray-500)",
                  background: "transparent",
                  border: 0,
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="space-y-3 overflow-y-auto"
              style={{ padding: "20px 24px" }}
            >
              <Field label="Titulo *">
                <input
                  className="crm-input w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Loja XPTO — proposta inicial"
                  autoFocus
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Estagio *">
                  <select
                    className="crm-input w-full"
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    required
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={
                    productRows.length > 0 ? "Valor (soma dos produtos)" : "Valor (BRL)"
                  }
                >
                  <input
                    className="crm-input w-full"
                    inputMode="numeric"
                    placeholder="0,00"
                    disabled={productRows.length > 0}
                    value={
                      productRows.length > 0
                        ? formatBRL(String(Math.round(productsTotal.total * 100)))
                        : value
                          ? formatBRL(value)
                          : ""
                    }
                    onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                    style={productRows.length > 0 ? { opacity: 0.7 } : undefined}
                  />
                </Field>
              </div>

              {/* Produtos vendidos (opcional) — escolha do catálogo com
                  cadastro rápido; a soma vira o valor do negócio. */}
              <Field label="Produtos" as="div">
                <div className="space-y-1.5">
                  {productRows.map((row) => {
                    const rowTotal =
                      Math.round(
                        (parseBRNumber(row.quantity) || 1) *
                          centsToNumber(row.unit_price_cents) *
                          (1 - (parseBRNumber(row.discount_pct) || 0) / 100) *
                          100,
                      ) / 100
                    return (
                      <div key={row.key} className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="truncate"
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: "var(--crm-gray-900)",
                            flex: 1,
                            minWidth: 100,
                          }}
                          title={row.name}
                        >
                          {row.name}
                          {row.billing_type === "recurring" && (
                            <span style={{ color: "var(--crm-gray-400)", fontWeight: 400 }}>
                              {" "}/mês
                            </span>
                          )}
                        </span>
                        <input
                          className="crm-input crm-tnum"
                          style={{ height: 28, width: 52, fontSize: 12, textAlign: "right" }}
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(e) =>
                            setProductRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, quantity: e.target.value } : r,
                              ),
                            )
                          }
                          title="Quantidade"
                          aria-label="Quantidade"
                        />
                        <input
                          className="crm-input crm-tnum"
                          style={{ height: 28, width: 100, fontSize: 12, textAlign: "right" }}
                          inputMode="numeric"
                          placeholder="0,00"
                          value={formatCentsBRL(row.unit_price_cents)}
                          onChange={(e) =>
                            setProductRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? { ...r, unit_price_cents: e.target.value.replace(/\D/g, "") }
                                  : r,
                              ),
                            )
                          }
                          title="Preço unitário (R$)"
                          aria-label="Preço unitário em reais"
                        />
                        <input
                          className="crm-input crm-tnum"
                          style={{ height: 28, width: 64, fontSize: 12, textAlign: "right" }}
                          inputMode="decimal"
                          placeholder="% desc"
                          value={row.discount_pct}
                          onChange={(e) =>
                            setProductRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, discount_pct: e.target.value } : r,
                              ),
                            )
                          }
                          title="Desconto (%)"
                          aria-label="Desconto em porcento"
                        />
                        <span
                          className="crm-tnum"
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--crm-gray-700)",
                            minWidth: 76,
                            textAlign: "right",
                          }}
                        >
                          R${" "}
                          {rowTotal.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setProductRows((rows) => rows.filter((r) => r.key !== row.key))
                          }
                          aria-label={`Remover ${row.name}`}
                          className="flex h-6 w-6 items-center justify-center rounded-[4px]"
                          style={{
                            background: "transparent",
                            border: 0,
                            color: "var(--crm-gray-400)",
                            cursor: "pointer",
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                  <ProductPicker
                    placeholder={
                      productRows.length > 0
                        ? "Adicionar outro produto..."
                        : "Buscar no catálogo (opcional)..."
                    }
                    onSelect={(p) =>
                      setProductRows((rows) => [
                        ...rows,
                        {
                          key: Date.now() + rows.length,
                          product_id: p.id,
                          name: p.name,
                          quantity: "1",
                          unit_price_cents: numberToCents(p.unit_price),
                          discount_pct: "",
                          billing_type: p.billing_type,
                          recurring_interval: p.recurring_interval,
                        },
                      ])
                    }
                  />
                </div>
              </Field>

              <Field
                label="Loja existente (autopreenche título, cliente e telefone)"
                as="div"
              >
                {storeId ? (
                  <div
                    className="flex items-center justify-between gap-2"
                    style={{
                      padding: "8px 10px",
                      background: "var(--crm-gray-50)",
                      border: "1px solid var(--crm-gray-200)",
                      borderRadius: "var(--crm-radius-md)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--crm-gray-900)",
                        }}
                      >
                        {storeLabel}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--crm-gray-500)",
                        }}
                      >
                        Loja vinculada ao deal · trocar abaixo
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearStore}
                      className="flex items-center justify-center cf-focusable"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "var(--crm-radius-sm)",
                        color: "var(--crm-gray-500)",
                        background: "transparent",
                        border: 0,
                      }}
                      aria-label="Remover loja"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="crm-input w-full"
                      placeholder="Buscar loja por nome ou URL..."
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                    />
                    {storeOptions.length > 0 && (
                      <div
                        className="mt-1"
                        style={{
                          border: "1px solid var(--crm-gray-200)",
                          borderRadius: "var(--crm-radius-md)",
                          maxHeight: 200,
                          overflowY: "auto",
                          background: "var(--crm-gray-0)",
                        }}
                      >
                        {storeOptions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="block w-full text-left hover:bg-[color:var(--crm-gray-50)]"
                            style={{
                              padding: "8px 10px",
                              fontSize: "var(--crm-text-base)",
                              color: "var(--crm-gray-800)",
                              borderBottom: "1px solid var(--crm-gray-100)",
                            }}
                            onClick={() => selectStore(s)}
                          >
                            <div
                              style={{
                                fontWeight: "var(--crm-weight-medium)",
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <span>{s.store_name}</span>
                              {s.health_score != null && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    borderRadius: 3,
                                    color:
                                      s.health_score < 50
                                        ? "#991B1B"
                                        : s.health_score < 70
                                          ? "#92400E"
                                          : "#065F46",
                                    background:
                                      s.health_score < 50
                                        ? "#FEF2F2"
                                        : s.health_score < 70
                                          ? "#FFFBEB"
                                          : "#ECFDF5",
                                  }}
                                >
                                  health {s.health_score}
                                </span>
                              )}
                            </div>
                            {s.client?.name && (
                              <div
                                style={{
                                  fontSize: "var(--crm-text-xs)",
                                  color: "var(--crm-gray-500)",
                                  marginTop: 1,
                                }}
                              >
                                {s.client.name}
                                {s.mrr_cents && s.mrr_cents > 0
                                  ? ` · MRR R$ ${(s.mrr_cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                                  : ""}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {storeSearch.length >= 2 && storeOptions.length === 0 && (
                      <p
                        style={{
                          fontSize: "var(--crm-text-xs)",
                          color: "var(--crm-gray-500)",
                          marginTop: 4,
                        }}
                      >
                        Nenhuma loja encontrada com &quot;{storeSearch}&quot;.
                      </p>
                    )}
                  </>
                )}
              </Field>

              <Field label="Cliente (opcional, sem loja)" as="div">
                <input
                  className="crm-input w-full"
                  placeholder="Buscar cliente existente..."
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    if (e.target.value === "") setClientId("")
                  }}
                  disabled={storeId !== ""}
                  style={{
                    opacity: storeId ? 0.5 : 1,
                    cursor: storeId ? "not-allowed" : undefined,
                  }}
                />
                {clientOptions.length > 0 && clientSearch && !clientId && (
                  <div
                    className="mt-1"
                    style={{
                      border: "1px solid var(--crm-gray-200)",
                      borderRadius: "var(--crm-radius-md)",
                      maxHeight: 160,
                      overflowY: "auto",
                      background: "var(--crm-gray-0)",
                    }}
                  >
                    {clientOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full text-left hover:bg-[color:var(--crm-gray-50)]"
                        style={{
                          padding: "6px 10px",
                          fontSize: "var(--crm-text-base)",
                          color: "var(--crm-gray-800)",
                        }}
                        onClick={() => {
                          setClientId(c.id)
                          setClientSearch(c.name)
                        }}
                      >
                        <div style={{ fontWeight: "var(--crm-weight-medium)" }}>{c.name}</div>
                        {c.company && (
                          <div style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                            {c.company}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Telefone / WhatsApp do contato">
                <input
                  className="crm-input w-full"
                  type="tel"
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>

              {/* Tipo de origem (categoria) + Quem indicou/canal especifico */}
              <Field label="Tipo de origem" as="div">
                <div className="grid grid-cols-3 gap-1.5">
                  {SOURCE_TYPES.map((opt) => {
                    const active = sourceType === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSourceType(opt.value)
                          if (opt.value !== "indicacao") setSourceReferrer("")
                        }}
                        className={
                          "inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-[12px] font-medium border transition-colors " +
                          (active
                            ? "bg-brand-50 text-brand-700 border-brand-300"
                            : "bg-white text-slate-700 border-black/[0.06] hover:bg-slate-50")
                        }
                      >
                        <span>{opt.icon}</span>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              {/* Quem indicou / origem especifica */}
              {sourceType && (
                <Field
                  label={
                    sourceType === "indicacao"
                      ? "Quem indicou? (obrigatório)"
                      : "Origem específica (opcional)"
                  }
                >
                  <input
                    className="crm-input w-full"
                    placeholder={
                      sourceType === "indicacao"
                        ? "Ex: João Silva (cliente atual)"
                        : sourceType === "meta_ads"
                          ? "Ex: Campanha BF24 - Lookalike"
                          : sourceType === "google_ads"
                            ? "Ex: KW Convertfy Email"
                            : sourceType === "instagram"
                              ? "Ex: Reels @convertfy 12/05"
                              : "Ex: detalhe da origem"
                    }
                    value={sourceReferrer}
                    onChange={(e) => setSourceReferrer(e.target.value)}
                  />
                  {sourceType === "indicacao" && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Identifica o cliente/parceiro que indicou — permite
                      ranquear quem mais traz negócios.
                    </p>
                  )}
                </Field>
              )}

              {/* Fonte livre (legacy/free-text quando o tipo nao cobre) */}
              <Field label="Fonte (legado / texto livre)">
                <input
                  className="crm-input w-full"
                  placeholder="Ex: Inbound, parceiro X..."
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </Field>

              <Field label="Tags" as="div">
                <TagsSelector
                  entity="deal"
                  selected={tags}
                  onChange={setTags}
                  placeholder="Buscar ou criar tag…"
                />
              </Field>

              <Field label="Notas">
                <textarea
                  className="crm-input w-full"
                  style={{ height: "auto", minHeight: 60, padding: 10, resize: "vertical" }}
                  placeholder="Observacoes iniciais..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

              {error && (
                <p
                  style={{
                    fontSize: "var(--crm-text-sm)",
                    color: "var(--crm-danger-fg)",
                  }}
                >
                  {error}
                </p>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2"
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--crm-border)",
                background: "var(--crm-gray-25)",
                flexShrink: 0,
              }}
            >
              <button type="button" className="crm-button-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="crm-button-primary"
                disabled={submitting || !title.trim() || !stageId}
                style={{ opacity: submitting || !title.trim() || !stageId ? 0.5 : 1 }}
              >
                {submitting ? "Criando..." : "Criar deal"}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Field — caption + controle.
 *
 * `as="div"` é OBRIGATÓRIO quando o conteúdo não é um input simples (combobox
 * de tags, lista de resultados de busca...). Um <label> que envolve o controle
 * tem "label activation behavior": todo clique em descendente NÃO-interativo é
 * re-despachado pelo browser no primeiro elemento labelable de dentro. No
 * TagsSelector isso significa que, com uma tag já selecionada, o clique vai
 * parar no <button> de remover do chip — a tag some no mesmo batch em que foi
 * adicionada e o campo parece "não clicável".
 */
function Field({
  label,
  children,
  as = "label",
}: {
  label: string
  children: React.ReactNode
  as?: "label" | "div"
}) {
  const Wrapper = as
  return (
    <Wrapper className="block">
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
    </Wrapper>
  )
}

function formatBRL(centsStr: string): string {
  if (!centsStr) return ""
  const cents = parseInt(centsStr, 10) || 0
  const reais = Math.floor(cents / 100)
  const cen = cents % 100
  return `${reais.toLocaleString("pt-BR")},${cen.toString().padStart(2, "0")}`
}
