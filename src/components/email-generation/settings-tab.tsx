"use client"

/**
 * Aba Configurações do hub de Geração de Emails.
 * Extraída de `email-generation-workspace.tsx` (o shell ficou fino).
 */

import { useState } from "react"
import useSWR from "swr"
import { Loader2, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/lib/hooks/use-toast"
import type { EmailGenerationSettings } from "@/types/email-generation"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function SettingsTab() {
  const { data, mutate, isLoading } = useSWR<{ settings: EmailGenerationSettings | null }>(
    "/api/admin/email-generation-settings?org_id=00000000-0000-0000-0000-000000000001",
    fetcher,
  )
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<EmailGenerationSettings>>({})
  const [emailInput, setEmailInput] = useState("")

  const settings = data?.settings
  const merged = {
    auto_trigger: form.auto_trigger ?? settings?.auto_trigger ?? false,
    max_parallel: form.max_parallel ?? settings?.max_parallel ?? 3,
    generate_images: form.generate_images ?? settings?.generate_images ?? true,
    notify_on_error: form.notify_on_error ?? settings?.notify_on_error ?? true,
    notify_on_success: form.notify_on_success ?? settings?.notify_on_success ?? false,
    notify_emails: form.notify_emails ?? settings?.notify_emails ?? [],
  }

  const dirty = Object.keys(form).length > 0

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/email-generation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: "00000000-0000-0000-0000-000000000001",
          ...form,
        }),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      setForm({})
      mutate()
      toast({ title: "Configurações salvas" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configurações" })
    } finally {
      setSaving(false)
    }
  }

  const addEmail = () => {
    const email = emailInput.trim()
    if (!email || !email.includes("@")) return
    const current = merged.notify_emails
    if (!current.includes(email)) {
      setForm((f) => ({ ...f, notify_emails: [...current, email] }))
    }
    setEmailInput("")
  }

  const removeEmail = (email: string) => {
    setForm((f) => ({
      ...f,
      notify_emails: merged.notify_emails.filter((e) => e !== email),
    }))
  }

  if (isLoading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-[600px] space-y-5">
      <div className="space-y-4 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Comportamento
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Trigger automático</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Iniciar geração automaticamente ao criar emails
            </p>
          </div>
          <Switch
            checked={merged.auto_trigger}
            onCheckedChange={(v) => setForm((f) => ({ ...f, auto_trigger: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Gerar imagens</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Incluir geração de imagens no pipeline
            </p>
          </div>
          <Switch
            checked={merged.generate_images}
            onCheckedChange={(v) => setForm((f) => ({ ...f, generate_images: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Execuções paralelas</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Máximo de agentes rodando simultaneamente
            </p>
          </div>
          <input
            type="number"
            value={merged.max_parallel}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                max_parallel: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)),
              }))
            }
            min={1}
            max={10}
            className="crm-input w-[80px] text-center"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Notificações
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Notificar em erros</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Enviar email quando uma geração falhar
            </p>
          </div>
          <Switch
            checked={merged.notify_on_error}
            onCheckedChange={(v) => setForm((f) => ({ ...f, notify_on_error: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Notificar em sucesso</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Enviar email quando a geração concluir com sucesso
            </p>
          </div>
          <Switch
            checked={merged.notify_on_success}
            onCheckedChange={(v) => setForm((f) => ({ ...f, notify_on_success: v }))}
          />
        </div>

        <div className="space-y-2">
          <p className="text-[13px] text-slate-700 dark:text-white/80">Emails para notificação</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
              placeholder="email@exemplo.com"
              className="crm-input flex-1"
            />
            <button
              type="button"
              onClick={addEmail}
              className="h-8 px-3 rounded-[6px] bg-slate-100 dark:bg-white/[0.06] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-200 dark:hover:bg-white/[0.10]"
            >
              Adicionar
            </button>
          </div>
          {merged.notify_emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {merged.notify_emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 px-2 py-0.5 rounded-full"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar configurações
          </button>
        </div>
      )}
    </div>
  )
}
