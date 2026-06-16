"use client"

import { useState, type ReactNode } from "react"
import { Loader2, ImageOff, AlertTriangle, Check, X, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OneGenResponse, SpikeImageResult } from "@/lib/agents/image/image-spike.service"

const DEFAULT_PROMPT =
  "Hero de boas-vindas para email de e-commerce: foto editorial do produto em uso/destaque, luz natural suave, profundidade de campo cinematográfica, enquadramento vertical 4:5, sem texto na imagem."

const field =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"

function fmtCost(cost: number | null | undefined): string {
  if (cost == null) return "custo não retornado"
  if (cost === 0) return "$0"
  // imagens custam centavos; casas suficientes pra não virar $0.00
  return cost < 0.01 ? `$${cost.toFixed(5)}` : `$${cost.toFixed(4)}`
}

export function ImageSpikeClient() {
  const [imageUrl, setImageUrl] = useState("")
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [model, setModel] = useState("")
  const [maxTokens, setMaxTokens] = useState("16384")
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resA, setResA] = useState<OneGenResponse | null>(null)
  const [resB, setResB] = useState<OneGenResponse | null>(null)

  const busy = loadingA || loadingB

  const run = async (mode: "product_ref" | "text2img") => {
    const setLoading = mode === "product_ref" ? setLoadingA : setLoadingB
    const setRes = mode === "product_ref" ? setResA : setResB
    setLoading(true)
    setError(null)
    setRes(null)
    try {
      const res = await fetch("/api/admin/agents/image-spike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          image_url: imageUrl || undefined,
          prompt,
          model: model || undefined,
          max_tokens: maxTokens ? Number(maxTokens) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setRes(json as OneGenResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  const totalCost = (resA?.result.cost_usd ?? 0) + (resB?.result.cost_usd ?? 0)

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Spike — Agente de Imagem (multimodal)
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Prova se o modelo <strong>recebe</strong> a foto do produto pelo link e a <strong>usa</strong>{" "}
          como referência. Gere <strong>A (com a imagem)</strong> e <strong>B (sem)</strong> e compare a
          correlação.
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-3 rounded-[6px] border border-border bg-card p-4">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-foreground">
            URL da foto de produto (pública, 200 + image/*)
          </label>
          <input
            className={field}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://cdn.shopify.com/.../foto-do-produto.jpg"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-foreground">Prompt</label>
          <textarea
            className={`${field} resize-y`}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-semibold text-foreground">
              Modelo (opcional)
            </label>
            <input
              className={field}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="openai/gpt-5.4-image-2 (padrão)"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-[12px] font-semibold text-foreground">max_tokens</label>
            <input
              className={field}
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="16384"
            />
          </div>
        </div>

        {/* Ações — uma geração por clique, sob demanda */}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => run("product_ref")} disabled={busy || imageUrl.trim().length === 0}>
            {loadingA ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
            Gerar A — com imagem
          </Button>
          <Button
            variant="secondary"
            onClick={() => run("text2img")}
            disabled={busy || prompt.trim().length < 3}
          >
            {loadingB ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
            Gerar B — sem imagem
          </Button>
          <span className="text-[11.5px] text-muted-foreground">
            Roda <strong>1 imagem por clique</strong> · cada geração é cobrada · até ~270s
          </span>
        </div>

        {busy && (
          <div className="text-[12px] text-muted-foreground">
            Gerando… o modelo pode levar mais de um minuto. Não recarregue a página.
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-[6px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#991B1B]">
            <AlertTriangle size={15} className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Resultado */}
      {(resA || resB) && (
        <div className="flex flex-col gap-3">
          <div className="text-[12.5px] text-muted-foreground">
            Modelo:{" "}
            <span className="font-mono text-foreground">{resA?.model ?? resB?.model}</span>
            {resA?.input ? (
              <>
                {" "}· entrada:{" "}
                {resA.input.ok ? (
                  <span className="font-semibold text-emerald-600">
                    acessível ({resA.input.content_type})
                  </span>
                ) : (
                  <span className="font-semibold text-[#991B1B]">
                    inacessível {resA.input.status ? `(HTTP ${resA.input.status})` : ""}{" "}
                    {resA.input.content_type ? `· ${resA.input.content_type}` : ""}
                  </span>
                )}
              </>
            ) : null}
          </div>

          {totalCost > 0 && (
            <div className="text-[12.5px]">
              <span className="text-muted-foreground">Custo somado (A + B gerados): </span>
              <span className="font-semibold text-foreground">{fmtCost(totalCost)}</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Panel title="Entrada (referência)">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="entrada" className="w-full rounded-md border border-border" />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground/50">
                  <ImageOff size={28} />
                </div>
              )}
            </Panel>
            <ResultPanel title="A · product_ref (com imagem)" r={resA?.result} />
            <ResultPanel title="B · text2img (sem imagem)" r={resB?.result} />
          </div>

          <div className="rounded-[6px] border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">Como ler:</div>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>
                <strong>A</strong> reflete o produto da entrada e <strong>B</strong> é genérica → o
                modelo recebe e <strong>usa</strong> a imagem. Vale ligar o product_ref.
              </li>
              <li>
                <strong>A ≈ B</strong> (as duas genéricas) → o modelo <strong>ignora</strong> a imagem.
              </li>
              <li>
                <strong>A</strong> com erro 4xx &ldquo;image not supported&rdquo; → o modelo{" "}
                <strong>não aceita</strong> multimodal nesse endpoint.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[6px] border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function ResultPanel({ title, r }: { title: string; r: SpikeImageResult | undefined }) {
  if (!r) {
    return (
      <Panel title={title}>
        <div className="flex aspect-square items-center justify-center rounded-md bg-muted/50 text-[11.5px] text-muted-foreground/60">
          ainda não gerada
        </div>
      </Panel>
    )
  }
  if (r.ok && r.image_src) {
    return (
      <Panel title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.image_src} alt={title} className="w-full rounded-md border border-border" />
        <div className="mt-2 flex flex-col gap-0.5 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-600">
            <Check size={13} /> gerada em {(r.duration_ms / 1000).toFixed(1)}s
            {r.is_remote_url ? " · via URL" : ""}
          </span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{fmtCost(r.cost_usd)}</span>
            {r.total_tokens != null ? ` · ${r.total_tokens.toLocaleString("pt-BR")} tokens` : ""}
          </span>
        </div>
      </Panel>
    )
  }
  // Falha: distingue "abortada antes de gastar" (skipped) de erro real.
  return (
    <Panel title={title}>
      <div className="flex flex-col gap-2">
        <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground/50">
          {r.skipped ? <Ban size={28} /> : <ImageOff size={28} />}
        </div>
        <div
          className={`inline-flex items-start gap-1.5 text-[11.5px] ${
            r.skipped ? "text-amber-700" : "text-[#991B1B]"
          }`}
        >
          {r.skipped ? (
            <Ban size={13} className="mt-px shrink-0" />
          ) : (
            <X size={13} className="mt-px shrink-0" />
          )}
          <span className="break-words">
            {r.status ? `HTTP ${r.status} · ` : ""}
            {r.error ?? "falhou"}
            {r.skipped ? " (sem custo)" : ` (${(r.duration_ms / 1000).toFixed(1)}s)`}
          </span>
        </div>
        {/* Diagnóstico-chave: se o modelo respondeu TEXTO em vez de imagem,
            mostra o texto. É a prova de que não fez img2img. */}
        {r.assistant_text && (
          <div className="rounded-[4px] border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            <div className="mb-0.5 font-semibold">
              Texto que o modelo respondeu{r.finish_reason ? ` (finish: ${r.finish_reason})` : ""}:
            </div>
            <div className="max-h-32 overflow-auto whitespace-pre-wrap break-words italic">
              {r.assistant_text}
            </div>
          </div>
        )}
        {!r.skipped && r.cost_usd != null && r.cost_usd > 0 && (
          <div className="text-[11px] text-[#991B1B]">
            ⚠ Cobrado mesmo sem imagem: <strong>{fmtCost(r.cost_usd)}</strong>
            {r.total_tokens != null ? ` · ${r.total_tokens.toLocaleString("pt-BR")} tokens` : ""}
          </div>
        )}
      </div>
    </Panel>
  )
}
