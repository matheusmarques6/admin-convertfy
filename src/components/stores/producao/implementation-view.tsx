"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code as CodeIcon,
  Copy,
  LayoutGrid,
  Link2,
  Mail,
  Tag as TagIcon,
  Users,
  Zap,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { InlineEditField } from "@/components/crm/inline-edit-field"
import { renderEmailHtml } from "@/lib/email-workspace/render-html"
import { blockCopyFields } from "@/lib/email-workspace/block-copy-fields"
import { emailCoupons } from "@/lib/email-workspace/implementation/coupon-info"
import { emailUtm, applyUtm } from "@/lib/email-workspace/implementation/utm"
import {
  resolveFlowSetupFor,
  type FlowSetupConfig,
  type ResolvedFlowSetup,
} from "@/lib/email-workspace/implementation/flow-settings"
import type {
  EmailBlock,
  EmailFlow,
  EmailFlowEmail,
  EmailQAItem,
} from "@/types/email-workspace"
import { EmailCopyView, EmailHtmlView, RenderedBlock } from "./email-detail-view"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

interface EmailDetailResponse {
  email: EmailFlowEmail & {
    blocks: EmailBlock[]
    qa_items: EmailQAItem[]
  }
}

interface ImplementationViewProps {
  storeId: string
  flow: EmailFlow
  emailId: string
  /** ESP onde o flow será montado (client_stores.email_platform). */
  esp: string | null
  storeUrl: string | null
  languageLabel: string | null
  onEmailUpdated: () => void
  onNavigate: (emailId: string) => void
}

const ESP_LABEL: Record<string, string> = {
  klaviyo: "Klaviyo",
  omnisend: "Omnisend",
}

export function ImplementationView({
  storeId,
  flow,
  emailId,
  esp,
  storeUrl,
  languageLabel,
  onEmailUpdated,
  onNavigate,
}: ImplementationViewProps) {
  const toast = useToast()
  const { data, mutate } = useSWR<
    { data?: EmailDetailResponse } & EmailDetailResponse
  >(`/api/admin/email-flows/${flow.id}/emails/${emailId}`, fetcher)

  // Config global do setup (Gatilho/Público/Evento/UTM) — editável em
  // Configurações. Fallback pros defaults enquanto carrega.
  const { data: setupResp } = useSWR<
    { data?: { flows: ResolvedFlowSetup } } & { flows?: ResolvedFlowSetup }
  >("/api/settings/implementation-flow", fetcher)
  const setup: FlowSetupConfig = useMemo(() => {
    const flows = setupResp?.data?.flows ?? setupResp?.flows
    return flows?.[flow.flow_type] ?? resolveFlowSetupFor(flow.flow_type)
  }, [setupResp, flow.flow_type])

  const email = data?.data?.email ?? data?.email
  const blocks = useMemo(
    () =>
      [...(email?.blocks ?? [])].sort((a, b) => a.position - b.position),
    [email?.blocks],
  )

  const [viewMode, setViewMode] = useState<"map" | "html">("map")

  const emails = flow.emails ?? []
  const currentIdx = emails.findIndex((e) => e.id === emailId)
  const prevEmail = currentIdx > 0 ? emails[currentIdx - 1] : null
  const nextEmail =
    currentIdx >= 0 && currentIdx < emails.length - 1
      ? emails[currentIdx + 1]
      : null

  const meta = useMemo(
    () => ({
      trigger: setup.trigger,
      audience: setup.audience,
      metricEvent: setup.metricEvent,
    }),
    [setup],
  )
  const utm = email
    ? emailUtm(flow.flow_type, email.number, {
        source: setup.utmSource,
        medium: setup.utmMedium,
        campaign: setup.utmCampaign,
      })
    : null
  const coupons = useMemo(() => emailCoupons(blocks), [blocks])

  const blockSections = useMemo(
    () => blocks.map((b) => ({ block: b, fields: blockCopyFields(b) })),
    [blocks],
  )

  const patchEmail = async (update: Record<string, unknown>) => {
    const res = await fetch(
      `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
  }

  // Remetente é config de loja: editar aqui aplica a TODOS os e-mails da loja.
  const patchSender = async (update: {
    from_name?: string | null
    from_email?: string | null
  }) => {
    const res = await fetch(`/api/admin/stores/${storeId}/email-sender`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
    toast.toast({
      title: "Remetente atualizado",
      description: "Aplicado a todos os e-mails desta loja.",
    })
  }

  const copy = async (text: string, label = "Conteúdo") => {
    try {
      await navigator.clipboard.writeText(text)
      toast.toast({ title: `${label} copiado`, description: "Cole na plataforma" })
    } catch {
      toast.toast({
        variant: "destructive",
        title: "Falha ao copiar",
        description: "Permita acesso ao clipboard",
      })
    }
  }

  const fullHandoffText = useMemo(() => {
    if (!email) return ""
    const lines: string[] = []
    lines.push(`# ${flow.name} · E-mail #${String(email.number).padStart(2, "0")} — ${email.name}`)
    lines.push("")
    lines.push("## Setup de disparo")
    lines.push(`Plataforma: ${esp ? ESP_LABEL[esp] ?? esp : "—"}`)
    lines.push(`Gatilho: ${meta.trigger}`)
    lines.push(`Público: ${meta.audience}`)
    lines.push(`Evento/métrica: ${meta.metricEvent}`)
    lines.push(
      `Esperar: ${email.delay_hours ?? 0}h após o e-mail anterior`,
    )
    lines.push("")
    lines.push("## Envelope")
    lines.push(`De: ${email.from_name ?? "—"} <${email.from_email ?? "—"}>`)
    lines.push(`Idioma: ${languageLabel ?? "—"}`)
    lines.push(`Assunto: ${email.subject ?? "—"}`)
    lines.push(`Pré-cabeçalho: ${email.preheader ?? "—"}`)
    if (utm) lines.push(`UTM: ${utm.query}`)
    lines.push("")
    if (coupons.length > 0) {
      lines.push("## Cupons a criar")
      for (const c of coupons) {
        lines.push(
          `- ${c.code}${c.discountLabel ? ` (${c.discountLabel})` : ""}${c.hint ? ` — ${c.hint}` : ""}`,
        )
      }
      lines.push("")
    }
    lines.push("## Copy completa")
    for (const sec of blockSections) {
      if (sec.fields.length === 0) continue
      lines.push(`### ${sec.block.label}`)
      for (const f of sec.fields) lines.push(`${f.label}: ${f.value}`)
      lines.push("")
    }
    return lines.join("\n").trim()
  }, [email, flow.name, esp, meta, languageLabel, utm, coupons, blockSections])

  if (!email) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ color: "var(--crm-gray-500)" }}
      >
        Carregando e-mail...
      </div>
    )
  }

  const html = email.html || renderEmailHtml(email, blocks)

  return (
    <>
      {/* Title bar + toggle */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--crm-gray-700)" }}>
            {flow.name}
          </span>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <span
            className="crm-tnum"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--crm-gray-900)" }}
          >
            E-mail #{String(email.number).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--crm-gray-900)" }}>
            · {email.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center"
            style={{ padding: 2, background: "var(--crm-gray-100)", borderRadius: 6 }}
          >
            <TogglePill
              icon={<LayoutGrid className="h-3 w-3" />}
              label="Mapa de implementação"
              active={viewMode === "map"}
              onClick={() => setViewMode("map")}
            />
            <TogglePill
              icon={<CodeIcon className="h-3 w-3" />}
              label="HTML final"
              active={viewMode === "html"}
              onClick={() => setViewMode("html")}
            />
          </div>
          <button
            type="button"
            onClick={() => copy(fullHandoffText, "Handoff completo")}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] text-white text-[12px] font-semibold hover:bg-black"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar tudo
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--crm-gray-50)" }}>
        {viewMode === "html" ? (
          <EmailHtmlView email={email} html={html} onCopyAll={(h) => copy(h, "HTML completo")} />
        ) : (
          <div style={{ padding: "24px 32px 48px", maxWidth: 1080, margin: "0 auto" }}>
            {/* Setup cards */}
            <div className="flex items-baseline justify-between">
              <SectionLabel>Setup do disparo</SectionLabel>
              <a
                href="/admin/settings/implementation"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, color: "var(--crm-gray-500)", textDecoration: "underline" }}
                title="Gatilho, público, evento e UTM são globais — editar em Configurações"
              >
                Gerenciar em Configurações
              </a>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <SetupCard title="Automação & disparo" icon={<Zap className="h-3.5 w-3.5" />}>
                <SetupRow
                  icon={<Mail className="h-3 w-3" />}
                  label="Plataforma (ESP)"
                  value={esp ? ESP_LABEL[esp] ?? esp : "Não definida — verificar"}
                  onCopy={esp ? () => copy(ESP_LABEL[esp] ?? esp, "Plataforma") : undefined}
                />
                <SetupRow
                  icon={<Zap className="h-3 w-3" />}
                  label="Gatilho"
                  value={meta.trigger}
                  hint={`Evento: ${meta.metricEvent}`}
                  onCopy={() => copy(meta.trigger, "Gatilho")}
                />
                <SetupRow
                  icon={<Users className="h-3 w-3" />}
                  label="Público"
                  value={meta.audience}
                  onCopy={() => copy(meta.audience, "Público")}
                />
                <SetupRow
                  icon={<Clock className="h-3 w-3" />}
                  label="Tempo de espera"
                  value={`${email.delay_hours ?? 0}h após o e-mail anterior`}
                  hint={`Posição #${currentIdx + 1} de ${emails.length}`}
                  last
                />
              </SetupCard>

              <SetupCard title="Envelope & remetente" icon={<Mail className="h-3.5 w-3.5" />}>
                <SetupRow
                  icon={<Mail className="h-3 w-3" />}
                  label="Remetente"
                  editable
                  hint="Aplica a todos os e-mails desta loja"
                  editSlot={
                    <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
                      <InlineEditField
                        value={email.from_name}
                        placeholder="Nome do remetente"
                        onSave={(v) => patchSender({ from_name: v || null })}
                      />
                      <span style={{ color: "var(--crm-gray-500)", marginLeft: 6 }}>
                        &lt;
                        <InlineEditField
                          value={email.from_email}
                          placeholder="email@dominio.com"
                          onSave={(v) => patchSender({ from_email: v || null })}
                        />
                        &gt;
                      </span>
                    </span>
                  }
                />
                <SetupRow
                  label="Idioma"
                  value={languageLabel ?? "—"}
                />
                <SetupRow
                  label="Assunto"
                  editable
                  hint={`${(email.subject ?? "").length} caracteres`}
                  editSlot={
                    <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
                      <InlineEditField
                        value={email.subject}
                        placeholder="Assunto do e-mail"
                        onSave={(v) => patchEmail({ subject: v || null })}
                      />
                    </span>
                  }
                  onCopy={email.subject ? () => copy(email.subject!, "Assunto") : undefined}
                />
                <SetupRow
                  label="Pré-cabeçalho"
                  editable
                  last
                  hint={`${(email.preheader ?? "").length} caracteres`}
                  editSlot={
                    <InlineEditField
                      value={email.preheader}
                      placeholder="Texto curto após o assunto"
                      onSave={(v) => patchEmail({ preheader: v || null })}
                    />
                  }
                  onCopy={email.preheader ? () => copy(email.preheader!, "Pré-cabeçalho") : undefined}
                />
              </SetupCard>
            </div>

            {/* Rastreio & UTM */}
            {utm && (
              <div
                style={{
                  background: "var(--crm-gray-0)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5" style={{ color: "var(--crm-gray-500)" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--crm-gray-800)" }}>
                      Rastreio & UTM
                    </span>
                  </div>
                  <CopyButton onClick={() => copy(utm.query, "UTM")} />
                </div>
                <code
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--crm-gray-700)",
                    background: "var(--crm-gray-50)",
                    borderRadius: 4,
                    padding: "8px 10px",
                    wordBreak: "break-all",
                  }}
                >
                  {applyUtm(storeUrl, utm)}
                </code>
              </div>
            )}

            {/* Cupons a criar */}
            {coupons.length > 0 && (
              <>
                <SectionLabel>Cupons a criar no ESP</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                  {coupons.map((c) => (
                    <div
                      key={c.code}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "var(--crm-gray-0)",
                        border: "1px solid var(--crm-border)",
                        borderRadius: 6,
                        padding: "10px 12px",
                      }}
                    >
                      <TagIcon className="h-3.5 w-3.5" style={{ color: "var(--crm-brand)" }} />
                      <div>
                        <div
                          className="crm-tnum"
                          style={{ fontSize: 13, fontWeight: 700, color: "var(--crm-gray-900)" }}
                        >
                          {c.code}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--crm-gray-500)" }}>
                          {[c.discountLabel, c.hint].filter(Boolean).join(" · ") || "Sem regra definida"}
                        </div>
                      </div>
                      <CopyButton onClick={() => copy(c.code, "Cupom")} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Mapa render ↔ copy */}
            <SectionLabel>Mapa render ↔ copy (bloco a bloco)</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {blockSections.map((sec) => (
                <div
                  key={sec.block.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    gap: 0,
                    background: "var(--crm-gray-0)",
                    border: "1px solid var(--crm-border)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {/* Render */}
                  <div style={{ borderRight: "1px solid var(--crm-border)", background: "#fff" }}>
                    <RenderedBlock block={sec.block} />
                  </div>
                  {/* Copy */}
                  <div style={{ padding: 14 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--crm-gray-600)",
                        marginBottom: 10,
                      }}
                    >
                      #{sec.block.position} · {sec.block.label}
                    </div>
                    {sec.fields.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--crm-gray-400)", fontStyle: "italic" }}>
                        Bloco visual (sem copy de texto).
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {sec.fields.map((f) => (
                          <div
                            key={f.key}
                            className="flex items-start gap-2"
                            style={{ padding: 8, borderRadius: 4, background: "var(--crm-gray-50)" }}
                          >
                            <div className="flex-1 min-w-0">
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "var(--crm-gray-500)",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.03em",
                                  marginBottom: 4,
                                }}
                              >
                                {f.label}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "var(--crm-gray-900)",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {f.value}
                              </div>
                            </div>
                            <CopyButton onClick={() => copy(f.value, f.label)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Copy completa do e-mail — mesmo formato que os designers veem */}
            <SectionLabel style={{ marginTop: 24 }}>Copy do e-mail</SectionLabel>
            <div
              style={{
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <EmailCopyView email={email} blocks={blocks} copyToClipboard={copy} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderTop: "1px solid var(--crm-border)",
        }}
      >
        <button
          disabled={!prevEmail}
          onClick={() => prevEmail && onNavigate(prevEmail.id)}
          className="cf-focusable inline-flex items-center gap-1.5"
          style={{
            height: 32,
            padding: "0 12px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            color: prevEmail ? "var(--crm-gray-700)" : "var(--crm-gray-300)",
            fontSize: 12,
            fontWeight: 500,
            cursor: prevEmail ? "pointer" : "default",
          }}
        >
          <ChevronLeft className="h-3 w-3" />
          Anterior
        </button>
        <span className="crm-tnum" style={{ fontSize: 11, color: "var(--crm-gray-500)" }}>
          E-mail <b style={{ color: "var(--crm-gray-900)" }}>#{currentIdx + 1}</b> de {emails.length}
        </span>
        <button
          disabled={!nextEmail}
          onClick={() => nextEmail && onNavigate(nextEmail.id)}
          className="cf-focusable inline-flex items-center gap-1.5"
          style={{
            height: 32,
            padding: "0 12px",
            background: nextEmail ? "var(--crm-brand)" : "var(--crm-gray-100)",
            color: nextEmail ? "var(--crm-brand-fg)" : "var(--crm-gray-400)",
            border: 0,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: nextEmail ? "pointer" : "default",
          }}
        >
          Próximo
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SetupCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--crm-gray-100)",
          color: "var(--crm-gray-700)",
        }}
      >
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ padding: "4px 14px" }}>{children}</div>
    </div>
  )
}

function SetupRow({
  icon,
  label,
  value,
  hint,
  editable,
  editSlot,
  onCopy,
  last,
}: {
  icon?: React.ReactNode
  label: string
  value?: string
  hint?: string
  editable?: boolean
  editSlot?: React.ReactNode
  onCopy?: () => void
  last?: boolean
}) {
  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--crm-gray-100)",
      }}
    >
      <span
        className="flex items-center gap-1.5 shrink-0"
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          width: 130,
          paddingTop: 1,
        }}
      >
        {icon}
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--crm-gray-900)" }}>
          {editable ? editSlot : value}
        </div>
        {hint && (
          <div style={{ fontSize: 11, color: "var(--crm-gray-400)", marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      {onCopy && <CopyButton onClick={onCopy} />}
    </div>
  )
}

function CopyButton({ onClick }: { onClick: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        onClick()
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="shrink-0 flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-500 hover:bg-slate-200"
      title="Copiar"
    >
      {done ? (
        <Check className="h-3 w-3" style={{ color: "var(--crm-pos)" }} />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  )
}

function TogglePill({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        height: 24,
        padding: "0 10px",
        borderRadius: 5,
        border: 0,
        background: active ? "var(--crm-gray-0)" : "transparent",
        color: active ? "var(--crm-gray-900)" : "var(--crm-gray-500)",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {icon}
      {label}
    </button>
  )
}
