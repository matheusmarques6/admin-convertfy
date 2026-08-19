"use client"

/**
 * Estúdio de Agentes — aba Teste: dispara gerações de teste e acompanha em
 * DOIS modos de visualização sobre a MESMA execução (o estado vive no hook
 * compartilhado useTestGeneration — trocar de modo não perde nada):
 *
 *   - Fluxo (por nós, default): o canvas do pipeline com a execução AO
 *     VIVO — nó rodando derivado da máquina de status do email
 *     (projectLiveTest), pills de tempo/custo, clique abre o detalhe.
 *   - Etapas (o que temos hoje): a lista de agentes da aba Testar do hub.
 */

import { useMemo, useState } from "react"
import { Eye, Play, Rocket, Zap } from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { FLOW_TYPE_LABELS } from "@/components/email-generation/flow-labels"
import { useTestGeneration } from "@/components/email-generation/use-test-generation"
import { fmtElapsed } from "@/lib/agents/test-run-view"
import { projectLiveTest } from "@/lib/agents/studio-graph"
import type { ExecutionRow } from "./studio-data"
import { FlowCanvas, defaultPositions, type Positions } from "./flow-canvas"
import { NodeRunPanel } from "./execs-tab"
import { Spinner, StudioBtn } from "./studio-atoms"
import { TestStepsView } from "./test-steps-view"

type ViewMode = "flow" | "steps"
const VIEW_LS_KEY = "cf-studio-test-view"

const selectStyle: React.CSSProperties = {
  height: 31,
  padding: "0 8px",
  borderRadius: 7,
  border: `1px solid ${C.border}`,
  background: C.white,
  fontSize: 12,
  color: C.g900,
  fontFamily: F.sans,
  outline: "none",
  maxWidth: 190,
}

export function StudioTestTab({ positions }: { positions?: Positions }) {
  const t = useTestGeneration()
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(VIEW_LS_KEY)
        if (stored === "flow" || stored === "steps") return stored
      } catch {
        /* noop */
      }
    }
    return "flow"
  })
  const pickView = (v: ViewMode) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_LS_KEY, v)
    } catch {
      /* noop */
    }
  }

  const [nodeKey, setNodeKey] = useState<string | null>(null)
  const pos = positions ?? defaultPositions()

  // Projeção ao vivo — só quando existe um teste em contexto.
  const liveRuns = useMemo(() => {
    if (!t.hasRun) return null
    const currentBatchId = t.statusInfo?.currentBatchId ?? t.batchId
    const runs = (t.statusInfo?.runs ?? []).filter(
      (r) => !currentBatchId || r.batch_id === currentBatchId,
    )
    return projectLiveTest({
      runs,
      emailStatus: t.statusInfo?.email_status,
      htmlStage: t.statusInfo?.html_pipeline_stage,
      mode: t.lastMode,
      terminal: t.statusInfo?.status ?? t.result?.status ?? null,
    })
  }, [t.hasRun, t.statusInfo, t.batchId, t.lastMode, t.result?.status])

  // Exec sintética pro NodeRunPanel (mesmo painel da aba Execuções) — o
  // rerun do painel dispara os MESMOS modos do teste.
  const syntheticExec: ExecutionRow | null = useMemo(() => {
    if (!t.selectedEmailId || !t.selectedFlow || !t.selectedEmail) return null
    const bucket =
      t.statusInfo?.status === "error" || t.result?.status === "error"
        ? "error"
        : t.statusInfo?.status === "done"
          ? "success"
          : "running"
    return {
      email_id: t.selectedEmailId,
      email_name: t.selectedEmail.name,
      email_number: t.selectedEmail.number,
      email_status: t.statusInfo?.email_status ?? t.selectedEmail.status,
      bucket,
      failure_reason: null,
      updated_at: new Date(t.nowTick).toISOString(),
      ready_at: null,
      failed_at: null,
      store_id: t.selectedStoreId || null,
      store_name:
        t.stores.find((s) => s.id === t.selectedStoreId)?.store_name ?? "—",
      flow_id: t.selectedFlow.id,
      flow_type: t.selectedFlow.flow_type,
      flow_type_label:
        FLOW_TYPE_LABELS[t.selectedFlow.flow_type] ?? t.selectedFlow.flow_type,
      cost_cents: 0,
      runs: [],
    }
  }, [t.selectedEmailId, t.selectedFlow, t.selectedEmail, t.selectedStoreId, t.stores, t.statusInfo, t.result?.status, t.nowTick])

  const onPanelRerun = (mode: "phase2" | "full_pipeline" | "blueprints") => {
    if (mode === "phase2") void t.handleGenerate(true)
    else if (mode === "full_pipeline") void t.handleGenerate(false, true)
    else if (syntheticExec?.store_id) {
      void fetch(`/api/admin/stores/${syntheticExec.store_id}/generate-blueprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flow_ids: syntheticExec.flow_id ? [syntheticExec.flow_id] : undefined,
          force: true,
        }),
      })
    }
  }

  const ready =
    Boolean(t.selectedStoreId && t.selectedFlowId && t.selectedEmailId) &&
    !t.generationInFlight

  const headerText = t.result?.status === "dispatched"
    ? "Copy disparada ao N8N"
    : t.statusInfo?.status === "done" || t.result?.status === "done"
      ? "Geração concluída"
      : t.statusInfo?.status === "error" || t.result?.status === "error"
        ? "Erro na geração"
        : t.hasRun
          ? "Gerando email…"
          : null

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* ── Barra de briefing ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 16px",
          background: C.white,
          borderBottom: `1px solid ${C.border}`,
          flexWrap: "wrap",
        }}
      >
        <select
          style={selectStyle}
          value={t.selectedStoreId}
          onChange={(e) => t.selectStore(e.target.value)}
          aria-label="Loja"
        >
          <option value="">{t.loadingStores ? "Carregando lojas…" : "Loja…"}</option>
          {t.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.store_name}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={t.selectedFlowId}
          onChange={(e) => t.selectFlow(e.target.value)}
          disabled={!t.selectedStoreId}
          aria-label="Flow"
        >
          <option value="">
            {t.loadingFlows ? "Carregando…" : t.selectedStoreId && t.flows.length === 0 ? "Sem flows" : "Flow…"}
          </option>
          {t.flows.map((f) => (
            <option key={f.id} value={f.id}>
              {FLOW_TYPE_LABELS[f.flow_type] ?? f.flow_type} — {f.name}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={t.selectedEmailId}
          onChange={(e) => t.selectEmail(e.target.value)}
          disabled={!t.selectedFlow || (t.selectedFlow?.emails.length ?? 0) === 0}
          aria-label="Email"
        >
          <option value="">Email…</option>
          {(t.selectedFlow?.emails ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              #{e.number} — {e.name} [{e.status}]
            </option>
          ))}
        </select>
        <input
          style={{ ...selectStyle, flex: "1 1 160px", maxWidth: 320 }}
          value={t.testContext}
          onChange={(e) => t.setTestContext(e.target.value)}
          placeholder="Objetivo / contexto (opcional)"
          aria-label="Contexto do teste"
        />
        <StudioBtn
          variant="primary"
          onClick={() => t.handleGenerate(false, true)}
          disabled={!ready}
          title="Fluxo completo real: fase 1 → copy NOVA via n8n só deste e-mail → fase 2 automática. Assíncrono."
        >
          {t.generating ? <Spinner size={12} track="rgba(255,255,255,0.4)" head="#fff" /> : <Rocket size={13} />}
          Pipeline completo
        </StudioBtn>
        <StudioBtn
          onClick={() => t.handleGenerate()}
          disabled={!ready}
          title="Com copy: Montador → Blueprint → render. Sem copy: dispara ao N8N."
        >
          <Play size={13} /> Gerar
        </StudioBtn>
        <StudioBtn
          onClick={() => t.handleGenerate(true)}
          disabled={!ready}
          title="Reusa Montador/Blueprint/copy existentes e roda só a fase 2 (requer copy no email)"
        >
          <Zap size={13} /> Só fase 2
        </StudioBtn>
        <StudioBtn
          onClick={() => {
            void t.handlePreviewVars()
            pickView("steps")
          }}
          disabled={t.previewingVars || !t.selectedStoreId || !t.selectedEmailId}
          title="Mostra as vars que o HTML vai receber, sem invocar o LLM (abre no modo Etapas)"
        >
          <Eye size={13} /> Vars
        </StudioBtn>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: C.g100, padding: 3, borderRadius: 8 }}>
          {(
            [
              ["flow", "Fluxo"],
              ["steps", "Etapas"],
            ] as Array<[ViewMode, string]>
          ).map(([k, label]) => {
            const on = view === k
            return (
              <button
                key={k}
                onClick={() => pickView(k)}
                style={{
                  padding: "4px 13px",
                  borderRadius: 6,
                  border: "none",
                  background: on ? C.white : "transparent",
                  color: on ? C.g900 : C.g500,
                  fontWeight: on ? 600 : 500,
                  fontSize: 12,
                  fontFamily: F.sans,
                  cursor: "pointer",
                  boxShadow: on ? C.shadowSm : "none",
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Faixa de status (igual nos dois modos) ── */}
      {(headerText || t.showStaleWarning || t.result?.error || t.result?.relaxedBrand) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "8px 16px",
            background: C.g50,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {headerText && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {t.hasRun &&
                t.statusInfo?.status !== "done" &&
                t.statusInfo?.status !== "error" &&
                t.result?.status !== "error" &&
                t.result?.status !== "done" && <Spinner size={12} />}
              <span
                style={{ fontSize: 12.5, fontWeight: 600, color: C.g900, fontFamily: F.sans }}
              >
                {headerText}
              </span>
              {t.hasRun && !t.isTerminalStatus && (t.phaseMessage || t.result?.message) && (
                <span style={{ fontSize: 12, color: C.g500, fontFamily: F.sans }}>
                  {t.phaseMessage ?? t.result?.message}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {t.startedAt != null && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontFamily: F.mono,
                    color: t.timerActive ? C.brand : C.g400,
                    ...TNUM,
                  }}
                >
                  ⏱ {fmtElapsed(t.nowTick - t.startedAt)}
                </span>
              )}
            </div>
          )}
          {t.result?.relaxedBrand && (
            <div style={{ fontSize: 11.5, color: C.warn, fontFamily: F.sans }}>
              Modo teste tolerante: brand identity pode estar incompleta — o email pode
              sair sem logo ou com cores default.
            </div>
          )}
          {t.showStaleWarning && (
            <div style={{ fontSize: 11.5, color: C.warn, fontFamily: F.sans }}>
              ⚠️ Geração parece travada — o watchdog vai limpar em alguns minutos.
            </div>
          )}
          {t.result?.error && (
            <div
              style={{
                fontSize: 12,
                color: C.neg,
                fontFamily: F.mono,
                wordBreak: "break-all",
              }}
            >
              {t.result.error}
            </div>
          )}
        </div>
      )}

      {/* ── Conteúdo ── */}
      {view === "flow" ? (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            <FlowCanvas
              positions={pos}
              selected={nodeKey}
              onSelect={setNodeKey}
              runs={liveRuns}
              overlay={
                !t.hasRun ? (
                  <div
                    style={{
                      position: "absolute",
                      top: 14,
                      left: 16,
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11.5,
                        color: C.g400,
                        fontFamily: F.sans,
                        background: "rgba(255,255,255,0.85)",
                        padding: "3px 9px",
                        borderRadius: 6,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      Selecione loja, flow e email e dispare — a execução aparece ao vivo nos nós
                    </span>
                  </div>
                ) : null
              }
            />
          </div>
          {nodeKey && liveRuns?.[nodeKey] && syntheticExec && (
            <NodeRunPanel
              exec={syntheticExec}
              nodeKey={nodeKey}
              run={liveRuns[nodeKey]}
              onClose={() => setNodeKey(null)}
              onRerun={onPanelRerun}
              rerunning={t.generationInFlight}
            />
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", background: "#F6F7F9" }}>
          <TestStepsView t={t} />
        </div>
      )}
    </div>
  )
}
