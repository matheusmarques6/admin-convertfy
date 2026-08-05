"use client"

/**
 * Dialog "Automação do Instagram" — cria em 1 clique a automação
 * interação (DM/comentário) → negócio na pipeline, estilo Datacrazy.
 *
 * Honestidade primeiro: a API oficial NÃO avisa quem passou a seguir a
 * conta (nem por webhook), então "seguidor novo → pipeline" não existe
 * de forma identificável. O gatilho real é a INTERAÇÃO — quem comenta
 * ou manda direct é identificável e vira negócio. O dialog explica isso.
 *
 * O POST vai para /api/crm/channels/[id]/instagram/setup-automation,
 * que monta trigger + DAG espelhados (módulo instagram-automation.ts) e
 * é idempotente por conteúdo (double-click devolve a existente).
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Workflow } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  IG_AUTOMATION_EVENT_LABEL,
  type InstagramAutomationEventKind,
} from "@/lib/services/instagram-automation"

interface PipelineOption {
  id: string
  name: string
  stages: Array<{ id: string; name: string; order: number; stage_type?: string | null }>
}

export interface IgAutomationResult {
  id: string
  name: string
  is_active: boolean
  already_exists: boolean
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Erro ${res.status}`)
  return body
}

const EVENT_OPTIONS: Array<{ value: InstagramAutomationEventKind; hint: string }> = [
  { value: "any", hint: "Qualquer interação do contato cria o negócio" },
  { value: "message", hint: "Só quando o contato manda mensagem no direct" },
  { value: "comment", hint: "Só quando o contato comenta numa publicação" },
]

const inputStyle: React.CSSProperties = {
  borderColor: "var(--crm-gray-300)",
  fontSize: "var(--crm-text-sm)",
  background: "var(--crm-gray-0)",
  color: "var(--crm-gray-900)",
}

export function InstagramAutomationDialog({
  open,
  onOpenChange,
  channelId,
  channelName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelId: string
  channelName: string
  onCreated: (result: IgAutomationResult) => void
}) {
  const { data: pipelinesData, error: pipelinesError } = useSWR<{ pipelines: PipelineOption[] }>(
    open ? "/api/crm/pipelines?scope=sales" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const pipelines = useMemo(() => pipelinesData?.pipelines ?? [], [pipelinesData])

  const [eventKind, setEventKind] = useState<InstagramAutomationEventKind>("any")
  const [firstOnly, setFirstOnly] = useState(true)
  const [pipelineId, setPipelineId] = useState("")
  const [stageId, setStageId] = useState("")
  const [activate, setActivate] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? null
  const stages = useMemo(
    () => [...(pipeline?.stages ?? [])].sort((a, b) => a.order - b.order),
    [pipeline],
  )

  // Primeira pipeline pré-selecionada; etapa padrão = primeira etapa
  // aberta do funil (negócio novo não deve nascer em Ganho/Perdido).
  useEffect(() => {
    if (!open) return
    if (!pipelineId && pipelines.length > 0) setPipelineId(pipelines[0].id)
  }, [open, pipelines, pipelineId])
  useEffect(() => {
    if (!pipeline) return
    if (stages.some((s) => s.id === stageId)) return
    const firstOpen = stages.find((s) => s.stage_type !== "won" && s.stage_type !== "lost")
    setStageId(firstOpen?.id ?? stages[0]?.id ?? "")
  }, [pipeline, stages, stageId])

  const submit = async () => {
    if (!pipelineId || !stageId || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/channels/${channelId}/instagram/setup-automation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          stage_id: stageId,
          event_kind: eventKind,
          first_message_only: firstOnly,
          only_this_channel: true,
          activate,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const e = (body as { error?: unknown })?.error
        setError(typeof e === "string" && e ? e : "Falha ao criar a automação")
        return
      }
      onCreated(body as IgAutomationResult)
      onOpenChange(false)
    } catch {
      setError("Falha de rede ao criar a automação")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Automação do Instagram
          </DialogTitle>
          <DialogDescription>
            Quem interage com <strong>{channelName}</strong> entra como negócio na etapa escolhida.
            A conversa fica vinculada ao negócio no inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Gatilho */}
          <fieldset className="flex flex-col gap-1.5">
            <legend
              className="mb-1"
              style={{ fontSize: "var(--crm-text-xs)", fontWeight: 600, color: "var(--crm-gray-700)" }}
            >
              Gatilho
            </legend>
            {EVENT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-2 rounded border px-2.5 py-2"
                style={{
                  borderColor: eventKind === opt.value ? "var(--crm-gray-900)" : "var(--crm-gray-200)",
                  background: eventKind === opt.value ? "var(--crm-gray-50)" : "var(--crm-gray-0)",
                }}
              >
                <input
                  type="radio"
                  name="ig-event-kind"
                  checked={eventKind === opt.value}
                  onChange={() => setEventKind(opt.value)}
                  className="mt-0.5 accent-black"
                />
                <span className="flex flex-col">
                  <span style={{ fontSize: "var(--crm-text-sm)", fontWeight: 500, color: "var(--crm-gray-900)" }}>
                    {IG_AUTOMATION_EVENT_LABEL[opt.value]}
                  </span>
                  <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>{opt.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={firstOnly}
              onChange={(e) => setFirstOnly(e.target.checked)}
              className="mt-0.5 accent-black"
            />
            <span className="flex flex-col">
              <span style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-900)" }}>
                Disparar só na primeira mensagem do contato
              </span>
              <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                Recomendado — sem isso o fluxo roda a cada resposta da mesma pessoa.
              </span>
            </span>
          </label>

          {/* Destino */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: "var(--crm-text-xs)", fontWeight: 600, color: "var(--crm-gray-700)" }}>
                Pipeline
              </span>
              <select
                value={pipelineId}
                onChange={(e) => {
                  setPipelineId(e.target.value)
                  setStageId("")
                }}
                className="rounded border px-2 py-1.5"
                style={inputStyle}
              >
                {pipelines.length === 0 && (
                  <option value="">
                    {pipelinesData ? "Nenhuma pipeline de vendas" : "Carregando…"}
                  </option>
                )}
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: "var(--crm-text-xs)", fontWeight: 600, color: "var(--crm-gray-700)" }}>
                Etapa de entrada
              </span>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="rounded border px-2 py-1.5"
                style={inputStyle}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
              className="accent-black"
            />
            <span style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-900)" }}>
              Ativar imediatamente
            </span>
          </label>

          <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
            A API oficial não avisa quem passou a <strong>seguir</strong> a conta — o gatilho
            identificável é a interação (direct ou comentário). O negócio criado herda o nome do
            contato e pode ser revisado no construtor de automações.
          </p>

          {pipelinesError && (
            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-danger-fg, #B3261E)" }}>
              Não foi possível carregar as pipelines de vendas.
            </p>
          )}
          {error && (
            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-danger-fg, #B3261E)" }}>{error}</p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded border px-3 py-1.5"
            style={{
              borderColor: "var(--crm-gray-300)",
              fontSize: "var(--crm-text-sm)",
              color: "var(--crm-gray-700)",
              background: "var(--crm-gray-0)",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !pipelineId || !stageId}
            className="rounded px-3 py-1.5 disabled:opacity-60"
            style={{
              background: "var(--crm-gray-900)",
              color: "var(--crm-gray-0)",
              fontSize: "var(--crm-text-sm)",
              fontWeight: 500,
            }}
          >
            {saving ? "Criando…" : "Criar automação"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
