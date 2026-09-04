"use client"

/**
 * Bloco "MCP da loja" (aba Setup do detalhe da loja): o que a
 * ConvertIA consegue consultar/executar NESTA loja.
 *
 * - Conectores built-in (Shopify/Omnisend/Klaviyo): derivados das
 *   credenciais já cadastradas na seção Integrações acima — conectar a
 *   integração É conectar o MCP; nada a configurar em dobro.
 * - Servidores MCP externos da loja (ai_mcp_servers com store_id):
 *   CRUD + teste + trava de escrita, mesmo modelo do dialog global da
 *   ConvertIA.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Copy, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react"

const HAIR = "var(--crm-border, rgba(0,0,0,0.08))"
const BRAND = "#4E62D8"

interface McpRow {
  id: string
  name: string
  url: string
  is_active: boolean
  allow_write: boolean
  tool_count: number | null
  last_status: string | null
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Erro ${res.status}`)
  return body
}

const BUILTIN: Array<{ key: "shopify" | "omnisend" | "klaviyo"; name: string; color: string }> = [
  { key: "shopify", name: "Shopify", color: "#96BF48" },
  { key: "omnisend", name: "Omnisend", color: "#5C6AC4" },
  { key: "klaviyo", name: "Klaviyo", color: "#111827" },
]

export function StoreMcpPanel({
  storeId,
  status,
}: {
  storeId: string
  status: Record<string, { connected: boolean }>
}) {
  const { data, mutate, error } = useSWR<{ servers: McpRow[] }>(
    `/api/ai/mcp-servers?store_id=${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const servers = data?.servers ?? []
  const [adding, setAdding] = useState<null | { name: string; url: string; auth_token: string; allow_write: boolean }>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (error) setErr(error instanceof Error ? error.message : "Falha ao carregar")
  }, [error])

  const create = async () => {
    if (!adding?.name || !adding.url) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch("/api/ai/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: adding.name,
          url: adding.url,
          auth_token: adding.auth_token || null,
          store_id: storeId,
          allow_write: adding.allow_write,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string })?.error || `Erro ${res.status}`)
      setAdding(null)
      await mutate()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao conectar")
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: string, init: RequestInit) => {
    await fetch(`/api/ai/mcp-servers/${id}`, init)
    await mutate()
  }

  const inputCls =
    "h-[30px] w-full rounded-[6px] border bg-transparent px-2.5 text-[12px] outline-none"

  return (
    <div>
      {/* Servidor MCP DESTA loja (protocolo MCP real, para clientes externos) */}
      <StoreMcpEndpoint storeId={storeId} />

      {/* Built-ins derivados das credenciais */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {BUILTIN.map((b) => {
          const on = status[b.key]?.connected === true
          return (
            <div key={b.key} className="flex items-center gap-2 rounded-[6px] border px-2.5 py-2" style={{ borderColor: HAIR }}>
              <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[10px] font-bold text-white" style={{ background: b.color }}>
                {b.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium" style={{ color: "var(--crm-gray-900, #111827)" }}>
                  {b.name}
                </span>
                <span className="block text-[10px]" style={{ color: on ? "#047857" : "var(--crm-gray-400, #9CA3AF)" }}>
                  {on ? "MCP ativo (credencial da loja)" : "conecte a integração acima"}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--crm-gray-400, #9CA3AF)" }}>
        Os conectores acima usam as credenciais desta loja — a ConvertIA consulta e executa por eles quando esta loja está selecionada na conversa.
      </div>

      {/* Servidores externos da loja */}
      <div className="mt-3 flex flex-col gap-1.5">
        {servers.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-[6px] border px-2.5 py-2" style={{ borderColor: HAIR }}>
            <span className="inline-flex h-[17px] w-[17px] items-center justify-center rounded-[5px] text-[9.5px] font-bold text-white" style={{ background: "#7C3AED" }}>
              X
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium" style={{ color: "var(--crm-gray-900, #111827)" }}>
                {s.name}
              </span>
              <span className="block truncate text-[10px]" style={{ color: "var(--crm-gray-400, #9CA3AF)" }}>
                {s.url}
              </span>
            </span>
            <span className="text-[10.5px]" style={{ color: s.last_status === "ok" ? "#047857" : "#B45309" }}>
              {s.last_status === "ok" ? `${s.tool_count ?? 0} tools` : (s.last_status ?? "não testado")}
            </span>
            <button
              onClick={() =>
                void act(s.id, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ allow_write: !s.allow_write }),
                })
              }
              className="text-[10.5px] font-medium"
              style={{ color: s.allow_write ? "#DC2626" : "var(--crm-gray-400, #9CA3AF)" }}
              title="Alternar permissão de execução"
            >
              {s.allow_write ? "lê + executa" : "só leitura"}
            </button>
            <button
              onClick={async () => {
                setTesting(s.id)
                await act(s.id, { method: "POST" })
                setTesting(null)
              }}
              title="Testar conexão"
              style={{ color: BRAND }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing === s.id ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => void act(s.id, { method: "DELETE" })} title="Excluir" style={{ color: "#B91C1C" }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {err && (
        <div className="mt-2 text-[11px]" style={{ color: "#B91C1C" }} role="alert">
          {err}
        </div>
      )}

      {!adding ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {/* O botão "Conectar Omnisend (OAuth)" saiu daqui: a própria
              Omnisend confirmou que não é para nos conectarmos ao MCP
              deles como cliente. Quem é o servidor MCP somos nós (o
              endpoint acima); a autenticação com a Omnisend é a API key
              da loja, que já está gravada. O OAuth deles serve a app
              SaaS multi-tenant que autoriza pelo login do usuário final
              — não é o nosso caso. */}
          <button
            onClick={() => setAdding({ name: "", url: "", auth_token: "", allow_write: false })}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[6px] border border-dashed px-3 text-[12px] font-medium"
            style={{ borderColor: HAIR, color: "var(--crm-gray-500, #6B7280)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar servidor MCP desta loja
          </button>
        </div>
      ) : (
        <div className="mt-2.5 rounded-[8px] border p-3" style={{ borderColor: HAIR }}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Nome (ex.: ERP da loja)" className={inputCls} style={{ borderColor: HAIR }} />
            <input value={adding.url} onChange={(e) => setAdding({ ...adding, url: e.target.value })} placeholder="https://mcp.exemplo.com/mcp" className={inputCls} style={{ borderColor: HAIR }} />
            <input value={adding.auth_token} onChange={(e) => setAdding({ ...adding, auth_token: e.target.value })} type="password" placeholder="Token Bearer (opcional)" className={inputCls} style={{ borderColor: HAIR }} />
            <label className="flex items-center gap-2 text-[11.5px]" style={{ color: "var(--crm-gray-700, #374151)" }}>
              <input type="checkbox" checked={adding.allow_write} onChange={(e) => setAdding({ ...adding, allow_write: e.target.checked })} />
              Permitir execução (escrita)
            </label>
          </div>
          <div className="mt-2.5 flex justify-end gap-2">
            <button onClick={() => setAdding(null)} className="h-[29px] rounded-[6px] border px-3 text-[11.5px] font-medium" style={{ borderColor: HAIR, color: "var(--crm-gray-700, #374151)" }}>
              Cancelar
            </button>
            <button
              onClick={() => void create()}
              disabled={busy || !adding.name || !adding.url}
              className="h-[29px] rounded-[6px] px-3 text-[11.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy ? "Conectando…" : "Conectar e testar"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Endpoint MCP da loja (servidor MCP real, protocolo 2025-03-26) ──

function StoreMcpEndpoint({ storeId }: { storeId: string }) {
  const { data, mutate } = useSWR<{ exists: boolean; created_at: string | null; url: string }>(
    `/api/ai/store-mcp-token/${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<"url" | "token" | null>(null)

  const copy = (kind: "url" | "token", value: string) => {
    void navigator.clipboard.writeText(value)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1400)
  }

  const generate = async () => {
    if (
      data?.exists &&
      !window.confirm("Rotacionar o token? O token atual deixa de funcionar na hora.")
    )
      return
    setBusy(true)
    try {
      const res = await fetch(`/api/ai/store-mcp-token/${storeId}`, { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { token?: string }
      if (res.ok && body.token) {
        setFreshToken(body.token)
        await mutate()
      }
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    if (!window.confirm("Revogar o token? Clientes MCP conectados perdem o acesso.")) return
    await fetch(`/api/ai/store-mcp-token/${storeId}`, { method: "DELETE" })
    setFreshToken(null)
    await mutate()
  }

  return (
    <div className="mb-3 rounded-[8px] border p-3" style={{ borderColor: HAIR }}>
      <div className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5" style={{ color: BRAND }} />
        <span className="text-[12px] font-semibold" style={{ color: "var(--crm-gray-900, #111827)" }}>
          Servidor MCP desta loja
        </span>
        <span className="text-[10.5px]" style={{ color: data?.exists ? "#047857" : "var(--crm-gray-400, #9CA3AF)" }}>
          {data?.exists ? "token ativo" : "sem token"}
        </span>
      </div>
      <div className="mt-1.5 text-[10.5px] leading-[1.5]" style={{ color: "var(--crm-gray-500, #6B7280)" }}>
        Endpoint MCP real (streamable HTTP) com as tools desta loja — consulta E execução. Conecte
        no Claude, Cursor ou qualquer cliente MCP usando a URL + token Bearer.
      </div>
      {data?.url && (
        <div className="mt-2 flex items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate rounded-[5px] border px-2 py-1 text-[11px]"
            style={{ borderColor: HAIR, color: "var(--crm-gray-700, #374151)" }}
          >
            {data.url}
          </code>
          <button onClick={() => copy("url", data.url)} title="Copiar URL" style={{ color: copied === "url" ? "#047857" : BRAND }}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {freshToken && (
        <div className="mt-2 rounded-[6px] border px-2.5 py-2" style={{ borderColor: "#F59E0B", background: "rgba(251,191,36,0.06)" }}>
          <div className="text-[10.5px] font-semibold" style={{ color: "#92400E" }}>
            Token gerado — copie AGORA, ele não será mostrado de novo:
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "#92400E" }}>
              {freshToken}
            </code>
            <button onClick={() => copy("token", freshToken)} title="Copiar token" style={{ color: copied === "token" ? "#047857" : "#92400E" }}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => void generate()}
          disabled={busy}
          className="h-[28px] rounded-[6px] px-3 text-[11.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: BRAND }}
        >
          {data?.exists ? "Rotacionar token" : "Gerar token"}
        </button>
        {data?.exists && (
          <button
            onClick={() => void revoke()}
            className="h-[28px] rounded-[6px] border px-3 text-[11.5px] font-medium"
            style={{ borderColor: HAIR, color: "#B91C1C" }}
          >
            Revogar
          </button>
        )}
      </div>
    </div>
  )
}
