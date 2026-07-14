"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { BarChart3, FileText, Layers, Link2, Pencil, Plus } from "lucide-react"
import { ROUTES } from "@/lib/routes"
import { NewCsFormDialog } from "./new-cs-form-dialog"

/**
 * Aba "Formularios" do modulo Customer Success — porta do prototipo Figma
 * Make (grid de cards) ligada aos forms REAIS: GET /api/crm/forms?scope=cs.
 * "Novo formulario" reusa NewFormDialog (scope=cs). Editar abre o detalhe
 * real do form.
 */

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => j?.data ?? j)

interface FormRow {
  id: string
  name: string
  slug: string | null
  description: string | null
  status: "draft" | "published" | "archived" | string
  submissions_count: number | null
  views_count: number | null
  updated_at: string | null
  pipeline: { id: string; name: string; color: string | null } | null
}

function relTime(iso: string | null): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return "ontem"
  return `há ${d}d`
}

export function FormulariosTab() {
  const { data, mutate } = useSWR<{
    forms?: FormRow[]
    data?: { forms: FormRow[] }
  }>("/api/crm/forms?scope=cs", fetcher)

  const forms = useMemo<FormRow[]>(
    () => data?.data?.forms ?? data?.forms ?? [],
    [data],
  )

  const [newDialogOpen, setNewDialogOpen] = useState(false)

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 16,
      }}
    >
      {forms.map((f) => (
        <FormCard key={f.id} form={f} />
      ))}

      {/* Novo formulario */}
      <button
        type="button"
        onClick={() => setNewDialogOpen(true)}
        className="cf-focusable"
        style={{
          background: "none",
          border: "1.5px dashed var(--crm-gray-300)",
          borderRadius: 12,
          minHeight: 260,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: "pointer",
          color: "var(--crm-gray-500)",
          fontFamily: "var(--crm-font-sans)",
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: "var(--crm-blue-50)",
            color: "var(--crm-brand)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus className="h-[22px] w-[22px]" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--crm-gray-700)" }}>
          Novo formulário
        </span>
        <span style={{ fontSize: 11.5, color: "var(--crm-gray-400)" }}>
          Vincule a uma pipeline CS
        </span>
      </button>

      <NewCsFormDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => {
          setNewDialogOpen(false)
          mutate()
        }}
      />
    </div>
  )
}

function FormCard({ form }: { form: FormRow }) {
  const draft = form.status === "draft"
  const archived = form.status === "archived"
  const submissions = form.submissions_count ?? 0
  const views = form.views_count ?? 0
  const rate = views > 0 ? Math.min(100, Math.round((submissions / views) * 100)) : 0
  const rateColor =
    rate >= 70 ? "var(--crm-pos)" : rate >= 40 ? "var(--crm-amber)" : rate === 0 ? "var(--crm-gray-300)" : "var(--crm-neg)"

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--crm-border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid var(--crm-gray-100)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: draft || archived ? "var(--crm-gray-100)" : "var(--crm-blue-50)",
              color: draft || archived ? "var(--crm-gray-400)" : "var(--crm-brand)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText className="h-[19px] w-[19px]" />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--crm-gray-900)", letterSpacing: "-0.01em" }}>
                {form.name}
              </span>
              <StatusBadge status={form.status} />
            </div>
            {form.description && (
              <div style={{ fontSize: 11.5, color: "var(--crm-gray-500)", marginTop: 4, lineHeight: 1.45 }}>
                {form.description}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline vinculado */}
      <div
        style={{
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--crm-gray-100)",
        }}
      >
        <span style={{ color: "var(--crm-gray-400)" }}>
          <Layers className="h-[13px] w-[13px]" />
        </span>
        <span style={{ fontSize: 11.5, color: "var(--crm-gray-500)" }}>Pipeline</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--crm-gray-700)" }}>
          {form.pipeline?.name ?? "—"}
        </span>
        <span className="crm-tnum" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--crm-gray-400)" }}>
          {views} views
        </span>
      </div>

      {/* Metricas */}
      <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Metric value={String(submissions)} label="respostas" />
        <Metric value={`${rate}%`} label="conversão" color={rateColor} />
        <Metric value={relTime(form.updated_at)} label="atualizado" />
      </div>

      {/* Barra de conversao */}
      <div style={{ padding: "0 18px 14px" }}>
        <div style={{ height: 6, background: "var(--crm-gray-100)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${rate}%`, height: "100%", background: rateColor, borderRadius: 4 }} />
        </div>
      </div>

      {/* Acoes */}
      <div
        style={{
          marginTop: "auto",
          padding: "12px 18px",
          borderTop: "1px solid var(--crm-gray-100)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Link
          href={ROUTES.ADMIN.OPERACIONAL.FORM_DETAIL(form.id)}
          className="inline-flex items-center gap-1.5 rounded-[6px] cf-focusable"
          style={{
            height: 30,
            padding: "0 10px",
            background: "#fff",
            border: "1px solid var(--crm-border)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textDecoration: "none",
          }}
        >
          <Pencil className="h-[13px] w-[13px]" /> Editar
        </Link>
        <Link
          href={ROUTES.ADMIN.OPERACIONAL.FORM_DETAIL(form.id)}
          className="inline-flex items-center gap-1.5 rounded-[6px] cf-focusable"
          style={{
            height: 30,
            padding: "0 10px",
            background: "none",
            border: "none",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-600)",
            textDecoration: "none",
          }}
        >
          <BarChart3 className="h-[13px] w-[13px]" /> Respostas
        </Link>
        <div style={{ flex: 1 }} />
        <CopyLinkButton formId={form.id} />
      </div>
    </div>
  )
}

function CopyLinkButton({ formId }: { formId: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copiar link do formulário"
      onClick={() => {
        const url =
          typeof window !== "undefined"
            ? window.location.origin + ROUTES.ADMIN.OPERACIONAL.FORM_DETAIL(formId)
            : ""
        if (url && navigator.clipboard) {
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
      }}
      className="cf-focusable"
      style={{
        background: "none",
        border: "1px solid var(--crm-border)",
        borderRadius: 6,
        padding: 6,
        cursor: "pointer",
        color: copied ? "var(--crm-pos)" : "var(--crm-gray-500)",
        display: "inline-flex",
      }}
    >
      <Link2 className="h-[14px] w-[14px]" />
    </button>
  )
}

function Metric({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div>
      <div className="crm-tnum" style={{ fontSize: 19, fontWeight: 700, color: color || "var(--crm-gray-900)" }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--crm-gray-400)" }}>{label}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; c: string; bg: string }> = {
    published: { label: "Ativo", c: "var(--crm-pos)", bg: "var(--crm-pos-bg)" },
    draft: { label: "Rascunho", c: "var(--crm-gray-500)", bg: "var(--crm-gray-100)" },
    archived: { label: "Arquivado", c: "var(--crm-gray-400)", bg: "var(--crm-gray-100)" },
  }
  const s = map[status] || map.draft
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.c,
        fontSize: 10.5,
        fontWeight: 700,
      }}
    >
      {status === "published" && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.c }} />
      )}
      {s.label}
    </span>
  )
}
