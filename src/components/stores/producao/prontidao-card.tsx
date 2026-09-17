"use client"

/**
 * Card "Prontidão para geração" (B1, set/2026) — topo da sidebar do
 * workspace de produção.
 *
 * Lê `GET /api/admin/stores/[id]/prontidao`, que roda a MESMA avaliação
 * que o gate do enfileiramento aplica: o que o card mostra é o que a fila
 * vai decidir. Bloqueio em vermelho (a loja não entra na fila), aviso em
 * amarelo (entra, com lacuna declarada). Cada item tem o botão que leva
 * ao lugar onde se resolve.
 *
 * "Gerar mesmo assim" só aparece com bloqueio e exige motivo: o motivo vai
 * para o run `gate_override` — quem olhar a telemetria depois sabe que a
 * peça saiu com a loja incompleta e por quê.
 */

import { useState } from "react"
import useSWR from "swr"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, ShieldAlert } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type { ItemDeProntidao, Prontidao } from "@/lib/stores/prontidao"

interface ProntidaoPayload extends Prontidao {
  gate_mode: "off" | "shadow" | "on"
}

const fetcher = async (url: string): Promise<ProntidaoPayload> => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) throw new Error(json?.error || `HTTP ${r.status}`)
  return json.data ?? json
}

export function ProntidaoCard({
  storeId,
  onOpenResource,
}: {
  storeId: string
  onOpenResource: (recurso: "brand" | "briefing") => void
}) {
  const { toast } = useToast()
  const { data, error, isLoading, mutate } = useSWR<ProntidaoPayload>(
    `/api/admin/stores/${storeId}/prontidao`,
    fetcher,
    { revalidateOnFocus: true },
  )
  const [aberto, setAberto] = useState(true)
  const [overrideAberto, setOverrideAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)

  const bloqueios = data?.bloqueios ?? []
  const avisos = data?.avisos ?? []

  const irPara = (item: ItemDeProntidao) => {
    if (item.acao.destino.tipo === "recurso") onOpenResource(item.acao.destino.recurso)
    else window.location.href = item.acao.destino.href
  }

  const gerarMesmoAssim = async () => {
    if (motivo.trim().length < 10) {
      toast({ title: "Motivo curto demais", description: "Diga em pelo menos 10 caracteres por que a loja deve gerar incompleta.", variant: "destructive" })
      return
    }
    setEnviando(true)
    try {
      const r = await fetch(`/api/admin/stores/${storeId}/regenerate-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override_motivo: motivo.trim() }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
      toast({ title: "Geração enfileirada com override", description: "O motivo ficou registrado no run gate_override." })
      setOverrideAberto(false)
      setMotivo("")
      void mutate()
    } catch (err) {
      toast({ title: "Não foi possível gerar", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setEnviando(false)
    }
  }

  const tone = bloqueios.length > 0 ? "bloqueio" : avisos.length > 0 ? "aviso" : "ok"
  const cor = tone === "bloqueio" ? "#B91C1C" : tone === "aviso" ? "#B45309" : "#047857"
  const fundo = tone === "bloqueio" ? "#FEF2F2" : tone === "aviso" ? "#FFFBEB" : "#ECFDF5"
  const borda = tone === "bloqueio" ? "#FECACA" : tone === "aviso" ? "#FDE68A" : "#A7F3D0"

  return (
    <div style={{ padding: "12px 12px 4px" }} data-testid="prontidao-card">
      <div style={{ border: `1px solid ${borda}`, background: fundo, borderRadius: 6 }}>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="w-full flex items-center gap-2 text-left"
          style={{ padding: "8px 10px", border: 0, background: "transparent", cursor: "pointer" }}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--crm-gray-400)" }} />
          ) : tone === "bloqueio" ? (
            <ShieldAlert className="h-3.5 w-3.5" style={{ color: cor }} />
          ) : tone === "aviso" ? (
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: cor }} />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: cor }} />
          )}
          <span className="flex-1 truncate" style={{ fontSize: 12, fontWeight: 600, color: cor }}>
            {isLoading
              ? "Conferindo prontidão…"
              : error
                ? "Prontidão indisponível"
                : tone === "bloqueio"
                  ? `${bloqueios.length} bloqueio${bloqueios.length > 1 ? "s" : ""} para gerar`
                  : tone === "aviso"
                    ? `Pronta · ${avisos.length} aviso${avisos.length > 1 ? "s" : ""}`
                    : "Pronta para gerar"}
          </span>
          {data?.gate_mode && data.gate_mode !== "on" && (
            <span title="Modo do gate na org" style={{ fontSize: 10, color: "var(--crm-gray-500)" }}>
              gate {data.gate_mode}
            </span>
          )}
          {aberto ? <ChevronDown className="h-3.5 w-3.5" style={{ color: cor }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: cor }} />}
        </button>

        {aberto && !isLoading && (
          <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {error && (
              <div style={{ fontSize: 11, color: "var(--crm-gray-600)" }}>{error.message}</div>
            )}
            {[...bloqueios, ...avisos].map((item) => (
              <div
                key={item.id}
                style={{
                  background: "var(--crm-gray-0)",
                  border: "1px solid var(--crm-border)",
                  borderLeft: `3px solid ${item.severidade === "bloqueio" ? "#DC2626" : "#D97706"}`,
                  borderRadius: 4,
                  padding: "6px 8px",
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--crm-gray-900)" }}>{item.titulo}</div>
                <div style={{ fontSize: 11, color: "var(--crm-gray-600)", marginTop: 2, lineHeight: 1.35 }}>{item.detalhe}</div>
                <button
                  type="button"
                  onClick={() => irPara(item)}
                  className="cf-focusable"
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--crm-brand)",
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  {item.acao.rotulo} →
                </button>
              </div>
            ))}
            {tone === "ok" && !error && (
              <div style={{ fontSize: 11, color: "var(--crm-gray-600)" }}>
                Pesquisa, produtos, paleta, logo e fontes presentes. A loja entra na fila sem ressalva.
              </div>
            )}

            {bloqueios.length > 0 && data?.gate_mode === "on" && (
              <div style={{ marginTop: 4 }}>
                {!overrideAberto ? (
                  <button
                    type="button"
                    onClick={() => setOverrideAberto(true)}
                    className="cf-focusable"
                    style={{ fontSize: 11, color: "var(--crm-gray-600)", background: "transparent", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}
                  >
                    Gerar mesmo assim…
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <textarea
                      id={`prontidao-override-${storeId}`}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Por que gerar com a loja incompleta? (obrigatório, fica no run gate_override)"
                      rows={3}
                      style={{ width: "100%", fontSize: 11.5, padding: "6px 8px", border: "1px solid var(--crm-border)", borderRadius: 4, background: "var(--crm-gray-0)", color: "var(--crm-gray-900)", resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={gerarMesmoAssim}
                        disabled={enviando}
                        className="cf-focusable"
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 4, background: "var(--crm-brand)", color: "#fff", border: 0, cursor: enviando ? "default" : "pointer" }}
                      >
                        {enviando ? "Enfileirando…" : "Gerar a loja inteira com override"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverrideAberto(false)}
                        className="cf-focusable"
                        style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 4, background: "transparent", color: "var(--crm-gray-700)", border: "1px solid var(--crm-border)", cursor: "pointer" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
