"use client"

/**
 * BlockImageInstructionField — AE-16
 *
 * Renderizado no `BlockContentEditor` (email-detail-view.tsx) apenas pra
 * blocks `hero` e `image`. Permite ao designer/dev:
 *   - Adicionar instrucao adicional textual (APPEND ao prompt mestre)
 *   - Ver o prompt resolvido (modal de debug)
 *   - Regenerar a imagem (rate-limited 30s server-side + UI)
 *
 * A instrucao eh salva via `onPatch({content: {..., image_instruction}})`,
 * reusando o mesmo fluxo de patchBlock que ja existe pros outros campos
 * (debounce 1s pra evitar PATCH a cada tecla).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eye, Loader2, RefreshCw } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { PromptPreviewModal } from "./prompt-preview-modal"

const COOLDOWN_MS = 30_000
const DEBOUNCE_MS = 1_000

type RegenResponse = {
  success: boolean
  image_url?: string
  image_last_generated_at?: string
  mode?: string
  aspect?: string
}

type ApiEnvelope<T> = {
  success?: boolean
  data?: T
  error?: string
  code?: string
  retry_after_seconds?: number
}

export function BlockImageInstructionField({
  blockId,
  blockLabel,
  currentInstruction,
  lastGeneratedAt,
  onInstructionSave,
  onRegenerated,
}: {
  blockId: string
  blockLabel?: string | null
  currentInstruction?: string
  lastGeneratedAt?: string
  /** Salva o campo image_instruction. O caller eh responsavel pelo merge com o `content` atual. */
  onInstructionSave: (value: string) => Promise<void>
  /** Chamado apos regen com sucesso pra triggerar refetch do email. */
  onRegenerated?: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState(currentInstruction ?? "")
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(() => {
    if (!lastGeneratedAt) return null
    const last = new Date(lastGeneratedAt).getTime()
    if (Number.isNaN(last)) return null
    const until = last + COOLDOWN_MS
    return until > Date.now() ? until : null
  })
  const [now, setNow] = useState(Date.now())

  // Sync text com prop quando muda externamente (ex: outra aba salvou)
  useEffect(() => {
    setText(currentInstruction ?? "")
  }, [currentInstruction])

  // Debounce save da instrucao
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>(currentInstruction ?? "")
  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (newText === lastSavedRef.current) return
        lastSavedRef.current = newText
        onInstructionSave(newText).catch(() => {
          toast.toast({
            title: "Falha ao salvar instrucao",
            description: "Tente novamente em alguns segundos",
          })
        })
      }, DEBOUNCE_MS)
    },
    [onInstructionSave, toast],
  )

  // Cooldown tick
  useEffect(() => {
    if (!cooldownUntilMs) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [cooldownUntilMs])

  // Recalcula cooldown quando lastGeneratedAt vem atualizado de fora
  useEffect(() => {
    if (!lastGeneratedAt) return
    const last = new Date(lastGeneratedAt).getTime()
    if (Number.isNaN(last)) return
    const until = last + COOLDOWN_MS
    if (until > Date.now()) setCooldownUntilMs(until)
  }, [lastGeneratedAt])

  const cooldownSecs = cooldownUntilMs
    ? Math.max(0, Math.ceil((cooldownUntilMs - now) / 1000))
    : 0
  const cooldownActive = cooldownSecs > 0

  const relativeLast = useMemo(
    () => (lastGeneratedAt ? relativeTime(lastGeneratedAt) : null),
    [lastGeneratedAt],
  )

  const handleRegenerate = async () => {
    if (loading || cooldownActive) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/email-blocks/${blockId}/regenerate-image`,
        { method: "POST" },
      )
      const json = (await res.json()) as ApiEnvelope<RegenResponse>
      if (!res.ok) {
        if (res.status === 409 && json.code === "rate_limited") {
          const wait = json.retry_after_seconds ?? 30
          setCooldownUntilMs(Date.now() + wait * 1000)
          toast.toast({
            title: "Aguarde antes de regenerar",
            description: json.error ?? `Disponivel em ${wait}s`,
          })
        } else {
          toast.toast({
            title: "Falha na regeneracao",
            description: json.error ?? `Erro ${res.status}`,
          })
        }
        return
      }
      const payload = (json.data ?? json) as RegenResponse
      setCooldownUntilMs(Date.now() + COOLDOWN_MS)
      toast.toast({
        title: "Imagem regenerada",
        description: `${payload.mode} · ${payload.aspect}`,
      })
      onRegenerated?.()
    } catch (err) {
      toast.toast({
        title: "Falha de rede",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        style={{
          borderTop: "1px solid var(--crm-gray-200, #e5e7eb)",
          marginTop: 12,
          paddingTop: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--crm-gray-500, #6b7280)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 6,
          }}
        >
          Instrucao adicional (opcional)
        </div>
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder='Ex: "mostre a capa em couro vermelho esportivo"'
          style={{
            width: "100%",
            minHeight: 80,
            resize: "vertical",
            padding: 8,
            border: "1px solid var(--crm-gray-200, #e5e7eb)",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "inherit",
          }}
        />
        <p
          style={{
            fontSize: 10,
            color: "var(--crm-gray-500, #6b7280)",
            margin: "4px 0 8px 0",
          }}
        >
          Vazio = usa prompt mestre. Sua instrucao eh ADICIONADA — nao substitui.
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={iconBtnStyle()}
          >
            <Eye style={{ width: 12, height: 12 }} />
            Ver prompt resolvido
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={loading || cooldownActive}
            style={iconBtnStyle(loading || cooldownActive)}
          >
            {loading ? (
              <Loader2
                style={{ width: 12, height: 12 }}
                className="animate-spin"
              />
            ) : (
              <RefreshCw style={{ width: 12, height: 12 }} />
            )}
            {cooldownActive
              ? `Aguarde ${cooldownSecs}s`
              : loading
                ? "Gerando…"
                : "Regenerar imagem"}
          </button>
        </div>
        {relativeLast && (
          <p
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500, #6b7280)",
              marginTop: 6,
            }}
          >
            Ultima geracao: {relativeLast}
          </p>
        )}
      </div>

      <PromptPreviewModal
        open={showModal}
        onClose={() => setShowModal(false)}
        blockId={blockId}
        blockLabel={blockLabel}
      />
    </>
  )
}

function iconBtnStyle(disabled = false): React.CSSProperties {
  return {
    background: disabled ? "var(--crm-gray-100, #f3f4f6)" : "#fff",
    color: disabled ? "var(--crm-gray-400, #9ca3af)" : "var(--crm-gray-700, #374151)",
    border: "1px solid var(--crm-gray-200, #e5e7eb)",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return "agora"
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min atras`
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h atras`
  return new Date(iso).toLocaleString("pt-BR")
}
