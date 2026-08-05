"use client"

/**
 * Painel Instagram — atividade da conta conectada.
 *
 * Mostra o perfil (seguidores/seguindo/posts) com evolução diária de
 * seguidores, os posts recentes com últimos comentários e a importação
 * das conversas recentes pro inbox.
 *
 * LIMITAÇÃO (comunicada na UI): a API oficial não revela QUEM
 * seguiu/deixou de seguir — só o total. O "quem seguiu recente" vira
 * delta diário (1d/7d/30d) a partir dos snapshots do canal.
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Download,
  ExternalLink,
  Heart,
  Inbox,
  Instagram,
  MessageCircle,
  RefreshCw,
  Users,
} from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { ROUTES } from "@/lib/routes"
import type {
  InstagramMediaInfo,
  InstagramProfileInfo,
} from "@/lib/services/instagram-activity.service"
import type { FollowerDelta, FollowerSnapshot } from "@/lib/services/instagram-followers"

// errorResponse da casa devolve { error: "<string>" } — mas rotas podem
// devolver objeto também. Extrai a mensagem real nos dois formatos.
const extractApiError = (body: unknown, fallback: string): string => {
  const e = (body as { error?: unknown } | null)?.error
  if (typeof e === "string" && e) return e
  const nested = (e as { message?: string } | null)?.message
  if (nested) return nested
  const msg = (body as { message?: string } | null)?.message
  return msg || fallback
}

// Lança em não-2xx (lição do incidente do funil): corpo de erro nunca
// pode chegar ao render como se fosse payload válido.
const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(extractApiError(body, `Erro ${res.status}`))
  }
  return body
}

interface ChannelOption {
  id: string
  type: string
  display_name: string
  is_active?: boolean
}

interface ActivityPayload {
  profile: InstagramProfileInfo | null
  profile_error: string | null
  media: InstagramMediaInfo[]
  media_error: string | null
  follower_history: FollowerSnapshot[]
  deltas: { d1: FollowerDelta | null; d7: FollowerDelta | null; d30: FollowerDelta | null }
  /** Preenchido quando o ID salvo era o da Página e foi corrigido. */
  account_fix?: { from: string; to: string } | null
}

interface ImportResult {
  conversations: number
  threads_created: number
  threads_matched: number
  messages_imported: number
  messages_skipped: number
  note?: string
}

const nf = new Intl.NumberFormat("pt-BR")

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function relTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days} d`
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

/** Chip de variação: verde ganhou, vermelho perdeu, neutro coletando. */
function DeltaChip({ label, delta }: { label: string; delta: FollowerDelta | null }) {
  const tone = !delta
    ? { bg: "var(--crm-gray-100)", fg: "var(--crm-gray-500)" }
    : delta.delta >= 0
      ? { bg: "#E7F6EC", fg: "#177245" }
      : { bg: "#FDEBEC", fg: "#B3261E" }
  const text = !delta ? "—" : `${delta.delta >= 0 ? "+" : ""}${nf.format(delta.delta)}`
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      title={
        delta
          ? `Comparado com o snapshot de ${fmtDate(delta.since)}`
          : "Coletando histórico — o snapshot é diário a partir da conexão"
      }
      style={{ background: tone.bg, color: tone.fg, fontSize: "var(--crm-text-xs)", fontWeight: 600 }}
    >
      {text}
      <span style={{ fontWeight: 400, opacity: 0.85 }}>{label}</span>
    </span>
  )
}

/** Sparkline SVG puro do histórico de seguidores (sem lib). */
function FollowerSparkline({ history }: { history: FollowerSnapshot[] }) {
  if (history.length < 2) return null
  const w = 220
  const h = 44
  const values = history.map((s) => s.followers)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = w / (values.length - 1)
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`)
    .join(" ")
  return (
    <div className="flex flex-col items-end gap-0.5">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke="var(--crm-gray-900)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span style={{ fontSize: "10px", color: "var(--crm-gray-400)" }}>
        {fmtDate(history[0].day)} — {fmtDate(history[history.length - 1].day)} · {history.length} dias
      </span>
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col">
      <span
        style={{
          fontSize: "var(--crm-text-lg)",
          fontWeight: 600,
          color: "var(--crm-gray-900)",
          lineHeight: 1.2,
        }}
      >
        {value === null ? "—" : nf.format(value)}
      </span>
      <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>{label}</span>
    </div>
  )
}

function WarnBanner({ text }: { text: string }) {
  return (
    <div
      className="rounded border px-3 py-2"
      style={{
        borderColor: "#F4D08A",
        background: "#FEF7E6",
        color: "#8A6116",
        fontSize: "var(--crm-text-sm)",
      }}
    >
      {text}
    </div>
  )
}

const MEDIA_TYPE_LABEL: Record<string, string> = {
  IMAGE: "Foto",
  VIDEO: "Vídeo",
  CAROUSEL_ALBUM: "Carrossel",
  REELS: "Reels",
}

function PostCard({ media }: { media: InstagramMediaInfo }) {
  const [showComments, setShowComments] = useState(false)
  const thumb = media.thumbnail_url || media.media_url
  return (
    <div
      className="flex flex-col overflow-hidden rounded-md border"
      style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
    >
      <div className="relative aspect-square w-full" style={{ background: "var(--crm-gray-100)" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={media.caption ?? "Post do Instagram"} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Instagram className="h-8 w-8" style={{ color: "var(--crm-gray-300)" }} />
          </div>
        )}
        <span
          className="absolute left-2 top-2 rounded px-1.5 py-0.5"
          style={{
            background: "rgba(31,31,31,0.75)",
            color: "#fff",
            fontSize: "10px",
            fontWeight: 600,
          }}
        >
          {MEDIA_TYPE_LABEL[media.media_type ?? ""] ?? media.media_type ?? "Post"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-2.5">
        <div
          className="flex items-center gap-3"
          style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)" }}
        >
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3 w-3" /> {media.like_count === null ? "—" : nf.format(media.like_count)}
          </span>
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="inline-flex items-center gap-1 hover:underline"
            disabled={media.comments.length === 0}
            style={{ color: media.comments.length > 0 ? "var(--crm-gray-700)" : "var(--crm-gray-400)" }}
          >
            <MessageCircle className="h-3 w-3" />
            {media.comments_count === null ? "—" : nf.format(media.comments_count)}
          </button>
          <span className="ml-auto" style={{ color: "var(--crm-gray-400)" }}>
            {relTime(media.timestamp)}
          </span>
        </div>

        {media.caption && (
          <p
            className="line-clamp-2"
            style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-700)" }}
          >
            {media.caption}
          </p>
        )}

        {showComments && media.comments.length > 0 && (
          <div
            className="flex flex-col gap-1 rounded border p-2"
            style={{ borderColor: "var(--crm-gray-150, var(--crm-gray-200))", background: "var(--crm-gray-50)" }}
          >
            {media.comments.map((c) => (
              <div key={c.id} style={{ fontSize: "var(--crm-text-xs)" }}>
                <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
                  {c.username ? `@${c.username}` : "usuário"}
                </span>{" "}
                <span style={{ color: "var(--crm-gray-700)" }}>{c.text ?? ""}</span>{" "}
                <span style={{ color: "var(--crm-gray-400)" }}>{relTime(c.timestamp)}</span>
              </div>
            ))}
          </div>
        )}

        {media.permalink && (
          <a
            href={media.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
            style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}
          >
            <ExternalLink className="h-3 w-3" /> Ver no Instagram
          </a>
        )}
      </div>
    </div>
  )
}

export default function InstagramActivityPage() {
  const {
    data: channelsData,
    error: channelsError,
    isLoading: channelsLoading,
  } = useSWR<{ channels: ChannelOption[] }>("/api/crm/channels", fetcher, {
    revalidateOnFocus: false,
  })
  const igChannels = useMemo(
    () =>
      (channelsData?.channels ?? []).filter((c) => c.type === "instagram" && c.is_active !== false),
    [channelsData],
  )

  const [selectedId, setSelectedId] = useState<string>("")
  // Deep-link ?channel=<id> (botão "Atividade" do card em Canais) — lido
  // no mount pra não divergir do SSR.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("channel")
    if (fromUrl) setSelectedId(fromUrl)
  }, [])
  // Seleção só vale se o canal ainda existe na lista — canal removido/
  // desativado cai no primeiro disponível (sem travar a tela num 404).
  const channelId = igChannels.some((c) => c.id === selectedId)
    ? selectedId
    : (igChannels[0]?.id ?? "")

  const {
    data: activity,
    error: activityError,
    isLoading,
    mutate,
    isValidating,
  } = useSWR<ActivityPayload>(
    channelId ? `/api/crm/channels/${channelId}/instagram/activity` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  // Payload defensivo: erro de rede/permissão deixa `activity` undefined
  // e campos individuais podem faltar — a página nunca pode quebrar.
  const media = activity?.media ?? []
  const deltas = activity?.deltas ?? { d1: null, d7: null, d30: null }
  const history = activity?.follower_history ?? []

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const runImport = async () => {
    if (!channelId || importing) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const res = await fetch(`/api/crm/channels/${channelId}/instagram/import-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportError(extractApiError(body, "Falha ao importar conversas"))
      } else {
        setImportResult(body as ImportResult)
      }
    } catch {
      setImportError("Falha de rede ao importar conversas")
    } finally {
      setImporting(false)
    }
  }

  const profile = activity?.profile ?? null
  const channelsLoaded = channelsData !== undefined

  return (
    <CrmPageShell
      title="Instagram"
      subtitle="Atividade da conta — seguidores, posts e comentários recentes"
      actions={
        <div className="flex items-center gap-2">
          {igChannels.length > 1 && (
            <select
              value={channelId}
              onChange={(e) => {
                setSelectedId(e.target.value)
                setImportResult(null)
                setImportError(null)
              }}
              className="rounded border px-2 py-1"
              style={{
                borderColor: "var(--crm-gray-300)",
                fontSize: "var(--crm-text-sm)",
                background: "var(--crm-gray-0)",
              }}
            >
              {igChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          )}
          {channelId && (
            <button
              type="button"
              onClick={() => mutate()}
              className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 hover:bg-black/5"
              style={{
                borderColor: "var(--crm-gray-300)",
                fontSize: "var(--crm-text-sm)",
                color: "var(--crm-gray-700)",
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          )}
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
        {channelsError && (
          <WarnBanner
            text={`Não foi possível carregar os canais: ${channelsError instanceof Error ? channelsError.message : "erro desconhecido"}`}
          />
        )}
        {channelsLoading && !channelsData && (
          <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
            Carregando canais…
          </p>
        )}

        {/* Sem canal conectado */}
        {channelsLoaded && igChannels.length === 0 && (
          <div
            className="flex flex-col items-center gap-3 rounded-md border px-6 py-12 text-center"
            style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
          >
            <Instagram className="h-8 w-8" style={{ color: "var(--crm-gray-400)" }} />
            <div>
              <p style={{ fontSize: "var(--crm-text-md)", fontWeight: 600, color: "var(--crm-gray-900)" }}>
                Nenhuma conta de Instagram conectada
              </p>
              <p className="mt-1" style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
                Conecte a conta em Canais para acompanhar seguidores, posts e conversas por aqui.
              </p>
            </div>
            <Link
              href={ROUTES.ADMIN.COMERCIAL.CANAIS}
              className="rounded px-3 py-1.5"
              style={{
                background: "var(--crm-gray-900)",
                color: "var(--crm-gray-0)",
                fontSize: "var(--crm-text-sm)",
                fontWeight: 500,
              }}
            >
              Conectar Instagram
            </Link>
          </div>
        )}

        {channelId && (
          <>
            {activityError && (
              <WarnBanner
                text={`Não foi possível carregar a atividade: ${activityError instanceof Error ? activityError.message : "erro desconhecido"}`}
              />
            )}
            {activity?.account_fix && (
              <div
                className="rounded border px-3 py-2"
                style={{
                  borderColor: "#BFE3CC",
                  background: "#EFF9F2",
                  color: "#1D5B36",
                  fontSize: "var(--crm-text-sm)",
                }}
              >
                Corrigimos a conexão automaticamente: o ID salvo era o da Página do Facebook —
                o canal agora usa o ID do Instagram vinculado e o webhook volta a rotear as
                mensagens desta conta.
              </div>
            )}
            {activity?.profile_error && <WarnBanner text={activity.profile_error} />}

            {/* Perfil */}
            <div
              className="flex flex-col gap-4 rounded-md border p-4 md:flex-row md:items-center"
              style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {profile?.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profile_picture_url}
                    alt={profile.username ?? "Perfil"}
                    className="h-14 w-14 shrink-0 rounded-full border object-cover"
                    style={{ borderColor: "var(--crm-gray-200)" }}
                  />
                ) : (
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--crm-gray-100)" }}
                  >
                    <Instagram className="h-6 w-6" style={{ color: "var(--crm-gray-400)" }} />
                  </div>
                )}
                <div className="min-w-0">
                  <p
                    className="truncate"
                    style={{ fontSize: "var(--crm-text-md)", fontWeight: 600, color: "var(--crm-gray-900)" }}
                  >
                    {profile?.username ? `@${profile.username}` : isLoading ? "Carregando…" : "Conta"}
                  </p>
                  {profile?.name && (
                    <p className="truncate" style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-600)" }}>
                      {profile.name}
                    </p>
                  )}
                  {profile?.biography && (
                    <p
                      className="mt-0.5 line-clamp-2"
                      style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}
                    >
                      {profile.biography}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex flex-col gap-1">
                  <StatBlock label="Seguidores" value={profile?.followers_count ?? null} />
                  <div className="flex flex-wrap gap-1">
                    <DeltaChip label="hoje" delta={deltas.d1 ?? null} />
                    <DeltaChip label="7d" delta={deltas.d7 ?? null} />
                    <DeltaChip label="30d" delta={deltas.d30 ?? null} />
                  </div>
                </div>
                <StatBlock label="Seguindo" value={profile?.follows_count ?? null} />
                <StatBlock label="Publicações" value={profile?.media_count ?? null} />
                <FollowerSparkline history={history} />
              </div>
            </div>

            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
              A API oficial do Instagram não revela <strong>quem</strong> seguiu ou deixou de seguir —
              acompanhamos a evolução do total com um snapshot diário a partir da conexão do canal.
            </p>

            {/* Conversas */}
            <div
              className="flex flex-col gap-3 rounded-md border p-4"
              style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p style={{ fontSize: "var(--crm-text-sm)", fontWeight: 600, color: "var(--crm-gray-900)" }}>
                    Conversas do direct
                  </p>
                  <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                    Puxa as conversas recentes da conta pro inbox — quem já existe só ganha as mensagens
                    que faltam.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={ROUTES.ADMIN.INBOX}
                    className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 hover:bg-black/5"
                    style={{
                      borderColor: "var(--crm-gray-300)",
                      fontSize: "var(--crm-text-sm)",
                      color: "var(--crm-gray-700)",
                    }}
                  >
                    <Inbox className="h-3.5 w-3.5" /> Abrir inbox
                  </Link>
                  <button
                    type="button"
                    onClick={runImport}
                    disabled={importing}
                    className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 disabled:opacity-60"
                    style={{
                      background: "var(--crm-gray-900)",
                      color: "var(--crm-gray-0)",
                      fontSize: "var(--crm-text-sm)",
                      fontWeight: 500,
                    }}
                  >
                    <Download className={`h-3.5 w-3.5 ${importing ? "animate-pulse" : ""}`} />
                    {importing ? "Importando…" : "Importar conversas recentes"}
                  </button>
                </div>
              </div>

              {importError && <WarnBanner text={importError} />}
              {importResult && (
                <div
                  className="rounded border px-3 py-2"
                  style={{
                    borderColor: "#BFE3CC",
                    background: "#EFF9F2",
                    color: "#1D5B36",
                    fontSize: "var(--crm-text-sm)",
                  }}
                >
                  {importResult.conversations} conversa(s) lida(s) · {importResult.threads_created} nova(s) no
                  inbox · {importResult.messages_imported} mensagem(ns) importada(s)
                  {importResult.messages_skipped > 0 && ` · ${importResult.messages_skipped} já existiam`}
                  {importResult.note && (
                    <span className="mt-0.5 block" style={{ fontSize: "var(--crm-text-xs)", opacity: 0.85 }}>
                      {importResult.note}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Posts recentes */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: "var(--crm-gray-500)" }} />
                <h2 style={{ fontSize: "var(--crm-text-sm)", fontWeight: 600, color: "var(--crm-gray-900)" }}>
                  Posts recentes e comentários
                </h2>
              </div>
              {activity?.media_error && <WarnBanner text={activity.media_error} />}
              {isLoading && !activity && (
                <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>Carregando posts…</p>
              )}
              {activity && media.length === 0 && !activity.media_error && (
                <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
                  Nenhum post encontrado na conta.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {media.map((m) => (
                  <PostCard key={m.id} media={m} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </CrmPageShell>
  )
}
