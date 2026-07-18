"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Plus,
  Phone,
  CheckCircle2,
  Instagram,
  QrCode,
  AlertCircle,
  RefreshCw,
  Unplug,
  Trash2,
  Power,
} from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { EvolutionQrModal } from "@/components/crm/channels/evolution-qr-modal"

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
  /** Só canais provider=evolution (derivado seguro do config). */
  connection_state?: string
  owner_jid?: string | null
  needs_reconnect?: boolean
}

type ChannelKind = "whatsapp" | "instagram" | "evolution"

interface QrTarget {
  channelId: string
  channelName: string
  initialQr?: string | null
}

export default function ChannelsPage() {
  const { data, mutate } = useSWR<{ channels: Channel[] }>(
    "/api/crm/channels",
    fetcher,
  )

  const channels = data?.channels || []
  const [creating, setCreating] = useState<ChannelKind | null>(null)
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null)

  return (
    <CrmPageShell
      title="Canais conectados"
      subtitle="WhatsApp oficial (Cloud API), WhatsApp via QR e Instagram"
      actions={
        <div className="flex gap-2">
          <button
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
            onClick={() => setCreating("instagram")}
          >
            <Instagram className="h-3.5 w-3.5" />
            Conectar Instagram
          </button>
          <button
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
            onClick={() => setCreating("evolution")}
          >
            <QrCode className="h-3.5 w-3.5" />
            WhatsApp via QR
          </button>
          <button
            className="crm-button-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
            onClick={() => setCreating("whatsapp")}
          >
            <Plus className="h-3.5 w-3.5" />
            Conectar WhatsApp
          </button>
        </div>
      }
    >
      <div className="p-6">
        {channels.length === 0 && !creating ? (
          <CrmEmptyState
            icon={<Phone className="h-5 w-5" />}
            title="Nenhum canal conectado"
            description="Configure WhatsApp Cloud API e/ou Instagram Direct/Comments com os tokens gerados no Meta Business Suite — ou conecte um número via QR (não-oficial)."
            action={
              <button className="crm-button-primary" onClick={() => setCreating("whatsapp")}>
                Conectar agora
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {channels.map((c) => (
              <ChannelCard
                key={c.id}
                channel={c}
                onReconnect={() =>
                  setQrTarget({ channelId: c.id, channelName: c.display_name })
                }
                onChanged={() => mutate()}
              />
            ))}
          </div>
        )}

        {creating === "whatsapp" && (
          <WhatsAppForm
            onCancel={() => setCreating(null)}
            onCreated={() => {
              setCreating(null)
              mutate()
            }}
          />
        )}

        {creating === "evolution" && (
          <EvolutionForm
            onCancel={() => setCreating(null)}
            onCreated={(target) => {
              setCreating(null)
              mutate()
              setQrTarget(target)
            }}
          />
        )}

        {creating === "instagram" && (
          <InstagramForm
            onCancel={() => setCreating(null)}
            onCreated={() => {
              setCreating(null)
              mutate()
            }}
          />
        )}

        {qrTarget && (
          <EvolutionQrModal
            channelId={qrTarget.channelId}
            channelName={qrTarget.channelName}
            initialQr={qrTarget.initialQr}
            onClose={() => setQrTarget(null)}
            onConnected={() => mutate()}
          />
        )}
      </div>
    </CrmPageShell>
  )
}

// ─── Channel card (lista) ────────────────────────────────────────

function ChannelCard({
  channel,
  onReconnect,
  onChanged,
}: {
  channel: Channel
  onReconnect: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<"check" | "logout" | "remove" | "restart" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const isInstagram = channel.type === "instagram"
  const isEvolution = channel.provider === "evolution"

  // Consulta o estado LIVE na Evolution (pega instância zumbi em que o
  // config diz "open" mas a API está quebrada) e revalida a lista.
  const checkState = async () => {
    setBusy("check")
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/channels/${channel.id}/evolution/state`)
      const json = await res.json()
      if (!res.ok || json.error) {
        setActionError(json.error?.message || "Falha ao consultar o estado")
      }
      onChanged()
    } catch {
      setActionError("Falha ao consultar o estado")
    } finally {
      setBusy(null)
    }
  }

  // Reinicia o socket na Evolution usando as credenciais salvas — SEM
  // novo QR. É o remédio para instância zumbi (painel diz Conectado mas
  // envios falham/mensagens não chegam).
  const restart = async () => {
    setBusy("restart")
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/channels/${channel.id}/evolution/restart`, { method: "POST" })
      const json = await res.json()
      const data = json.data ?? json
      if (!res.ok || json.error) {
        setActionError(json.error?.message || "Falha ao reiniciar a instância")
      } else if (!data.recovered) {
        setActionError(
          `Reiniciou mas não reconectou (estado: ${data.state}). Sessão pode estar corrompida — desconecte e leia o QR novamente.`,
        )
      }
      onChanged()
    } catch {
      setActionError("Falha ao reiniciar a instância")
    } finally {
      setBusy(null)
    }
  }

  // Desconecta o número (logout) — o canal continua existindo e pode
  // reconectar com novo QR (inclusive outro número).
  const logout = async () => {
    if (!window.confirm(`Desconectar o WhatsApp de "${channel.display_name}"? As mensagens param de chegar até reconectar com um novo QR.`)) return
    setBusy("logout")
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/channels/${channel.id}/evolution/logout`, { method: "POST" })
      const json = await res.json()
      const data = json.data ?? json
      if (!res.ok || json.error) {
        setActionError(json.error?.message || "Falha ao desconectar")
      } else if (data.evolution_ok === false) {
        setActionError(`Marcado como desconectado aqui, mas a Evolution não confirmou o logout: ${data.evolution_error ?? "erro desconhecido"}`)
      }
      onChanged()
    } catch {
      setActionError("Falha ao desconectar")
    } finally {
      setBusy(null)
    }
  }

  // Remove a instância no servidor Evolution e desativa o canal.
  const remove = async () => {
    if (!window.confirm(`Remover o canal "${channel.display_name}"? A instância será apagada no servidor Evolution e o canal desativado. As conversas já recebidas permanecem no inbox.`)) return
    setBusy("remove")
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/channels/${channel.id}/evolution/logout`, { method: "DELETE" })
      const json = await res.json()
      const data = json.data ?? json
      if (!res.ok || json.error) {
        setActionError(json.error?.message || "Falha ao remover")
      } else if (data.evolution_ok === false) {
        setActionError(`Canal desativado aqui, mas a Evolution não confirmou a remoção da instância: ${data.evolution_error ?? "erro desconhecido"}`)
      }
      onChanged()
    } catch {
      setActionError("Falha ao remover")
    } finally {
      setBusy(null)
    }
  }
  const Icon = isInstagram ? Instagram : isEvolution ? QrCode : Phone
  const tagLabel = isInstagram
    ? "Instagram (DM + Comments)"
    : isEvolution
      ? "WhatsApp via QR (não-oficial)"
      : "WhatsApp Oficial (Cloud API)"
  const accentBg = isInstagram ? "rgba(219,39,119,0.10)" : "var(--crm-success-bg)"
  const accentFg = isInstagram ? "#DB2777" : "var(--crm-success-fg)"

  const evoState = channel.connection_state ?? "unknown"
  const evoDisconnected = isEvolution && evoState !== "open"

  return (
    <div className="crm-card flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center"
          style={{
            background: accentBg,
            color: accentFg,
            borderRadius: "var(--crm-radius-md)",
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div
            style={{
              fontSize: "var(--crm-text-md)",
              fontWeight: "var(--crm-weight-medium)",
              color: "var(--crm-gray-900)",
            }}
          >
            {channel.display_name}
          </div>
          <div
            style={{
              fontSize: "var(--crm-text-xs)",
              color: "var(--crm-gray-500)",
              fontFamily: "var(--crm-font-mono)",
            }}
          >
            {tagLabel} · {isEvolution && channel.owner_jid ? `+${channel.owner_jid}` : channel.external_id}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isEvolution && (
          <span
            style={{
              fontSize: "var(--crm-text-xs)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontWeight: "var(--crm-weight-medium)",
              color:
                evoState === "open"
                  ? "var(--crm-success-fg)"
                  : evoState === "connecting"
                    ? "var(--crm-warning-fg, #B45309)"
                    : "var(--crm-danger-fg)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "9999px",
                background: "currentColor",
                display: "inline-block",
              }}
            />
            {evoState === "open" ? "Conectado" : evoState === "connecting" ? "Conectando" : "Desconectado"}
          </span>
        )}
        {actionError && (
          <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-danger-fg)" }}>
            {actionError}
          </span>
        )}
        {isEvolution && channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Consulta o estado real da instância na Evolution (detecta conexão travada mesmo quando aparece Conectado)"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)", opacity: busy ? 0.5 : 1 }}
            disabled={busy !== null}
            onClick={checkState}
          >
            <RefreshCw className={`h-3 w-3 ${busy === "check" ? "animate-spin" : ""}`} />
            Verificar
          </button>
        )}
        {isEvolution && channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Reinicia o socket na Evolution com as credenciais salvas (sem novo QR) — use quando a instância trava: mostra Conectado mas mensagens não chegam"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)", opacity: busy ? 0.5 : 1 }}
            disabled={busy !== null}
            onClick={restart}
          >
            <Power className="h-3 w-3" />
            {busy === "restart" ? "Reiniciando..." : "Reiniciar"}
          </button>
        )}
        {evoDisconnected && channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)", opacity: busy ? 0.5 : 1 }}
            disabled={busy !== null}
            onClick={onReconnect}
          >
            <AlertCircle className="h-3 w-3" />
            Reconectar
          </button>
        )}
        {isEvolution && channel.is_active && evoState === "open" && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Desconecta o número (logout) — reconecte depois com um novo QR"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              color: "var(--crm-danger-fg)",
              opacity: busy ? 0.5 : 1,
            }}
            disabled={busy !== null}
            onClick={logout}
          >
            <Unplug className="h-3 w-3" />
            {busy === "logout" ? "Desconectando..." : "Desconectar"}
          </button>
        )}
        {isEvolution && channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Remove a instância no servidor Evolution e desativa o canal"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              color: "var(--crm-danger-fg)",
              opacity: busy ? 0.5 : 1,
            }}
            disabled={busy !== null}
            onClick={remove}
          >
            <Trash2 className="h-3 w-3" />
            {busy === "remove" ? "Removendo..." : "Remover"}
          </button>
        )}
        {channel.is_active && !isEvolution && (
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
    </div>
  )
}

// ─── Evolution form (WhatsApp via QR) ────────────────────────────

function EvolutionForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (target: { channelId: string; channelName: string; initialQr?: string | null }) => void
}) {
  const [name, setName] = useState("")
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
          provider: "evolution",
          display_name: name,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar canal")
        return
      }
      const data = json.data ?? json
      onCreated({ channelId: data.id, channelName: name, initialQr: data.qr_base64 ?? null })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 crm-card" style={{ maxWidth: 560 }}>
      <h3
        style={{
          fontSize: "var(--crm-text-md)",
          fontWeight: "var(--crm-weight-medium)",
          color: "var(--crm-gray-900)",
          marginBottom: "var(--crm-space-3)",
        }}
      >
        Conectar WhatsApp via QR (não-oficial)
      </h3>
      <div className="space-y-3">
        <Field label="Nome do canal *">
          <input
            className="crm-input w-full"
            placeholder="Ex: WhatsApp Atendimento"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        {error && (
          <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
            {error}
          </p>
        )}
        <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", lineHeight: 1.6 }}>
          Conexão não-oficial (Baileys/Evolution): escaneie o QR com o celular do número.
          Sem janela de 24h e sem templates Meta — mas com risco de banimento em envios em
          massa. Um número só pode estar conectado em UMA instância.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="crm-button-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="submit"
            className="crm-button-primary"
            disabled={submitting}
            style={{ opacity: submitting ? 0.5 : 1 }}
          >
            {submitting ? "Criando instância..." : "Gerar QR"}
          </button>
        </div>
      </div>
    </form>
  )
}

// ─── WhatsApp form ───────────────────────────────────────────────

function WhatsAppForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
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
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 crm-card" style={{ maxWidth: 560 }}>
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
          <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
            {error}
          </p>
        )}
        <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
          Webhook URL pra registrar no Meta Business Suite:{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)" }}>
            /api/webhooks/whatsapp
          </code>
          . Verify token: variavel de ambiente{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)" }}>
            WHATSAPP_WEBHOOK_VERIFY_TOKEN
          </code>
          .
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="crm-button-ghost" onClick={onCancel}>
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
  )
}

// ─── Instagram form ──────────────────────────────────────────────

function InstagramForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [igAccountId, setIgAccountId] = useState("")
  const [accessToken, setAccessToken] = useState("")
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
          type: "instagram",
          display_name: name,
          instagram: {
            instagram_business_account_id: igAccountId,
            access_token: accessToken,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar channel")
        return
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 crm-card" style={{ maxWidth: 560 }}>
      <h3
        style={{
          fontSize: "var(--crm-text-md)",
          fontWeight: "var(--crm-weight-medium)",
          color: "var(--crm-gray-900)",
          marginBottom: "var(--crm-space-3)",
        }}
      >
        Conectar Instagram (DM + Comments)
      </h3>
      <div className="space-y-3">
        <Field label="Nome do canal *">
          <input
            className="crm-input w-full"
            placeholder="Ex: @minhaloja"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Instagram Business Account ID *">
          <input
            className="crm-input w-full"
            style={{ fontFamily: "var(--crm-font-mono)" }}
            placeholder="17841405822304914"
            value={igAccountId}
            onChange={(e) => setIgAccountId(e.target.value)}
            required
          />
        </Field>
        <Field label="Page Access Token *">
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
        {error && (
          <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
            {error}
          </p>
        )}
        <div
          style={{
            fontSize: "var(--crm-text-xs)",
            color: "var(--crm-gray-500)",
            lineHeight: 1.6,
          }}
        >
          <strong>Pre-requisitos no Meta Business Suite:</strong>
          <ul style={{ marginTop: 4, paddingLeft: 16, listStyle: "disc" }}>
            <li>
              Token gerado com escopos:{" "}
              <code>instagram_basic</code>, <code>instagram_manage_messages</code>,{" "}
              <code>instagram_manage_comments</code>, <code>pages_show_list</code>,{" "}
              <code>pages_read_engagement</code>
            </li>
            <li>
              Webhook URL:{" "}
              <code style={{ fontFamily: "var(--crm-font-mono)" }}>
                /api/webhooks/instagram
              </code>
            </li>
            <li>
              Verify token:{" "}
              <code style={{ fontFamily: "var(--crm-font-mono)" }}>
                META_WEBHOOK_VERIFY_TOKEN
              </code>{" "}
              (cai no <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> se nao definida)
            </li>
            <li>
              Subscribe nos campos: <code>messages</code>, <code>messaging_postbacks</code>,{" "}
              <code>comments</code>
            </li>
            <li>App secret em <code>META_APP_SECRET</code> pra validar HMAC</li>
          </ul>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="crm-button-ghost" onClick={onCancel}>
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
  )
}

// ─── Field helper ────────────────────────────────────────────────

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
