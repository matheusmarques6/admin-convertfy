"use client"

/**
 * Card "Testar geração" da aba Componentes (maquete EG).
 * Roda o agente component_test com um briefing curto (+ loja opcional),
 * mostra os campos gerados, custo/tokens e o preview do bloco com a copy
 * gerada aplicada nas {{TAGS}} do HTML.
 */

import { useState } from "react"
import useSWR from "swr"
import { Loader2, Zap } from "lucide-react"
import type { ComponentOutputField } from "@/types/email-generation"
import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import {
  EGCard,
  EGRenderFrame,
  EGSelect,
  EGTextarea,
} from "@/components/email-generation/ui/eg-atoms"
import { EMAIL_WIDTH } from "@/lib/email-workspace/email-width"
import { mergeExamplesIntoHtml } from "./variant-editor"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface TestResult {
  fields: Record<string, string>
  missing_required: string[]
  model: string
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
}

export function VariantTestCard({
  variantId,
  html,
  schema,
}: {
  /** null = variante ainda não salva (teste desabilitado). */
  variantId: string | null
  html: string
  schema: ComponentOutputField[]
}) {
  const [briefing, setBriefing] = useState("")
  const [storeId, setStoreId] = useState("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: storesData } = useSWR<{
    stores: Array<{ id: string; store_name: string }>
  }>("/api/admin/stores", fetcher)
  const stores = storesData?.stores ?? []

  const canRun =
    !!variantId && briefing.trim().length >= 3 && schema.length > 0 && !running

  const run = async () => {
    if (!variantId) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/components/${variantId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing: briefing.trim(),
          ...(storeId ? { store_id: storeId } : {}),
        }),
      })
      const text = await res.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(`Resposta inválida (HTTP ${res.status})`)
      }
      const data = (parsed?.data ?? parsed) as Record<string, unknown>
      if (!res.ok) {
        const errMsg =
          (typeof data?.error === "string" && data.error) ||
          (typeof (data?.error as Record<string, unknown>)?.message ===
            "string" &&
            ((data.error as Record<string, unknown>).message as string)) ||
          `HTTP ${res.status}`
        throw new Error(errMsg)
      }
      setResult(data as unknown as TestResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no teste")
    } finally {
      setRunning(false)
    }
  }

  // Preview com a copy gerada: schema com example = valor gerado.
  const mergedHtml = result
    ? mergeExamplesIntoHtml(
        html,
        schema.map((f) => ({ ...f, example: result.fields[f.key] ?? f.example })),
      )
    : null

  return (
    <EGCard
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Zap size={16} /> Testar geração
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <EGTextarea
          rows={2}
          value={briefing}
          onChange={setBriefing}
          placeholder="Briefing de teste (ex: Black Friday, 40% em tudo, para amantes de moda)"
        />
        <EGSelect
          value={storeId}
          onChange={setStoreId}
          placeholder="Sem loja (só o briefing)"
          options={stores.map((s) => ({ value: s.id, label: s.store_name }))}
        />
        <div>
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            title={
              !variantId
                ? "Salve a variante antes de testar"
                : schema.length === 0
                  ? "Adicione campos ao schema de output antes de testar"
                  : undefined
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              height: 34,
              padding: "0 16px",
              borderRadius: 7,
              border: "none",
              background: C.brand,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: F.sans,
              cursor: canRun ? "pointer" : "not-allowed",
              opacity: canRun ? 1 : 0.5,
            }}
          >
            {running ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Zap size={15} />
            )}
            {running ? "Gerando…" : "Testar com IA"}
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "9px 12px",
              border: `1px solid ${C.negBorder}`,
              background: C.negBg,
              borderRadius: 8,
              color: C.neg,
              fontSize: 12.5,
              fontFamily: F.sans,
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <>
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 11.5,
                color: C.g400,
                fontFamily: F.sans,
                ...TNUM,
              }}
            >
              <span>{result.model}</span>
              <span>
                {(result.tokens_input + result.tokens_output).toLocaleString(
                  "pt-BR",
                )}{" "}
                tokens
              </span>
              <span>US$ {(result.cost_cents / 100).toFixed(4)}</span>
              <span>{(result.duration_ms / 1000).toFixed(1)}s</span>
            </div>

            {result.missing_required.length > 0 && (
              <div
                style={{
                  padding: "9px 12px",
                  border: `1px solid ${C.warnBorder}`,
                  background: C.warnBg,
                  borderRadius: 8,
                  color: C.warn,
                  fontSize: 12,
                  fontFamily: F.sans,
                }}
              >
                Campos obrigatórios vazios: {result.missing_required.join(", ")}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {schema.map((f) => (
                <div
                  key={f.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: 12.5,
                    fontFamily: F.sans,
                    padding: "7px 10px",
                    background: C.g25,
                    border: `1px solid ${C.border}`,
                    borderRadius: 7,
                  }}
                >
                  <code
                    style={{
                      fontFamily: F.mono,
                      fontSize: 11.5,
                      color: C.brand,
                      flexShrink: 0,
                    }}
                  >
                    {f.key}
                  </code>
                  <span style={{ color: C.g700, minWidth: 0, wordBreak: "break-word" }}>
                    {result.fields[f.key] || (
                      <i style={{ color: C.g400 }}>(vazio)</i>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {mergedHtml && (
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: C.g400,
                    fontFamily: F.sans,
                    marginBottom: 6,
                  }}
                >
                  Preview com a copy gerada:
                </div>
                <div
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <EGRenderFrame
                    html={mergedHtml}
                    minHeight={300}
                    emailWidth={EMAIL_WIDTH}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </EGCard>
  )
}
