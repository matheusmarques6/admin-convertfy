"use client"

/**
 * Fila de triagem: cobranças do Asaas que entraram no espelho sem dono.
 *
 * Antes elas não entravam: `resolveClientForPayment` só acha quem já tem
 * `custom_fields.asaas_customer_id` gravado, `invoices.client_id` era NOT
 * NULL e o INSERT morria — 167 pagamentos fora da carteira numa rodada só
 * (10/09/2026), sem nada em tela. A carteira existe para mostrar esse
 * dinheiro, então a fatura passou a entrar sem dono e a parar aqui.
 *
 * Vincular ENSINA: o `asaas_customer_id` vai para o cliente escolhido e as
 * outras cobranças do mesmo pagador são vinculadas junto — a fila encolhe
 * sozinha e as próximas nem chegam a entrar nela.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, Link2, Loader2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = (body as { error?: unknown })?.error
    throw new Error(typeof e === "string" && e ? e : `Erro ${res.status}`)
  }
  return body
}

interface FaturaSemDono {
  id: string
  asaas_id: string | null
  asaas_customer_id: string | null
  amount: number | string
  due_date: string
  payment_date: string | null
  status: string | null
  description: string | null
}

interface ClientLite {
  id: string
  name: string
}

export function InvoicesSemCliente() {
  const { data, error, isLoading, mutate } = useSWR<{
    faturas: FaturaSemDono[]
    schema_missing?: boolean
  }>("/api/financial/invoice-client", fetcher, { revalidateOnFocus: false })

  const faturas = useMemo(() => data?.faturas ?? [], [data])
  const [aberta, setAberta] = useState<string | null>(null)

  // Fila vazia é o estado normal e não merece espaço: quando não há o que
  // triar, o bloco inteiro some em vez de anunciar "0 pendências".
  if (isLoading || data?.schema_missing) return null
  if (error) return null
  if (faturas.length === 0) return null

  const total = faturas.reduce((s, f) => s + Number(f.amount || 0), 0)

  return (
    <div
      className="mb-6 rounded-[8px] border p-4"
      style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)" }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4" style={{ color: "#b54708" }} />
        <h3 className="m-0 text-[13.5px] font-[620]" style={{ color: "var(--ops-title)" }}>
          Sem cliente — vincular
        </h3>
        <span className="text-[12px]" style={{ color: "var(--ops-sec)" }}>
          {faturas.length} {faturas.length === 1 ? "cobrança" : "cobranças"} ·{" "}
          {formatCurrency(total)}
        </span>
      </div>

      <p className="mb-3 text-[11.5px] leading-snug" style={{ color: "var(--ops-mut)" }}>
        Cobranças do Asaas cujo pagador ainda não bate com nenhum cliente da base. Elas
        estão fora da carteira até serem vinculadas. Vincular uma ensina o sistema: as
        outras do mesmo pagador vão junto, e as próximas já entram no cliente certo.
      </p>

      <div className="flex flex-col gap-2">
        {faturas.map((f) => (
          <LinhaDaFila
            key={f.id}
            fatura={f}
            aberta={aberta === f.id}
            onToggle={() => setAberta(aberta === f.id ? null : f.id)}
            onVinculada={() => {
              setAberta(null)
              mutate()
            }}
          />
        ))}
      </div>
    </div>
  )
}

function LinhaDaFila({
  fatura,
  aberta,
  onToggle,
  onVinculada,
}: {
  fatura: FaturaSemDono
  aberta: boolean
  onToggle: () => void
  onVinculada: () => void
}) {
  const [busca, setBusca] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { data } = useSWR<{ clients: ClientLite[] }>(
    aberta && busca.trim().length >= 2
      ? `/api/clients/search?q=${encodeURIComponent(busca.trim())}`
      : null,
    fetcher,
  )
  const opcoes = data?.clients ?? []

  const vincular = async (clientId: string) => {
    setSalvando(true)
    setErro(null)
    try {
      const res = await fetch("/api/financial/invoice-client", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: fatura.id, client_id: clientId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const e = (body as { error?: unknown })?.error
        throw new Error(typeof e === "string" && e ? e : "Falha ao vincular")
      }
      onVinculada()
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao vincular")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="rounded-[6px] border p-2.5"
      style={{ borderColor: "var(--ops-border)", background: "var(--ops-page)" }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-[600]" style={{ color: "var(--ops-title)" }}>
          {formatCurrency(Number(fatura.amount || 0))}
        </span>
        <span className="text-[12px]" style={{ color: "var(--ops-sec)" }}>
          {fatura.description || "Cobrança do Asaas"}
        </span>
        <span className="text-[11px]" style={{ color: "var(--ops-mut)" }}>
          vence {formatarDia(fatura.due_date)}
          {fatura.status ? ` · ${fatura.status}` : ""}
        </span>
        {/* O pagador no Asaas é o que torna a linha decidível — sem ele
            não há como saber de quem é a cobrança. */}
        {fatura.asaas_customer_id && (
          <code className="text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
            {fatura.asaas_customer_id}
          </code>
        )}
        <button
          onClick={onToggle}
          className="ml-auto flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[6px] border px-2.5 text-[11.5px] font-medium"
          style={{
            borderColor: "var(--ops-border)",
            background: "transparent",
            color: "var(--ops-sec)",
          }}
        >
          <Link2 className="h-3 w-3" />
          {aberta ? "Fechar" : "Vincular"}
        </button>
      </div>

      {aberta && (
        <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--ops-border)" }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente pelo nome…"
            aria-label="Buscar cliente"
            autoFocus
            className="h-[30px] w-full rounded-[6px] border px-2 text-[12.5px] outline-none"
            style={{
              borderColor: "var(--ops-border)",
              background: "var(--ops-card)",
              color: "var(--ops-title)",
            }}
          />
          {erro && (
            <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--crm-danger-fg, #b42318)" }}>
              {erro}
            </p>
          )}
          {busca.trim().length >= 2 && (
            <div className="mt-1.5 flex flex-col gap-1">
              {opcoes.length === 0 && (
                <p className="text-[11.5px]" style={{ color: "var(--ops-mut)" }}>
                  Nenhum cliente com esse nome.
                </p>
              )}
              {opcoes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => vincular(c.id)}
                  disabled={salvando}
                  className="flex cursor-pointer items-center gap-2 rounded-[6px] border px-2 py-1.5 text-left text-[12px] disabled:opacity-50"
                  style={{
                    borderColor: "var(--ops-border)",
                    background: "var(--ops-card)",
                    color: "var(--ops-title)",
                  }}
                >
                  {salvando && <Loader2 className="h-3 w-3 animate-spin" />}
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Dia sem passar por `Date`: `new Date("2026-09-08")` é meia-noite UTC. */
function formatarDia(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso
}
