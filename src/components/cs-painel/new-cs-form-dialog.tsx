"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Check, FileText, Plus, X } from "lucide-react"

/**
 * Modal "Novo formulario" no design do prototipo Figma Make (modulo 08):
 * nome + descricao + pipeline + construtor de perguntas (tipos). Gera o
 * slug automaticamente a partir do nome (o backend exige slug) e mapeia os
 * tipos do prototipo para os field_type reais de POST /api/crm/forms.
 */

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => j?.data ?? j)

// Tipos do prototipo -> field_type real aceito pelo backend.
const FIELD_TYPES: Array<{ t: string; label: string; map: string }> = [
  { t: "text", label: "Texto curto", map: "text" },
  { t: "long", label: "Texto longo", map: "textarea" },
  { t: "choice", label: "Múltipla escolha", map: "radio" },
  { t: "scale", label: "Escala 1–10", map: "number" },
  { t: "date", label: "Data", map: "date" },
]

function slugify(s: string): string {
  const base = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
  return base.length >= 2 ? base : `form-${Math.floor(Math.random() * 100000)}`
}

interface PipelineOpt {
  id: string
  name: string
}
interface BuilderField {
  label: string
  type: string
}

const inputCss: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: "1px solid var(--crm-border)",
  borderRadius: 9,
  fontFamily: "var(--crm-font-sans)",
  fontSize: 13.5,
  color: "var(--crm-gray-800)",
  background: "#fff",
  outline: "none",
}

export function NewCsFormDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { data } = useSWR<{
    pipelines?: PipelineOpt[]
    data?: { pipelines: PipelineOpt[] }
  }>(open ? "/api/crm/pipelines?scope=cs" : null, fetcher)

  const pipelines = useMemo<PipelineOpt[]>(
    () => data?.data?.pipelines ?? data?.pipelines ?? [],
    [data],
  )

  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [pipelineId, setPipelineId] = useState<string>("")
  const [fields, setFields] = useState<BuilderField[]>([
    { label: "Como você avalia o resultado do mês?", type: "scale" },
    { label: "Comentários", type: "long" },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const valid = name.trim().length > 0 && fields.length >= 1
  const setF = (i: number, patch: Partial<BuilderField>) =>
    setFields((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)))
  const addF = () => setFields((fs) => [...fs, { label: "", type: "text" }])
  const rmF = (i: number) => setFields((fs) => fs.filter((_, k) => k !== i))

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    const mapped = fields
      .filter((f) => f.label.trim())
      .map((f, idx) => ({
        field_type: FIELD_TYPES.find((t) => t.t === f.type)?.map ?? "text",
        label: f.label.trim(),
        required: false,
        position: idx,
      }))
    const payloadBase = {
      name: name.trim(),
      description: desc.trim() || null,
      scope: "cs" as const,
      pipeline_id: pipelineId || null,
      fields: mapped,
    }

    async function post(slug: string) {
      const r = await fetch("/api/crm/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...payloadBase, slug }),
      })
      return r
    }

    try {
      let slug = slugify(name)
      let r = await post(slug)
      if (r.status === 409) {
        // slug em uso — tenta com sufixo
        slug = `${slug}-${Math.floor(Math.random() * 9999)}`
        r = await post(slug)
      }
      if (!r.ok) {
        const body = await r.json().catch(() => null)
        throw new Error(body?.error?.message || "Falha ao criar formulário")
      }
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", zIndex: 80 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          maxWidth: "94vw",
          maxHeight: "90vh",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 48px rgba(17,24,39,0.24)",
          zIndex: 81,
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--crm-font-sans)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--crm-gray-100)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText className="h-[19px] w-[19px]" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--crm-gray-900)", letterSpacing: "-0.01em" }}>
              Novo formulário
            </div>
            <div style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>
              Vincule a um pipeline e monte as perguntas
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--crm-gray-400)", display: "inline-flex" }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Nome do formulário">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Feedback Mensal"
              style={inputCss}
            />
          </Field>

          <Field label="Descrição" hint="opcional">
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Quando e por que este formulário é enviado…"
              style={{ ...inputCss, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.5 }}
            />
          </Field>

          <Field label="Pipeline vinculado" hint="opcional">
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              style={{ ...inputCss, appearance: "none", cursor: "pointer" }}
            >
              <option value="">Sem pipeline (só cria lead)</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Perguntas" hint={`${fields.length} campo${fields.length === 1 ? "" : "s"}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fields.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="crm-tnum"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: "var(--crm-blue-50)",
                      color: "var(--crm-brand)",
                      fontSize: 11,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <input
                    value={f.label}
                    onChange={(e) => setF(i, { label: e.target.value })}
                    placeholder="Texto da pergunta"
                    style={{ ...inputCss, height: 36, flex: 1 }}
                  />
                  <select
                    value={f.type}
                    onChange={(e) => setF(i, { type: e.target.value })}
                    style={{ ...inputCss, height: 36, width: 150, appearance: "none", cursor: "pointer", flexShrink: 0, fontSize: 12.5 }}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.t} value={t.t}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => rmF(i)}
                    disabled={fields.length <= 1}
                    title="Remover"
                    style={{
                      background: "none",
                      border: "1px solid var(--crm-border)",
                      borderRadius: 7,
                      padding: 7,
                      cursor: fields.length <= 1 ? "default" : "pointer",
                      color: fields.length <= 1 ? "var(--crm-gray-300)" : "var(--crm-gray-500)",
                      display: "inline-flex",
                      flexShrink: 0,
                    }}
                  >
                    <X className="h-[14px] w-[14px]" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addF}
              style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "1px dashed var(--crm-gray-300)",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontFamily: "var(--crm-font-sans)",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--crm-brand)",
              }}
            >
              <Plus className="h-[14px] w-[14px]" /> Adicionar pergunta
            </button>
          </Field>

          {error && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--crm-neg)",
                background: "var(--crm-neg-bg)",
                border: "1px solid var(--crm-neg-border)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--crm-gray-100)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "flex-end",
            background: "var(--crm-gray-25)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 38,
              padding: "0 14px",
              borderRadius: 8,
              background: "#fff",
              border: "1px solid var(--crm-border)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--crm-gray-700)",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || saving}
            className="inline-flex items-center gap-1.5"
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 8,
              background: valid && !saving ? "var(--crm-brand)" : "var(--crm-gray-300)",
              border: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: valid && !saving ? "pointer" : "default",
            }}
          >
            <Check className="h-[15px] w-[15px]" />
            {saving ? "Criando…" : "Criar formulário"}
          </button>
        </div>
      </div>
    </>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--crm-gray-700)" }}>{label}</label>
        {hint && <span style={{ fontSize: 11, color: "var(--crm-gray-400)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}
