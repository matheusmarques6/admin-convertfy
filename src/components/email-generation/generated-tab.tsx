"use client"

/**
 * Aba Geradas do hub de Geração de Emails (maquete EG).
 *
 * Visão inicial: tabela global de execuções recentes do pipeline (loja, flow,
 * assunto, status, blocos, custo, quando) via /api/admin/generated-emails.
 * Clicar numa linha abre o inspector existente (blueprint + HTML montado)
 * daquela loja/email, com botão de voltar.
 */

import { useState } from "react"
import useSWR from "swr"
import { FileText, Loader2 } from "lucide-react"
import { FLOW_TYPE_LABELS } from "./flow-labels"
import { GeneratedInspector } from "./generated-inspector"
import { C, F, TNUM } from "./ui/eg-theme"
import {
  EGBadge,
  EGSecTitle,
  EGSelect,
  type EGBadgeTone,
} from "./ui/eg-atoms"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface GeneratedRow {
  email_id: string
  email_number: number
  email_name: string | null
  subject: string | null
  status: string
  status_bucket: "success" | "error" | "running"
  cost_cents: number
  batch_id: string | null
  store_id: string | null
  store_name: string
  flow_type: string
  blocks_count: number
  when: string
}

const BUCKET_LABELS: Record<
  GeneratedRow["status_bucket"],
  { label: string; tone: EGBadgeTone }
> = {
  success: { label: "Sucesso", tone: "pos" },
  error: { label: "Erro", tone: "neg" },
  running: { label: "Em andamento", tone: "info" },
}

const GRID = "1.4fr 1fr 2fr 0.9fr 0.7fr 0.8fr 1fr"

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${dm} ${hm}`
}

export function GeneratedTab() {
  const [statusFilter, setStatusFilter] = useState("")
  const [storeFilter, setStoreFilter] = useState("")
  const [drill, setDrill] = useState<{ storeId: string; key: string } | null>(
    null,
  )

  const { data: storesData } = useSWR<{
    stores: Array<{ id: string; store_name: string }>
  }>("/api/admin/stores", fetcher)
  const stores = storesData?.stores ?? []

  const params = new URLSearchParams()
  if (statusFilter) params.set("status", statusFilter)
  if (storeFilter) params.set("store_id", storeFilter)
  const qs = params.toString()

  const { data, isLoading } = useSWR<{
    items?: GeneratedRow[]
    data?: { items?: GeneratedRow[] }
  }>(`/api/admin/generated-emails${qs ? `?${qs}` : ""}`, fetcher, {
    refreshInterval: 30_000,
  })
  const items = data?.items ?? data?.data?.items ?? []

  if (drill) {
    return (
      <GeneratedInspector
        initialStoreId={drill.storeId}
        initialKey={drill.key}
        onBack={() => setDrill(null)}
      />
    )
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <EGSecTitle
          icon={<FileText size={18} />}
          title="Emails gerados"
          sub="Execuções recentes do pipeline. Status, blocos, custo e loja de destino. Clique numa linha para inspecionar blueprint e HTML."
        />
        <div style={{ display: "flex", gap: 8, flexShrink: 0, width: 380 }}>
          <div style={{ flex: 1 }}>
            <EGSelect
              value={storeFilter}
              onChange={setStoreFilter}
              placeholder="Todas as lojas"
              options={stores.map((s) => ({
                value: s.id,
                label: s.store_name,
              }))}
            />
          </div>
          <div style={{ width: 150, flexShrink: 0 }}>
            <EGSelect
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Todos os status"
              options={[
                { value: "success", label: "Sucesso" },
                { value: "running", label: "Em andamento" },
                { value: "error", label: "Erro" },
              ]}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          background: C.white,
          overflow: "hidden",
          boxShadow: C.shadowSm,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: 12,
            padding: "11px 18px",
            borderBottom: `1px solid ${C.border}`,
            background: C.g25,
          }}
        >
          {["Loja", "Flow", "Assunto", "Status", "Blocos", "Custo", "Quando"].map(
            (h) => (
              <span
                key={h}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.g400,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontFamily: F.sans,
                }}
              >
                {h}
              </span>
            ),
          )}
        </div>

        {isLoading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 40,
              color: C.g400,
            }}
          >
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              fontSize: 13,
              color: C.g400,
              fontFamily: F.sans,
            }}
          >
            Nenhuma execução do pipeline encontrada
            {statusFilter || storeFilter ? " com estes filtros" : ""}.
          </div>
        )}

        {items.map((g) => {
          const bucket = BUCKET_LABELS[g.status_bucket]
          return (
            <button
              key={g.email_id}
              type="button"
              onClick={() =>
                g.store_id &&
                setDrill({
                  storeId: g.store_id,
                  key: `${g.flow_type}:${g.email_number}`,
                })
              }
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 12,
                padding: "13px 18px",
                alignItems: "center",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${C.border}`,
                cursor: g.store_id ? "pointer" : "default",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.g800,
                  fontFamily: F.sans,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {g.store_name}
              </span>
              <span
                style={{ fontSize: 12.5, color: C.g600, fontFamily: F.sans }}
              >
                {FLOW_TYPE_LABELS[g.flow_type] ?? g.flow_type}{" "}
                <span style={{ color: C.g400 }}>#{g.email_number}</span>
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  color: C.g600,
                  fontFamily: F.sans,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={g.subject ?? undefined}
              >
                {g.subject ?? g.email_name ?? "—"}
              </span>
              <span>
                <EGBadge tone={bucket.tone} dot>
                  {bucket.label}
                </EGBadge>
              </span>
              <span
                style={{
                  ...TNUM,
                  fontSize: 12.5,
                  color: C.g600,
                  fontFamily: F.sans,
                }}
              >
                {g.blocks_count || "—"}
              </span>
              <span
                style={{
                  ...TNUM,
                  fontSize: 12.5,
                  color: C.g600,
                  fontFamily: F.sans,
                }}
              >
                {g.cost_cents > 0
                  ? `US$ ${(g.cost_cents / 100).toFixed(2)}`
                  : "—"}
              </span>
              <span
                style={{
                  ...TNUM,
                  fontSize: 12,
                  color: C.g400,
                  fontFamily: F.sans,
                }}
              >
                {fmtWhen(g.when)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
