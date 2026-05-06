"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

interface NewLeadDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: (leadId: string) => void
}

export function NewLeadDialog({ open, onClose, onCreated }: NewLeadDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [source, setSource] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName("")
      setEmail("")
      setPhone("")
      setCompany("")
      setSource("")
      setNotes("")
      setError(null)
    }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email || null,
          phone: phone || null,
          company: company || null,
          source: source || null,
          notes: notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar lead")
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
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=open]:zoom-in-95"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-lg)",
            width: "90vw",
            maxWidth: 480,
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "var(--crm-duration-normal)",
            boxShadow: "var(--crm-shadow-lg)",
          }}
        >
          <form onSubmit={submit}>
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--crm-gray-200)" }}
            >
              <DialogPrimitive.Title
                style={{
                  fontSize: "var(--crm-text-md)",
                  fontWeight: "var(--crm-weight-medium)",
                  color: "var(--crm-gray-900)",
                }}
              >
                Novo lead
              </DialogPrimitive.Title>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
                style={{ borderRadius: "var(--crm-radius-md)", color: "var(--crm-gray-500)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <Field label="Nome *">
                <input
                  className="crm-input w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maria Silva"
                  autoFocus
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email">
                  <input
                    className="crm-input w-full"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </Field>
                <Field label="Telefone">
                  <input
                    className="crm-input w-full"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Empresa">
                  <input
                    className="crm-input w-full"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </Field>
                <Field label="Fonte">
                  <input
                    className="crm-input w-full"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Form site, Indicacao..."
                  />
                </Field>
              </div>
              <Field label="Notas">
                <textarea
                  className="crm-input w-full"
                  style={{ height: "auto", minHeight: 60, padding: 10, resize: "vertical" }}
                  placeholder="Contexto inicial..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              {error && (
                <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
                  {error}
                </p>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-50)" }}
            >
              <button type="button" className="crm-button-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="crm-button-primary"
                disabled={submitting || !name.trim()}
                style={{ opacity: submitting || !name.trim() ? 0.5 : 1 }}
              >
                {submitting ? "Criando..." : "Criar lead"}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
