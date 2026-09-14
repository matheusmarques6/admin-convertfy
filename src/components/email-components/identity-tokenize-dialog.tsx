"use client"

/**
 * Varredura "Tokens de identidade" da biblioteca — prévia + aplicar (B5).
 *
 * Fala com `/api/admin/components/tokenize-identity`: o GET diz, variante a
 * variante, o que a heurística mudaria (de/para por token, o que ficou sem
 * papel) e devolve o HTML tokenizado; a tela o RENDERIZA nas duas paletas
 * de prova (Luxe Lift, escura; Innova Bay, verde/clara) antes de gravar —
 * uma inferência errada aqui sai em toda peça que usar a variante, então a
 * revisão é humana e por variante. O POST aplica só nas marcadas.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Palette, X } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import { EGBadge, EGBtn, EGNotice, EGRenderFrame } from "@/components/email-generation/ui/eg-atoms"
import { aplicarTokens, type TokenDeIdentidade, type ValoresDeTokens } from "@/lib/agents/html/identity-tokens"
import type { MapaDeToken, NaoInferido } from "@/lib/agents/html/identity-tokenize"

interface Item {
  id: string
  name: string
  block_type: string
  is_active: boolean
  flag_atual: boolean
  ja_tokenizado: boolean
  mapa: MapaDeToken[]
  nao_inferidos: NaoInferido[]
  tokens_presentes: TokenDeIdentidade[]
  html_changed: boolean
  tagged_changed: boolean
  html_tokenizado: string
}

interface Paleta {
  nome: string
  origem: "loja" | "padrao"
  tokens: ValoresDeTokens
}

interface Summary {
  total: number
  to_change: number
  already_tokenized: number
  nothing_inferred: number
}

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as (T & { error?: string; data?: T }) | null
  if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
  return (json?.data ?? json) as T
}

const precisaAplicar = (i: Item) => i.html_changed || i.tagged_changed || (i.ja_tokenizado && !i.flag_atual)

export function IdentityTokenizeDialog({
  open,
  onClose,
  onApplied,
}: {
  open: boolean
  onClose: () => void
  onApplied: () => void | Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [paletas, setPaletas] = useState<Paleta[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/components/tokenize-identity")
      const data = await readJson<{ items: Item[]; summary: Summary; paletas: Paleta[] }>(res)
      setItems(data.items ?? [])
      setSummary(data.summary ?? null)
      setPaletas(data.paletas ?? [])
      // Nasce com TODAS as pendentes marcadas; desmarcar é a revisão.
      setMarcados(new Set((data.items ?? []).filter(precisaAplicar).map((i) => i.id)))
      setAberto((data.items ?? []).find(precisaAplicar)?.id ?? null)
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

  const pendentes = useMemo(() => items.filter(precisaAplicar), [items])
  const selecionado = useMemo(() => items.find((i) => i.id === aberto) ?? null, [items, aberto])
  const previews = useMemo(
    () => (selecionado ? paletas.map((p) => ({ nome: p.nome, origem: p.origem, html: aplicarTokens(selecionado.html_tokenizado, p.tokens).html })) : []),
    [selecionado, paletas],
  )

  if (!open) return null

  async function apply() {
    const ids = [...marcados]
    if (ids.length === 0) return
    setApplying(true)
    try {
      const res = await fetch("/api/admin/components/tokenize-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await readJson<{ updated: string[]; failed: Array<{ id: string; error: string }> }>(res)
      const ok = data.updated?.length ?? 0
      const bad = data.failed?.length ?? 0
      toast({
        variant: bad > 0 ? "destructive" : "default",
        title: `${ok} variante(s) tokenizada(s)`,
        description: bad > 0 ? `${bad} falharam: ${data.failed.map((f) => f.error).join("; ")}` : undefined,
      })
      await onApplied()
      await load()
    } catch (e) {
      toast({ variant: "destructive", title: "Falha ao aplicar", description: e instanceof Error ? e.message : undefined })
    } finally {
      setApplying(false)
    }
  }

  const toggle = (id: string) =>
    setMarcados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tokens de identidade na biblioteca"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(1180px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", fontFamily: F.sans }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Palette size={16} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.g900 }}>Tokens de identidade na biblioteca</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.g500, padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 12 }}>
            A heurística troca o hex fixo da variante por <code>{"{{COR_FUNDO}}"}</code>, <code>{"{{COR_PRINCIPAL}}"}</code>,{" "}
            <code>{"{{COR_TEXTO}}"}</code>, <code>{"{{FONTE_TITULO}}"}</code>… — e a peça passa a sair na paleta de cada loja por
            código, sem o agente de cor. O que não coube em papel nenhum fica hex (listado como &ldquo;sem papel&rdquo;).
            Confira cada variante nas duas paletas de prova antes de aplicar: inferência errada aqui sai em toda peça que a usar.
            A gravação guarda o HTML anterior em <code>geracao_meta.tokenizacao</code>.
          </div>

          {error && (
            <div style={{ marginBottom: 12 }}>
              <EGNotice tone="neg">{error}</EGNotice>
            </div>
          )}

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 30, color: C.g400 }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <>
              {summary && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  <EGBadge tone="neut">{summary.total} ativas</EGBadge>
                  <EGBadge tone="pos">{summary.already_tokenized} já tokenizadas</EGBadge>
                  <EGBadge tone={summary.to_change > 0 ? "warn" : "neut"}>{summary.to_change} a tokenizar</EGBadge>
                  {summary.nothing_inferred > 0 && <EGBadge tone="neg">{summary.nothing_inferred} sem nada inferível</EGBadge>}
                  {paletas.map((p) => (
                    <EGBadge key={p.nome} tone="neut">
                      prova: {p.nome} ({p.origem === "loja" ? "identidade real" : "paleta fixa"})
                    </EGBadge>
                  ))}
                </div>
              )}

              {pendentes.length === 0 && !error && <EGNotice tone="pos">Nenhuma variante ativa precisa de tokenização.</EGNotice>}

              <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16 }}>
                <div>
                  {pendentes.map((it) => (
                    <div
                      key={it.id}
                      onClick={() => setAberto(it.id)}
                      style={{ border: `1px solid ${aberto === it.id ? C.g900 : C.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8, cursor: "pointer", background: aberto === it.id ? C.g50 : "transparent" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <input
                          id={`tok-${it.id}`}
                          type="checkbox"
                          checked={marcados.has(it.id)}
                          onChange={() => toggle(it.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Aplicar em ${it.name}`}
                        />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.g900, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                        <EGBadge tone="neut">{it.block_type}</EGBadge>
                      </div>
                      <div style={{ fontSize: 11, color: C.g500, fontFamily: F.mono }}>
                        {it.mapa.map((m) => `${m.token}←${m.de}`).join(" · ") || "só a marca (já tinha tokens)"}
                      </div>
                      {it.nao_inferidos.length > 0 && (
                        <div style={{ fontSize: 11, color: "#92400E", marginTop: 2 }}>
                          sem papel: {it.nao_inferidos.map((n) => `${n.valor} (${n.contextos.join("/")}${n.razao === "conflito" ? `, conflito com ${n.conflito_com}` : ""})`).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  {selecionado ? (
                    <>
                      <div style={{ fontSize: 12, color: C.g700, marginBottom: 8 }}>
                        <strong>{selecionado.name}</strong> — a MESMA anatomia nas duas paletas de prova:
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                        {previews.map((p) => (
                          <div key={p.nome}>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.g700, marginBottom: 4 }}>
                              {p.nome} <span style={{ fontWeight: 400, color: C.g400 }}>({p.origem === "loja" ? "identidade real" : "paleta fixa"})</span>
                            </div>
                            <EGRenderFrame html={p.html} emailWidth={600} minHeight={360} collapsedMax={520} />
                          </div>
                        ))}
                      </div>
                      <details style={{ marginTop: 10, fontSize: 11.5, color: C.g500 }}>
                        <summary style={{ cursor: "pointer" }}>Mapa de/para</summary>
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontFamily: F.mono }}>
                          {selecionado.mapa.map((m, i) => (
                            <li key={i}>
                              {m.token} ← {m.de} · {m.ocorrencias}× — {m.motivo}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: C.g400 }}>Selecione uma variante para ver a prévia.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
          <EGBtn onClick={onClose} disabled={applying}>
            Fechar
          </EGBtn>
          <EGBtn variant="dark" onClick={() => void apply()} disabled={applying || loading || marcados.size === 0}>
            {applying ? <Loader2 size={15} className="animate-spin" /> : <Palette size={15} />}
            Tokenizar {marcados.size} variante(s)
          </EGBtn>
        </div>
      </div>
    </div>
  )
}
