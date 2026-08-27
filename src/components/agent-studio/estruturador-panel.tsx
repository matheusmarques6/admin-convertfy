"use client"

/**
 * Estúdio de Agentes — painel de embasamento do Estruturador (fase 4 do
 * ADR adr-estruturador-adaptativo).
 *
 * Renderiza o parsed_output da run de forma LEGÍVEL (decisão 8: "nós
 * precisamos entender como a ia pensou e como influenciou cada uma das
 * partes"): diagnóstico, estrutura posição a posição com referência+porquê,
 * fio narrativo, fontes, aprendizados aplicados e descartes.
 *
 * Embaixo, o ciclo de calibração (decisão 9): 👍/👎 + comentário por run
 * (upsert por autor — reclicar atualiza) e o botão "Gerar rascunho de
 * aprendizado", que monta a nota do vault a partir da run + feedback
 * (buildAprendizadoDraft, puro). O caminho de volta ao agente é a curadoria
 * no Obsidian — nunca injeção direta no prompt.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Copy as CopyIcon, ThumbsDown, ThumbsUp } from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { buildAprendizadoDraft } from "@/lib/agents/estruturador/aprendizado-draft"
import {
  CodeBlock,
  OUT_BODY,
  OUT_LABEL,
  OutCard,
  OutItem,
  OutPill,
  OutSection,
  StudioBtn,
} from "./studio-atoms"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ── Shapes tolerantes do parsed_output (a run é a fonte; UI não valida) ──

interface PosicaoView {
  section?: string
  papel?: string
  referencia?: string
  adaptacao?: string
  porque?: string
}

interface DescarteView {
  section?: string | null
  papel_na_referencia?: string | null
  porque?: string
  origem?: string
}

interface EmbasamentoView {
  diagnostico?: {
    objecao_dominante?: string
    referencia_base?: string
    traducao_do_mecanismo?: string
  }
  estrutura?: PosicaoView[]
  fio_narrativo?: string
  fontes?: Array<{ ref?: string; o_que_pegou?: string; porque?: string }>
  aprendizados_aplicados?: Array<{ slug?: string; como?: string }>
  text_only?: boolean
  descartes?: DescarteView[]
  _validador?: { retry_count?: number; posicoes_removidas?: number; shadow?: boolean }
}

interface FeedbackRow {
  id: string
  rating: "up" | "down"
  comentario: string | null
  autor: string | null
  mine: boolean
  created_at: string
}

// Os átomos (label/body/Sec/Pill) viraram compartilhados em studio-atoms:
// as saídas do Curador, do Montador e do Blueprint usam a MESMA anatomia
// que este painel estabeleceu.
const label = OUT_LABEL
const body = OUT_BODY
const Sec = OutSection
const Pill = OutPill

export function EstruturadorEmbasamento({ output }: { output: unknown }) {
  const o = (output ?? {}) as EmbasamentoView
  const estrutura = Array.isArray(o.estrutura) ? o.estrutura : []
  const descartes = Array.isArray(o.descartes) ? o.descartes : []
  const fontes = Array.isArray(o.fontes) ? o.fontes : []
  const aprendizados = Array.isArray(o.aprendizados_aplicados)
    ? o.aprendizados_aplicados
    : []

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {o._validador?.shadow === true && <Pill text="shadow — não consumido" tone="warn" />}
        {o._validador?.shadow === false && <Pill text="consumido pelo pipeline" tone="info" />}
        {(o._validador?.retry_count ?? 0) > 0 && (
          <Pill text={`retry ×${o._validador?.retry_count}`} tone="neut" />
        )}
        {(o._validador?.posicoes_removidas ?? 0) > 0 && (
          <Pill text={`${o._validador?.posicoes_removidas} posição(ões) removidas pelo validador`} tone="warn" />
        )}
        {o.text_only === true && <Pill text="text_only" tone="warn" />}
      </div>

      <Sec title="Diagnóstico">
        <div style={body}>
          <strong>Objeção dominante:</strong> {o.diagnostico?.objecao_dominante ?? "—"}
          <br />
          <strong>Referência base:</strong> {o.diagnostico?.referencia_base ?? "—"}
          <br />
          <strong>Tradução do mecanismo:</strong>{" "}
          {o.diagnostico?.traducao_do_mecanismo ?? "—"}
        </div>
      </Sec>

      {estrutura.length > 0 && (
        <Sec title={`Estrutura (${estrutura.length} posições)`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {estrutura.map((p, i) => (
              <OutItem key={i}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...body, fontWeight: 700, ...TNUM }}>{i + 1}.</span>
                  <span style={{ ...body, fontWeight: 700 }}>{p.section ?? "?"}</span>
                  {p.referencia && <Pill text={p.referencia} tone="neut" />}
                </div>
                <div style={{ ...body, marginTop: 3 }}>{p.papel ?? "—"}</div>
                {p.adaptacao && (
                  <div style={{ ...body, color: C.g500, marginTop: 2 }}>
                    <strong>Adaptação:</strong> {p.adaptacao}
                  </div>
                )}
                {p.porque && (
                  <div style={{ ...body, color: C.g500, marginTop: 2 }}>
                    <strong>Porquê:</strong> {p.porque}
                  </div>
                )}
              </OutItem>
            ))}
          </div>
        </Sec>
      )}

      {o.fio_narrativo && (
        <Sec title="Fio narrativo">
          <div style={{ ...body, fontStyle: "italic" }}>{o.fio_narrativo}</div>
        </Sec>
      )}

      {fontes.length > 0 && (
        <Sec title="Fontes">
          <div style={body}>
            {fontes.map((f, i) => (
              <div key={i} style={{ marginBottom: 3 }}>
                <strong>{f.ref ?? "?"}</strong> — {f.o_que_pegou ?? "—"}
                {f.porque ? ` (${f.porque})` : ""}
              </div>
            ))}
          </div>
        </Sec>
      )}

      {aprendizados.length > 0 && (
        <Sec title="Aprendizados aplicados">
          <div style={body}>
            {aprendizados.map((a, i) => (
              <div key={i} style={{ marginBottom: 3 }}>
                <strong>{a.slug ?? "?"}</strong>
                {a.como ? ` — ${a.como}` : ""}
              </div>
            ))}
          </div>
        </Sec>
      )}

      {descartes.length > 0 && (
        <Sec title="Descartes">
          <div style={body}>
            {descartes.map((d, i) => (
              <div key={i} style={{ marginBottom: 3, display: "flex", gap: 6, alignItems: "baseline" }}>
                <Pill
                  text={d.origem === "validador" ? "validador" : "modelo"}
                  tone={d.origem === "validador" ? "warn" : "neut"}
                />
                <span>
                  {d.section ? `${d.section}: ` : ""}
                  {d.papel_na_referencia ? `${d.papel_na_referencia} — ` : ""}
                  {d.porque ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </Sec>
      )}
    </OutCard>
  )
}

export function EstruturadorFeedback({
  runId,
  output,
  flowType,
  emailNumber,
  storeName,
  runIso,
}: {
  runId: string
  output: unknown
  flowType: string | null
  emailNumber: number
  storeName: string
  /** Data da run (ou da execução) — vira o `data` do rascunho. */
  runIso: string
}) {
  const { data, mutate } = useSWR<{ feedbacks: FeedbackRow[] }>(
    `/api/admin/agents/estruturador-feedback?run_id=${runId}`,
    fetcher,
  )
  const feedbacks = useMemo(() => data?.feedbacks ?? [], [data])
  const meu = feedbacks.find((f) => f.mine) ?? null

  const [comentario, setComentario] = useState("")
  const [enviando, setEnviando] = useState<"up" | "down" | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ path: string; markdown: string } | null>(null)

  const enviar = async (rating: "up" | "down") => {
    setEnviando(rating)
    setErro(null)
    try {
      const res = await fetch("/api/admin/agents/estruturador-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          rating,
          comentario: comentario.trim() || meu?.comentario || null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          (json && typeof json.error === "string" && json.error) ||
            "Falha ao registrar o feedback",
        )
      }
      setComentario("")
      void mutate()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar feedback")
    } finally {
      setEnviando(null)
    }
  }

  const gerarDraft = () => {
    const d = buildAprendizadoDraft({
      flowType: flowType ?? "custom",
      emailNumber,
      storeName,
      runId,
      dataIso: runIso,
      feedbacks: feedbacks.map((f) => ({
        rating: f.rating,
        comentario: f.comentario,
        autor: f.autor,
      })),
      output: (output ?? {}) as Parameters<typeof buildAprendizadoDraft>[0]["output"],
    })
    setDraft({ path: d.path, markdown: d.markdown })
  }

  const fbBtn = (rating: "up" | "down") => {
    const on = meu?.rating === rating
    const Icon = rating === "up" ? ThumbsUp : ThumbsDown
    const tone = rating === "up" ? "#065F46" : "#991B1B"
    return (
      <button
        onClick={() => void enviar(rating)}
        disabled={enviando != null}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 7,
          border: `1px solid ${on ? tone : C.border}`,
          background: on ? (rating === "up" ? "#ECFDF5" : "#FEF2F2") : C.white,
          color: on ? tone : C.g500,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: F.sans,
          cursor: enviando != null ? "wait" : "pointer",
        }}
      >
        <Icon size={13} />
        {rating === "up" ? "Boa decisão" : "Decisão ruim"}
      </button>
    )
  }

  return (
    <div
      style={{
        marginBottom: 12,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        background: C.g50,
      }}
    >
      <div style={{ ...label, marginBottom: 8 }}>Feedback do COO</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {fbBtn("up")}
        {fbBtn("down")}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder={
          meu?.comentario
            ? `Seu comentário atual: ${meu.comentario}`
            : "O que estava certo/errado nesta decisão? (vai junto do 👍/👎)"
        }
        rows={2}
        maxLength={4000}
        style={{
          width: "100%",
          resize: "vertical",
          borderRadius: 7,
          border: `1px solid ${C.border}`,
          padding: "7px 10px",
          fontSize: 12,
          fontFamily: F.sans,
          color: C.g900,
          background: C.white,
          marginBottom: 8,
        }}
      />
      {erro && (
        <div style={{ fontSize: 11.5, color: "#991B1B", fontFamily: F.sans, marginBottom: 8 }}>
          {erro}
        </div>
      )}

      {feedbacks.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...label, marginBottom: 4 }}>Feedback recebido</div>
          {feedbacks.map((f) => (
            <div key={f.id} style={{ ...body, marginBottom: 3 }}>
              {f.rating === "up" ? "👍" : "👎"} <strong>{f.autor ?? "—"}</strong>
              {f.comentario ? `: ${f.comentario}` : ""}
            </div>
          ))}
        </div>
      )}

      <StudioBtn onClick={gerarDraft} style={{ height: 30 }}>
        Gerar rascunho de aprendizado
      </StudioBtn>

      {draft && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ ...body, color: C.g500 }}>
              Salvar no vault como <code style={{ fontSize: 11 }}>{draft.path}</code>
            </span>
            <StudioBtn
              onClick={() => void navigator.clipboard?.writeText(draft.markdown)}
              style={{ height: 26 }}
            >
              <CopyIcon size={12} /> Copiar
            </StudioBtn>
          </div>
          <CodeBlock text={draft.markdown} />
        </div>
      )}
    </div>
  )
}
