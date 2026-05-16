"use client"

/**
 * Modal shell compartilhado pelos editores de Pesquisa & Diagnóstico.
 * Side drawer 520px, scroll interno, footer fixo com cancelar + salvar.
 */

import { X, Loader2 } from "lucide-react"

interface ModalShellProps {
  title: string
  subtitle?: string
  onClose: () => void
  onSave: () => void | Promise<void>
  saving?: boolean
  children: React.ReactNode
}

export function ModalShell({ title, subtitle, onClose, onSave, saving, children }: ModalShellProps) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80] bg-slate-900/30" />
      <div className="fixed top-0 right-0 bottom-0 w-[560px] max-w-[95vw] bg-white shadow-2xl z-[81] overflow-hidden flex flex-col">
        <header className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-slate-900 m-0 leading-tight">{title}</h2>
            {subtitle && <p className="text-[11.5px] text-slate-500 mt-0.5 m-0">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <footer
          className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0"
          style={{ borderColor: "rgba(0,0,0,0.06)", background: "#FAFAFA" }}
        >
          <button onClick={onClose} className="h-9 px-4 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </div>
    </>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[10.5px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
      style={{ borderColor: "rgba(0,0,0,0.10)" }}
    />
  )
}

export function TextArea({ value, onChange, rows = 4, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-md border text-[13px] outline-none focus:border-brand-500 resize-y"
      style={{ borderColor: "rgba(0,0,0,0.10)", lineHeight: 1.6 }}
    />
  )
}

export function ListEditor({
  values,
  onChange,
  placeholder,
  max,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  max?: number
}) {
  const cap = max ?? 10
  return (
    <div className="flex flex-col gap-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={v}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={placeholder}
            className="flex-1 h-9 px-3 rounded-md border text-[13px] outline-none focus:border-brand-500"
            style={{ borderColor: "rgba(0,0,0,0.10)" }}
          />
          <button
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
            title="Remover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {values.length < cap && (
        <button
          onClick={() => onChange([...values, ""])}
          className="h-9 px-3 rounded-md text-[12px] font-medium text-brand-600 hover:bg-brand-50 text-left border-2 border-dashed"
          style={{ borderColor: "rgba(78,98,216,0.20)" }}
        >
          + Adicionar item
        </button>
      )}
    </div>
  )
}
