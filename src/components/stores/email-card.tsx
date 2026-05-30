"use client"

/**
 * EmailCard (Epic AE - Story AE-6)
 *
 * Visualizacao do email para o designer:
 *   - Header: numero + nome + badge de status + indicador de status
 *   - Preview HTML em iframe sandbox (sem `allow-scripts` — protecao XSS)
 *   - Copy: subject + preheader + blocks com botao "copiar" por bloco
 *   - Imagens: link "baixar" por imagem detectada em blocks ou em html
 *   - Erro: failure_reason traduzido + CTA "Tentar de novo" (mode=redo
 *     da AE-2)
 *
 * Painel debug (dev) renderizado em <EmailDebugPanel /> separado e
 * controlado pelo parent (page server-side checa role/tag).
 */

import { useState } from "react"
import {
  AlertTriangle,
  Copy,
  Check,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getStatusLabel,
  translateFailureReason,
  type LiveEmail,
} from "@/hooks/use-emails-live"
import { useToast } from "@/lib/hooks/use-toast"
import { EmailDebugPanel } from "./email-debug-panel"

interface EmailCardProps {
  email: LiveEmail
  storeId: string
  isDev: boolean
}

const INTERMEDIATE_STATUSES = new Set([
  "pending",
  "draft",
  "copy_generating",
  "copy_generating_recovery",
  "copy_ready",
  "rendering",
  "qa_running",
])

function extractImages(email: LiveEmail): Array<{ url: string; alt?: string }> {
  const out: Array<{ url: string; alt?: string }> = []
  const seen = new Set<string>()
  for (const block of email.blocks ?? []) {
    const c = block.content as Record<string, unknown> | undefined
    if (!c) continue
    const url = c.image_url as string | undefined
    if (url && !seen.has(url)) {
      seen.add(url)
      out.push({ url, alt: (c.image_alt as string | undefined) ?? undefined })
    }
    // Products block: array of products with image_url
    const products = c.products as Array<{ image_url?: string; name?: string }> | undefined
    if (Array.isArray(products)) {
      for (const p of products) {
        if (p.image_url && !seen.has(p.image_url)) {
          seen.add(p.image_url)
          out.push({ url: p.image_url, alt: p.name })
        }
      }
    }
  }
  return out
}

function buildFullCopy(email: LiveEmail): string {
  const lines: string[] = []
  if (email.subject) lines.push(`**Assunto:** ${email.subject}`)
  if (email.preheader) lines.push(`**Preheader:** ${email.preheader}`)
  if (lines.length > 0) lines.push("")

  for (const block of email.blocks ?? []) {
    const c = block.content as Record<string, unknown> | undefined
    if (!c) continue
    lines.push(`### ${block.label || block.block_type}`)
    const eyebrow = c.eyebrow as string | undefined
    const headline = c.headline as string | undefined
    const body = c.body as string | undefined
    const ctaText = c.cta_text as string | undefined
    const ctaUrl = c.cta_url as string | undefined
    const code = c.code as string | undefined
    if (eyebrow) lines.push(eyebrow)
    if (headline) lines.push(`**${headline}**`)
    if (body) lines.push(body)
    if (code) lines.push(`Codigo: \`${code}\``)
    if (ctaText) lines.push(`CTA: ${ctaText}${ctaUrl ? ` → ${ctaUrl}` : ""}`)
    lines.push("")
  }
  return lines.join("\n").trim()
}

function buildBlockCopy(block: LiveEmail["blocks"][number]): string {
  const c = block.content as Record<string, unknown>
  const parts: string[] = []
  const eyebrow = c.eyebrow as string | undefined
  const headline = c.headline as string | undefined
  const body = c.body as string | undefined
  const ctaText = c.cta_text as string | undefined
  const ctaUrl = c.cta_url as string | undefined
  const code = c.code as string | undefined
  if (eyebrow) parts.push(eyebrow)
  if (headline) parts.push(headline)
  if (body) parts.push(body)
  if (code) parts.push(`Codigo: ${code}`)
  if (ctaText) parts.push(`CTA: ${ctaText}${ctaUrl ? ` (${ctaUrl})` : ""}`)
  return parts.join("\n").trim()
}

export function EmailCard({ email, storeId, isDev }: EmailCardProps) {
  const { toast } = useToast()
  const [retrying, setRetrying] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const statusInfo = getStatusLabel(email.status)
  const isIntermediate = INTERMEDIATE_STATUSES.has(email.status)
  const isFailed = email.status === "failed"
  const images = extractImages(email)

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1500)
    } catch (err) {
      toast({
        title: "Falha ao copiar",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      })
    }
  }

  async function handleRetry() {
    setRetrying(true)
    try {
      const resp = await fetch(`/api/admin/stores/${storeId}/start-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "redo", triggered_by: "ui_retry" }),
      })
      const json = await resp.json()
      if (!resp.ok) {
        toast({
          title: "Falha ao reiniciar geracao",
          description: json.error || `HTTP ${resp.status}`,
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Geracao reiniciada",
        description: `Batch ${(json.batch_id ?? "").slice(0, 8)} disparado.`,
      })
    } catch (err) {
      toast({
        title: "Erro inesperado",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <article className="border border-gray-200 rounded-md bg-white">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-gray-500">#{email.number}</div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{email.name}</h3>
            {email.subject && (
              <p className="text-xs text-gray-600 mt-0.5">{email.subject}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isIntermediate && (
            <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
          )}
          <Badge
            variant={statusInfo.variant}
            aria-label={`Status: ${statusInfo.label}`}
          >
            {statusInfo.label}
          </Badge>
        </div>
      </header>

      {/* Failure banner */}
      {isFailed && (
        <div
          className="m-4 rounded-md border border-red-200 bg-red-50 p-3"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-900">
                {translateFailureReason(email.failure_reason)}
              </div>
              {email.failure_reason && (
                <div className="mt-1 text-xs text-red-700 font-mono">
                  {email.failure_reason}
                </div>
              )}
              <div className="mt-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Tentar de novo
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview + copy/imagens (so quando temos conteudo) */}
      {(email.html || email.blocks.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
          {/* Preview HTML */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wide">
                Preview
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(buildFullCopy(email), "full")}
                aria-live="polite"
              >
                {copiedKey === "full" ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copiar copy completa
                  </>
                )}
              </Button>
            </div>
            {email.html ? (
              <iframe
                srcDoc={email.html}
                sandbox="allow-same-origin"
                title={`Preview do email ${email.name}`}
                className="w-full h-[420px] border border-gray-200 rounded bg-white"
              />
            ) : (
              <div className="w-full h-[420px] border border-dashed border-gray-300 rounded bg-gray-50 flex items-center justify-center text-xs text-gray-500">
                HTML ainda nao gerado
              </div>
            )}
          </div>

          {/* Copy + imagens */}
          <div className="space-y-3">
            {email.preheader && (
              <div className="text-xs text-gray-600">
                <span className="font-semibold">Preheader: </span>
                {email.preheader}
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wide mb-2">
                Blocos ({email.blocks.length})
              </h4>
              <ul className="space-y-2">
                {email.blocks.map((block) => {
                  const copyText = buildBlockCopy(block)
                  const key = `block-${block.id}`
                  return (
                    <li
                      key={block.id}
                      className="border border-gray-200 rounded p-2 bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-700">
                            {block.label || block.block_type}
                          </div>
                          {copyText && (
                            <pre className="mt-1 text-[11px] text-gray-600 whitespace-pre-wrap font-sans">
                              {copyText.slice(0, 200)}
                              {copyText.length > 200 ? "…" : ""}
                            </pre>
                          )}
                        </div>
                        {copyText && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(copyText, key)}
                            aria-live="polite"
                            aria-label={`Copiar ${block.label || block.block_type}`}
                          >
                            {copiedKey === key ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            {images.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wide mb-2">
                  Imagens ({images.length})
                </h4>
                <ul className="space-y-1">
                  {images.map((img, i) => (
                    <li
                      key={`${img.url}-${i}`}
                      className="flex items-center gap-2 text-xs"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={img.alt ?? ""}
                        className="h-8 w-8 object-cover rounded border border-gray-200"
                      />
                      <span className="flex-1 truncate text-gray-600">
                        {img.alt ?? img.url.split("/").pop()}
                      </span>
                      <a
                        href={img.url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                      >
                        <Download className="h-3.5 w-3.5" /> Baixar
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug panel (collapsible) — so para admin/owner/tag=dev */}
      {isDev && <EmailDebugPanel email={email} />}
    </article>
  )
}
