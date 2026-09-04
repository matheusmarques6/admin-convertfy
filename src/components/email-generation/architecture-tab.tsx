"use client"

/**
 * Aba "Arquitetura dos Emails" — a régua de cada fluxo e o conteúdo
 * editorial de cada e-mail, numa tela só.
 *
 * Substitui as abas "Blueprints" e "Estrutura geral", que editavam metades do
 * MESMO par (flow_type, email_number) em lugares diferentes — e por isso
 * divergiam em 14 das 34 linhas. Tudo passa por
 * `/api/admin/email-architecture`, o único ponto de escrita.
 *
 * Estrutura: seletor de fluxo com o gatilho, régua de e-mails, os três guias
 * em acordeão, a tabela de blocos com paleta e o esquema do e-mail à direita.
 *
 * O título "Régua da sequência" com subtítulo, que a maquete trazia no topo,
 * SAIU: era o terceiro nível de cabeçalho para uma tela só — acima já estão o
 * "Geração de Emails" da página e o nome da aba —, e o subtítulo descrevia a
 * coluna "o que cada um precisa dizer", que também saiu. O nome do fluxo, no
 * cabeçalho do card, é o título de verdade daqui.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type {
  ArchFlow,
  EmailArchitectureRow,
} from "@/lib/email-architecture/types"
import { delayLabel, textToGuides } from "@/lib/email-architecture/merge"
import { C, F } from "./ui/eg-theme"
import { EGBtn, EGNotice } from "./ui/eg-atoms"
import { AgentOrientacoes } from "@/components/agent-studio/estruturador-panel"
import { ArchGuides } from "./architecture/arch-guides"
import { ArchBlocks, shortCategoryLabel } from "./architecture/arch-blocks"
import { CategoryIcon } from "./architecture/category-icon"

/**
 * Lança em não-2xx. `r => r.json()` devolveria o CORPO DE ERRO como dado
 * válido e a tela renderizaria vazia em vez de dizer o que houve — a lição
 * do `funnel-data.ts`.
 */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
  })
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
  } & Record<string, unknown>
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return body as T
}

const rowKey = (flow: string, n: number) => `${flow}:${n}`

export function ArchitectureTab() {
  const [rows, setRows] = useState<EmailArchitectureRow[]>([])
  const [flows, setFlows] = useState<ArchFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [flowType, setFlowType] = useState<string | null>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)

  // Rascunho da linha em edição. `null` = nada tocado desde o último load.
  const [draft, setDraft] = useState<EmailArchitectureRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await call<{
        rows: EmailArchitectureRow[]
        flows: ArchFlow[]
      }>("/api/admin/email-architecture")
      setRows(data.rows ?? [])
      setFlows(data.flows ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Primeiro fluxo com e-mail; se nenhum tiver, o primeiro da lista.
  useEffect(() => {
    if (flowType || flows.length === 0) return
    setFlowType((flows.find((f) => f.emails > 0) ?? flows[0]).flow_type)
  }, [flows, flowType])

  const flow = flows.find((f) => f.flow_type === flowType) ?? null

  const emails = useMemo(
    () =>
      rows
        .filter((r) => r.flow_type === flowType && r.is_active)
        .sort((a, b) => a.email_number - b.email_number),
    [rows, flowType],
  )

  const activeNumber = selected ?? emails[0]?.email_number ?? null
  const saved =
    emails.find((r) => r.email_number === activeNumber) ?? null
  const row = draft ?? saved
  const dirty = draft !== null

  // Trocar de e-mail/fluxo com rascunho pendente descarta — avisa antes.
  const switchTo = (fn: () => void) => {
    if (dirty && !window.confirm("Há alterações não salvas. Descartar?")) return
    setDraft(null)
    fn()
  }

  const patch = (p: Partial<EmailArchitectureRow>) => {
    if (!row) return
    setDraft({ ...row, ...p })
  }

  const save = async () => {
    if (!row) return
    setSaving(true)
    try {
      const { row: updated } = await call<{ row: EmailArchitectureRow | null }>(
        "/api/admin/email-architecture",
        {
          method: "PUT",
          body: JSON.stringify({
            flow_type: row.flow_type,
            email_number: row.email_number,
            name: row.name,
            delay_hours: row.delay_hours,
            is_active: row.is_active,
            intent: row.intent,
            // Normaliza só aqui: durante a digitação a linha em branco fica.
            should: textToGuides(row.should.join("\n")),
            should_not: textToGuides(row.should_not.join("\n")),
            blocks: row.blocks,
            subject_hint: row.subject_hint,
            tone: row.tone,
            coupon_code: row.coupon_code,
            text_only: row.text_only,
          }),
        },
      )
      if (updated) {
        setRows((prev) =>
          prev.map((r) =>
            rowKey(r.flow_type, r.email_number) ===
            rowKey(updated.flow_type, updated.email_number)
              ? updated
              : r,
          ),
        )
      }
      setDraft(null)
      toast({
        title: "Sequência salva",
        description: `${flow?.label ?? row.flow_type} · e-mail ${row.email_number}`,
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não salvou",
        description: err instanceof Error ? err.message : "Erro ao salvar",
      })
    } finally {
      setSaving(false)
    }
  }

  const addEmail = async () => {
    if (!flowType) return
    setBusy(true)
    try {
      const r = await call<{ email_number: number; reactivated: boolean }>(
        "/api/admin/email-architecture",
        { method: "POST", body: JSON.stringify({ flow_type: flowType }) },
      )
      await load()
      setDraft(null)
      setSelected(r.email_number)
      toast({
        title: r.reactivated
          ? `E-mail ${r.email_number} de volta na régua`
          : `E-mail ${r.email_number} adicionado`,
        description: "Vale para lojas geradas a partir de agora.",
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não adicionou",
        description: err instanceof Error ? err.message : "Erro",
      })
    } finally {
      setBusy(false)
    }
  }

  const removeLast = async () => {
    const last = emails[emails.length - 1]
    if (!flowType || !last) return
    if (
      !window.confirm(
        `Remover o e-mail ${last.email_number} (${last.name}) da régua de ${flow?.label ?? flowType}?\n\nO conteúdo fica guardado — readicionar traz de volta. Lojas já geradas não mudam.`,
      )
    )
      return
    setBusy(true)
    try {
      await call("/api/admin/email-architecture", {
        method: "DELETE",
        body: JSON.stringify({
          flow_type: flowType,
          email_number: last.email_number,
        }),
      })
      await load()
      setDraft(null)
      setSelected(null)
      toast({ title: `E-mail ${last.email_number} removido da régua` })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não removeu",
        description: err instanceof Error ? err.message : "Erro",
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 40,
          color: C.g500,
          fontSize: 13,
          fontFamily: F.sans,
        }}
      >
        <Loader2 size={16} className="animate-spin" />
        Carregando a arquitetura…
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <EGNotice tone="neg">
          Não deu para carregar a arquitetura: {loadError}
        </EGNotice>
        <div>
          <EGBtn onClick={() => void load()}>Tentar de novo</EGBtn>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {/* ── Cabeçalho: fluxo + ações ── */}
        <div
          style={{
            padding: "16px 20px 14px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ position: "relative", minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setFlowOpen((o) => !o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "2px 8px 2px 0",
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color: C.g900,
                  fontFamily: F.sans,
                }}
              >
                {flow?.label ?? "Escolha um fluxo"}
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.g500}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={flowOpen ? "M8 14l4-4 4 4" : "M8 10l4 4 4-4"} />
                </svg>
              </button>
              <div
                style={{ fontSize: 12, color: C.g500, fontFamily: F.sans }}
              >
                {emails.length} {emails.length === 1 ? "e-mail" : "e-mails"}
                {flow ? ` · dispara em ${flow.trigger.toLowerCase()}` : ""}
              </div>

              {flowOpen && (
                <div
                  style={{
                    position: "absolute",
                    zIndex: 20,
                    top: 34,
                    left: 0,
                    width: 340,
                    background: C.white,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    boxShadow:
                      "0 4px 6px -1px rgba(0,0,0,0.06), 0 10px 24px -6px rgba(0,0,0,0.06)",
                    padding: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {flows.map((f) => {
                    const on = f.flow_type === flowType
                    return (
                      <button
                        key={f.flow_type}
                        type="button"
                        onClick={() =>
                          switchTo(() => {
                            setFlowType(f.flow_type)
                            setSelected(null)
                            setFlowOpen(false)
                          })
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 10px",
                          border: 0,
                          borderRadius: 6,
                          background: on ? C.blue50 : C.white,
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: F.sans,
                        }}
                      >
                        <svg
                          width={16}
                          height={16}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={C.brand}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ flex: "0 0 16px" }}
                          aria-hidden
                        >
                          {on && <path d="M5 13l4 4 10-10" />}
                        </svg>
                        <span
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: on ? 600 : 500,
                              color: on ? C.brandHover : C.g700,
                            }}
                          >
                            {f.label}
                          </span>
                          <span style={{ fontSize: 11, color: C.g400 }}>
                            {f.emails} e-mails · {f.trigger.toLowerCase()}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <EGBtn
                onClick={() => void removeLast()}
                disabled={busy || emails.length === 0}
                title="Desativa o último e-mail da régua; o conteúdo fica guardado"
              >
                <Trash2 size={15} />
                Remover e-mail
              </EGBtn>
              <EGBtn onClick={() => void addEmail()} disabled={busy || !flowType}>
                <Plus size={15} />
                Adicionar e-mail
              </EGBtn>
              {row && (
                <a
                  href={`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=test&flow=${row.flow_type}&email=${row.email_number}`}
                  style={{ textDecoration: "none" }}
                >
                  <EGBtn>Testar</EGBtn>
                </a>
              )}
              <EGBtn
                variant="brand"
                onClick={() => void save()}
                disabled={saving || !row || !dirty}
                title={dirty ? undefined : "Nada alterado desde o último salvamento"}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Salvar sequência
              </EGBtn>
            </div>
          </div>

          {/* ── Especificações do fluxo inteiro ──
              Vale para TODOS os e-mails deste fluxo, então mora acima da
              régua, não dentro do e-mail selecionado. É o escopo `flow` de
              `estruturador_orientacoes` — a mesma linha que o Estúdio edita
              no detalhe de uma run; aqui só está no lugar onde o fluxo é
              desenhado, em vez de atrás de uma execução. Salva SOZINHA, no
              próprio botão: não entra no "Salvar sequência".

              São DOIS textos porque o pipeline já lê dois: `intencao_flow`
              (o arco) e `progressao` (como a forma muda de e-mail para
              e-mail) chegam ao Estruturador como variáveis distintas. Num
              campo só, a régua de toques e o arco brigavam pela mesma
              caixa. */}
          {flowType && (
            <AgentOrientacoes
              flowType={flowType}
              emailNumber={activeNumber ?? 1}
              campos={["flow:intencao", "flow:progressao"]}
              colapsavel
              rotulos={{
                "flow:intencao": `Intenção de ${flow?.label ?? flowType}`,
                "flow:progressao": `Progressão de ${flow?.label ?? flowType}`,
              }}
            />
          )}

          {/* ── Régua de e-mails ── */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
            {emails.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  padding: "14px 12px",
                  border: `1px dashed ${C.g300}`,
                  borderRadius: 6,
                  fontSize: 12.5,
                  color: C.g400,
                  fontFamily: F.sans,
                }}
              >
                Este fluxo não tem e-mail na régua. Clique em “Adicionar
                e-mail”.
              </div>
            ) : (
              emails.map((e) => {
                const on = e.email_number === activeNumber
                return (
                  <button
                    key={e.email_number}
                    type="button"
                    onClick={() =>
                      switchTo(() => setSelected(e.email_number))
                    }
                    style={{
                      flex: "1 1 0",
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      textAlign: "left",
                      padding: "10px 11px",
                      borderRadius: 6,
                      cursor: "pointer",
                      border: `1px solid ${on ? C.blue100 : C.border}`,
                      background: on ? C.blue50 : C.white,
                      fontFamily: F.sans,
                    }}
                  >
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 600,
                          color: on ? "#fff" : C.g500,
                          background: on ? C.brand : C.g100,
                        }}
                      >
                        {e.email_number}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: C.g400,
                        }}
                      >
                        {delayLabel(e.delay_hours)}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: on ? 600 : 500,
                        color: on ? C.brandHover : C.g700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.name}
                    </span>
                    <span style={{ fontSize: 11, color: C.g400 }}>
                      {e.blocks.length}{" "}
                      {e.blocks.length === 1 ? "bloco" : "blocos"} ·{" "}
                      {e.text_only ? "texto" : "montado"}
                    </span>
                  </button>
                )
              })
            )}
            <button
              type="button"
              onClick={() => void addEmail()}
              disabled={busy || !flowType}
              title="Adicionar e-mail ao fim da sequência"
              style={{
                flex: "0 0 56px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                border: `1px dashed ${C.g300}`,
                borderRadius: 6,
                background: C.white,
                cursor: busy ? "not-allowed" : "pointer",
                color: C.g500,
              }}
            >
              <Plus size={20} />
              <span style={{ fontSize: 10, fontWeight: 500 }}>E-mail</span>
            </button>
          </div>
        </div>

        {/* ── Corpo: guias + blocos | esquema ── */}
        {row ? (
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <div
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                padding: "18px 20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <ArchGuides
                intent={row.intent}
                should={row.should}
                shouldNot={row.should_not}
                onChange={patch}
              />

              <ArchBlocks
                blocks={row.blocks}
                onChange={(blocks) => patch({ blocks })}
                extras={row.outline_extras}
              />

              <MoreOptions
                open={showMore}
                onToggle={() => setShowMore((o) => !o)}
                row={row}
                onChange={patch}
              />
            </div>

            <div
              style={{
                width: 300,
                flex: "0 0 300px",
                borderLeft: `1px solid ${C.border}`,
                background: C.g50,
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: C.g400,
                  fontFamily: F.sans,
                }}
              >
                Como fica o e-mail
              </div>
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  background: C.white,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {row.blocks.length === 0 ? (
                  <span
                    style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}
                  >
                    Sem blocos ainda.
                  </span>
                ) : (
                  row.blocks.map((b, i) => (
                    <div
                      key={b.id}
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        padding: 10,
                        background: C.white,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <CategoryIcon category={b.category} color={C.g500} />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: C.g700,
                          fontFamily: F.sans,
                        }}
                      >
                        {shortCategoryLabel(b.category)}
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 11,
                          color: C.g400,
                          fontFamily: F.sans,
                        }}
                      >
                        {i + 1}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <span
                style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}
              >
                Esquema de blocos, não o HTML final. O template real vem da
                referência do pipeline.
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              fontSize: 13,
              color: C.g400,
              fontFamily: F.sans,
            }}
          >
            Escolha um e-mail na régua acima.
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Os campos que o pipeline lê e a maquete não mostra. Ficam recolhidos por
 * padrão, mas precisam existir: sem editor, `subject_hint`, tom, cupom e
 * "somente texto" só seriam alteráveis por SQL.
 */
function MoreOptions({
  open,
  onToggle,
  row,
  onChange,
}: {
  open: boolean
  onToggle: () => void
  row: EmailArchitectureRow
  onChange: (p: Partial<EmailArchitectureRow>) => void
}) {
  const field: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 13,
    color: C.g900,
    background: C.white,
    fontFamily: F.sans,
    outline: "none",
  }
  const label: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: C.g500,
    fontFamily: F.sans,
  }

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 14px",
          border: "none",
          background: open ? C.g50 : C.white,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 500,
          color: C.g900,
        }}
      >
        Mais opções
        <span
          style={{ marginLeft: "auto", fontSize: 12, color: C.g400 }}
        >
          nome e intervalo na régua, assunto, tom, cupom, somente texto
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: 14,
            background: C.g50,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 12,
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Nome na régua</span>
            <input
              style={field}
              value={row.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Lembrete suave"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Intervalo (horas)</span>
            <input
              style={field}
              type="number"
              min={0}
              value={row.delay_hours}
              onChange={(e) =>
                onChange({ delay_hours: Number(e.target.value) || 0 })
              }
            />
            <span style={{ fontSize: 11, color: C.g400, fontFamily: F.sans }}>
              Desde o gatilho do fluxo. {delayLabel(row.delay_hours)}.
            </span>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Dica de assunto</span>
            <input
              style={field}
              value={row.subject_hint ?? ""}
              onChange={(e) =>
                onChange({ subject_hint: e.target.value || null })
              }
              placeholder="Bem-vindo(a) à <marca>!"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Tom (opcional)</span>
            <input
              style={field}
              value={row.tone ?? ""}
              onChange={(e) => onChange({ tone: e.target.value || null })}
              placeholder="Vazio = usa o tom da loja"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Cupom</span>
            <input
              style={{ ...field, fontFamily: F.mono, textTransform: "uppercase" }}
              value={row.coupon_code ?? ""}
              onChange={(e) =>
                onChange({ coupon_code: e.target.value || null })
              }
              placeholder="BEMVINDO10"
            />
            <span style={{ fontSize: 11, color: C.g400, fontFamily: F.sans }}>
              Vazio = e-mail sem cupom.
            </span>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              background: C.white,
              gridColumn: "1 / -1",
            }}
          >
            <input
              type="checkbox"
              checked={row.text_only}
              onChange={(e) => onChange({ text_only: e.target.checked })}
              style={{ marginTop: 2, width: 14, height: 14, cursor: "pointer" }}
            />
            <span>
              <span
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: C.g800,
                  fontFamily: F.sans,
                }}
              >
                E-mail somente texto
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 11.5,
                  color: C.g500,
                  fontFamily: F.sans,
                }}
              >
                Pula o Montador por loja: a copy vai para o n8n com esta
                arquitetura e o e-mail fica pronto direto, sem imagem nem HTML
                gerado.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
