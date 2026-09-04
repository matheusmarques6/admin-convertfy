"use client"

/**
 * Dialogs de gestão da ConvertIA:
 * - "skills": CRUD das skills próprias (nome + instruções que entram
 *   no system prompt quando a skill está ativa na conversa);
 * - "mcp": servidores MCP externos (streamable HTTP) — org-level ou
 *   por loja — com preset do Obsidian, teste de conexão e trava de
 *   escrita (allow_write).
 */

import { useEffect, useState } from "react"
import { Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react"

export type ManageKind = "skills" | "mcp"

const HAIR = "var(--ops-border)"
const BRAND = "#4E62D8"

interface SkillRow {
  id: string
  name: string
  description: string | null
  workspace: string
  instructions: string
  is_active: boolean
}
interface McpRow {
  id: string
  name: string
  url: string
  store_id: string | null
  is_active: boolean
  allow_write: boolean
  tool_count: number | null
  last_status: string | null
  has_token: boolean
}

const jsonOrThrow = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Erro ${res.status}`)
  return body
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
  width = 560,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{ background: "rgba(9,10,14,0.45)" }}
      role="dialog"
      aria-modal
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[82vh] overflow-y-auto rounded-[12px] border px-[22px] py-5 shadow-2xl"
        style={{ width, background: "var(--ops-card)", borderColor: HAIR }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[14.5px] font-[650]" style={{ color: "var(--ops-title)" }}>
              {title}
            </div>
            <div className="mt-1 text-[11.5px] leading-[1.5]" style={{ color: "var(--ops-sec)" }}>
              {subtitle}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="mt-0.5" style={{ color: "var(--ops-sec)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputCls =
  "h-[32px] w-full rounded-[8px] border bg-transparent px-2.5 text-[12.5px] outline-none"
const labelCls = "mb-1 mt-3 block text-[9.5px] font-[650] uppercase tracking-[0.07em]"

export function ConvertiaManageDialogs({
  kind,
  ws,
  stores,
  onClose,
}: {
  kind: ManageKind | null
  ws: "operacional" | "comercial"
  stores: Array<{ id: string; name: string }>
  onClose: () => void
}) {
  if (kind === "skills") return <SkillsDialog ws={ws} onClose={onClose} />
  if (kind === "mcp") return <McpDialog stores={stores} onClose={onClose} />
  return null
}

// ── Skills ──────────────────────────────────────────────────────────

function SkillsDialog({ ws, onClose }: { ws: string; onClose: () => void }) {
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [editing, setEditing] = useState<Partial<SkillRow> | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // "Criar com IA": descreve em uma frase (+ exemplo real opcional),
  // a IA escreve a skill no template da casa e o rascunho cai no form
  // de edição pra revisão humana — nada é salvo sem revisar.
  const [aiOpen, setAiOpen] = useState(false)
  const [aiDesc, setAiDesc] = useState("")
  const [aiExample, setAiExample] = useState("")
  const [aiBusy, setAiBusy] = useState(false)

  const generateWithAi = async () => {
    if (aiDesc.trim().length < 10 || aiBusy) return
    setAiBusy(true)
    setErr(null)
    try {
      const body = (await jsonOrThrow(
        await fetch("/api/ai/skills/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: aiDesc.trim(),
            workspace: ws,
            example: aiExample.trim() || null,
          }),
        }),
      )) as { draft: { name: string; description: string; instructions: string } }
      setEditing({
        name: body.draft.name,
        description: body.draft.description,
        workspace: ws,
        instructions: body.draft.instructions,
      })
      setAiOpen(false)
      setAiDesc("")
      setAiExample("")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao gerar a skill")
    } finally {
      setAiBusy(false)
    }
  }

  const load = async () => {
    try {
      const body = (await jsonOrThrow(await fetch("/api/ai/skills"))) as { skills: SkillRow[] }
      setSkills(body.skills)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar")
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    if (!editing?.name || !editing.instructions) return
    setBusy(true)
    setErr(null)
    try {
      if (editing.id) {
        await jsonOrThrow(
          await fetch(`/api/ai/skills/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: editing.name,
              description: editing.description ?? null,
              workspace: editing.workspace ?? "geral",
              instructions: editing.instructions,
            }),
          }),
        )
      } else {
        await jsonOrThrow(
          await fetch("/api/ai/skills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: editing.name,
              description: editing.description ?? null,
              workspace: (editing.workspace as "geral") ?? ws,
              instructions: editing.instructions,
            }),
          }),
        )
      }
      setEditing(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar")
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (s: SkillRow) => {
    await fetch(`/api/ai/skills/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    await load()
  }

  const remove = async (s: SkillRow) => {
    await fetch(`/api/ai/skills/${s.id}`, { method: "DELETE" })
    await load()
  }

  return (
    <Shell
      title="Skills da ConvertIA"
      subtitle="Instruções próprias que o assistente segue quando a skill está ativa na conversa — o playbook da casa em forma de skill."
      onClose={onClose}
    >
      {err && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--ops-neg)" }} role="alert">
          {err}
        </div>
      )}
      {!editing && (
        <>
          <div className="mt-3.5 flex flex-col gap-1.5">
            {skills.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-[8px] border px-2.5 py-2" style={{ borderColor: HAIR }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium" style={{ color: s.is_active ? "var(--ops-title)" : "var(--ops-mut)" }}>
                    {s.name}
                    <span className="ml-2 text-[10px] uppercase" style={{ color: "var(--ops-mut)" }}>
                      {s.workspace}
                    </span>
                  </div>
                  {s.description && (
                    <div className="truncate text-[11px]" style={{ color: "var(--ops-mut)" }}>
                      {s.description}
                    </div>
                  )}
                </div>
                <button onClick={() => void toggle(s)} className="text-[11px] font-medium" style={{ color: s.is_active ? "var(--ops-pos)" : "var(--ops-mut)" }}>
                  {s.is_active ? "ativa" : "inativa"}
                </button>
                <button onClick={() => setEditing(s)} className="text-[11px] font-medium" style={{ color: BRAND }}>
                  Editar
                </button>
                <button onClick={() => void remove(s)} title="Excluir" style={{ color: "var(--ops-neg)" }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {skills.length === 0 && (
              <div className="py-4 text-center text-[12px]" style={{ color: "var(--ops-mut)" }}>
                Nenhuma skill ainda.
              </div>
            )}
          </div>
          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={() => setEditing({ workspace: ws })}
              className="inline-flex h-[31px] items-center gap-1.5 rounded-[8px] border border-dashed px-3 text-[12px] font-medium"
              style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
            >
              <Plus className="h-3.5 w-3.5" /> Nova skill
            </button>
            <button
              onClick={() => setAiOpen(!aiOpen)}
              className="inline-flex h-[31px] items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-semibold"
              style={{ background: "rgba(78,98,216,0.09)", color: BRAND }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Criar com IA
            </button>
          </div>
          {aiOpen && (
            <div className="mt-3 rounded-[10px] border p-3" style={{ borderColor: HAIR }}>
              <label className={labelCls} style={{ color: "var(--ops-mut)" }}>
                O que a skill deve fazer?
              </label>
              <textarea
                value={aiDesc}
                onChange={(e) => setAiDesc(e.target.value)}
                rows={2}
                placeholder='ex.: "relatório semanal de performance no padrão que mando pros clientes, com destaque de quedas e 3 ações"'
                className="w-full resize-y rounded-[8px] border bg-transparent px-2.5 py-2 text-[12.5px] leading-[1.55] outline-none"
                style={{ borderColor: HAIR, color: "var(--ops-title)" }}
              />
              <label className={labelCls} style={{ color: "var(--ops-mut)" }}>
                Exemplo real do resultado desejado (opcional — a IA destila o padrão)
              </label>
              <textarea
                value={aiExample}
                onChange={(e) => setAiExample(e.target.value)}
                rows={4}
                placeholder="cole aqui um relatório/email/mensagem real no formato que você quer"
                className="w-full resize-y rounded-[8px] border bg-transparent px-2.5 py-2 text-[12.5px] leading-[1.55] outline-none"
                style={{ borderColor: HAIR, color: "var(--ops-title)" }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
                  O rascunho abre no editor pra você revisar antes de salvar.
                </span>
                <button
                  onClick={() => void generateWithAi()}
                  disabled={aiBusy || aiDesc.trim().length < 10}
                  className="inline-flex h-[31px] items-center gap-1.5 rounded-[8px] px-3.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: BRAND }}
                >
                  {aiBusy ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Gerando…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> Gerar skill
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {editing && (
        <div className="mt-2">
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>Nome</label>
          <input
            value={editing.name ?? ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="ex.: Relatórios no padrão Convertfy"
            className={inputCls}
            style={{ borderColor: HAIR, color: "var(--ops-title)" }}
          />
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>Descrição curta</label>
          <input
            value={editing.description ?? ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="aparece no menu Skills"
            className={inputCls}
            style={{ borderColor: HAIR, color: "var(--ops-title)" }}
          />
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>Workspace</label>
          <select
            value={editing.workspace ?? "geral"}
            onChange={(e) => setEditing({ ...editing, workspace: e.target.value })}
            className={inputCls}
            style={{ borderColor: HAIR, color: "var(--ops-title)", background: "var(--ops-card)" }}
          >
            <option value="geral">Geral (os dois)</option>
            <option value="operacional">Operacional</option>
            <option value="comercial">Comercial</option>
          </select>
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>Instruções (o que a ConvertIA deve seguir)</label>
          <textarea
            value={editing.instructions ?? ""}
            onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
            rows={7}
            placeholder="ex.: Ao montar relatórios, sempre abra com o número de receita atribuída, compare com o período anterior e feche com 3 recomendações acionáveis…"
            className="w-full resize-y rounded-[8px] border bg-transparent px-2.5 py-2 text-[12.5px] leading-[1.55] outline-none"
            style={{ borderColor: HAIR, color: "var(--ops-title)" }}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="h-[31px] rounded-[8px] border px-3 text-[12px] font-medium" style={{ borderColor: HAIR, color: "var(--ops-text)" }}>
              Cancelar
            </button>
            <button
              onClick={() => void save()}
              disabled={busy || !editing.name || !(editing.instructions && editing.instructions.length >= 10)}
              className="h-[31px] rounded-[8px] px-3.5 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy ? "Salvando…" : "Salvar skill"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}

// ── Servidores MCP ──────────────────────────────────────────────────

const OBSIDIAN_PRESET = {
  name: "Obsidian",
  url: "",
  hint: "Exponha seu vault via um servidor MCP do Obsidian (ex.: obsidian-mcp + Local REST API) atrás de HTTPS público — um túnel (Cloudflare Tunnel/ngrok) resolve — e cole a URL do endpoint MCP aqui.",
}

const OMNISEND_MCP_URL = "https://mcp.omnisend.com/mcp"

/** Inicia o fluxo OAuth de um servidor MCP e redireciona pro login. */
export async function startMcpOAuth(args: {
  name: string
  url: string
  store_id?: string | null
  allow_write?: boolean
}): Promise<string | null> {
  const res = await fetch("/api/ai/mcp-oauth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: args.name,
      url: args.url,
      store_id: args.store_id ?? null,
      allow_write: args.allow_write ?? true,
      return_to: window.location.pathname,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { authorize_url?: string; error?: string }
  if (!res.ok || !body.authorize_url) {
    return body.error ?? "Não foi possível iniciar a autorização OAuth."
  }
  window.location.href = body.authorize_url
  return null
}

function McpDialog({
  stores,
  onClose,
}: {
  stores: Array<{ id: string; name: string }>
  onClose: () => void
}) {
  const [servers, setServers] = useState<McpRow[]>([])
  const [adding, setAdding] = useState<{
    name: string
    url: string
    auth_token: string
    store_id: string | null
    allow_write: boolean
    hint?: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    try {
      const body = (await jsonOrThrow(await fetch("/api/ai/mcp-servers"))) as { servers: McpRow[] }
      setServers(body.servers)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar")
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const create = async () => {
    if (!adding?.name || !adding.url) return
    setBusy(true)
    setErr(null)
    try {
      await jsonOrThrow(
        await fetch("/api/ai/mcp-servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: adding.name,
            url: adding.url,
            auth_token: adding.auth_token || null,
            store_id: adding.store_id,
            allow_write: adding.allow_write,
          }),
        }),
      )
      setAdding(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao conectar")
    } finally {
      setBusy(false)
    }
  }

  const test = async (s: McpRow) => {
    setTesting(s.id)
    try {
      await jsonOrThrow(await fetch(`/api/ai/mcp-servers/${s.id}`, { method: "POST" }))
    } finally {
      setTesting(null)
      await load()
    }
  }

  const remove = async (s: McpRow) => {
    await fetch(`/api/ai/mcp-servers/${s.id}`, { method: "DELETE" })
    await load()
  }

  const toggleWrite = async (s: McpRow) => {
    await fetch(`/api/ai/mcp-servers/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allow_write: !s.allow_write }),
    })
    await load()
  }

  return (
    <Shell
      title="Conexões · servidores MCP"
      subtitle="Servidores MCP externos que a ConvertIA pode consultar e executar. Da organização (ex.: Obsidian) ou de uma loja específica — os MCPs de loja também aparecem nas integrações da loja."
      onClose={onClose}
    >
      {err && (
        // O erro do discovery vem com a lista do que foi tentado (URL →
        // status). Precisa caber inteiro: era aqui que "deu erro ao
        // conectar" morria sem dizer onde travou.
        <div
          className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[8px] border px-3 py-2 text-[11px] leading-[1.55]"
          style={{ borderColor: "var(--ops-neg)", color: "var(--ops-neg)" }}
          role="alert"
        >
          {err}
        </div>
      )}
      {!adding && (
        <>
          {/* A confusão mais comum: achar que a API key da plataforma já
              é a conexão do MCP. São coisas diferentes. */}
          <div
            className="mt-2.5 rounded-[8px] border px-3 py-2 text-[11px] leading-[1.6]"
            style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
          >
            <strong style={{ color: "var(--ops-title)" }}>API key ≠ MCP.</strong> A chave da
            plataforma (Omnisend, Shopify, Klaviyo) já é usada pelos conectores da loja — ela
            autentica as chamadas que o admin faz na API pública. Um servidor MCP é outra coisa:
            um endereço HTTPS separado que fala o protocolo MCP e expõe o catálogo de operações
            da plataforma. Ele tem autenticação própria — normalmente <em>login OAuth</em> (o
            botão abaixo), às vezes um token Bearer. Colar a API key aqui não conecta nada.
          </div>
          <div className="mt-3.5 flex flex-col gap-1.5">
            {servers.map((s) => (
              <div key={s.id} className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: HAIR }}>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-[17px] w-[17px] items-center justify-center rounded-[5px] text-[9.5px] font-bold text-white" style={{ background: "#7C3AED" }}>
                    X
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: "var(--ops-title)" }}>
                    {s.name}
                    <span className="ml-2 text-[10px]" style={{ color: "var(--ops-mut)" }}>
                      {s.store_id ? (stores.find((x) => x.id === s.store_id)?.name ?? "loja") : "organização"}
                    </span>
                  </span>
                  <span className="tabular-nums text-[10.5px]" style={{ color: s.last_status === "ok" ? "var(--ops-pos)" : "var(--ops-warn)" }}>
                    {s.last_status === "ok" ? `${s.tool_count ?? 0} tools` : (s.last_status ?? "não testado")}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5 pl-[25px] text-[11px]">
                  <button onClick={() => void toggleWrite(s)} style={{ color: s.allow_write ? "#DC2626" : "var(--ops-mut)" }}>
                    {s.allow_write ? "leitura + execução" : "só leitura"}
                  </button>
                  <button onClick={() => void test(s)} className="inline-flex items-center gap-1" style={{ color: BRAND }}>
                    <RefreshCw className={`h-3 w-3 ${testing === s.id ? "animate-spin" : ""}`} /> Testar
                  </button>
                  <span className="flex-1" />
                  <button onClick={() => void remove(s)} title="Excluir" style={{ color: "var(--ops-neg)" }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {servers.length === 0 && (
              <div className="py-3 text-center text-[12px]" style={{ color: "var(--ops-mut)" }}>
                Nenhum servidor MCP externo ainda.
              </div>
            )}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                setBusy(true)
                const e = await startMcpOAuth({
                  name: "Omnisend (MCP oficial)",
                  url: OMNISEND_MCP_URL,
                  allow_write: true,
                })
                if (e) {
                  setErr(e)
                  setBusy(false)
                }
              }}
              disabled={busy}
              className="inline-flex h-[31px] items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
              style={{ background: "#5C6AC4" }}
              title="Autoriza via OAuth na sua conta Omnisend — escolha permissões de escrita na tela deles para criar/editar automações, campanhas e popups"
            >
              {busy ? "Redirecionando…" : "Conectar Omnisend (OAuth)"}
            </button>
            <button
              onClick={() => setAdding({ name: "", url: "", auth_token: "", store_id: null, allow_write: false })}
              className="inline-flex h-[31px] items-center gap-1.5 rounded-[8px] border border-dashed px-3 text-[12px] font-medium"
              style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar servidor
            </button>
            <button
              onClick={() =>
                setAdding({
                  name: OBSIDIAN_PRESET.name,
                  url: OBSIDIAN_PRESET.url,
                  auth_token: "",
                  store_id: null,
                  allow_write: false,
                  hint: OBSIDIAN_PRESET.hint,
                })
              }
              className="inline-flex h-[31px] items-center gap-1.5 rounded-[8px] border px-3 text-[12px] font-medium"
              style={{ borderColor: HAIR, color: "var(--ops-title)" }}
            >
              <span className="text-[13px]">💎</span> Conectar Obsidian
            </button>
          </div>
          <div className="mt-1.5 text-[10px] leading-[1.5]" style={{ color: "var(--ops-mut)" }}>
            Omnisend multi-marca: conecte de novo trocando a URL para
            https://mcp.omnisend.com/v2/mcp?brand=&lt;marca&gt; via &ldquo;Adicionar servidor&rdquo; + OAuth.
          </div>
        </>
      )}
      {adding && (
        <div className="mt-2">
          {adding.hint && (
            <div className="mb-1 mt-2 rounded-[8px] border px-3 py-2 text-[11px] leading-[1.5]" style={{ borderColor: HAIR, color: "var(--ops-sec)" }}>
              {adding.hint}
            </div>
          )}
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>Nome</label>
          <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="ex.: Obsidian" className={inputCls} style={{ borderColor: HAIR, color: "var(--ops-title)" }} />
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>URL do endpoint MCP (HTTPS)</label>
          <input value={adding.url} onChange={(e) => setAdding({ ...adding, url: e.target.value })} placeholder="https://mcp.exemplo.com/mcp" className={inputCls} style={{ borderColor: HAIR, color: "var(--ops-title)" }} />
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>Token (Bearer, opcional)</label>
          <input value={adding.auth_token} onChange={(e) => setAdding({ ...adding, auth_token: e.target.value })} type="password" placeholder="••••••" className={inputCls} style={{ borderColor: HAIR, color: "var(--ops-title)" }} />
          <label className={labelCls} style={{ color: "var(--ops-mut)" }}>Escopo</label>
          <select
            value={adding.store_id ?? ""}
            onChange={(e) => setAdding({ ...adding, store_id: e.target.value || null })}
            className={inputCls}
            style={{ borderColor: HAIR, color: "var(--ops-title)", background: "var(--ops-card)" }}
          >
            <option value="">Organização (todas as conversas)</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                Loja: {s.name}
              </option>
            ))}
          </select>
          <label className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: "var(--ops-title)" }}>
            <input type="checkbox" checked={adding.allow_write} onChange={(e) => setAdding({ ...adding, allow_write: e.target.checked })} />
            Permitir execução (tools de escrita) — sem isso, só tools marcadas como leitura entram
          </label>
          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={async () => {
                setBusy(true)
                const e = await startMcpOAuth({
                  name: adding.name,
                  url: adding.url,
                  store_id: adding.store_id,
                  allow_write: adding.allow_write,
                })
                if (e) {
                  setErr(e)
                  setBusy(false)
                }
              }}
              disabled={busy || !adding.name || !adding.url}
              className="h-[31px] rounded-[8px] border px-3 text-[12px] font-medium disabled:opacity-50"
              style={{ borderColor: HAIR, color: "var(--ops-title)" }}
              title="Para servidores que autenticam por OAuth (login na plataforma) em vez de token fixo"
            >
              Autorizar via OAuth
            </button>
            <span className="flex-1" />
            <button onClick={() => setAdding(null)} className="h-[31px] rounded-[8px] border px-3 text-[12px] font-medium" style={{ borderColor: HAIR, color: "var(--ops-text)" }}>
              Cancelar
            </button>
            <button
              onClick={() => void create()}
              disabled={busy || !adding.name || !adding.url}
              className="h-[31px] rounded-[8px] px-3.5 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy ? "Conectando…" : "Conectar com token"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}
