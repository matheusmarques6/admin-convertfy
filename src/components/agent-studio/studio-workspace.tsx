"use client"

/**
 * Estúdio de Agentes — shell da página (`/admin/agents/studio`).
 *
 * Topbar com breadcrumb + abas (Visão Geral | Editor | Execuções) fiel à
 * maquete "Estúdio de Agentes". A aba persiste em localStorage e na URL
 * (?tab=), as posições dos nós persistem em localStorage por usuário.
 *
 * "Histórico" abre um drawer com as versões de config de todos os agentes
 * (email_agent_configs via /api/admin/agents/prompts) — restaurar uma
 * versão usa o endpoint de activate existente. Não existe "Publicar"
 * separado: salvar no editor JÁ cria e ativa uma versão (semântica do hub).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { ChevronRight, Clock, X } from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { AGENT_VISUAL, type PipelineAgentKey } from "@/lib/agents/agent-visual"
import { restoreLayout, serializeLayout, type Positions } from "./flow-canvas"
import { EditorTab } from "./editor-tab"
import { ExecutionsTab } from "./execs-tab"
import { OverviewTab } from "./overview-tab"
import { StudioTestTab } from "./test-tab"
// A aba Conhecimento vivia SÓ no hub de Geração de Emails, e o Estúdio não
// linkava para lá: quem opera o pipeline daqui não tinha como ver o material
// que alimenta o Estruturador, nem que o sync estava quebrado. Mesmo
// componente, sem cópia — o hub continua com a aba dele.
import { VaultTab } from "@/components/email-generation/vault-tab"
import { AgentChip, StudioBtn, StudioSpinStyle } from "./studio-atoms"
import type { PromptsPayload } from "./studio-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TABS = [
  { key: "overview", label: "Visão Geral" },
  { key: "editor", label: "Editor" },
  { key: "execs", label: "Execuções" },
  { key: "test", label: "Teste" },
  { key: "vault", label: "Conhecimento" },
] as const

type TabKey = (typeof TABS)[number]["key"]

const TAB_LS_KEY = "cf-agent-studio-tab"
const POS_LS_KEY = "cf-agent-studio-positions"

// O layout salvo carrega a assinatura do mapa em que foi feito: sem ela,
// acrescentar um agente ao pipeline fazia o nó novo nascer embaixo do
// vizinho. Regra e testes em `@/lib/agents/studio-layout`.

function isTabKey(v: string | null | undefined): v is TabKey {
  return (
    v === "overview" ||
    v === "editor" ||
    v === "execs" ||
    v === "test" ||
    v === "vault"
  )
}

function HistoryDrawer({
  prompts,
  onClose,
  onRestored,
}: {
  prompts: PromptsPayload | undefined
  onClose: () => void
  onRestored: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!prompts?.by_type) return []
    const all: Array<{
      id: string
      agent_type: string
      version: number
      model: string
      created_at: string
      is_active: boolean
      created_by_name?: string | null
    }> = []
    for (const group of Object.values(prompts.by_type)) {
      if (group.active) all.push(group.active)
      for (const h of group.history) all.push(h)
    }
    return all
      .filter((r) => r.agent_type in AGENT_VISUAL)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 60)
  }, [prompts])

  const restore = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/agents/prompts/${id}/activate`, {
        method: "POST",
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error ?? "Falha ao restaurar versão")
      }
      onRestored()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao restaurar")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(15,17,23,0.35)" }}
      />
      <aside
        style={{
          position: "relative",
          width: 420,
          maxWidth: "92vw",
          height: "100%",
          background: C.white,
          borderLeft: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 40px rgba(0,0,0,0.15)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, fontFamily: F.sans }}>
              Histórico de versões
            </div>
            <div style={{ fontSize: 11.5, color: C.g400, fontFamily: F.sans, marginTop: 2 }}>
              Configs dos agentes do pipeline — restaurar ativa a versão na hora.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: C.g400,
              cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>
        {error && (
          <div
            style={{
              margin: "12px 16px 0",
              padding: "9px 12px",
              borderRadius: 8,
              background: C.negBg,
              border: `1px solid ${C.negBorder}`,
              fontSize: 12,
              color: C.neg,
              fontFamily: F.sans,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderBottom: `1px solid ${C.g100}`,
              }}
            >
              <AgentChip k={r.agent_type as PipelineAgentKey} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: C.g700,
                    fontFamily: F.sans,
                    ...TNUM,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  v{r.version} · {r.model}
                </div>
                <div style={{ fontSize: 10.5, color: C.g400, fontFamily: F.sans, ...TNUM }}>
                  {new Date(r.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {r.created_by_name ? ` · ${r.created_by_name}` : ""}
                </div>
              </div>
              {r.is_active ? (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: C.pos,
                    background: C.posBg,
                    border: `1px solid ${C.posBorder}`,
                    borderRadius: 999,
                    padding: "1px 8px",
                    fontFamily: F.sans,
                  }}
                >
                  ativa
                </span>
              ) : (
                <StudioBtn
                  onClick={() => restore(r.id)}
                  disabled={busyId != null}
                  style={{ height: 26, padding: "0 10px", fontSize: 11.5 }}
                >
                  {busyId === r.id ? "Restaurando…" : "Restaurar"}
                </StudioBtn>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <div style={{ padding: "24px 16px", fontSize: 12.5, color: C.g400, fontFamily: F.sans }}>
              Nenhuma versão registrada.
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function StudioTopbar({
  tab,
  onTab,
  activeCount,
  onHistory,
}: {
  tab: TabKey
  onTab: (t: TabKey) => void
  activeCount: number | null
  onHistory: () => void
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 52,
        padding: "0 18px",
        background: C.white,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
        position: "relative",
        zIndex: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          minWidth: 0,
          flex: "1 1 0",
          overflow: "hidden",
        }}
      >
        <span style={{ fontSize: 12.5, color: C.g400, fontFamily: F.sans, flexShrink: 0 }}>
          Ferramentas
        </span>
        <span style={{ color: C.g300, display: "flex", flexShrink: 0 }}>
          <ChevronRight size={13} />
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.g900,
            fontFamily: F.sans,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 70,
          }}
        >
          Pipeline de Geração de Emails
        </span>
        {activeCount != null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "1px 7px",
              borderRadius: 4,
              background: C.posBg,
              border: `1px solid ${C.posBorder}`,
              fontSize: 11,
              fontWeight: 500,
              color: C.pos,
              fontFamily: F.sans,
              whiteSpace: "nowrap",
              flexShrink: 1,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.pos }} />
            Publicado · {activeCount} agentes ativos
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 2, background: C.g100, padding: 3, borderRadius: 8 }}>
          {TABS.map((t) => {
            const on = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => onTab(t.key)}
                style={{
                  padding: "5px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: on ? C.white : "transparent",
                  color: on ? C.g900 : C.g500,
                  fontWeight: on ? 600 : 500,
                  fontSize: 12.5,
                  fontFamily: F.sans,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  boxShadow: on ? C.shadowSm : "none",
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: "1 1 0",
          justifyContent: "flex-end",
        }}
      >
        <StudioBtn onClick={onHistory}>
          <Clock size={13} /> Histórico
        </StudioBtn>
      </div>
    </header>
  )
}

export function StudioWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tab, setTab] = useState<TabKey>(() => {
    const fromUrl = searchParams?.get("tab")
    if (isTabKey(fromUrl)) return fromUrl
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(TAB_LS_KEY)
        if (isTabKey(stored)) return stored
      } catch {
        /* localStorage indisponível */
      }
    }
    return "editor"
  })

  const pickTab = useCallback(
    (t: TabKey) => {
      setTab(t)
      try {
        localStorage.setItem(TAB_LS_KEY, t)
      } catch {
        /* noop */
      }
      router.replace(`?tab=${t}`, { scroll: false })
    },
    [router],
  )

  const [positions, setPositions] = useState<Positions>(() =>
    restoreLayout(
      typeof window !== "undefined" ? localStorage.getItem(POS_LS_KEY) : null,
    ),
  )

  const onMove = useCallback((key: string, x: number, y: number) => {
    setPositions((p) => ({ ...p, [key]: { x, y } }))
  }, [])

  // Persistência debounced das posições.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(POS_LS_KEY, serializeLayout(positions))
      } catch {
        /* noop */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [positions])

  const [days, setDays] = useState(14)
  const [historyOpen, setHistoryOpen] = useState(false)

  const { data: prompts, mutate: refetchPrompts } = useSWR<PromptsPayload>(
    "/api/admin/agents/prompts",
    fetcher,
  )
  const activeCount = useMemo(() => {
    if (!prompts?.by_type) return null
    return Object.entries(prompts.by_type).filter(
      ([k, v]) => v.active != null && k in AGENT_VISUAL,
    ).length
  }, [prompts])

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        overflow: "hidden",
        background: "#F6F7F9",
      }}
    >
      <StudioSpinStyle />
      <StudioTopbar
        tab={tab}
        onTab={pickTab}
        activeCount={activeCount}
        onHistory={() => setHistoryOpen(true)}
      />
      {tab === "overview" && <OverviewTab days={days} onDays={setDays} />}
      {tab === "editor" && (
        <EditorTab
          positions={positions}
          onMove={onMove}
          onRunPipeline={() => pickTab("test")}
        />
      )}
      {tab === "execs" && <ExecutionsTab positions={positions} />}
      {tab === "test" && <StudioTestTab positions={positions} />}
      {/* O VaultTab é escrito para o hub, que dá o scroll e o respiro à
          volta. Aqui a casca é a mesma da Visão Geral, para o conteúdo não
          nascer colado no topo nem sem rolagem. */}
      {tab === "vault" && (
        <div style={{ flex: 1, overflowY: "auto", background: "#F6F7F9" }}>
          <div style={{ maxWidth: 1480, margin: "0 auto", padding: "22px 28px 40px" }}>
            <VaultTab />
          </div>
        </div>
      )}
      {historyOpen && (
        <HistoryDrawer
          prompts={prompts}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => refetchPrompts()}
        />
      )}
    </div>
  )
}
