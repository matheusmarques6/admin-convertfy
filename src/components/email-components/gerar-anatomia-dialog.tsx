"use client"

/**
 * "Gerar anatomia" (Trilha B4): pedido → POST /api/admin/components/gerar →
 * resultado (aprovada e gravada desativada, ou reprovada com o relatório do
 * validador). A prévia nas duas paletas de prova vem da própria geração.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles, X } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import { EGBadge, EGBtn, EGInput, EGLabel, EGNotice, EGSelect } from "@/components/email-generation/ui/eg-atoms"
import { DESCRICAO_DO_DISPOSITIVO, DISPOSITIVOS_PEDIVEIS, type Dispositivo } from "@/lib/agents/shared/dispositivos"
import { DENSITY_LABELS_PT } from "@/lib/agents/shared/component-dimensions"

interface Info {
  cobertura: Record<string, { ativas: number; geradas_aguardando: number }>
  lojas: Array<{ id: string; nome: string }>
  paletas: Array<{ nome: string; origem: string }>
}

interface Resultado {
  status: "ok" | "reprovada" | "erro"
  variantId: string | null
  runId: string | null
  nome: string | null
  anatomiaSlug: string | null
  tentativas: number
  modeloFinal: string
  erros: string[]
  avisos: string[]
  custoCents: number
  previews: Array<{ nome: string; slug: string; url: string }>
}

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as (T & { error?: string; data?: T }) | null
  if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
  return (json?.data ?? json) as T
}

const usd = (cents: number) => `US$ ${(cents / 100).toFixed(3)}`

export function GerarAnatomiaDialog({
  open,
  onClose,
  onCreated,
  dispositivoInicial,
}: {
  open: boolean
  onClose: () => void
  /** Chamado com o id da variante gravada — o pai recarrega e a seleciona. */
  onCreated: (variantId: string) => void | Promise<void>
  dispositivoInicial?: Dispositivo | null
}) {
  const [info, setInfo] = useState<Info | null>(null)
  const [dispositivo, setDispositivo] = useState<string>(dispositivoInicial ?? "tese_declarada")
  const [variante, setVariante] = useState("a")
  const [densidade, setDensidade] = useState("balanced")
  const [idioma, setIdioma] = useState("pt-BR")
  const [notas, setNotas] = useState("")
  const [storeId, setStoreId] = useState("")
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/components/gerar")
      const data = await readJson<Info>(res)
      setInfo(data)
      setStoreId((s) => s || data.lojas[0]?.id || "")
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar")
    }
  }, [])

  useEffect(() => {
    if (open) {
      setResultado(null)
      setErro(null)
      if (dispositivoInicial) setDispositivo(dispositivoInicial)
      void load()
    }
  }, [open, load, dispositivoInicial])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !gerando) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, gerando])

  if (!open) return null

  async function gerar() {
    setGerando(true)
    setErro(null)
    setResultado(null)
    try {
      const res = await fetch("/api/admin/components/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispositivo, variante, densidade, idioma, notas: notas || undefined, store_id: storeId || undefined }),
      })
      const r = await readJson<Resultado>(res)
      setResultado(r)
      if (r.status === "ok" && r.variantId) {
        toast({ title: `Anatomia gerada: ${r.nome}`, description: `${r.tentativas} tentativa(s) · ${usd(r.custoCents)} · entra DESATIVADA` })
        await onCreated(r.variantId)
        await load()
      } else {
        toast({ variant: "destructive", title: r.status === "reprovada" ? "Reprovada pelo validador" : "Falha na geração", description: r.erros.slice(0, 2).join(" · ") })
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar")
    } finally {
      setGerando(false)
    }
  }

  const cob = info?.cobertura ?? {}

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gerar anatomia"
      onClick={() => !gerando && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(980px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", fontFamily: F.sans }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.g900 }}>Gerar anatomia</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" disabled={gerando} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.g500, padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 12 }}>
            O gerador escreve UMA variante nova para o dispositivo escolhido — 600px, table-based, com tokens de identidade — e a passa pelo
            validador (lint de envio, largura, tokens, cobertura schema × HTML, contrato do dispositivo). Até 3 tentativas com o relatório
            como correção; a última num modelo mais forte. Aprovada, entra <strong>desativada</strong> (selo &ldquo;gerada&rdquo;) com prévia
            nas paletas {info?.paletas.map((p) => p.nome).join(" e ") || "de prova"}. Ativar é o botão de sempre no editor.
          </div>

          {erro && (
            <div style={{ marginBottom: 12 }}>
              <EGNotice tone="neg">{erro}</EGNotice>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Dispositivo</EGLabel>
              <EGSelect
                value={dispositivo}
                onChange={setDispositivo}
                options={DISPOSITIVOS_PEDIVEIS.map((d) => ({
                  value: d,
                  label: `${d} — ${DESCRICAO_DO_DISPOSITIVO[d]} · ${cob[d]?.ativas ?? 0} ativa(s)${(cob[d]?.geradas_aguardando ?? 0) > 0 ? ` · ${cob[d].geradas_aguardando} gerada(s) aguardando` : ""}`,
                }))}
              />
            </div>
            <div>
              <EGLabel>Variante (letra)</EGLabel>
              <EGInput value={variante} onChange={(v) => setVariante(v.slice(0, 3))} placeholder="a" />
            </div>
            <div>
              <EGLabel>Densidade</EGLabel>
              <EGSelect value={densidade} onChange={setDensidade} options={Object.entries(DENSITY_LABELS_PT).map(([value, label]) => ({ value, label }))} />
            </div>
            <div>
              <EGLabel>Idioma dos exemplos</EGLabel>
              <EGInput value={idioma} onChange={setIdioma} placeholder="pt-BR" />
            </div>
            <div>
              <EGLabel>Loja de referência (run e paleta)</EGLabel>
              <EGSelect
                value={storeId}
                onChange={setStoreId}
                options={(info?.lojas ?? []).map((l) => ({ value: l.id, label: l.nome }))}
                placeholder={info && info.lojas.length === 0 ? "nenhuma loja de prova encontrada" : undefined}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <EGLabel>Notas do curador (opcional)</EGLabel>
              <textarea
                id="gerar-anatomia-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                placeholder="Ex.: banda escura no topo com o logo; grade 2×2; sem imagem de fundo."
                style={{ width: "100%", fontSize: 12.5, padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F.sans }}
              />
            </div>
          </div>

          {resultado && (
            <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <EGBadge tone={resultado.status === "ok" ? "pos" : "neg"}>{resultado.status === "ok" ? "aprovada · gravada desativada" : resultado.status === "reprovada" ? "reprovada pelo validador" : "erro"}</EGBadge>
                <EGBadge tone="neut">{resultado.tentativas} tentativa(s)</EGBadge>
                <EGBadge tone="neut">{resultado.modeloFinal}</EGBadge>
                <EGBadge tone="neut">{usd(resultado.custoCents)}</EGBadge>
                {resultado.nome && <span style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>{resultado.nome}</span>}
                {resultado.anatomiaSlug && <span style={{ fontSize: 11.5, color: C.g500, fontFamily: F.mono }}>{resultado.anatomiaSlug}</span>}
              </div>
              {resultado.erros.length > 0 && (
                <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12, color: "#991B1B", fontFamily: F.mono }}>
                  {resultado.erros.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {resultado.avisos.length > 0 && (
                <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 11.5, color: "#92400E", fontFamily: F.mono }}>
                  {resultado.avisos.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {resultado.previews.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                  {resultado.previews.map((p) => (
                    <div key={p.slug}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.g700, marginBottom: 4 }}>{p.nome}</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Prévia da anatomia na paleta ${p.nome}`} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6 }} />
                    </div>
                  ))}
                </div>
              )}
              {resultado.status === "ok" && resultado.previews.length === 0 && (
                <div style={{ fontSize: 11.5, color: C.g500 }}>Sem prévia renderizada (Chromium indisponível ou desligado) — abra a variante no editor para ver.</div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
          <EGBtn onClick={onClose} disabled={gerando}>
            Fechar
          </EGBtn>
          <EGBtn variant="dark" onClick={() => void gerar()} disabled={gerando || !dispositivo}>
            {gerando ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {gerando ? "Gerando (até ~4 min)…" : "Gerar anatomia"}
          </EGBtn>
        </div>
      </div>
    </div>
  )
}
