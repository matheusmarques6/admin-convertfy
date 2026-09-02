"use client"

/**
 * Varredura "Largura 600px" da biblioteca — prévia + aplicar.
 *
 * Fala com `/api/admin/components/normalize-width`: o GET diz, variante a
 * variante, o que a normalização mudaria (nada gravado); o POST aplica.
 * A revisão é humana de propósito: a lista mostra de/para de cada mudança
 * e destaca o que continuaria fora de 600 mesmo depois (precisa de mão).
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2, Ruler, X } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import {
  EGBadge,
  EGBtn,
  EGNotice,
} from "@/components/email-generation/ui/eg-atoms"
import type {
  EmailWidthAudit,
  WidthChange,
} from "@/lib/email-workspace/email-width"

interface Item {
  id: string
  name: string
  block_type: string
  is_active: boolean
  before: EmailWidthAudit
  after: EmailWidthAudit
  changes: WidthChange[]
  html_changed: boolean
  tagged_changed: boolean
  unresolved: boolean
}

interface Summary {
  width: number
  total: number
  to_change: number
  already_ok: number
  unresolved: number
}

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: string; data?: T })
    | null
  if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
  return (json?.data ?? json) as T
}

export function WidthNormalizeDialog({
  open,
  onClose,
  onApplied,
}: {
  open: boolean
  onClose: () => void
  /** Chamado após aplicar — o pai recarrega a lista. */
  onApplied: () => void | Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/components/normalize-width")
      const data = await readJson<{ items: Item[]; summary: Summary }>(res)
      setItems(data.items ?? [])
      setSummary(data.summary ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a prévia")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const pending = items.filter((i) => i.html_changed || i.tagged_changed)
  const width = summary?.width ?? 600

  async function apply() {
    if (pending.length === 0) return
    setApplying(true)
    try {
      const res = await fetch("/api/admin/components/normalize-width", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: pending.map((i) => i.id) }),
      })
      const data = await readJson<{
        updated: string[]
        failed: Array<{ id: string; error: string }>
      }>(res)
      const ok = data.updated?.length ?? 0
      const bad = data.failed?.length ?? 0
      toast({
        variant: bad > 0 ? "destructive" : "default",
        title: `${ok} variante(s) fixada(s) em ${width}px`,
        description:
          bad > 0 ? `${bad} falharam — veja a prévia atualizada.` : undefined,
      })
      await onApplied()
      await load()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha ao aplicar",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Largura ${width}px na biblioteca`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(17,24,39,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          fontFamily: F.sans,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Ruler size={16} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.g900 }}>
              Largura {width}px na biblioteca
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: C.g500,
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 12 }}>
            Todo bloco tem de declarar o container em {width}px — é o que o
            Montador, o enxerto e o preview assumem. A prévia abaixo lista o
            que a normalização muda em cada variante ativa (só
            <code> &lt;table&gt;</code> com largura perto de {width} é
            tocada; colunas internas ficam como estão).
          </div>

          {error && (
            <div style={{ marginBottom: 12 }}>
              <EGNotice tone="neg">{error}</EGNotice>
            </div>
          )}

          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: 30,
                color: C.g400,
              }}
            >
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <>
              {summary && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  <EGBadge tone="neut">{summary.total} ativas</EGBadge>
                  <EGBadge tone="pos">{summary.already_ok} já em {width}px</EGBadge>
                  <EGBadge tone={summary.to_change > 0 ? "warn" : "neut"}>
                    {summary.to_change} a corrigir
                  </EGBadge>
                  {summary.unresolved > 0 && (
                    <EGBadge tone="neg">
                      {summary.unresolved} sem container fixo
                    </EGBadge>
                  )}
                </div>
              )}

              {pending.length === 0 && !error && (
                <EGNotice tone="pos">
                  Nenhuma variante ativa precisa de correção.
                </EGNotice>
              )}

              {pending.map((it) => (
                <div
                  key={it.id}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}
                    >
                      {it.name}
                    </span>
                    <EGBadge tone="neut">{it.block_type}</EGBadge>
                    {it.tagged_changed && (
                      <EGBadge tone="neut">html_tagged</EGBadge>
                    )}
                    {it.unresolved && (
                      <EGBadge tone="neg">continua fora de {width}px</EGBadge>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.g500, marginBottom: 4 }}>
                    {it.before.reason}
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: C.g700,
                      fontFamily: F.mono,
                    }}
                  >
                    {it.changes.map((c, i) => (
                      <li key={i}>
                        {c.from} → {c.to}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {items
                .filter((i) => i.unresolved && !i.html_changed)
                .map((it) => (
                  <div
                    key={it.id}
                    style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      marginBottom: 8,
                      fontSize: 12.5,
                      color: C.g500,
                    }}
                  >
                    <strong style={{ color: C.g900 }}>{it.name}</strong> —{" "}
                    {it.before.reason} Abra a variante e ajuste o HTML à mão.
                  </div>
                ))}
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 18px",
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <EGBtn onClick={onClose} disabled={applying}>
            Fechar
          </EGBtn>
          <EGBtn
            variant="dark"
            onClick={() => void apply()}
            disabled={applying || loading || pending.length === 0}
          >
            {applying ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Ruler size={15} />
            )}
            Fixar {pending.length} em {width}px
          </EGBtn>
        </div>
      </div>
    </div>
  )
}
