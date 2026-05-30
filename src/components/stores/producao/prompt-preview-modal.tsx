"use client"

/**
 * PromptPreviewModal — AE-16
 *
 * Modal de debug exibido ao clicar "Ver prompt resolvido" no
 * `BlockImageInstructionField`. Chama `POST /api/admin/email-blocks/
 * [blockId]/resolve-prompt` (custo zero — nao dispara OpenRouter) e
 * mostra:
 *   - Metadata badges: aspect, mode, has_reference
 *   - <pre> monospace scrollable com o prompt final renderizado
 *   - Botao "Copiar" pra clipboard
 *   - <details> colapsavel "Variaveis usadas" listando vars UPPERCASE
 *
 * Util para auditoria: designer entende por que a imagem saiu "errada"
 * (ex: PRODUTO_HEROI veio com nome incorreto).
 */

import { useEffect, useState } from "react"
import { Copy, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/lib/hooks/use-toast"

type ResolveResponse = {
  prompt: string
  mode: "product_ref" | "text2img"
  aspect: string
  has_reference: boolean
  vars_used: Record<string, string>
}

type ApiResponseShape = {
  success?: boolean
  data?: ResolveResponse
  error?: string
}

export function PromptPreviewModal({
  open,
  onClose,
  blockId,
  blockLabel,
}: {
  open: boolean
  onClose: () => void
  blockId: string
  blockLabel?: string | null
}) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ResolveResponse | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/admin/email-blocks/${blockId}/resolve-prompt`,
          { method: "POST" },
        )
        const json = (await res.json()) as ApiResponseShape
        if (cancelled) return
        if (!res.ok) {
          setError(json.error ?? `Falha (${res.status})`)
          return
        }
        // successResponse envolve em { success, data }
        const payload = (json.data ?? (json as unknown as ResolveResponse))
        setData(payload as ResolveResponse)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Erro de rede")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, blockId])

  const handleCopy = async () => {
    if (!data?.prompt) return
    try {
      await navigator.clipboard.writeText(data.prompt)
      toast.toast({ title: "Prompt copiado", description: `${data.prompt.length} caracteres` })
    } catch {
      toast.toast({
        title: "Falha ao copiar",
        description: "Selecione e use Cmd+C manualmente",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Prompt resolvido{blockLabel ? ` — Bloco ${blockLabel}` : ""}
          </DialogTitle>
          <DialogDescription>
            Preview do prompt final que sera enviado ao modelo. Vars ja
            substituidas, com appendix de aspect e fallback de produto-ref
            se aplicavel.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Resolvendo prompt…
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {/* AE-16 review sugestao: mensagens humanas pra erros comuns */}
            {error.includes("404")
              ? "Bloco nao encontrado. Pode ter sido deletado em outra aba — tente recarregar a pagina."
              : error.includes("rate_limited") || error.includes("429")
                ? "Aguarde 30s entre regeneracoes do mesmo bloco."
                : error}
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge>Aspect {data.aspect}</Badge>
              <Badge>Mode {data.mode}</Badge>
              <Badge tone={data.has_reference ? "ok" : "muted"}>
                Ref {data.has_reference ? "Sim" : "Nao"}
              </Badge>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
              >
                <Copy className="h-3 w-3" />
                Copiar
              </button>
            </div>

            <pre
              className="flex-1 overflow-auto rounded border bg-gray-50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
              style={{ maxHeight: "45vh" }}
            >
              {data.prompt.length > 5000
                ? `${data.prompt.slice(0, 5000)}\n\n… [truncado para exibicao, ${data.prompt.length} chars total]`
                : data.prompt}
            </pre>

            <details className="rounded border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-600">
                Variaveis usadas ({Object.keys(data.vars_used).length})
              </summary>
              <div className="max-h-64 overflow-auto px-3 py-2 font-mono text-[11px]">
                {Object.entries(data.vars_used).map(([k, v]) => (
                  <div key={k} className="py-0.5 break-all">
                    <span className="text-blue-700">{k}</span>
                    <span className="text-gray-400">=</span>
                    <span>{v || <em className="text-gray-400">(vazio)</em>}</span>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode
  tone?: "default" | "ok" | "muted"
}) {
  const styles =
    tone === "ok"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "muted"
        ? "bg-gray-100 text-gray-500 border-gray-200"
        : "bg-gray-50 text-gray-700 border-gray-200"
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}
    >
      {children}
    </span>
  )
}
