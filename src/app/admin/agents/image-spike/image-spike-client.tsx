"use client"

import { useState, type ReactNode } from "react"
import { Loader2, ImageOff, AlertTriangle, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ImageSpikeResponse, SpikeImageResult } from "@/lib/agents/image/image-spike.service"

const DEFAULT_PROMPT =
  "Hero de boas-vindas para email de e-commerce: foto editorial do produto em uso/destaque, luz natural suave, profundidade de campo cinematográfica, enquadramento vertical 4:5, sem texto na imagem."

const field =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"

export function ImageSpikeClient() {
  const [imageUrl, setImageUrl] = useState("")
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [model, setModel] = useState("")
  const [maxTokens, setMaxTokens] = useState("16384")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImageSpikeResponse | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/agents/image-spike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          prompt,
          model: model || undefined,
          max_tokens: maxTokens ? Number(maxTokens) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setResult(json as ImageSpikeResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Spike — Agente de Imagem (multimodal)
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Prova se o modelo <strong>recebe</strong> a foto do produto pelo link e a <strong>usa</strong>{" "}
          como referência. Gera a mesma campanha <strong>com</strong> a imagem (product_ref) e{" "}
          <strong>sem</strong> (text2img) pra você comparar a correlação.
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
          <Button onClick={run} disabled={loading || imageUrl.trim().length === 0}>
            {loading ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
            Rodar teste A/B
          </Button>
        </div>
        {loading && (
          <div className="text-[12px] text-muted-foreground">
            Gerando as duas imagens… pode levar até ~90s cada (rodando em paralelo).
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
      {result && (
        <div className="flex flex-col gap-3">
          <div className="text-[12.5px] text-muted-foreground">
            Modelo: <span className="font-mono text-foreground">{result.model}</span> · entrada:{" "}
            {result.input.ok ? (
              <span className="font-semibold text-emerald-600">
                acessível ({result.input.content_type})
              </span>
            ) : (
              <span className="font-semibold text-[#991B1B]">
                inacessível {result.input.status ? `(HTTP ${result.input.status})` : ""}{" "}
                {result.input.content_type ? `· ${result.input.content_type}` : ""}
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Panel title="Entrada (referência)">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="entrada" className="w-full rounded-md border border-border" />
              ) : null}
            </Panel>
            <ResultPanel title="A · product_ref (com imagem)" r={result.product_ref} />
            <ResultPanel title="B · text2img (sem imagem)" r={result.text2img} />
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

function ResultPanel({ title, r }: { title: string; r: SpikeImageResult }) {
  return (
    <Panel title={title}>
      {r.ok && r.data_uri ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.data_uri} alt={title} className="w-full rounded-md border border-border" />
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-emerald-600">
            <Check size={13} /> gerada em {(r.duration_ms / 1000).toFixed(1)}s
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground/50">
            <ImageOff size={28} />
          </div>
          <div className="inline-flex items-start gap-1.5 text-[11.5px] text-[#991B1B]">
            <X size={13} className="mt-px shrink-0" />
            <span className="break-words">
              {r.status ? `HTTP ${r.status} · ` : ""}
              {r.error ?? "falhou"} ({(r.duration_ms / 1000).toFixed(1)}s)
            </span>
          </div>
        </div>
      )}
    </Panel>
  )
}
