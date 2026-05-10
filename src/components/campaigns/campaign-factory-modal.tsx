"use client"

/**
 * Campaign Factory Modal
 *
 * Wizard de 5 steps pra deploy organizado em multiplas lojas:
 *  1. Selecao de lojas (checkboxes)
 *  2. Configuracoes (assunto, preview, segmento, data, UTMs)
 *  3. Conteudo (preview de copy/design)
 *  4. Checklist de verificacao
 *  5. Deploy (progress por loja)
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Search,
  Rocket,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react"
import type { CampaignPipelineItem } from "@/types/campaign-pipeline"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STEPS = [
  { key: "stores", label: "Lojas" },
  { key: "config", label: "Configuração" },
  { key: "content", label: "Conteúdo" },
  { key: "checklist", label: "Checklist" },
  { key: "deploy", label: "Deploy" },
] as const

type StepKey = (typeof STEPS)[number]["key"]

const SEGMENTS = [
  { value: "all", label: "Todos os contatos" },
  { value: "engaged", label: "Engajados (30 dias)" },
  { value: "buyers_30d", label: "Compraram nos últimos 30 dias" },
  { value: "buyers_90d", label: "Compraram nos últimos 90 dias" },
  { value: "abandoned", label: "Carrinho abandonado" },
  { value: "vip", label: "Clientes VIP" },
]

const CHECKLIST_ITEMS = [
  { key: "links", label: "Links verificados" },
  { key: "images", label: "Imagens carregadas" },
  { key: "utms", label: "UTMs configurados" },
  { key: "segment", label: "Segmento correto" },
  { key: "schedule", label: "Horário adequado" },
  { key: "mobile", label: "Preview mobile OK" },
]

interface DeployStatus {
  store_id: string
  store_name: string
  status: "pending" | "deploying" | "deployed" | "failed"
  error?: string
  omnisend_campaign_id?: string
}

interface Props {
  open: boolean
  item: CampaignPipelineItem
  onClose: () => void
  onCompleted: () => void
}

export function CampaignFactoryModal({
  open,
  item,
  onClose,
  onCompleted,
}: Props) {
  const [step, setStep] = useState<StepKey>("stores")
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [storeSearch, setStoreSearch] = useState("")
  const [subject, setSubject] = useState(item.subject_line ?? "")
  const [preview, setPreview] = useState(item.preview_text ?? "")
  const [segment, setSegment] = useState("all")
  const [sendDate, setSendDate] = useState(
    item.deploy_config?.send_date ?? "",
  )
  const [sendTime, setSendTime] = useState(
    item.deploy_config?.send_time ?? "10:00",
  )
  const [utmSource, setUtmSource] = useState(
    item.deploy_config?.utm_source ?? "omnisend",
  )
  const [utmMedium, setUtmMedium] = useState(
    item.deploy_config?.utm_medium ?? "email",
  )
  const [utmCampaign, setUtmCampaign] = useState(
    item.deploy_config?.utm_campaign ??
      item.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40),
  )
  const [bodyHtml, setBodyHtml] = useState(item.copy_data?.body_html ?? "")
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [deployStatuses, setDeployStatuses] = useState<DeployStatus[]>([])
  const [deploying, setDeploying] = useState(false)
  const [deployComplete, setDeployComplete] = useState(false)

  const { data: storesData } = useSWR<{
    data?: Array<{ id: string; store_name: string; platform: string | null; omnisend_api_key: string | null }>
    stores?: Array<{ id: string; store_name: string; platform: string | null; omnisend_api_key: string | null }>
  }>(open ? "/api/stores" : null, fetcher)

  const stores = storesData?.data ?? storesData?.stores ?? []

  useEffect(() => {
    if (!open) return
    setStep("stores")
    setSelectedStoreIds(
      (item.target_stores ?? []).map((s) => s.store_id),
    )
    setSubject(item.subject_line ?? "")
    setPreview(item.preview_text ?? "")
    setBodyHtml(item.copy_data?.body_html ?? "")
    setChecklist({})
    setDeployStatuses([])
    setDeployComplete(false)
  }, [open, item])

  const stepIdx = STEPS.findIndex((s) => s.key === step)
  const goNext = () => {
    if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1].key)
  }
  const goPrev = () => {
    if (stepIdx > 0) setStep(STEPS[stepIdx - 1].key)
  }

  const allChecklistDone = CHECKLIST_ITEMS.every((c) => checklist[c.key])

  const filteredStores = stores.filter((s) =>
    storeSearch
      ? s.store_name.toLowerCase().includes(storeSearch.toLowerCase())
      : true,
  )
  const allFilteredSelected =
    filteredStores.length > 0 &&
    filteredStores.every((s) => selectedStoreIds.includes(s.id))

  const canProceedFromStores = selectedStoreIds.length > 0
  const canProceedFromConfig = subject.trim().length > 0 && segment.length > 0

  const startDeploy = async () => {
    setDeploying(true)
    setDeployStatuses(
      selectedStoreIds.map((sid) => {
        const s = stores.find((x) => x.id === sid)
        return {
          store_id: sid,
          store_name: s?.store_name ?? sid,
          status: "deploying",
        }
      }),
    )

    // Persist config + copy antes de deployar
    await fetch(`/api/campaign-pipeline/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject_line: subject,
        preview_text: preview,
        copy_data: { ...item.copy_data, body_html: bodyHtml },
        deploy_config: {
          segment_id: segment,
          segment_label:
            SEGMENTS.find((x) => x.value === segment)?.label ?? segment,
          send_date: sendDate,
          send_time: sendTime,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
        },
        target_stores: selectedStoreIds.map((sid) => {
          const s = stores.find((x) => x.id === sid)
          return {
            store_id: sid,
            store_name: s?.store_name ?? sid,
            status: "pending" as const,
          }
        }),
      }),
    })

    const res = await fetch(`/api/campaign-pipeline/${item.id}/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_ids: selectedStoreIds }),
    })
    const j = await res.json()
    const results = (j.results ?? j.data?.results ?? []) as DeployStatus[]
    setDeployStatuses(
      selectedStoreIds.map((sid) => {
        const r = results.find((x) => x.store_id === sid)
        const s = stores.find((x) => x.id === sid)
        return {
          store_id: sid,
          store_name: s?.store_name ?? sid,
          status: r?.status ?? "failed",
          error: r?.error,
          omnisend_campaign_id: r?.omnisend_campaign_id,
        }
      }),
    )
    setDeploying(false)
    setDeployComplete(true)
  }

  const handleClose = () => {
    if (deploying) return
    onClose()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-[920px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[12px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            Campaign Factory
          </DialogPrimitive.Title>

          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400">
                <Rocket className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-white/55">
                  Deploy organizado pra múltiplas lojas
                </p>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                disabled={deploying}
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-1 px-6 py-3 bg-slate-50/60 dark:bg-white/[0.02] border-b border-black/[0.04] dark:border-white/[0.04]">
            {STEPS.map((s, i) => {
              const isActive = i === stepIdx
              const isDone = i < stepIdx
              return (
                <div key={s.key} className="flex items-center gap-1">
                  <div
                    className={
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors " +
                      (isActive
                        ? "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300"
                        : isDone
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-slate-400 dark:text-white/35")
                    }
                  >
                    <span
                      className={
                        "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums " +
                        (isActive
                          ? "bg-orange-600 text-white"
                          : isDone
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-200 dark:bg-white/[0.08]")
                      }
                    >
                      {isDone ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="text-[11px] font-semibold">{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="h-px w-6 bg-slate-200 dark:bg-white/[0.08]" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === "stores" && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    Selecione as lojas
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
                    Escolha quais lojas vão receber esta campanha. Apenas lojas
                    com Omnisend conectado podem receber deploys.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      placeholder="Buscar loja..."
                      className="w-full h-9 pl-8 pr-3 text-[13px] rounded-[6px] bg-slate-50 dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.10] focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (allFilteredSelected) {
                        setSelectedStoreIds((arr) =>
                          arr.filter(
                            (id) => !filteredStores.some((s) => s.id === id),
                          ),
                        )
                      } else {
                        setSelectedStoreIds((arr) => [
                          ...new Set([...arr, ...filteredStores.map((s) => s.id)]),
                        ])
                      }
                    }}
                    className="h-9 px-3 text-[12px] font-medium rounded-[6px] border border-black/[0.08] dark:border-white/[0.10] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                  >
                    {allFilteredSelected ? "Desmarcar todas" : "Selecionar todas"}
                  </button>
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-white/80 tabular-nums">
                    {selectedStoreIds.length} / {stores.length}
                  </span>
                </div>

                <ul className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {filteredStores.map((s) => {
                    const checked = selectedStoreIds.includes(s.id)
                    const hasOmnisend = !!s.omnisend_api_key
                    return (
                      <li key={s.id}>
                        <label
                          className={
                            "flex items-center justify-between gap-2 px-3 py-2.5 rounded-[6px] border cursor-pointer transition-colors " +
                            (checked
                              ? "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/30"
                              : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] hover:border-slate-300")
                          }
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!hasOmnisend}
                              onChange={() =>
                                setSelectedStoreIds((arr) =>
                                  checked
                                    ? arr.filter((id) => id !== s.id)
                                    : [...arr, s.id],
                                )
                              }
                              className="h-4 w-4 rounded"
                            />
                            <span className="text-[13px] font-medium text-slate-900 dark:text-white">
                              {s.store_name}
                            </span>
                            {s.platform && (
                              <span className="text-[10px] uppercase font-mono text-slate-400 dark:text-white/35">
                                {s.platform}
                              </span>
                            )}
                          </div>
                          {!hasOmnisend && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
                              <AlertCircle className="h-3 w-3" />
                              Omnisend não conectado
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                  {filteredStores.length === 0 && (
                    <li className="text-center py-8 text-[12px] text-slate-500 dark:text-white/45">
                      Nenhuma loja encontrada
                    </li>
                  )}
                </ul>
              </div>
            )}

            {step === "config" && (
              <div className="space-y-4 max-w-[600px]">
                <div>
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    Configurações da campanha
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
                    Ajuste assunto, segmento e UTM. Aplica-se a todas as lojas
                    selecionadas.
                  </p>
                </div>

                <Field label="Assunto do email" required>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="🔥 Black Friday começou!"
                    className="crm-input w-full"
                  />
                </Field>
                <Field label="Preview text">
                  <input
                    type="text"
                    value={preview}
                    onChange={(e) => setPreview(e.target.value)}
                    placeholder="Aproveite enquanto dura..."
                    className="crm-input w-full"
                  />
                </Field>
                <Field label="Segmento alvo" required>
                  <select
                    value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                    className="crm-input w-full"
                  >
                    {SEGMENTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Data de envio">
                    <input
                      type="date"
                      value={sendDate}
                      onChange={(e) => setSendDate(e.target.value)}
                      className="crm-input w-full"
                    />
                  </Field>
                  <Field label="Horário">
                    <input
                      type="time"
                      value={sendTime}
                      onChange={(e) => setSendTime(e.target.value)}
                      className="crm-input w-full"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="UTM source">
                    <input
                      type="text"
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      className="crm-input w-full font-mono text-[11px]"
                    />
                  </Field>
                  <Field label="UTM medium">
                    <input
                      type="text"
                      value={utmMedium}
                      onChange={(e) => setUtmMedium(e.target.value)}
                      className="crm-input w-full font-mono text-[11px]"
                    />
                  </Field>
                  <Field label="UTM campaign">
                    <input
                      type="text"
                      value={utmCampaign}
                      onChange={(e) => setUtmCampaign(e.target.value)}
                      className="crm-input w-full font-mono text-[11px]"
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === "content" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    Conteúdo da campanha
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
                    Edite a copy. Em deploy, isso vira o body do draft no
                    Omnisend.
                  </p>
                </div>

                {item.design_data?.figma_url && (
                  <div className="rounded-[8px] border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                      Design Figma
                    </p>
                    <a
                      href={item.design_data.figma_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-blue-700 dark:text-blue-300 hover:underline mt-0.5 block break-all"
                    >
                      {item.design_data.figma_url}
                    </a>
                  </div>
                )}

                <Field label="Body HTML">
                  <textarea
                    rows={12}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    placeholder="<h1>Olá {{firstName}}...</h1>"
                    className="crm-input w-full font-mono text-[12px]"
                  />
                </Field>

                {bodyHtml && (
                  <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.08] overflow-hidden">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 px-3 py-1.5 bg-slate-50 dark:bg-white/[0.02] border-b border-black/[0.04] dark:border-white/[0.04]">
                      Pré-visualização
                    </p>
                    <iframe
                      srcDoc={bodyHtml}
                      className="w-full h-[300px] bg-white"
                      title="Preview"
                    />
                  </div>
                )}
              </div>
            )}

            {step === "checklist" && (
              <div className="space-y-3 max-w-[500px] mx-auto">
                <div>
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    Checklist de verificação
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
                    Confirme cada item antes do deploy. Erros aqui custam caro.
                  </p>
                </div>
                <ul className="space-y-2">
                  {CHECKLIST_ITEMS.map((c) => (
                    <li key={c.key}>
                      <label
                        className={
                          "flex items-center gap-3 px-3 py-3 rounded-[6px] border cursor-pointer transition-colors " +
                          (checklist[c.key]
                            ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40"
                            : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] hover:border-slate-300")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={!!checklist[c.key]}
                          onChange={(e) =>
                            setChecklist((m) => ({
                              ...m,
                              [c.key]: e.target.checked,
                            }))
                          }
                          className="h-4 w-4"
                        />
                        <span className="text-[13px] font-medium text-slate-800 dark:text-white/85">
                          {c.label}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === "deploy" && (
              <div className="space-y-4 max-w-[600px] mx-auto">
                <div>
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    Resumo do deploy
                  </h3>
                </div>

                <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.08] divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  <SummaryRow label="Lojas" value={`${selectedStoreIds.length} selecionadas`} />
                  <SummaryRow label="Assunto" value={subject} />
                  <SummaryRow
                    label="Segmento"
                    value={SEGMENTS.find((s) => s.value === segment)?.label ?? segment}
                  />
                  <SummaryRow
                    label="Envio"
                    value={
                      sendDate
                        ? `${new Date(sendDate).toLocaleDateString("pt-BR")} ${sendTime}`
                        : "Como rascunho"
                    }
                  />
                </div>

                {!deployComplete && deployStatuses.length === 0 && (
                  <button
                    type="button"
                    onClick={startDeploy}
                    disabled={deploying}
                    className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-[8px] bg-orange-600 hover:bg-orange-700 text-white text-[14px] font-semibold disabled:opacity-50"
                  >
                    {deploying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    Implementar no Omnisend
                  </button>
                )}

                {deployStatuses.length > 0 && (
                  <ul className="space-y-1.5">
                    {deployStatuses.map((d) => (
                      <li
                        key={d.store_id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]"
                      >
                        <span className="text-[13px] font-medium text-slate-800 dark:text-white/85">
                          {d.store_name}
                        </span>
                        <StatusBadge status={d.status} error={d.error} />
                      </li>
                    ))}
                  </ul>
                )}

                {deployComplete && (
                  <div className="text-center py-3">
                    <p className="text-[14px] font-semibold text-emerald-700 dark:text-emerald-400">
                      Deploy concluído
                    </p>
                    <p className="text-[12px] text-slate-500 dark:text-white/55 mt-1">
                      Confira os drafts criados em cada Omnisend e ajuste antes
                      de enviar.
                    </p>
                    <button
                      type="button"
                      onClick={onCompleted}
                      className="mt-3 h-9 px-4 rounded-[6px] bg-[#1F1F1F] text-white dark:bg-white dark:text-black text-[12px] font-semibold"
                    >
                      Fechar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={goPrev}
              disabled={stepIdx === 0 || deploying || deployComplete}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            {step !== "deploy" && (
              <button
                type="button"
                onClick={goNext}
                disabled={
                  (step === "stores" && !canProceedFromStores) ||
                  (step === "config" && !canProceedFromConfig) ||
                  (step === "checklist" && !allChecklistDone)
                }
                className="inline-flex items-center gap-1 h-9 px-4 rounded-[6px] text-[12px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black disabled:opacity-50"
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-white/[0.02]">
      <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/45">
        {label}
      </span>
      <span className="text-[13px] text-slate-900 dark:text-white truncate max-w-[60%] text-right">
        {value || "—"}
      </span>
    </div>
  )
}

function StatusBadge({
  status,
  error,
}: {
  status: DeployStatus["status"]
  error?: string
}) {
  if (status === "deploying") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        Deployando...
      </span>
    )
  }
  if (status === "deployed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Sucesso
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400"
        title={error}
      >
        <XCircle className="h-3 w-3" />
        Falhou
      </span>
    )
  }
  return (
    <span className="text-[11px] text-slate-500 dark:text-white/55">
      Pendente
    </span>
  )
}
