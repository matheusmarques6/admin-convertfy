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
  FolderInput,
  Archive,
  Eraser,
  History,
} from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { EvolutionQrModal } from "@/components/crm/channels/evolution-qr-modal"
import { HistoryImportDialog } from "@/components/crm/channels/history-import-dialog"

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
  const [historyTarget, setHistoryTarget] = useState<{
    channelId: string
    channelName: string
  } | null>(null)

  return (
    <CrmPageShell
      title="Canais conectados"
      subtitle="WhatsApp oficial (Cloud API), WhatsApp via QR e Instagram"
      actions={
        <div className="flex flex-wrap gap-2">
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
                onImportHistory={() =>
                  setHistoryTarget({ channelId: c.id, channelName: c.display_name })
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

        {historyTarget && (
          <HistoryImportDialog
            channelId={historyTarget.channelId}
            channelName={historyTarget.channelName}
            onClose={() => {
              setHistoryTarget(null)
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
  onImportHistory,
  onChanged,
}: {
  channel: Channel
  onReconnect: () => void
  onImportHistory: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<
    | "check"
    | "logout"
    | "remove"
    | "restart"
    | "migrate"
    | "archive"
    | "purge"
    | "delete"
    | "history"
    | null
  >(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)

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

  // Traz as conversas dos canais Evolution DESATIVADOS da org para este
  // canal (troca de instância: threads antigas ficam amarradas ao canal
  // morto e responder nelas falha). Merge automático de contatos que já
  // têm conversa nova.
  const migrateThreads = async () => {
    if (!window.confirm(`Importar as conversas dos canais desativados para "${channel.display_name}"? Contatos que já têm conversa neste canal serão mesclados.`)) return
    setBusy("migrate")
    setActionError(null)
    setActionOk(null)
    try {
      const res = await fetch(`/api/crm/channels/${channel.id}/migrate-threads`, { method: "POST" })
      const json = await res.json()
      const data = json.data ?? json
      if (!res.ok || json.error) {
        setActionError(json.error?.message || "Falha ao importar conversas")
      } else if (data.sources === 0) {
        setActionOk("Nenhum canal desativado com conversas para importar.")
      } else {
        setActionOk(
          `${data.migrated} conversas importadas, ${data.merged} mescladas${data.failed ? `, ${data.failed} falharam (ver logs)` : ""}.`,
        )
      }
      onChanged()
    } catch {
      setActionError("Falha ao importar conversas")
    } finally {
      setBusy(null)
    }
  }

  // Tira do inbox as conversas DESTE canal — o inverso do importar.
  // Caso de uso: trocou de número, o canal antigo continua listando
  // centenas de conversas velhas na caixa. 'archive' é reversível (some
  // dos filtros, fica em "Todos"); 'delete' apaga conversas e mensagens.
  const purgeThreads = async (mode: "archive" | "delete") => {
    setBusy(mode === "archive" ? "archive" : "purge")
    setActionError(null)
    setActionOk(null)
    try {
      const previewRes = await fetch(`/api/crm/channels/${channel.id}/purge-threads`)
      const previewJson = await previewRes.json()
      const preview = previewJson.data ?? previewJson
      if (!previewRes.ok || previewJson.error) {
        setActionError(previewJson.error?.message || "Falha ao contar as conversas")
        return
      }
      if (!preview.threads) {
        setActionOk("Este canal não tem conversas no inbox.")
        return
      }

      const confirmMsg =
        mode === "archive"
          ? `Arquivar ${preview.threads} conversa(s) de "${channel.display_name}"? Elas somem dos filtros Abertos/Pendentes/Resolvidos e continuam acessíveis em "Todos".`
          : `Apagar ${preview.threads} conversa(s) e ${preview.messages} mensagem(ns) de "${channel.display_name}"? Isso é permanente — não dá para desfazer.`
      if (!window.confirm(confirmMsg)) return

      const res = await fetch(`/api/crm/channels/${channel.id}/purge-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json()
      const data = json.data ?? json
      if (!res.ok || json.error) {
        setActionError(json.error?.message || "Falha ao limpar as conversas")
        return
      }
      setActionOk(
        mode === "archive"
          ? `${data.threads} conversas arquivadas.`
          : `${data.threads} conversas e ${data.messages} mensagens apagadas.`,
      )
      onChanged()
    } catch {
      setActionError("Falha ao limpar as conversas")
    } finally {
      setBusy(null)
    }
  }

  // Exclui o canal de vez — o card sai da lista. "Remover" só desativa,
  // e o canal desativado ficava aqui para sempre sem nenhuma ação
  // possível. Leva junto as conversas e mensagens dele (CASCADE), então
  // a confirmação mostra quanto será perdido.
  const deleteChannel = async () => {
    setBusy("delete")
    setActionError(null)
    setActionOk(null)
    try {
      const previewRes = await fetch(`/api/crm/channels/${channel.id}/purge-threads`)
      const previewJson = await previewRes.json()
      const preview = previewRes.ok && !previewJson.error ? (previewJson.data ?? previewJson) : null

      const escopo = preview
        ? preview.threads
          ? ` As ${preview.threads} conversa(s) e ${preview.messages} mensagem(ns) dele serão apagadas junto.`
          : " Ele não tem conversas no inbox."
        : ""
      if (!window.confirm(`Excluir o canal "${channel.display_name}"?${escopo} Isso é permanente.`)) return

      const res = await fetch(`/api/crm/channels/${channel.id}`, { method: "DELETE" })
      const json = await res.json()
      const data = json.data ?? json
      if (!res.ok || json.error) {
        setActionError(json.error?.message || "Falha ao excluir o canal")
        return
      }
      if (data.evolution_ok === false) {
        setActionError(
          `Canal excluído aqui, mas a Evolution não confirmou a remoção da instância: ${data.evolution_error ?? "erro desconhecido"}`,
        )
      }
      onChanged()
    } catch {
      setActionError("Falha ao excluir o canal")
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
    <div className="crm-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end md:gap-3">
        {isEvolution && (
          <span
            style={{
              fontSize: "var(--crm-text-xs)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontWeight: "var(--crm-weight-medium)",
              // Canal desativado NUNCA mostra "Conectado" — o badge de
              // conexão de um canal removido é mentira útil pra ninguém
              // (a instância pode até estar open, mas o canal não opera).
              color: !channel.is_active
                ? "var(--crm-gray-500)"
                : evoState === "open"
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
            {!channel.is_active
              ? "Desativado"
              : evoState === "open"
                ? "Conectado"
                : evoState === "connecting"
                  ? "Conectando"
                  : "Desconectado"}
          </span>
        )}
        {actionError && (
          <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-danger-fg)" }}>
            {actionError}
          </span>
        )}
        {actionOk && (
          <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-success-fg)" }}>
            {actionOk}
          </span>
        )}
        {isEvolution && channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Traz as conversas dos canais Evolution desativados (troca de instância) para este canal — responder nelas volta a funcionar"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)", opacity: busy ? 0.5 : 1 }}
            disabled={busy !== null}
            onClick={migrateThreads}
          >
            <FolderInput className="h-3 w-3" />
            {busy === "migrate" ? "Importando..." : "Importar conversas antigas"}
          </button>
        )}
        {/* Só canal ativo: o histórico é lido da instância na Evolution,
            que deixa de existir quando o canal é removido. */}
        {isEvolution && channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Importa as conversas antigas que o WhatsApp entregou no pareamento deste número"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)", opacity: busy ? 0.5 : 1 }}
            disabled={busy !== null}
            onClick={onImportHistory}
          >
            <History className="h-3 w-3" />
            Importar histórico
          </button>
        )}
        {/* Canal em uso: limpa o histórico sem perder o canal. No canal
            desativado a ação coerente é "Excluir canal", que já leva as
            conversas junto — dois botões a mais só confundiriam. */}
        {channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Arquiva as conversas deste canal — somem dos filtros do inbox e continuam acessíveis em Todos"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)", opacity: busy ? 0.5 : 1 }}
            disabled={busy !== null}
            onClick={() => purgeThreads("archive")}
          >
            <Archive className="h-3 w-3" />
            {busy === "archive" ? "Arquivando..." : "Arquivar conversas"}
          </button>
        )}
        {channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Apaga permanentemente as conversas e mensagens deste canal"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              color: "var(--crm-danger-fg)",
              opacity: busy ? 0.5 : 1,
            }}
            disabled={busy !== null}
            onClick={() => purgeThreads("delete")}
          >
            <Eraser className="h-3 w-3" />
            {busy === "purge" ? "Apagando..." : "Apagar conversas"}
          </button>
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
        {!channel.is_active && (
          <button
            type="button"
            className="crm-button-ghost"
            title="Exclui o canal e todo o histórico dele — o card sai desta lista"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              color: "var(--crm-danger-fg)",
              opacity: busy ? 0.5 : 1,
            }}
            disabled={busy !== null}
            onClick={deleteChannel}
          >
            <Trash2 className="h-3 w-3" />
            {busy === "delete" ? "Excluindo..." : "Excluir canal"}
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

// ─── Instagram form (tutorial passo a passo) ─────────────────────

function IgStep({
  n,
  title,
  linkLabel,
  linkHref,
  defaultOpen,
  children,
}: {
  n: number
  title: string
  linkLabel?: string
  linkHref?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      style={{
        border: "1px solid var(--crm-gray-200)",
        borderRadius: 8,
        background: "var(--crm-gray-0)",
      }}
    >
      <summary
        className="flex cursor-pointer select-none items-center gap-2.5"
        style={{ padding: "9px 12px", listStyle: "none" }}
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "var(--crm-gray-900)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {n}
        </span>
        <span
          className="flex-1"
          style={{ fontSize: 13, fontWeight: 600, color: "var(--crm-gray-900)" }}
        >
          {title}
        </span>
        {linkHref && (
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--crm-brand)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {linkLabel ?? "Abrir"} ↗
          </a>
        )}
      </summary>
      <div
        style={{
          padding: "0 12px 11px 34px",
          fontSize: 12.5,
          color: "var(--crm-gray-600)",
          lineHeight: 1.65,
        }}
      >
        {children}
      </div>
    </details>
  )
}

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

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/instagram`
      : "/api/webhooks/instagram"

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
            instagram_business_account_id: igAccountId.trim(),
            access_token: accessToken.trim(),
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || json.error || "Erro ao criar channel")
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
    <form onSubmit={submit} className="mt-6 crm-card" style={{ maxWidth: 640 }}>
      <h3
        style={{
          fontSize: "var(--crm-text-md)",
          fontWeight: "var(--crm-weight-medium)",
          color: "var(--crm-gray-900)",
          marginBottom: 4,
        }}
      >
        Conectar Instagram (Directs + Comentários)
      </h3>
      <p style={{ fontSize: 12.5, color: "var(--crm-gray-500)", marginBottom: 12 }}>
        Configuração única por conta. Siga os passos na ordem — os passos 3 e 4
        geram os dois valores pedidos no final.
      </p>

      <div className="space-y-2" style={{ marginBottom: 14 }}>
        <IgStep
          n={1}
          title="Vincule o Instagram a uma Página do Facebook"
          linkLabel="Business Suite"
          linkHref="https://business.facebook.com/settings/instagram-account-v2s"
          defaultOpen
        >
          A conta precisa ser <strong>profissional</strong> (Business). Em Meta
          Business Suite → Configurações → Contas → <em>Contas do Instagram</em>,
          conecte a conta e vincule-a a uma Página do Facebook do seu negócio. Sem
          esse vínculo a API de mensagens não funciona.
        </IgStep>

        <IgStep
          n={2}
          title="Tenha um app na Meta for Developers"
          linkLabel="Meus apps"
          linkHref="https://developers.facebook.com/apps/"
        >
          Crie um app do tipo <strong>Negócios</strong> (ou use o mesmo app que já
          usa para o WhatsApp). Dentro do app, adicione o produto{" "}
          <strong>Messenger</strong> e ative a seção{" "}
          <em>Instagram — configurações da API</em>. Para funcionar com qualquer
          pessoa (não só administradores), o app precisa estar em modo{" "}
          <strong>Ativo</strong> (Live) com acesso avançado às permissões do passo 4.
        </IgStep>

        <IgStep
          n={3}
          title="Copie o Instagram Business Account ID"
          linkLabel="Graph Explorer"
          linkHref="https://developers.facebook.com/tools/explorer/"
        >
          No Graph API Explorer, selecione o seu app, clique em{" "}
          <em>Generate Access Token</em> (autorize com a conta que administra a
          Página) e rode a consulta:{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)", fontSize: 11.5 }}>
            me/accounts?fields=name,instagram_business_account
          </code>
          . Na resposta, copie o número de{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)", fontSize: 11.5 }}>
            instagram_business_account.id
          </code>{" "}
          da Página vinculada (ex.: 17841405822304914). É esse o ID pedido abaixo.
        </IgStep>

        <IgStep
          n={4}
          title="Gere um token que não expira (System User)"
          linkLabel="System Users"
          linkHref="https://business.facebook.com/settings/system-users"
        >
          Em Business Settings → Usuários → <em>Usuários do sistema</em>: crie um
          usuário Admin, clique em <em>Adicionar ativos</em> e atribua a Página do
          passo 1. Depois <em>Gerar token</em>, selecione o app e marque as
          permissões:{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)", fontSize: 11 }}>
            instagram_basic, instagram_manage_messages, instagram_manage_comments,
            pages_show_list, pages_read_engagement, pages_manage_metadata
          </code>
          . Copie o token gerado — ele não expira. (Token do Graph Explorer também
          funciona para testar, mas expira em ~1 hora.)
        </IgStep>

        <IgStep
          n={5}
          title="Configure o webhook no app (uma vez só)"
          linkLabel="Webhooks do app"
          linkHref="https://developers.facebook.com/apps/"
        >
          No painel do app → <strong>Webhooks</strong> → objeto{" "}
          <strong>Instagram</strong>:
          <br />• Callback URL:{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)", fontSize: 11.5 }}>
            {webhookUrl}
          </code>
          <br />• Verify token: o valor da variável{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)", fontSize: 11.5 }}>
            META_WEBHOOK_VERIFY_TOKEN
          </code>{" "}
          do servidor
          <br />• Assine os campos: <code>messages</code>,{" "}
          <code>messaging_postbacks</code> e <code>comments</code>
          <br />• Em Configurações → Básico, copie o <em>App Secret</em> para a
          variável{" "}
          <code style={{ fontFamily: "var(--crm-font-mono)", fontSize: 11.5 }}>
            META_APP_SECRET
          </code>
          . Este passo vale para TODAS as contas — não precisa repetir.
        </IgStep>
      </div>

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
        <Field label="Instagram Business Account ID * (passo 3)">
          <input
            className="crm-input w-full"
            style={{ fontFamily: "var(--crm-font-mono)" }}
            placeholder="17841405822304914"
            value={igAccountId}
            onChange={(e) => setIgAccountId(e.target.value)}
            required
          />
        </Field>
        <Field label="Access Token * (passo 4)">
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

        <p
          style={{
            fontSize: 12,
            color: "var(--crm-gray-500)",
            lineHeight: 1.6,
            padding: "8px 10px",
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-gray-200)",
            borderRadius: 8,
          }}
        >
          <strong>Segunda conta de Instagram?</strong> Repita os passos 1, 3 e 4
          para a outra conta (mesmo app, mesmo webhook — o passo 5 não se repete;
          no System User, atribua também a Página da segunda conta) e clique em
          &quot;Conectar Instagram&quot; de novo com o ID e o token dela. Cada
          conta vira um canal e as mensagens caem automaticamente no canal certo.
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
