"use client"

/**
 * Painel "Conformidade" da execução (B6): decisão × entregue por posição.
 * Vermelho = divergente (com o nó responsável), verde = conforme, cinza =
 * não avaliada (geração anterior ao contrato, ou regra pendente).
 */

import { useState } from "react"
import useSWR from "swr"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { AGENT_VISUAL, type PipelineAgentKey } from "@/lib/agents/agent-visual"
import type { ConformidadeDoEmail, LinhaDeConformidade } from "@/types/conformidade"
import { usd3 } from "./studio-atoms"

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return (j?.data ?? j) as ConformidadeDoEmail
  })

const COR: Record<LinhaDeConformidade["estado"], { c: string; bg: string; b: string; rotulo: string }> = {
  conforme: { c: "#065F46", bg: "#ECFDF5", b: "#A7F3D0", rotulo: "conforme" },
  divergente: { c: "#991B1B", bg: "#FEF2F2", b: "#FECACA", rotulo: "divergente" },
  nao_avaliada: { c: C.g500, bg: C.g50, b: C.border, rotulo: "não avaliada" },
}

const id8 = (v: string | null) => (v ? v.slice(0, 8) : "—")

export function ConformidadePanel({ emailId }: { emailId: string }) {
  const [aberto, setAberto] = useState(false)
  const { data, error, isLoading } = useSWR<ConformidadeDoEmail>(
    aberto ? `/api/admin/emails/${emailId}/conformidade` : null,
    fetcher,
  )
  const r = data?.resumo
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: C.white }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, padding: "8px 18px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", fontFamily: F.sans }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: C.g900 }}>Conformidade · decisão × entregue</span>
        {r && (
          <span style={{ fontSize: 11.5, color: C.g500, ...TNUM }}>
            {r.conformes} conforme{r.conformes === 1 ? "" : "s"} · {r.divergentes} divergente{r.divergentes === 1 ? "" : "s"}
            {r.nao_avaliadas > 0 ? ` · ${r.nao_avaliadas} não avaliada${r.nao_avaliadas === 1 ? "" : "s"}` : ""}
            {data?.custo_ate_divergencia_cents != null ? ` · custo até a divergência ${usd3(data.custo_ate_divergencia_cents)}` : ""}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.g400 }}>{aberto ? "ocultar" : "mostrar"}</span>
      </button>
      {aberto && (
        <div style={{ padding: "0 18px 12px", overflowX: "auto" }}>
          {isLoading && <div style={{ fontSize: 11.5, color: C.g500 }}>Carregando…</div>}
          {error && <div style={{ fontSize: 11.5, color: "#991B1B" }}>{error.message}</div>}
          {data && !data.decisao_presente && (
            <div style={{ fontSize: 11.5, color: C.g500, marginBottom: 8 }}>
              Geração anterior ao contrato de decisão: as colunas mostram o que foi gravado, mas nada foi conferido contra uma decisão.
            </div>
          )}
          {data && data.linhas.length > 0 && (
            <table style={{ borderCollapse: "collapse", fontSize: 11.5, fontFamily: F.sans, minWidth: 900 }}>
              <thead>
                <tr style={{ color: C.g500, textAlign: "left" }}>
                  {["#", "Seção", "Dispositivo", "Papel pedido", "Curador", "Blueprint", "Montado", "Entregue", "Estado", "Nó", "Motivo"].map((h) => (
                    <th key={h} style={{ padding: "4px 8px", fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((l) => {
                  const cor = COR[l.estado]
                  const no = l.no_responsavel ? AGENT_VISUAL[l.no_responsavel as PipelineAgentKey]?.name ?? l.no_responsavel : "—"
                  return (
                    <tr key={l.block_index} style={{ background: l.estado === "divergente" ? cor.bg : "transparent" }}>
                      <td style={{ padding: "5px 8px", ...TNUM }}>{l.block_index + 1}</td>
                      <td style={{ padding: "5px 8px" }}>{l.section ?? "—"}</td>
                      <td style={{ padding: "5px 8px", color: l.dispositivo_pedido ? C.g900 : C.g400 }}>
                        {l.dispositivo_pedido ?? (l.regra_pendente.includes("dispositivo") ? "— (regra pendente)" : "—")}
                      </td>
                      <td style={{ padding: "5px 8px", maxWidth: 260 }} title={l.papel ?? ""}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.papel ?? "—"}</span>
                      </td>
                      <td style={{ padding: "5px 8px", ...TNUM }} title={l.variante_curador ?? (l.origem_da_variante === "resgate" ? "posição resgatada por código — o Curador não escolheu" : "")}>
                        {l.variante_curador ? id8(l.variante_curador) : l.origem_da_variante === "resgate" ? <span style={{ color: "#92400E" }}>resgate</span> : "—"}
                      </td>
                      <td style={{ padding: "5px 8px", ...TNUM }} title={l.variante_blueprint ?? ""}>{id8(l.variante_blueprint)}</td>
                      <td style={{ padding: "5px 8px", ...TNUM }} title={l.variante_montada ?? ""}>{id8(l.variante_montada)}</td>
                      <td style={{ padding: "5px 8px", ...TNUM }} title={l.variante_entregue ?? ""}>{id8(l.variante_entregue)}</td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: cor.c, background: cor.bg, border: `1px solid ${cor.b}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{cor.rotulo}</span>
                      </td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{no}</td>
                      <td style={{ padding: "5px 8px", color: C.g500, maxWidth: 360 }} title={l.motivo ?? ""}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.motivo ?? ""}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
