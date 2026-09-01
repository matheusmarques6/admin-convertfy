"use client"

/**
 * Aba "Conhecimento" do hub de geração — v1 (fase 1 do Estruturador).
 *
 * Mostra o que o agente enxerga: estado do sync do vault (último commit,
 * quando, gatilho), o material ATIVO por flow (intenções, estruturas,
 * aprendizados) e as notas puladas com o motivo — a resposta visual para
 * "editei no Obsidian e não valeu". Botão de sincronização manual.
 *
 * Dados: GET/POST /api/admin/vault. O runtime nunca lê o Obsidian — lê as
 * tabelas que o sync popula (ADR adr-estruturador-adaptativo).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, BookOpen, AlertTriangle } from "lucide-react"
import { C, F } from "./ui/eg-theme"
import { EGBadge, EGBtn, EGCard, EGNotice, EGSecTitle } from "./ui/eg-atoms"

interface SyncState {
  repo: string | null
  branch: string | null
  last_commit_sha: string | null
  last_synced_at: string | null
}
interface SyncRun {
  id: string
  trigger: string
  commit_sha: string | null
  files_total: number
  upserted: number
  deactivated: number
  skipped_invalid: Array<{ path: string; motivo: string }>
  /** Faxina do vault (índice, .obsidian/, templates) — nunca é alerta. */
  ignored?: string[] | null
  duration_ms: number
  error: string | null
  created_at: string
}
interface IntentRow {
  id: string
  flow_type: string
  kind: string
  email_number: number | null
  slug: string
  status: string
  is_active: boolean
}
interface RefRow {
  id: string
  flow_type: string
  slug: string
  emails: number[]
  escopo: string | null
  amostra: string | null
  procedencia: string | null
  secoes: string[]
  secoes_normalizadas: string[]
  status: string
  is_active: boolean
}
interface LearningRow {
  id: string
  flow_type: string | null
  slug: string
  aplica_a: string[]
  origem_estrutura: string | null
  status: string
  is_active: boolean
}
interface VaultData {
  state: SyncState | null
  runs: SyncRun[]
  intents: IntentRow[]
  structure_refs: RefRow[]
  learnings: LearningRow[]
  configured: boolean
}

async function fetchVault(): Promise<VaultData> {
  const r = await fetch("/api/admin/vault")
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
  return (j?.data ?? j) as VaultData
}

const fmtWhen = (iso: string | null | undefined): string => {
  if (!iso) return "nunca"
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function VaultTab() {
  const [data, setData] = useState<VaultData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchVault().then(setData).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  const onSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await fetch("/api/admin/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
      const res = (j?.data ?? j) as { status: string; upserted: number; skipped: unknown[] }
      setSyncMsg(
        res.status === "noop"
          ? "Sem commit novo — nada a sincronizar."
          : `Sincronizado: ${res.upserted} notas atualizadas${(res.skipped?.length ?? 0) > 0 ? `, ${res.skipped.length} puladas` : ""}.`,
      )
      load()
    } catch (e) {
      setSyncMsg(`Falhou: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  const flows = useMemo(() => {
    const set = new Set<string>()
    for (const i of data?.intents ?? []) set.add(i.flow_type)
    for (const r of data?.structure_refs ?? []) set.add(r.flow_type)
    for (const l of data?.learnings ?? []) if (l.flow_type) set.add(l.flow_type)
    return Array.from(set).sort()
  }, [data])

  const lastRun = data?.runs?.[0]
  const skippedRecent = lastRun?.skipped_invalid ?? []
  const ignoredRecent = lastRun?.ignored ?? []

  if (error) {
    return <EGNotice tone="neg">Erro ao carregar o conhecimento: {error}</EGNotice>
  }
  if (!data) {
    return <div style={{ fontFamily: F.sans, fontSize: 13, color: C.g500, padding: 24 }}>Carregando…</div>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!data.configured && (
        <EGNotice tone="warn">
          Sync não configurado: defina <code>VAULT_REPO</code> e{" "}
          <code>VAULT_GITHUB_TOKEN</code> nas variáveis de ambiente. O material
          abaixo (se houver) é da última sincronização bem-sucedida.
        </EGNotice>
      )}

      {/* Estado do sync */}
      <EGCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BookOpen size={16} color={C.brand} />
            <div style={{ fontFamily: F.sans }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>
                {data.state?.repo ?? "Vault"}
                {data.state?.branch ? ` · ${data.state.branch}` : ""}
              </div>
              <div style={{ fontSize: 12, color: C.g500 }}>
                Último sync: {fmtWhen(data.state?.last_synced_at)}
                {data.state?.last_commit_sha ? ` · commit ${data.state.last_commit_sha.slice(0, 8)}` : ""}
                {lastRun ? ` · via ${lastRun.trigger}` : ""}
              </div>
              {/* Faxina do vault: contada, nunca alertada. O `_INDEX.md`
                  aparecia como "nota pulada" — e alerta que não pede ação
                  ensina a ignorar o card que existe para pedir ação. */}
              {ignoredRecent.length > 0 && (
                <div
                  style={{ fontSize: 11.5, color: C.g400, marginTop: 2 }}
                  title={ignoredRecent.join("\n")}
                >
                  {ignoredRecent.length}{" "}
                  {ignoredRecent.length === 1
                    ? "arquivo ignorado"
                    : "arquivos ignorados"}{" "}
                  (índice, templates)
                </div>
              )}
            </div>
          </div>
          <EGBtn variant="dark" onClick={onSync} disabled={syncing}>
            <RefreshCw size={13} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </EGBtn>
        </div>
        {syncMsg && (
          <div style={{ marginTop: 10, fontSize: 12, fontFamily: F.sans, color: syncMsg.startsWith("Falhou") ? C.neg : C.g600 }}>
            {syncMsg}
          </div>
        )}
      </EGCard>

      {/* O sync FALHOU — a resposta a "configurei e não veio nada".
          Sem este bloco, 40 falhas seguidas do cron apareciam na tela como
          "Nenhum material sincronizado ainda. Rode a primeira sincronização",
          que manda o operador tentar de novo o que nunca vai funcionar. */}
      {lastRun?.error && (
        <EGCard>
          <EGSecTitle
            icon={<AlertTriangle size={14} color={C.neg} />}
            title={`O último sync falhou (via ${lastRun.trigger}, ${fmtWhen(lastRun.created_at)})`}
          />
          <div
            style={{
              marginTop: 8,
              fontFamily: F.mono,
              fontSize: 12,
              color: C.g700,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {lastRun.error}
          </div>
        </EGCard>
      )}

      {/* Notas puladas do último sync — a resposta a "editei e não valeu" */}
      {skippedRecent.length > 0 && (
        <EGCard>
          <EGSecTitle
            icon={<AlertTriangle size={14} color={C.g700} />}
            title={`Notas puladas no último sync (${skippedRecent.length})`}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {skippedRecent.map((s, i) => (
              <div key={i} style={{ fontFamily: F.mono, fontSize: 12, color: C.g700 }}>
                <span style={{ color: C.g900, fontWeight: 600 }}>{s.path}</span>
                <span style={{ color: C.g500 }}> — {s.motivo}</span>
              </div>
            ))}
          </div>
        </EGCard>
      )}

      {/* Material ativo por flow */}
      {flows.length === 0 ? (
        <EGNotice tone={lastRun?.error ? "neg" : "neut"}>
          {lastRun?.error
            ? "Nenhum material disponível: o sync está falhando (o motivo está acima). Enquanto isso o Estruturador não tem do que se alimentar."
            : "Nenhum material sincronizado ainda. Rode a primeira sincronização."}
        </EGNotice>
      ) : (
        flows.map((flow) => {
          const intents = data.intents.filter((i) => i.flow_type === flow)
          const refs = data.structure_refs.filter((r) => r.flow_type === flow)
          const learnings = data.learnings.filter((l) => l.flow_type === flow)
          const globals = data.learnings.filter(
            (l) => l.flow_type === null && (l.aplica_a ?? []).includes(flow),
          )
          return (
            <EGCard key={flow}>
              <EGSecTitle title={flow} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 10 }}>
                <MaterialCol
                  title={`Intenções (${intents.filter((i) => i.is_active).length}/${intents.length})`}
                  rows={intents.map((i) => ({
                    key: i.id,
                    label: i.kind === "progressao" ? "_progressao" : i.slug,
                    active: i.is_active,
                    status: i.status,
                  }))}
                />
                <MaterialCol
                  title={`Estruturas (${refs.filter((r) => r.is_active).length}/${refs.length})`}
                  rows={refs.map((r) => ({
                    key: r.id,
                    label: r.slug,
                    sub: `#${(r.emails ?? []).join(",#")} · ${r.secoes_normalizadas.length} posições servíveis`,
                    active: r.is_active,
                    status: r.status,
                  }))}
                />
                <MaterialCol
                  title={`Aprendizados (${learnings.filter((l) => l.is_active).length + globals.filter((g) => g.is_active).length})`}
                  rows={[
                    ...learnings.map((l) => ({ key: l.id, label: l.slug, active: l.is_active, status: l.status })),
                    ...globals.map((g) => ({ key: g.id, label: g.slug, sub: "cross-flow", active: g.is_active, status: g.status })),
                  ]}
                />
              </div>
            </EGCard>
          )
        })
      )}
    </div>
  )
}

function MaterialCol({
  title,
  rows,
}: {
  title: string
  rows: Array<{ key: string; label: string; sub?: string; active: boolean; status: string }>
}) {
  return (
    <div>
      <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.g700, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.length === 0 && (
          <div style={{ fontFamily: F.sans, fontSize: 12, color: C.g400 }}>—</div>
        )}
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontFamily: F.mono, fontSize: 12,
                color: r.active ? C.g900 : C.g400,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              title={r.label}
            >
              {r.label}
            </span>
            {r.sub && (
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.g400, whiteSpace: "nowrap" }}>{r.sub}</span>
            )}
            {!r.active && <EGBadge tone={r.status === "pendente" ? "warn" : "neut"}>{r.status}</EGBadge>}
          </div>
        ))}
      </div>
    </div>
  )
}
