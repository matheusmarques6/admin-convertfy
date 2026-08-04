"use client"

/**
 * Fechamento da venda ganha — abre ao mover um negócio para Ganho.
 *
 * Num só lugar: confirma os dados do cliente (viram o cadastro
 * definitivo), mostra o que foi vendido e gera a cobrança no financeiro
 * — assinatura mensal (com 1ª mensalidade) e/ou cobrança única.
 * A cobrança cai em `unified_invoices`, a mesma fonte do onboarding e
 * do cash collect do funil: tudo sincronizado sem redigitação.
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { PartyPopper, X } from "lucide-react"
import {
  centsToNumber,
  dealTotals,
  formatCentsBRL,
  numberToCents,
} from "@/lib/services/crm-deal-products"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PAYMENT_METHOD_OPTIONS = [
  { value: "pix_direto", label: "PIX direto" },
  { value: "asaas", label: "Asaas" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão" },
  { value: "wise", label: "Wise" },
]

const fmtBRL = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const plusDays = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toISOString().split("T")[0]
}

interface DealPayload {
  deal?: {
    id: string
    title: string
    value: number | null
    client?: { id: string; name: string; email?: string | null; phone?: string | null; company?: string | null } | null
    lead?: { name: string; email?: string | null; phone?: string | null; company?: string | null } | null
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
  }>
}

export function WonDealDialog({
  dealId,
  onClose,
  onDone,
}: {
  dealId: string | null
  onClose: () => void
  /** Chamado após gerar cobrança (refetch do board + toast no caller). */
  onDone: (msg: string) => void
}) {
  const open = !!dealId
  const { data: dealData } = useSWR<DealPayload>(
    dealId ? `/api/crm/deals/${dealId}` : null,
    fetcher,
  )
  const { data: itemsData } = useSWR<ItemsPayload>(
    dealId ? `/api/crm/deals/${dealId}/products` : null,
    fetcher,
  )

  const deal = dealData?.deal
  const items = useMemo(() => itemsData?.items ?? [], [itemsData])
  const totals = useMemo(() => dealTotals(items), [items])

  // Dados do cliente (pré-preenchidos do cliente/lead)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")

  // Cobrança
  const [wantSub, setWantSub] = useState(false)
  const [subCents, setSubCents] = useState("")
  const [subDue, setSubDue] = useState(plusDays(7))
  const [wantCharge, setWantCharge] = useState(false)
  const [chargeCents, setChargeCents] = useState("")
  const [chargeDue, setChargeDue] = useState(plusDays(3))
  const [method, setMethod] = useState("pix_direto")

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)

  // Pré-preenche UMA vez quando os dados chegam (não sobrescreve o que
  // o usuário já digitou em re-render).
  useEffect(() => {
    if (!open) {
      setSeeded(false)
      return
    }
    if (seeded || !deal) return
    const src = deal.client ?? deal.lead
    setName(src?.name ?? "")
    setEmail(src?.email ?? "")
    setPhone(src?.phone ?? "")
    setCompany(src?.company ?? "")

    const recurring = totals.recurring
    const oneTime = totals.oneTime
    const dealValue = Number(deal.value) || 0
    if (recurring > 0) {
      setWantSub(true)
      setSubCents(numberToCents(recurring))
    } else if (oneTime === 0 && dealValue > 0) {
      // Sem produtos: oferece assinatura com o valor do negócio (modelo
      // recorrente é o padrão da casa) — o usuário desliga se for único.
      setWantSub(true)
      setSubCents(numberToCents(dealValue))
    }
    if (oneTime > 0) {
      setWantCharge(true)
      setChargeCents(numberToCents(oneTime))
    }
    setSeeded(true)
  }, [open, seeded, deal, totals])

  const canSubmit =
    !saving &&
    name.trim().length > 0 &&
    ((wantSub && centsToNumber(subCents) > 0) ||
      (wantCharge && centsToNumber(chargeCents) > 0))

  const submit = async () => {
    if (!dealId || !canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        client: {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
        },
      }
      if (wantSub && centsToNumber(subCents) > 0) {
        body.subscription = {
          value: centsToNumber(subCents),
          next_due_date: subDue,
          payment_method: method,
        }
      }
      if (wantCharge && centsToNumber(chargeCents) > 0) {
        body.charge = {
          value: centsToNumber(chargeCents),
          due_date: chargeDue,
          payment_method: method,
          description: deal ? `Entrada/Setup — ${deal.title}` : undefined,
        }
      }
      const res = await fetch(`/api/crm/deals/${dealId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: unknown } | null
        const raw = json?.error
        setError(
          (typeof raw === "string"
            ? raw
            : (raw as { message?: string } | undefined)?.message) ??
            "Não foi possível gerar a cobrança.",
        )
        return
      }
      const parts: string[] = []
      if (body.subscription) parts.push("assinatura mensal")
      if (body.charge) parts.push("cobrança única")
      onDone(`Venda fechada: cliente atualizado e ${parts.join(" + ")} no financeiro.`)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[60] bg-black/40"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-lg)",
            width: "94vw",
            maxWidth: 560,
            maxHeight: "92vh",
            fontFamily: "var(--crm-font-sans)",
            boxShadow: "var(--crm-shadow-lg)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-5 py-4"
            style={{ borderColor: "var(--crm-gray-200)" }}
          >
            <DialogPrimitive.Title
              className="flex items-center gap-2"
              style={{
                fontSize: "var(--crm-text-md)",
                fontWeight: "var(--crm-weight-medium)",
                color: "var(--crm-gray-900)",
              }}
            >
              <PartyPopper className="h-4 w-4" style={{ color: "var(--crm-success-fg)" }} />
              Venda ganha — fechar o ciclo
            </DialogPrimitive.Title>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
              style={{ borderRadius: "var(--crm-radius-md)", color: "var(--crm-gray-500)" }}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-4">
            {/* Cliente */}
            <section>
              <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--crm-gray-500)", marginBottom: 8 }}>
                Dados do cliente
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className="crm-input w-full sm:col-span-2"
                  placeholder="Nome *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="crm-input w-full"
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className="crm-input w-full"
                  placeholder="Telefone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <input
                  className="crm-input w-full sm:col-span-2"
                  placeholder="Empresa"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </section>

            {/* Produtos vendidos */}
            <section>
              <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--crm-gray-500)", marginBottom: 8 }}>
                O que foi vendido
              </h4>
              {items.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--crm-gray-500)", lineHeight: 1.5 }}>
                  Nenhum produto lançado neste negócio — os valores abaixo partem do
                  valor do negócio. Você pode lançar os produtos depois pela ficha.
                </p>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--crm-gray-200)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12.5,
                  }}
                >
                  {items.map((item) => {
                    const total =
                      Math.round(
                        item.quantity * item.unit_price * (1 - item.discount_pct / 100) * 100,
                      ) / 100
                    return (
                      <div key={item.id} className="flex items-baseline justify-between gap-2 py-0.5">
                        <span className="truncate" style={{ color: "var(--crm-gray-800)" }}>
                          {item.quantity > 1 ? `${item.quantity}× ` : ""}
                          {item.name}
                        </span>
                        <span className="crm-tnum shrink-0" style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
                          {fmtBRL(total)}
                          {item.billing_type === "recurring" && (
                            <span style={{ color: "var(--crm-gray-500)", fontWeight: 400 }}>/mês</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Cobrança */}
            <section>
              <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--crm-gray-500)", marginBottom: 8 }}>
                Gerar cobrança no financeiro
              </h4>

              <label className="flex cursor-pointer items-center gap-2.5" style={{ marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={wantSub}
                  onChange={(e) => setWantSub(e.target.checked)}
                  className="h-4 w-4 accent-[#4E62D8]"
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--crm-gray-900)" }}>
                  Assinatura mensal
                </span>
                <span style={{ fontSize: 11.5, color: "var(--crm-gray-500)" }}>
                  cria a recorrência + 1ª mensalidade
                </span>
              </label>
              {wantSub && (
                <div className="mb-3 flex flex-wrap items-center gap-2 pl-6">
                  <input
                    className="crm-input crm-tnum"
                    style={{ width: 130, textAlign: "right" }}
                    inputMode="numeric"
                    placeholder="0,00"
                    value={formatCentsBRL(subCents)}
                    onChange={(e) => setSubCents(e.target.value.replace(/\D/g, ""))}
                    aria-label="Valor mensal em reais"
                  />
                  <span style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>/mês · 1º venc.</span>
                  <input
                    className="crm-input"
                    style={{ width: 140 }}
                    type="date"
                    value={subDue}
                    onChange={(e) => setSubDue(e.target.value)}
                    aria-label="Primeiro vencimento da assinatura"
                  />
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2.5" style={{ marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={wantCharge}
                  onChange={(e) => setWantCharge(e.target.checked)}
                  className="h-4 w-4 accent-[#4E62D8]"
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--crm-gray-900)" }}>
                  Cobrança única
                </span>
                <span style={{ fontSize: 11.5, color: "var(--crm-gray-500)" }}>
                  setup, implantação, entrada
                </span>
              </label>
              {wantCharge && (
                <div className="mb-3 flex flex-wrap items-center gap-2 pl-6">
                  <input
                    className="crm-input crm-tnum"
                    style={{ width: 130, textAlign: "right" }}
                    inputMode="numeric"
                    placeholder="0,00"
                    value={formatCentsBRL(chargeCents)}
                    onChange={(e) => setChargeCents(e.target.value.replace(/\D/g, ""))}
                    aria-label="Valor da cobrança única em reais"
                  />
                  <span style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>venc.</span>
                  <input
                    className="crm-input"
                    style={{ width: 140 }}
                    type="date"
                    value={chargeDue}
                    onChange={(e) => setChargeDue(e.target.value)}
                    aria-label="Vencimento da cobrança única"
                  />
                </div>
              )}

              {(wantSub || wantCharge) && (
                <div className="flex items-center gap-2 pl-6">
                  <span style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>Forma:</span>
                  <select
                    className="crm-input"
                    style={{ width: 160 }}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    aria-label="Forma de pagamento"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--crm-gray-500)", lineHeight: 1.55 }}>
                A cobrança entra no financeiro do cliente e alimenta o cash collect do
                funil e o status de pagamento do onboarding — tudo pela mesma fonte.
              </p>
            </section>

            {error && (
              <p style={{ fontSize: 12.5, color: "var(--crm-danger-fg)" }}>{error}</p>
            )}
          </div>

          <div
            className="flex items-center justify-between gap-2 border-t px-5 py-3"
            style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-50)" }}
          >
            <button type="button" className="crm-button-ghost" onClick={onClose}>
              Agora não
            </button>
            <button
              type="button"
              className="crm-button-primary"
              onClick={submit}
              disabled={!canSubmit}
              style={{ opacity: canSubmit ? 1 : 0.5 }}
              title={
                canSubmit
                  ? undefined
                  : "Informe o nome do cliente e ao menos uma cobrança com valor"
              }
            >
              {saving ? "Gerando…" : "Concluir fechamento"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
