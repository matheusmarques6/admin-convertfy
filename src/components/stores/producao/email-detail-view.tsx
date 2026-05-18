"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code as CodeIcon,
  Copy,
  Download,
  Eye,
  FileImage,
  Image as ImageIcon,
  LayoutGrid,
  Square,
  Tag as TagIcon,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { InlineEditField } from "@/components/crm/inline-edit-field"
import type {
  EmailBlock,
  EmailFlow,
  EmailFlowEmail,
  EmailQAItem,
  HeroBlockContent,
  CouponBlockContent,
  ProductsBlockContent,
  TextBlockContent,
} from "@/types/email-workspace"

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

interface EmailDetailViewProps {
  storeId: string
  flow: EmailFlow
  emailId: string
  onEmailUpdated: () => void
  onNavigate: (emailId: string) => void
}

export function EmailDetailView({
  flow,
  emailId,
  onEmailUpdated,
  onNavigate,
}: EmailDetailViewProps) {
  const toast = useToast()
  const { data, mutate } = useSWR<{ data?: EmailDetailResponse } & EmailDetailResponse>(
    `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
    fetcher,
  )

  const email = data?.data?.email ?? data?.email
  const blocks = email?.blocks ?? []
  const qaItems = email?.qa_items ?? []

  const [viewMode, setViewMode] = useState<"mock" | "html">("mock")
  const [activeTab, setActiveTab] = useState<"struct" | "qa">("struct")
  const [width, setWidth] = useState<number>(600)

  // Reset tab quando troca de email
  useEffect(() => {
    setActiveTab("struct")
    setViewMode("mock")
  }, [emailId])

  // Navegação prev/next entre emails do flow
  const emails = flow.emails ?? []
  const currentIdx = emails.findIndex((e) => e.id === emailId)
  const prevEmail = currentIdx > 0 ? emails[currentIdx - 1] : null
  const nextEmail =
    currentIdx >= 0 && currentIdx < emails.length - 1
      ? emails[currentIdx + 1]
      : null

  const blocksTotal = blocks.length
  const blocksApplied = blocks.filter((b) => b.applied).length
  const qaTotal = qaItems.length
  const qaDone = qaItems.filter((q) => q.done).length

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

  const patchBlock = async (
    blockId: string,
    update: Record<string, unknown>,
  ) => {
    const res = await fetch(`/api/admin/email-blocks/${blockId}`, {
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
  }

  const patchQA = async (itemId: string, update: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/email-qa/${itemId}`, {
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
  }

  const copyToClipboard = async (text: string, label = "Conteúdo") => {
    try {
      await navigator.clipboard.writeText(text)
      toast.toast({ title: `${label} copiado`, description: "Cole no builder" })
    } catch {
      toast.toast({
        variant: "destructive",
        title: "Falha ao copiar",
        description: "Permita acesso ao clipboard",
      })
    }
  }

  if (!email) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ color: "var(--crm-gray-500)" }}
      >
        Carregando email...
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <>
      {/* Email title bar (entre topbar e body) */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center rounded-[6px] shrink-0"
            style={{
              width: 28,
              height: 28,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
            }}
          >
            <FileImage className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-700)",
              }}
            >
              {flow.name}
            </span>
            <ChevronRight
              className="h-3 w-3"
              style={{ color: "var(--crm-gray-300)" }}
            />
            <span
              className="truncate"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
              }}
            >
              E-mail #{String(email.number).padStart(2, "0")} - {email.name}
            </span>
            <EmailStatusBadge status={email.status} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Mock / HTML toggle */}
          <div
            className="inline-flex items-center"
            style={{
              padding: 2,
              background: "var(--crm-gray-100)",
              borderRadius: 6,
            }}
          >
            <ModePillBtn
              icon={<LayoutGrid className="h-3 w-3" />}
              label="Mock"
              active={viewMode === "mock"}
              onClick={() => setViewMode("mock")}
            />
            <ModePillBtn
              icon={<CodeIcon className="h-3 w-3" />}
              label="HTML"
              active={viewMode === "html"}
              onClick={() => setViewMode("html")}
            />
          </div>
        </div>
      </div>

      {/* Body: center + right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Centro: preview */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--crm-gray-50)" }}
        >
          {viewMode === "mock" ? (
            <EmailMockPreview
              email={email}
              blocks={blocks}
              width={width}
              onEditSubject={(v) => patchEmail({ subject: v || null })}
              onEditPreheader={(v) => patchEmail({ preheader: v || null })}
              onEditFromName={(v) => patchEmail({ from_name: v || null })}
              onEditFromEmail={(v) => patchEmail({ from_email: v || null })}
            />
          ) : (
            <EmailHtmlView
              email={email}
              html={generateHtml(email, blocks)}
              onCopyAll={(html) => copyToClipboard(html, "HTML completo")}
            />
          )}
        </div>

        {/* Painel direito: blocos + QA */}
        <aside
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 380,
            background: "var(--crm-gray-0)",
            borderLeft: "1px solid var(--crm-border)",
          }}
        >
          {/* Tabs */}
          <div
            className="flex gap-1 shrink-0"
            style={{
              padding: "10px 16px 0",
              borderBottom: "1px solid var(--crm-gray-100)",
            }}
          >
            <TabBtn
              active={activeTab === "struct"}
              onClick={() => setActiveTab("struct")}
              count={`${blocksApplied}/${blocksTotal}`}
              label="Estrutura & Copy"
            />
            <TabBtn
              active={activeTab === "qa"}
              onClick={() => setActiveTab("qa")}
              count={`${qaDone}/${qaTotal}`}
              label="Checklist QA"
            />
          </div>

          {/* Hint banner */}
          <div
            style={{
              padding: "10px 16px",
              background: "var(--crm-blue-50)",
              borderBottom: "1px solid var(--crm-blue-100)",
              fontSize: 11,
              color: "var(--crm-brand-hover)",
              lineHeight: 1.5,
            }}
          >
            {activeTab === "struct" ? (
              <>
                Copie cada item pro builder de email, depois marque o bloco como{" "}
                <b>Aplicado</b>. Os conteúdos já estão prontos para uso — só
                montar e revisar.
              </>
            ) : (
              <>
                Revise cada item antes de enviar para aprovação do cliente.
                Marque os concluídos.
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto" style={{ padding: 12 }}>
            {activeTab === "struct" &&
              blocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  onToggleApplied={(applied) =>
                    patchBlock(block.id, { applied })
                  }
                  onCopy={copyToClipboard}
                  onPatch={(update) => patchBlock(block.id, update)}
                />
              ))}
            {activeTab === "struct" && blocks.length === 0 && (
              <div
                style={{
                  padding: "20px 16px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--crm-gray-500)",
                  background: "var(--crm-gray-50)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 8,
                }}
              >
                Nenhum bloco definido. Adicione blocos no template do email.
              </div>
            )}
            {activeTab === "qa" &&
              qaItems.map((item) => (
                <QACard
                  key={item.id}
                  item={item}
                  onToggle={(done) => patchQA(item.id, { done })}
                  onEditNotes={(notes) => patchQA(item.id, { notes: notes || null })}
                />
              ))}
            {activeTab === "qa" && qaItems.length === 0 && (
              <div
                style={{
                  padding: "20px 16px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--crm-gray-500)",
                  background: "var(--crm-gray-50)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 8,
                }}
              >
                Nenhum item de QA configurado.
              </div>
            )}
          </div>

          {/* Footer: Salvar rascunho + Enviar pra aprovação */}
          <div
            className="shrink-0 flex flex-col gap-2"
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--crm-gray-100)",
              background: "var(--crm-gray-0)",
            }}
          >
            <div className="flex gap-2">
              <button
                className="cf-focusable flex-1"
                style={{
                  height: 32,
                  background: "var(--crm-gray-0)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 6,
                  color: "var(--crm-gray-700)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
                onClick={() => patchEmail({ status: "draft" })}
              >
                <Download className="h-3 w-3" />
                Salvar rascunho
              </button>
              <button
                disabled={blocksApplied < blocksTotal}
                onClick={() => patchEmail({ status: "ready" })}
                className="cf-focusable flex-1"
                style={{
                  height: 32,
                  background:
                    blocksApplied < blocksTotal
                      ? "var(--crm-gray-100)"
                      : "var(--crm-brand)",
                  color:
                    blocksApplied < blocksTotal
                      ? "var(--crm-gray-400)"
                      : "var(--crm-brand-fg)",
                  border: 0,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor:
                    blocksApplied < blocksTotal ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                Enviar pra aprovação
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <span
              className="crm-tnum"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                textAlign: "center",
              }}
            >
              {blocksApplied}/{blocksTotal} blocos aplicados ·{" "}
              {qaTotal > 0
                ? `${Math.round((qaDone / qaTotal) * 100)}% do checklist QA`
                : "sem QA"}
            </span>
          </div>
        </aside>
      </div>

      {/* Bottom nav: prev / position / next + width slider */}
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
        <div className="flex items-center gap-1">
          {emails.map((e, i) => {
            const active = e.id === emailId
            const done =
              e.status === "ready" ||
              e.status === "approved" ||
              e.status === "live"
            return (
              <span
                key={e.id}
                onClick={() => onNavigate(e.id)}
                role="button"
                aria-label={`Email ${i + 1}`}
                style={{
                  width: active ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: active
                    ? "var(--crm-brand)"
                    : done
                      ? "var(--crm-pos)"
                      : "var(--crm-gray-200)",
                  cursor: "pointer",
                  transition: "width 150ms ease",
                }}
              />
            )
          })}
          <span
            className="crm-tnum"
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "var(--crm-gray-500)",
            }}
          >
            E-mail <b style={{ color: "var(--crm-gray-900)" }}>#{currentIdx + 1}</b> de {emails.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="crm-tnum"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
            }}
          >
            Largura {width}px · padrão de e-mail
          </span>
          <input
            type="range"
            min={320}
            max={800}
            step={20}
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value, 10))}
            style={{ width: 80 }}
          />
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
      </div>
    </>
  )
}

// ─── Mock preview (renderização visual) ────────────────────

function EmailMockPreview({
  email,
  blocks,
  width,
  onEditSubject,
  onEditPreheader,
  onEditFromName,
  onEditFromEmail,
}: {
  email: EmailFlowEmail
  blocks: EmailBlock[]
  width: number
  onEditSubject: (v: string) => Promise<void>
  onEditPreheader: (v: string) => Promise<void>
  onEditFromName: (v: string) => Promise<void>
  onEditFromEmail: (v: string) => Promise<void>
}) {
  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 760, margin: "0 auto" }}>
      {/* Envelope */}
      <SectionLabel>Envelope</SectionLabel>
      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: "16px 20px",
          fontSize: 13,
        }}
      >
        <EnvelopeRow label="De">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.from_name}
              placeholder="Nome do remetente"
              onSave={onEditFromName}
            />
          </span>
          <span style={{ color: "var(--crm-gray-500)", marginLeft: 8 }}>
            &lt;
            <InlineEditField
              value={email.from_email}
              placeholder="email@dominio.com"
              onSave={onEditFromEmail}
            />
            &gt;
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Assunto">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.subject}
              placeholder="Assunto do email"
              onSave={onEditSubject}
            />
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Pré-cabeçalho" last>
          <InlineEditField
            value={email.preheader}
            placeholder="Texto curto que aparece após o assunto"
            onSave={onEditPreheader}
          />
        </EnvelopeRow>
      </div>

      {/* Corpo */}
      <SectionLabel style={{ marginTop: 24 }}>Corpo do e-mail</SectionLabel>
      <div
        style={{
          width: width,
          maxWidth: "100%",
          margin: "0 auto",
          background: "#fff",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {blocks.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "var(--crm-gray-400)",
              fontSize: 13,
            }}
          >
            Nenhum bloco no email
          </div>
        ) : (
          blocks.map((b) => <RenderedBlock key={b.id} block={b} />)
        )}
      </div>
    </div>
  )
}

function EnvelopeRow({
  label,
  children,
  last,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className="flex items-baseline gap-3"
      style={{
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--crm-gray-100)",
        fontSize: 13,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          width: 110,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

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

// ─── Block renderers ──────────────────────────────────────

function RenderedBlock({ block }: { block: EmailBlock }) {
  switch (block.block_type) {
    case "hero":
      return <RenderHero content={block.content as HeroBlockContent} />
    case "text":
      return <RenderText content={block.content as TextBlockContent} />
    case "coupon":
      return <RenderCoupon content={block.content as CouponBlockContent} />
    case "products":
      return <RenderProducts content={block.content as ProductsBlockContent} />
    case "footer":
      return <RenderFooter content={block.content as Record<string, unknown>} />
    default:
      return (
        <div style={{ padding: 12, color: "var(--crm-gray-500)", fontSize: 11 }}>
          [{block.block_type}] {block.label}
        </div>
      )
  }
}

function RenderHero({ content }: { content: HeroBlockContent }) {
  return (
    <div style={{ background: "#fff" }}>
      {content.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.image_url}
          alt={content.image_alt ?? content.headline ?? ""}
          style={{ width: "100%", display: "block" }}
        />
      ) : (
        <div
          style={{
            background: "var(--crm-brand)",
            height: 240,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          <ImageIcon className="h-12 w-12 opacity-40" />
        </div>
      )}
      <div style={{ padding: "32px 32px 24px", textAlign: "center" }}>
        {content.eyebrow && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#0F0F0F",
              letterSpacing: "0.22em",
              marginBottom: 10,
            }}
          >
            {content.eyebrow}
          </div>
        )}
        {content.headline && (
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 900,
              color: "#0F0F0F",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              textTransform: "uppercase",
            }}
          >
            {content.headline}
          </h1>
        )}
        {content.body && (
          <p
            style={{
              margin: "16px auto 0",
              maxWidth: 440,
              fontSize: 14,
              color: "#2A2A2A",
              lineHeight: 1.65,
            }}
          >
            {content.body}
          </p>
        )}
        {content.cta_text && (
          <a
            href={content.cta_url ?? "#"}
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "15px 32px",
              background: "var(--crm-brand)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.06em",
              textDecoration: "none",
              borderRadius: 999,
            }}
          >
            {content.cta_text}
          </a>
        )}
      </div>
    </div>
  )
}

function RenderText({ content }: { content: TextBlockContent }) {
  return (
    <div
      style={{
        padding: "40px 56px",
        textAlign: "center",
        borderTop: "1px solid #F0F0F0",
      }}
    >
      {content.headline && (
        <h2
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 900,
            color: "#0F0F0F",
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {content.headline}
        </h2>
      )}
      {content.body && (
        <p
          style={{
            margin: "20px auto 0",
            maxWidth: 440,
            fontSize: 14,
            color: "#2A2A2A",
            lineHeight: 1.65,
          }}
        >
          {content.body}
        </p>
      )}
    </div>
  )
}

function RenderCoupon({ content }: { content: CouponBlockContent }) {
  return (
    <div
      style={{
        padding: "32px 56px",
        textAlign: "center",
        background: "#FAFAFA",
        borderTop: "1px solid #F0F0F0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#666",
          letterSpacing: "0.22em",
          marginBottom: 8,
        }}
      >
        CUPOM
      </div>
      <div
        style={{
          display: "inline-block",
          padding: "12px 24px",
          background: "#0F0F0F",
          color: "#fff",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "0.06em",
          borderRadius: 4,
          border: "1.5px dashed #999",
        }}
      >
        {content.code || "SEU_CUPOM"}
      </div>
      {content.hint && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "#666",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {content.hint}
        </div>
      )}
      {content.cta_text && (
        <a
          href={content.cta_url ?? "#"}
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "13px 28px",
            background: "var(--crm-brand)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.06em",
            textDecoration: "none",
            borderRadius: 999,
          }}
        >
          {content.cta_text}
        </a>
      )}
    </div>
  )
}

function RenderProducts({ content }: { content: ProductsBlockContent }) {
  const products = content.products ?? []
  return (
    <div style={{ padding: "40px 32px", borderTop: "1px solid #F0F0F0" }}>
      {content.title && (
        <h3
          style={{
            margin: "0 0 24px",
            textAlign: "center",
            fontSize: 22,
            fontWeight: 900,
            color: "#0F0F0F",
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {content.title}
        </h3>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 16,
        }}
      >
        {products.map((p, i) => (
          <div key={i}>
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.image_url}
                alt={p.name}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  borderRadius: 6,
                  background: "#F0F0F0",
                }}
              />
            ) : (
              <div
                style={{
                  aspectRatio: "1 / 1",
                  background: "#F0F0F0",
                  borderRadius: 6,
                }}
              />
            )}
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 600,
                color: "#0F0F0F",
                textAlign: "center",
              }}
            >
              {p.name}
            </div>
            <div
              style={{
                marginTop: 4,
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--crm-brand)",
              }}
            >
              {typeof p.price === "number"
                ? p.price.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })
                : p.price}
            </div>
            <a
              href={p.url ?? "#"}
              style={{
                display: "block",
                marginTop: 8,
                padding: "8px 0",
                textAlign: "center",
                background: "#0F0F0F",
                color: "#fff",
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: "0.1em",
                textDecoration: "none",
                borderRadius: 999,
              }}
            >
              {p.cta_text || "BUY NOW"}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function RenderFooter({ content }: { content: Record<string, unknown> }) {
  const columns = (content.columns as Array<{
    title?: string
    links?: Array<{ label: string; url: string }>
  }>) ?? []
  const copyright = (content.copyright as string) ?? ""
  return (
    <div
      style={{
        padding: "32px 24px 24px",
        background: "#0F0F0F",
        color: "#fff",
        textAlign: "center",
      }}
    >
      {columns.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {columns.flatMap((col) =>
            (col.links ?? []).map((l, i) => (
              <a
                key={`${l.label}-${i}`}
                href={l.url}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {l.label}
              </a>
            )),
          )}
        </div>
      )}
      {copyright && (
        <div
          style={{
            fontSize: 11,
            color: "#999",
            letterSpacing: "0.04em",
          }}
        >
          {copyright}
        </div>
      )}
    </div>
  )
}

// ─── HTML view ────────────────────────────────────────────

function EmailHtmlView({
  email,
  html,
  onCopyAll,
}: {
  email: EmailFlowEmail
  html: string
  onCopyAll: (html: string) => void
}) {
  const lines = html.split("\n")
  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          background: "#0F0F0F",
          color: "#fff",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontSize: 11,
          }}
        >
          <div
            className="flex items-center gap-2"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
            welcome-email-{String(email.number).padStart(2, "0")}.html
            <span style={{ marginLeft: 8 }}>· {lines.length} linhas</span>
          </div>
          <div className="flex gap-2">
            <button
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 28,
                padding: "0 10px",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
              }}
              onClick={() => {
                const blob = new Blob([html], { type: "text/html" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `welcome-email-${String(email.number).padStart(2, "0")}.html`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="h-3 w-3" />
              Baixar .html
            </button>
            <button
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 28,
                padding: "0 10px",
                background: "#fff",
                color: "#0F0F0F",
                border: 0,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => onCopyAll(html)}
            >
              <Copy className="h-3 w-3" />
              Copiar tudo
            </button>
          </div>
        </div>
        <pre
          style={{
            margin: 0,
            padding: "16px 0",
            fontSize: 12,
            lineHeight: 1.6,
            fontFamily: "var(--crm-font-mono, 'Geist Mono', monospace)",
            overflowX: "auto",
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                padding: "0 16px",
                background: "transparent",
              }}
            >
              <span
                className="crm-tnum shrink-0"
                style={{
                  width: 40,
                  textAlign: "right",
                  marginRight: 16,
                  color: "rgba(255,255,255,0.30)",
                }}
              >
                {i + 1}
              </span>
              <code
                style={{
                  flex: 1,
                  color: "rgba(255,255,255,0.85)",
                  whiteSpace: "pre",
                }}
              >
                {line || " "}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

// Gera o HTML do email a partir dos blocks. Versão simples server-friendly.
function generateHtml(email: EmailFlowEmail, blocks: EmailBlock[]): string {
  if (email.html) return email.html
  // Stub minimalista pra exibir
  const head = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${email.name}</title>
  <style>
    body { margin: 0; background: #F8F8F8; font-family: 'Inter', Arial, sans-serif; color: #2A2A2A; }
    .wrap { width: 600px; max-width: 100%; margin: 0 auto; background: #FFFFFF; }
  </style>
</head>
<body>
  <table class="wrap" cellpadding="0" cellspacing="0" role="presentation">`
  const body = blocks
    .map((b) => `    <!-- ${b.block_type.toUpperCase()} · ${b.label} -->`)
    .join("\n")
  return `${head}
${body}
  </table>
</body>
</html>`
}

// ─── Block card (painel direito) ──────────────────────────

const BLOCK_TYPE_ICON: Record<string, typeof FileImage> = {
  hero: FileImage,
  text: TagIcon,
  coupon: TagIcon,
  products: LayoutGrid,
  footer: Square,
  image: FileImage,
  cta: ChevronRight,
  divider: Square,
  spacer: Square,
  social: Square,
}

function BlockCard({
  block,
  onToggleApplied,
  onCopy,
  onPatch,
}: {
  block: EmailBlock
  onToggleApplied: (applied: boolean) => Promise<void>
  onCopy: (text: string, label?: string) => void
  onPatch: (update: Record<string, unknown>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(block.applied === false)
  const Icon = BLOCK_TYPE_ICON[block.block_type] ?? FileImage
  const content = block.content as Record<string, unknown>

  return (
    <div
      style={{
        marginBottom: 10,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "10px 14px", cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="crm-tnum"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontWeight: 700,
              width: 12,
              textAlign: "center",
            }}
          >
            {block.position}
          </span>
          <span
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
              flexShrink: 0,
            }}
          >
            <Icon className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
              }}
            >
              {block.label}
            </div>
            <div
              className="truncate"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                marginTop: 1,
                maxWidth: 220,
              }}
            >
              {summarizeBlockContent(block)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AppliedBadge
            applied={block.applied}
            onToggle={(v) => onToggleApplied(v)}
          />
          <ChevronRight
            className="h-3 w-3 transition-transform"
            style={{
              color: "var(--crm-gray-400)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: "1px solid var(--crm-gray-100)",
          }}
        >
          <div className="flex justify-end" style={{ paddingTop: 8 }}>
            <button
              onClick={() => onCopy(JSON.stringify(block.content, null, 2), "Bloco")}
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 24,
                padding: "0 8px",
                background: "transparent",
                color: "var(--crm-gray-600)",
                border: "1px solid var(--crm-border)",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Copy className="h-3 w-3" />
              copiar bloco completo
            </button>
          </div>
          <BlockContentEditor
            block={block}
            content={content}
            onCopy={onCopy}
            onPatch={onPatch}
          />
        </div>
      )}
    </div>
  )
}

function summarizeBlockContent(block: EmailBlock): string {
  const c = block.content as Record<string, unknown>
  if (block.block_type === "hero")
    return (c.headline as string) ?? ""
  if (block.block_type === "text")
    return (c.headline as string) ?? (c.body as string) ?? ""
  if (block.block_type === "coupon")
    return `Cupom ${c.code ?? ""}`.trim()
  if (block.block_type === "products") {
    const products = (c.products as Array<{ name: string }>) ?? []
    return (c.title as string) ?? `${products.length} produtos`
  }
  if (block.block_type === "footer") {
    const cols = (c.columns as Array<{ links?: unknown[] }>) ?? []
    const totalLinks = cols.reduce(
      (s, col) => s + (col.links?.length ?? 0),
      0,
    )
    return `${totalLinks} links de navegação`
  }
  return block.label
}

function AppliedBadge({
  applied,
  onToggle,
}: {
  applied: boolean
  onToggle: (v: boolean) => Promise<void>
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle(!applied)
      }}
      style={{
        height: 22,
        padding: "0 8px",
        borderRadius: 4,
        background: applied ? "var(--crm-pos-bg)" : "var(--crm-gray-0)",
        border: applied
          ? "1px solid var(--crm-pos-border)"
          : "1px solid var(--crm-border)",
        color: applied ? "var(--crm-pos)" : "var(--crm-gray-600)",
        fontSize: 10,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      {applied && <Check className="h-2.5 w-2.5" />}
      {applied ? "Aplicado" : "Marcar"}
    </button>
  )
}

// ─── Block content editor (fields editáveis inline) ──────

function BlockContentEditor({
  block,
  content,
  onCopy,
  onPatch,
}: {
  block: EmailBlock
  content: Record<string, unknown>
  onCopy: (text: string, label?: string) => void
  onPatch: (update: Record<string, unknown>) => Promise<void>
}) {
  const updateContent = async (key: string, value: unknown) => {
    await onPatch({ content: { ...content, [key]: value } })
  }

  // Renderiza campos específicos pelo block_type
  if (block.block_type === "hero") {
    const c = content as HeroBlockContent
    return (
      <>
        {c.image_url !== undefined && (
          <FieldImage
            label="Imagem"
            url={c.image_url || null}
            alt={c.image_alt}
            onChange={(url) => updateContent("image_url", url)}
          />
        )}
        <FieldText
          label="Eyebrow"
          value={c.eyebrow ?? ""}
          onSave={(v) => updateContent("eyebrow", v)}
          onCopy={() => onCopy(c.eyebrow ?? "", "Eyebrow")}
        />
        <FieldText
          label="Headline"
          value={c.headline ?? ""}
          onSave={(v) => updateContent("headline", v)}
          onCopy={() => onCopy(c.headline ?? "", "Headline")}
          big
        />
        <FieldTextarea
          label="Corpo"
          value={c.body ?? ""}
          onSave={(v) => updateContent("body", v)}
          onCopy={() => onCopy(c.body ?? "", "Corpo")}
        />
        <FieldButton
          label="Texto do botão (CTA)"
          value={c.cta_text ?? ""}
          onSave={(v) => updateContent("cta_text", v)}
          onCopy={() => onCopy(c.cta_text ?? "", "CTA")}
        />
      </>
    )
  }

  if (block.block_type === "text") {
    const c = content as TextBlockContent
    return (
      <>
        <FieldText
          label="Headline"
          value={c.headline ?? ""}
          onSave={(v) => updateContent("headline", v)}
          onCopy={() => onCopy(c.headline ?? "", "Headline")}
        />
        <FieldTextarea
          label="Corpo"
          value={c.body ?? ""}
          onSave={(v) => updateContent("body", v)}
          onCopy={() => onCopy(c.body ?? "", "Corpo")}
        />
      </>
    )
  }

  if (block.block_type === "coupon") {
    const c = content as CouponBlockContent
    return (
      <>
        <FieldLabel>VISUALIZAÇÃO DO CUPOM</FieldLabel>
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 12,
            border: "1.5px dashed #2A2A2A",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--crm-gray-700)",
              letterSpacing: "0.06em",
            }}
          >
            CUPOM:
          </div>
          <div
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#0F0F0F",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textAlign: "center",
            }}
          >
            {c.code || "SEU_CUPOM"}
          </div>
        </div>
        <FieldText
          label="Código (clipboard)"
          value={c.code ?? ""}
          onSave={(v) => updateContent("code", v.toUpperCase())}
          onCopy={() => onCopy(c.code ?? "", "Cupom")}
          mono
        />
        <FieldText
          label="Hint / Urgência"
          value={c.hint ?? ""}
          onSave={(v) => updateContent("hint", v)}
          onCopy={() => onCopy(c.hint ?? "", "Hint")}
        />
        <FieldButton
          label="Texto do botão (CTA)"
          value={c.cta_text ?? ""}
          onSave={(v) => updateContent("cta_text", v)}
          onCopy={() => onCopy(c.cta_text ?? "", "CTA")}
        />
      </>
    )
  }

  // Fallback genérico
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--crm-gray-500)",
        padding: "8px 0",
      }}
    >
      Bloco do tipo <b>{block.block_type}</b> · edição via JSON em breve.
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginTop: 12,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

function FieldText({
  label,
  value,
  onSave,
  onCopy,
  big,
  mono,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
  big?: boolean
  mono?: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "8px 10px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
          fontSize: big ? 14 : 12.5,
          fontWeight: big ? 700 : 500,
          color: "var(--crm-gray-900)",
          fontVariantNumeric: mono ? "tabular-nums lining-nums" : undefined,
          fontFamily: mono
            ? "var(--crm-font-mono, 'Geist Mono', monospace)"
            : undefined,
        }}
      >
        <InlineEditField
          value={value}
          placeholder={`${label}...`}
          onSave={onSave}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: big ? 14 : 12.5,
            fontWeight: big ? 700 : 500,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
          }}
        />
      </div>
    </div>
  )
}

function FieldTextarea({
  label,
  value,
  onSave,
  onCopy,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "10px 12px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
          fontSize: 12.5,
          color: "var(--crm-gray-800)",
          lineHeight: 1.5,
        }}
      >
        <InlineEditField
          type="textarea"
          value={value}
          placeholder={`${label}...`}
          onSave={onSave}
          rows={4}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: 12.5,
            color: value ? "var(--crm-gray-800)" : "var(--crm-gray-400)",
            display: "block",
            width: "100%",
            whiteSpace: "pre-wrap",
          }}
        />
      </div>
    </div>
  )
}

function FieldButton({
  label,
  value,
  onSave,
  onCopy,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "12px 16px",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-gray-900)",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          color: "var(--crm-gray-900)",
          textAlign: "center",
          letterSpacing: "0.06em",
        }}
      >
        <InlineEditField
          value={value}
          placeholder="TEXTO DO BOTÃO"
          onSave={(v) => onSave(v.toUpperCase())}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: 12,
            fontWeight: 700,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
            letterSpacing: "0.06em",
          }}
        />
      </div>
    </div>
  )
}

function FieldImage({
  label,
  url,
  alt,
  onChange,
}: {
  label: string
  url: string | null
  alt?: string
  onChange: (url: string) => Promise<void>
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
      </div>
      <div
        className="flex items-center gap-3"
        style={{
          padding: "8px 10px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "var(--crm-gray-200)",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--crm-gray-500)",
          }}
        >
          <ImageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--crm-gray-900)",
            }}
          >
            {alt ?? "Imagem do bloco"}
          </div>
          <div
            className="truncate"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontFamily: "var(--crm-font-mono, monospace)",
            }}
          >
            {url || "Sem URL definida"}
          </div>
        </div>
        <button
          onClick={() => {
            const next = window.prompt(
              "URL da imagem (ex: https://...)",
              url ?? "",
            )
            if (next != null) onChange(next)
          }}
          className="cf-focusable inline-flex items-center gap-1"
          style={{
            height: 28,
            padding: "0 10px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            color: "var(--crm-gray-700)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Eye className="h-3 w-3" />
          Trocar
        </button>
      </div>
    </div>
  )
}

// ─── QA card ──────────────────────────────────────────────

function QACard({
  item,
  onToggle,
  onEditNotes,
}: {
  item: EmailQAItem
  onToggle: (done: boolean) => Promise<void>
  onEditNotes: (notes: string) => Promise<void>
}) {
  return (
    <div
      className="flex items-start gap-2.5"
      style={{
        padding: "10px 12px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        marginBottom: 8,
      }}
    >
      <button
        onClick={() => onToggle(!item.done)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: item.done ? "var(--crm-pos)" : "transparent",
          border: `1.5px solid ${item.done ? "var(--crm-pos)" : "var(--crm-gray-300)"}`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {item.done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: item.done ? "var(--crm-gray-500)" : "var(--crm-gray-900)",
            textDecoration: item.done ? "line-through" : "none",
            lineHeight: 1.4,
          }}
        >
          {item.label}
        </div>
        {item.category && (
          <span
            style={{
              display: "inline-block",
              marginTop: 4,
              padding: "1px 6px",
              borderRadius: 3,
              background: "var(--crm-gray-100)",
              color: "var(--crm-gray-600)",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {item.category}
          </span>
        )}
        <div style={{ marginTop: 6, fontSize: 11 }}>
          <InlineEditField
            type="textarea"
            value={item.notes}
            placeholder="+ adicionar nota"
            onSave={onEditNotes}
            rows={2}
            rootStyle={{ width: "100%" }}
            displayStyle={{
              fontSize: 11,
              color: item.notes ? "var(--crm-gray-600)" : "var(--crm-gray-400)",
              whiteSpace: "pre-wrap",
              display: "block",
              width: "100%",
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────

function ModePillBtn({
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
      onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        height: 26,
        padding: "0 10px",
        background: active ? "var(--crm-gray-0)" : "transparent",
        color: active ? "var(--crm-gray-900)" : "var(--crm-gray-600)",
        border: 0,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2"
      style={{
        padding: "10px 4px",
        background: "transparent",
        color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
        border: 0,
        borderBottom: active ? "2px solid var(--crm-brand)" : "2px solid transparent",
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {label}
      <span
        className="crm-tnum"
        style={{
          fontSize: 10,
          padding: "1px 6px",
          borderRadius: 999,
          background: active ? "var(--crm-blue-50)" : "var(--crm-gray-100)",
          color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  )
}

function EmailStatusBadge({ status }: { status: EmailFlowEmail["status"] }) {
  const map: Record<
    EmailFlowEmail["status"],
    { bg: string; fg: string; label: string }
  > = {
    draft: {
      bg: "var(--crm-gray-100)",
      fg: "var(--crm-gray-600)",
      label: "Rascunho",
    },
    in_progress: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "Em progresso",
    },
    ready: {
      bg: "var(--crm-warn-bg)",
      fg: "var(--crm-warn)",
      label: "Pronto pra revisão",
    },
    approved: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      label: "Aprovado",
    },
    live: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      label: "Ao vivo",
    },
  }
  const v = map[status]
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 4,
        background: v.bg,
        color: v.fg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: v.fg,
        }}
      />
      {v.label}
    </span>
  )
}
