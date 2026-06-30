"use client"

/**
 * Painel "Copy da Campanha (Handoff)" — tela cheia, aberto da task de design.
 *
 * Mostra as copies de PRODUÇÃO de cada loja da campanha (read-only), agrupadas
 * por idioma, atualizando ao vivo conforme o n8n gera (polling 4s enquanto
 * houver loja `pending`). O designer registra a loja base com "vou usar essa
 * loja" (grava design_pilot_store_id). Reusa BlockPreview/helpers do CopyPanel.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  Star,
  X,
} from "lucide-react"
import {
  BlockPreview,
  copyBlocksToText,
  blockCountLabel,
} from "@/components/campaign-central/block-preview"
import type {
  CampaignHandoffPayload,
  CampaignHandoffStatus,
  CampaignHandoffStore,
  EmailDraftBlock,
} from "@/types/campaign-central"

function langGroup(language: string | null): string {
  const l = (language ?? "").toLowerCase()
  if (l.startsWith("pt")) return "Português"
  if (l.startsWith("en")) return "Inglês"
  if (l.startsWith("es")) return "Espanhol"
  if (l.startsWith("fr")) return "Francês"
  if (l.startsWith("de")) return "Alemão"
  if (l.startsWith("it")) return "Italiano"
  return language ? language.toUpperCase() : "Outros"
}

const TYPE_LABEL: Record<string, string> = {
  heading: "Título",
  text: "Texto",
  products: "Grid de produtos",
  button: "CTA / botão",
  offer: "Oferta / cupom",
  image: "Imagem",
  divider: "Divisória",
  footer: "Rodapé",
}

const BADGE_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-500",
  "bg-violet-600",
  "bg-rose-500",
  "bg-slate-700",
]

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

function statusMeta(status: CampaignHandoffStatus): { dot: string; label: string } {
  switch (status) {
    case "ready":
      return { dot: "bg-emerald-500", label: "Pronta" }
    case "pending":
      return { dot: "bg-amber-400 animate-pulse", label: "Gerando…" }
    case "error":
      return { dot: "bg-rose-500", label: "Erro" }
    default:
      return { dot: "bg-muted-foreground/40", label: "Sem copy" }
  }
}

/** Texto de um único bloco pra "Copiar bloco". */
function blockText(b: EmailDraftBlock): string {
  if (b.type === "products") {
    return (b.items ?? [])
      .map((it) => `• ${it.name ?? "Produto"} — ${it.price ?? ""}`)
      .join("\n")
  }
  return [b.headline, b.sub, b.value, b.caption].filter(Boolean).join("\n")
}

function CopyBtn({
  text,
  label = "Copiar",
  small,
}: {
  text: string
  label?: string
  small?: boolean
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          /* clipboard indisponível — silencioso */
        }
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[5px] border border-border bg-card font-medium text-foreground/80 hover:bg-muted ${
        small ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]"
      }`}
    >
      {done ? <Check size={small ? 11 : 13} /> : <Copy size={small ? 11 : 13} />}
      {done ? "Copiado" : label}
    </button>
  )
}

export function CampaignCopyHandoff({
  taskId,
  onClose,
}: {
  taskId: string
  onClose: () => void
}) {
  const [data, setData] = useState<CampaignHandoffPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-copies`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${res.status}`)
      }
      const j = (await res.json()) as CampaignHandoffPayload
      setData(j)
      setSelected((cur) => cur ?? j.pilot_store_id ?? j.stores[0]?.store_id ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar")
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  const anyPending = !!data?.stores.some((s) => s.status === "pending")
  useEffect(() => {
    if (!anyPending) return
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [anyPending, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const stores = useMemo(() => data?.stores ?? [], [data])
  const current = useMemo(
    () => stores.find((s) => s.store_id === selected) ?? stores[0] ?? null,
    [stores, selected],
  )
  const currentIdx = current
    ? stores.findIndex((s) => s.store_id === current.store_id)
    : -1

  const groups = useMemo(() => {
    const m = new Map<string, CampaignHandoffStore[]>()
    for (const s of stores) {
      const g = langGroup(s.language)
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(s)
    }
    return Array.from(m.entries())
  }, [stores])

  const setPilot = async (storeId: string) => {
    setData((d) => (d ? { ...d, pilot_store_id: storeId } : d)) // otimista
    try {
      await fetch(`/api/tasks/${taskId}/campaign-copies`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      })
    } catch {
      /* mantém otimista; recarrega no próximo poll/abertura */
    }
  }

  const sendLabel = (() => {
    if (!data?.send_date) return "Sem data"
    const d = new Date(data.send_date + "T00:00:00")
    const fmt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
    return days > 0 ? `${fmt} · em ${days}d` : fmt
  })()

  const isPilot = current && data?.pilot_store_id === current.store_id

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/50 p-2 sm:p-5">
      <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            <FileText size={14} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Produção</span>
            <ChevronRight size={13} className="text-muted-foreground/50" />
            <span className="truncate font-medium text-foreground">
              {data?.title || "Campanha"}
            </span>
            <ChevronRight size={13} className="text-muted-foreground/50" />
            <span className="text-muted-foreground">Copy da campanha</span>
            <span className="ml-1 rounded-[5px] bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Handoff de copy
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[12px] text-muted-foreground sm:inline">
              Envia: {sendLabel}
            </span>
            {current?.copy && (
              <CopyBtn text={copyBlocksToText(current.copy)} label="Copiar tudo" small />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-[5px] p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3 sm:block">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Lojas da campanha
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {stores.length}
              </span>
            </div>
            {groups.map(([group, gstores]) => (
              <div key={group} className="mb-3">
                <div className="px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {group} · {gstores.length}
                </div>
                {gstores.map((s) => {
                  const sm = statusMeta(s.status)
                  const active = current?.store_id === s.store_id
                  return (
                    <button
                      key={s.store_id}
                      type="button"
                      onClick={() => setSelected(s.store_id)}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left ${
                        active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-foreground/85 text-[10px] font-bold text-background">
                        {initials(s.store_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-medium text-foreground">
                            {s.store_name}
                          </span>
                          {data?.pilot_store_id === s.store_id && (
                            <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
                          )}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {s.country || "—"}
                        </span>
                      </span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${sm.dot}`}
                        title={sm.label}
                      />
                    </button>
                  )
                })}
              </div>
            ))}
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {loading && (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" size={16} /> Carregando copies…
              </div>
            )}
            {!loading && error && (
              <div className="flex h-40 items-center justify-center gap-2 text-[13px] text-rose-600">
                <AlertTriangle size={15} /> {error}
              </div>
            )}
            {!loading && !error && !current && (
              <div className="flex h-40 items-center justify-center text-[13px] text-muted-foreground">
                Nenhuma loja nesta campanha.
              </div>
            )}

            {!loading && !error && current && (
              <>
                {/* Store header */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-foreground/85 text-[12px] font-bold text-background">
                      {initials(current.store_name)}
                    </span>
                    <div>
                      <div className="text-[15px] font-semibold text-foreground">
                        {current.store_name}
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {langGroup(current.language)}
                        {current.country ? ` · ${current.country}` : ""}
                      </div>
                    </div>
                    <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <span className={`h-2 w-2 rounded-full ${statusMeta(current.status).dot}`} />
                      {statusMeta(current.status).label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPilot(current.store_id)}
                    className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${
                      isPilot
                        ? "border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400"
                        : "bg-foreground text-background hover:opacity-90"
                    }`}
                  >
                    <Star size={13} className={isPilot ? "fill-amber-400 text-amber-400" : ""} />
                    {isPilot ? "Loja base" : "Vou usar essa loja"}
                  </button>
                </div>

                {/* Meta row */}
                <div className="mb-3 grid grid-cols-1 gap-3 rounded-[8px] border border-border bg-card p-3 sm:grid-cols-3">
                  <Meta label="Canal" value={data?.channel || "Email"} />
                  <Meta label="Envio" value={sendLabel} />
                  <Meta label="Assunto base" value={data?.subject || "—"} />
                </div>

                {current.status === "pending" || !current.copy ? (
                  <div className="flex h-40 items-center justify-center gap-2 rounded-[8px] border border-dashed border-border text-[13px] text-muted-foreground">
                    {current.status === "error" ? (
                      <>
                        <AlertTriangle size={15} className="text-rose-500" />
                        {current.copy?.error_message || "Falha ao gerar a copy desta loja."}
                      </>
                    ) : (
                      <>
                        <Loader2 className="animate-spin" size={15} /> Gerando a copy desta loja…
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Subject + preheader */}
                    <Field label="Assunto" value={current.copy.subject} />
                    <Field
                      label="Pré-cabeçalho"
                      value={current.copy.preheader ?? current.copy.preview ?? ""}
                    />

                    {/* Blocks */}
                    <div className="mt-3 rounded-[8px] border border-border bg-card">
                      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-foreground">
                            Copy · {langGroup(current.language)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            bloco a bloco · {blockCountLabel(current.copy.blocks ?? [])}
                          </div>
                        </div>
                        <CopyBtn text={copyBlocksToText(current.copy)} label="Copiar tudo" small />
                      </div>
                      <div className="divide-y divide-border">
                        {(current.copy.blocks ?? []).map((b, i) => (
                          <div key={b.id ?? i} className="flex gap-3 px-3 py-3">
                            <div className="flex w-36 shrink-0 flex-col gap-1">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded-[5px] text-[11px] font-bold text-white ${
                                    BADGE_COLORS[i % BADGE_COLORS.length]
                                  }`}
                                >
                                  {i + 1}
                                </span>
                                <span className="text-[12.5px] font-semibold text-foreground">
                                  {b.section || TYPE_LABEL[b.type] || b.type}
                                </span>
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {TYPE_LABEL[b.type] || b.type}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <BlockPreview block={{ ...b, section: undefined }} />
                            </div>
                            <CopyBtn text={blockText(b)} label="" small />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </main>
        </div>

        {/* Footer nav */}
        {stores.length > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <button
              type="button"
              disabled={currentIdx <= 0}
              onClick={() => setSelected(stores[currentIdx - 1]?.store_id ?? null)}
              className="inline-flex items-center gap-1 rounded-[6px] px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <span className="text-[12px] text-muted-foreground">
              Loja {currentIdx + 1} de {stores.length}
            </span>
            <button
              type="button"
              disabled={currentIdx >= stores.length - 1}
              onClick={() => setSelected(stores[currentIdx + 1]?.store_id ?? null)}
              className="inline-flex items-center gap-1 rounded-[6px] px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-40"
            >
              Próxima <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-[13px] text-foreground" title={value}>
        {value}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 rounded-[8px] border border-border bg-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {value && <CopyBtn text={value} label="" small />}
      </div>
      <div className="text-[13.5px] text-foreground">{value || "—"}</div>
    </div>
  )
}
