"use client"

import { useEffect, useState } from "react"
import { X, Check, Loader2, AlertTriangle, Copy as CopyIcon } from "lucide-react"
import type { CopyResultEntry } from "@/types/campaign-central"
import { BlockPreview, copyBlocksToText, copyStatusMeta } from "./block-preview"

interface Props {
  /** Copy da loja a exibir. `null` mantém o pop-up fechado. */
  entry: CopyResultEntry | null
  storeName: string
  onClose: () => void
}

/**
 * Pop-up de copy por loja — empilha ACIMA do modal de detalhe (z-[100]) e do
 * painel lateral (z-[90]/[91]) via z-[120]. Fechar (overlay/X/Esc) só desmonta
 * o pop-up; o modal/painel de baixo continua montado, então o COO volta pra
 * onde estava. Deriva a flag de status com o mesmo `copyStatusMeta` dos cards.
 */
export function CopyPreviewModal({ entry, storeName, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!entry) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [entry, onClose])

  if (!entry) return null

  const meta = copyStatusMeta(entry)
  const blocks = entry.blocks ?? []
  const preview = (entry.preheader ?? entry.preview) || "—"

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyBlocksToText(entry))
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // clipboard indisponível
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm md:p-7"
      onClick={(e) => {
        // stopPropagation: o pop-up é montado DENTRO do modal de detalhe, cujo
        // contêiner raiz fecha no clique. Sem isto, fechar o pop-up fecharia
        // também o modal de baixo. Inócuo quando montado solto (CopyPanel).
        e.stopPropagation()
        onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[calc(100vh-48px)] w-[560px] max-w-full flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-card px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Copy da loja
            </div>
            <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {storeName}
            </div>
          </div>
          {meta.kind === "pending" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary">
              <Loader2 size={12} className="animate-spin" /> {meta.label}
            </span>
          ) : meta.kind === "error" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 dark:border-red-900 dark:bg-red-950/30">
              <AlertTriangle size={12} /> {meta.label}
            </span>
          ) : meta.kind === "approved" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30">
              <Check size={12} /> {meta.label}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-border bg-muted/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {meta.label}
            </span>
          )}
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-5">
          {meta.kind === "error" ? (
            <div className="rounded-[6px] border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-snug text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {entry.error_message ?? "A geração desta loja falhou."}
            </div>
          ) : (
            <>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Assunto
              </div>
              <div className="mb-3 text-[14px] font-semibold text-foreground">
                {entry.subject || "—"}
              </div>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preview
              </div>
              <div className="mb-3 text-[12.5px] leading-normal text-muted-foreground">
                {preview}
              </div>
              {entry.strategy && (
                <>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Estratégia
                  </div>
                  <div className="mb-3 text-[12px] italic leading-normal text-foreground/70">
                    {entry.strategy}
                  </div>
                </>
              )}
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email completo{blocks.length > 0 && ` (${blocks.length} blocos)`}
              </div>
              {blocks.length > 0 ? (
                <div className="space-y-2.5 rounded-[6px] border border-border bg-card p-3.5">
                  {blocks.map((b, i) => (
                    <BlockPreview key={b.id ?? i} block={b} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[6px] border border-dashed border-border bg-card px-3.5 py-6 text-center text-[12px] text-muted-foreground">
                  {meta.kind === "pending"
                    ? "A copy ainda está sendo gerada…"
                    : "Sem blocos de email para esta loja."}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {blocks.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
            <button
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${
                copied ? "text-emerald-600" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CopyIcon size={14} />
              {copied ? "Copiado" : "Copiar tudo"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
