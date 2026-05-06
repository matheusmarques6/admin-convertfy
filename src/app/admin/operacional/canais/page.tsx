"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, Phone, CheckCircle2 } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Channel {
  id: string
  type: string
  provider: string
  display_name: string
  external_id: string
  is_active: boolean
  last_sync_at: string | null
  created_at: string
}

export default function ChannelsPage() {
  const { data, mutate } = useSWR<{ channels: Channel[] }>(
    "/api/crm/channels",
    fetcher,
  )

  const channels = data?.channels || []
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [businessAccountId, setBusinessAccountId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "whatsapp",
          display_name: name,
          whatsapp: {
            phone_number_id: phoneNumberId,
            access_token: accessToken,
            business_account_id: businessAccountId || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar channel")
        return
      }
      setCreating(false)
      setName("")
      setPhoneNumberId("")
      setAccessToken("")
      setBusinessAccountId("")
      mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CrmPageShell
      title="Canais conectados"
      subtitle="WhatsApp Cloud API oficial — adicione um phone_number_id por loja"
      actions={
        <button
          className="crm-button-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Conectar WhatsApp
        </button>
      }
    >
      <div className="p-6">
        {channels.length === 0 && !creating ? (
          <CrmEmptyState
            icon={<Phone className="h-5 w-5" />}
            title="Nenhum canal conectado"
            description="Configure a WhatsApp Cloud API com o phone_number_id e access_token gerados no Meta Business Suite."
            action={
              <button className="crm-button-primary" onClick={() => setCreating(true)}>
                Conectar agora
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {channels.map((c) => (
              <div key={c.id} className="crm-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center"
                    style={{
                      background: "var(--crm-success-bg)",
                      color: "var(--crm-success-fg)",
                      borderRadius: "var(--crm-radius-md)",
                    }}
                  >
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "var(--crm-text-md)",
                        fontWeight: "var(--crm-weight-medium)",
                        color: "var(--crm-gray-900)",
                      }}
                    >
                      {c.display_name}
                    </div>
                    <div style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", fontFamily: "var(--crm-font-mono)" }}>
                      WhatsApp · {c.external_id}
                    </div>
                  </div>
                </div>
                {c.is_active && (
                  <span
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: "var(--crm-success-fg)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontWeight: "var(--crm-weight-medium)",
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Ativo
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {creating && (
          <form
            onSubmit={submit}
            className="mt-6 crm-card"
            style={{ maxWidth: 560 }}
          >
            <h3
              style={{
                fontSize: "var(--crm-text-md)",
                fontWeight: "var(--crm-weight-medium)",
                color: "var(--crm-gray-900)",
                marginBottom: "var(--crm-space-3)",
              }}
            >
              Conectar WhatsApp Cloud API
            </h3>
            <div className="space-y-3">
              <Field label="Nome do canal *">
                <input
                  className="crm-input w-full"
                  placeholder="Ex: WhatsApp Loja Principal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Phone Number ID *">
                <input
                  className="crm-input w-full"
                  style={{ fontFamily: "var(--crm-font-mono)" }}
                  placeholder="123456789012345"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  required
                />
              </Field>
              <Field label="Access Token *">
                <input
                  className="crm-input w-full"
                  type="password"
                  style={{ fontFamily: "var(--crm-font-mono)" }}
                  placeholder="EAAxxxxxxxxx..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  required
                />
              </Field>
              <Field label="Business Account ID">
                <input
                  className="crm-input w-full"
                  style={{ fontFamily: "var(--crm-font-mono)" }}
                  placeholder="Opcional"
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                />
              </Field>
              {error && (
                <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>{error}</p>
              )}
              <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                Webhook URL pra registrar no Meta Business Suite:{" "}
                <code style={{ fontFamily: "var(--crm-font-mono)" }}>
                  /api/webhooks/whatsapp
                </code>
                . Verify token: variavel de ambiente{" "}
                <code style={{ fontFamily: "var(--crm-font-mono)" }}>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="crm-button-ghost" onClick={() => setCreating(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="crm-button-primary"
                  disabled={submitting}
                  style={{ opacity: submitting ? 0.5 : 1 }}
                >
                  {submitting ? "Conectando..." : "Conectar"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </CrmPageShell>
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
