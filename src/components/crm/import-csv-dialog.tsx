"use client"

import { useMemo, useRef, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"

interface ImportCsvDialogProps {
  open: boolean
  onClose: () => void
  pipelineId: string
  /** Stages do pipeline — pra usar como fallback quando a coluna do
   *  CSV nao mapeia pra nada e pra fuzzy match no backend. */
  stages: Array<{ id: string; name: string }>
  onImported?: (result: ImportResult) => void
}

interface ImportResult {
  imported: number
  leadsCreated: number
  dealsCreated: number
  errors: Array<{ row: number; error: string }>
}

/** Campos do Convertfy que podem receber dados do CSV. */
type ConvertfyField =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "source"
  | "notes"
  | "tags"
  | "deal_title"
  | "deal_value"
  | "deal_stage_name"
  | "ignore"

const FIELD_LABELS: Record<ConvertfyField, string> = {
  name: "Nome do lead *",
  email: "Email",
  phone: "Telefone",
  company: "Empresa",
  source: "Fonte / origem",
  notes: "Notas",
  tags: "Tags",
  deal_title: "Titulo do deal",
  deal_value: "Valor do deal (R$)",
  deal_stage_name: "Etapa (fuzzy match)",
  ignore: "— Ignorar coluna —",
}

/**
 * Detector heuristico do formato Kommo. Se o header tem essas colunas
 * tipicas, sugere mapeamento automatico (-> labels do nosso schema).
 *
 * Comparacao case-insensitive + normalizacao basica de acentos.
 */
const KOMMO_MAP: Record<string, ConvertfyField> = {
  "nome completo": "name",
  "lead titulo": "deal_title",
  "lead título": "deal_title",
  "lead venda r$": "deal_value",
  "lead venda rs": "deal_value",
  "email comercial": "email",
  "email pessoal": "email",
  "outro email": "email",
  email: "email",
  celular: "phone",
  "telefone comercial": "phone",
  "telefone residencial": "phone",
  "tel direto com": "phone",
  "tel direto comercial": "phone",
  "outro telefone": "phone",
  "empresa lead s": "company",
  "empresa lead's": "company",
  empresa: "company",
  "etapa do lead": "deal_stage_name",
  tags: "tags",
  "funil de vendas": "ignore",
  "criado em": "ignore",
  "criado por": "ignore",
  "modificada em": "ignore",
  "modificado por": "ignore",
  "fechado as": "ignore",
  "usuario responsavel": "ignore",
  "usuário responsável": "ignore",
  id: "ignore",
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Parser CSV simples — suporta valores entre aspas (com aspas
 * escapadas internas) e separadores `,` ou `;`. Sem deps externas.
 */
function parseCsv(text: string): string[][] {
  // Detecta separador olhando a primeira linha
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const semicolons = (firstLine.match(/;/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  const sep = semicolons > commas ? ";" : ","

  const rows: string[][] = []
  let cur: string[] = []
  let buf = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === "\"" && text[i + 1] === "\"") {
        buf += "\""
        i += 1
      } else if (ch === "\"") {
        inQuotes = false
      } else {
        buf += ch
      }
      continue
    }
    if (ch === "\"") {
      inQuotes = true
      continue
    }
    if (ch === sep) {
      cur.push(buf)
      buf = ""
      continue
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      cur.push(buf)
      buf = ""
      if (cur.some((c) => c.trim() !== "")) rows.push(cur)
      cur = []
      continue
    }
    buf += ch
  }
  if (buf || cur.length > 0) {
    cur.push(buf)
    if (cur.some((c) => c.trim() !== "")) rows.push(cur)
  }
  return rows
}

export function ImportCsvDialog({
  open,
  onClose,
  pipelineId,
  stages,
  onImported,
}: ImportCsvDialogProps) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<"upload" | "map" | "result">("upload")
  const [filename, setFilename] = useState<string>("")
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<number, ConvertfyField>>({})
  const [defaultStageId, setDefaultStageId] = useState<string>(stages[0]?.id ?? "")
  const [createDeals, setCreateDeals] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = () => {
    setStep("upload")
    setFilename("")
    setHeaders([])
    setRows([])
    setMapping({})
    setDefaultStageId(stages[0]?.id ?? "")
    setCreateDeals(true)
    setParseError(null)
    setResult(null)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleFile = async (file: File) => {
    setParseError(null)
    setFilename(file.name)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.length < 2) {
        setParseError("CSV vazio ou sem linhas de dados.")
        return
      }
      const [header, ...data] = parsed
      setHeaders(header.map((h) => h.trim()))
      setRows(data)

      // Auto-detect Kommo mapping
      const auto: Record<number, ConvertfyField> = {}
      header.forEach((h, idx) => {
        const norm = normalize(h)
        const field = KOMMO_MAP[norm]
        if (field) {
          auto[idx] = field
        } else if (norm.includes("nome") || norm.includes("name")) {
          auto[idx] = "name"
        } else if (norm.includes("email") || norm.includes("e-mail")) {
          auto[idx] = "email"
        } else if (
          norm.includes("phone") ||
          norm.includes("fone") ||
          norm.includes("celular")
        ) {
          auto[idx] = "phone"
        } else {
          auto[idx] = "ignore"
        }
      })

      // Garante que existe mapeamento de "name" — se nenhuma coluna mapeou,
      // usa a primeira coluna nao-ignorada.
      if (!Object.values(auto).includes("name")) {
        const firstUseful = header.findIndex(
          (_, i) => auto[i] !== "ignore",
        )
        if (firstUseful >= 0) auto[firstUseful] = "name"
      }

      setMapping(auto)
      setStep("map")
    } catch (e) {
      setParseError(
        e instanceof Error ? e.message : "Nao foi possivel ler o arquivo CSV.",
      )
    }
  }

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const hasNameMapped = useMemo(
    () => Object.values(mapping).includes("name"),
    [mapping],
  )

  const handleImport = async () => {
    if (!hasNameMapped) {
      toast.toast({
        variant: "destructive",
        title: "Mapeamento incompleto",
        description: "Mapeie pelo menos uma coluna como Nome.",
      })
      return
    }
    if (!defaultStageId) {
      toast.toast({
        variant: "destructive",
        title: "Etapa padrao",
        description: "Selecione a etapa padrao do pipeline.",
      })
      return
    }

    setSubmitting(true)
    try {
      // Constroi rows no shape do endpoint
      const payload = rows
        .map((row) => {
          const obj: Record<string, string> = {}
          for (const [colIdxStr, field] of Object.entries(mapping)) {
            if (field === "ignore") continue
            const idx = Number(colIdxStr)
            const val = (row[idx] || "").trim()
            if (!val) continue
            obj[field] = val
          }
          if (!obj.name) return null

          // Tags: split por virgula
          const tags = obj.tags
            ? obj.tags
                .split(/[,;]/)
                .map((t) => t.trim())
                .filter(Boolean)
            : []

          // Valor: parse R$ "1.234,56" → 1234.56
          let dealValue: number | null = null
          if (obj.deal_value) {
            const cleaned = obj.deal_value
              .replace(/r\$\s*/i, "")
              .replace(/\./g, "")
              .replace(",", ".")
            const n = parseFloat(cleaned)
            if (!isNaN(n) && n >= 0) dealValue = n
          }

          return {
            name: obj.name,
            email: obj.email || null,
            phone: obj.phone || null,
            company: obj.company || null,
            source: obj.source || "csv-import",
            notes: obj.notes || null,
            tags,
            deal_title: obj.deal_title || null,
            deal_value: dealValue,
            deal_stage_name: obj.deal_stage_name || null,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (payload.length === 0) {
        toast.toast({
          variant: "destructive",
          title: "Nenhuma linha valida",
          description: "Verifique o mapeamento da coluna Nome.",
        })
        setSubmitting(false)
        return
      }

      const res = await fetch("/api/crm/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          default_stage_id: defaultStageId,
          create_deals: createDeals,
          rows: payload,
        }),
      })

      const json = await res.json()
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error?.message || `HTTP ${res.status}`)
      }

      const r: ImportResult = {
        imported: json.imported ?? 0,
        leadsCreated: json.leadsCreated ?? 0,
        dealsCreated: json.dealsCreated ?? 0,
        errors: json.errors ?? [],
      }
      setResult(r)
      setStep("result")
      onImported?.(r)
      toast.toast({
        title: "Import concluido",
        description: `${r.leadsCreated} leads, ${r.dealsCreated} deals criados.`,
      })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Falha no import",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[760px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[92vh] overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">
            Importar leads de CSV
          </DialogPrimitive.Title>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300">
                <Upload className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Importar leads de CSV
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
                  Detecta formato Kommo automaticamente. Cria leads + deals no pipeline.
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Fechar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-slate-500 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stepper visual */}
          <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 dark:bg-white/[0.02] border-b border-black/[0.04] dark:border-white/[0.04]">
            <Step n={1} label="Upload" active={step === "upload"} done={step !== "upload"} />
            <ArrowRight className="h-3 w-3 text-slate-300 dark:text-white/20" />
            <Step n={2} label="Mapeamento" active={step === "map"} done={step === "result"} />
            <ArrowRight className="h-3 w-3 text-slate-300 dark:text-white/20" />
            <Step n={3} label="Resultado" active={step === "result"} done={false} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {step === "upload" && (
              <UploadStep
                onFile={handleFile}
                onDrop={onDrop}
                fileRef={fileRef}
                error={parseError}
              />
            )}

            {step === "map" && (
              <MapStep
                filename={filename}
                headers={headers}
                rows={rows}
                mapping={mapping}
                onMapping={setMapping}
                stages={stages}
                defaultStageId={defaultStageId}
                onDefaultStageId={setDefaultStageId}
                createDeals={createDeals}
                onCreateDeals={setCreateDeals}
                hasNameMapped={hasNameMapped}
              />
            )}

            {step === "result" && result && <ResultStep result={result} />}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            {step === "map" && (
              <>
                <button
                  onClick={() => {
                    reset()
                    setStep("upload")
                  }}
                  disabled={submitting}
                  className="h-9 px-4 text-[13px] font-medium rounded-[6px] text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  onClick={handleImport}
                  disabled={submitting || !hasNameMapped || !defaultStageId}
                  className="h-9 px-4 text-[13px] font-semibold rounded-[6px] text-white bg-[#2563EB] hover:bg-[#1D4ED8] shadow-[0_1px_2px_rgba(37,99,235,0.25)] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {submitting ? "Importando..." : `Importar ${rows.length} linhas`}
                </button>
              </>
            )}
            {step === "result" && (
              <button
                onClick={handleClose}
                className="h-9 px-4 text-[13px] font-semibold rounded-[6px] text-white bg-[#2563EB] hover:bg-[#1D4ED8]"
              >
                Concluir
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────

function Step({
  n,
  label,
  active,
  done,
}: {
  n: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium",
        active
          ? "text-slate-900 dark:text-white"
          : done
            ? "text-slate-500 dark:text-white/55"
            : "text-slate-400 dark:text-white/35",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
          active
            ? "bg-blue-600 text-white"
            : done
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-white/40",
        )}
      >
        {done ? <CheckCircle2 className="h-3 w-3" /> : n}
      </span>
      {label}
    </span>
  )
}

function UploadStep({
  onFile,
  onDrop,
  fileRef,
  error,
}: {
  onFile: (file: File) => void
  onDrop: (e: React.DragEvent<HTMLLabelElement>) => void
  fileRef: React.RefObject<HTMLInputElement | null>
  error: string | null
}) {
  return (
    <div className="space-y-3">
      <label
        htmlFor="csv-upload"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="block cursor-pointer rounded-[10px] border-2 border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.02] hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors p-10 text-center"
      >
        <input
          id="csv-upload"
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-[#1A1D27] border border-slate-200 dark:border-white/[0.08] mb-3 shadow-sm">
          <FileText className="h-5 w-5 text-slate-500 dark:text-white/55" />
        </div>
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
          Arraste o CSV aqui ou clique para selecionar
        </p>
        <p className="text-[12px] text-slate-500 dark:text-white/55 mt-1">
          Suporta export do Kommo · UTF-8 · separador `,` ou `;`
        </p>
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-[6px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-[12px] text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="rounded-[6px] bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-900/30 px-3 py-2.5">
        <p className="text-[11px] font-semibold text-blue-900 dark:text-blue-200 mb-1">
          O que acontece com cada linha?
        </p>
        <ul className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed space-y-0.5">
          <li>1. Cria/encontra lead (deduplica por email)</li>
          <li>2. Cria deal no pipeline com a etapa mapeada (ou padrao)</li>
          <li>3. Tags do CSV viram tags do deal</li>
        </ul>
      </div>
    </div>
  )
}

function MapStep({
  filename,
  headers,
  rows,
  mapping,
  onMapping,
  stages,
  defaultStageId,
  onDefaultStageId,
  createDeals,
  onCreateDeals,
  hasNameMapped,
}: {
  filename: string
  headers: string[]
  rows: string[][]
  mapping: Record<number, ConvertfyField>
  onMapping: (m: Record<number, ConvertfyField>) => void
  stages: Array<{ id: string; name: string }>
  defaultStageId: string
  onDefaultStageId: (id: string) => void
  createDeals: boolean
  onCreateDeals: (v: boolean) => void
  hasNameMapped: boolean
}) {
  const previewRows = rows.slice(0, 3)

  return (
    <div className="space-y-4">
      {/* Resumo do arquivo */}
      <div className="flex items-center justify-between rounded-[6px] bg-slate-50 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-white/55" />
          <span className="truncate text-[12px] font-medium text-slate-700 dark:text-white/80">
            {filename}
          </span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-white/55 tabular-nums shrink-0">
          {rows.length} {rows.length === 1 ? "linha" : "linhas"} · {headers.length} colunas
        </span>
      </div>

      {/* Configuracoes do import */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-slate-700 dark:text-white/75 block">
            Etapa padrao
          </label>
          <select
            value={defaultStageId}
            onChange={(e) => onDefaultStageId(e.target.value)}
            className="w-full h-8 px-2 text-[12px] rounded-[6px] bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white/90 border border-black/[0.08] dark:border-white/[0.08] cursor-pointer focus:outline-none focus:border-slate-400"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 dark:text-white/45">
            Usada quando &ldquo;Etapa do CSV&rdquo; nao bate com nenhuma etapa do pipeline.
          </p>
        </div>
        <div className="space-y-1.5">
          <span className="text-[12px] font-medium text-slate-700 dark:text-white/75 block">
            Comportamento
          </span>
          <label className="flex items-center gap-2 h-8 px-3 rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] cursor-pointer">
            <input
              type="checkbox"
              checked={createDeals}
              onChange={(e) => onCreateDeals(e.target.checked)}
              className="h-3 w-3 cursor-pointer"
            />
            <span className="text-[12px] text-slate-700 dark:text-white/80">
              Criar deals no pipeline
            </span>
          </label>
        </div>
      </div>

      {/* Mapeamento */}
      <div className="space-y-1.5">
        <span className="text-[12px] font-medium text-slate-700 dark:text-white/75 block">
          Mapeamento de colunas
          {!hasNameMapped && (
            <span className="ml-2 text-[10px] font-semibold text-red-600 dark:text-red-400">
              · Marque uma coluna como &ldquo;Nome&rdquo;
            </span>
          )}
        </span>
        <div className="rounded-[6px] border border-black/[0.06] dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#1A1D27]">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.04] border-b border-black/[0.04] dark:border-white/[0.04]">
                <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-[0.04em] text-slate-500 dark:text-white/55 w-[35%]">
                  Coluna do CSV
                </th>
                <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-[0.04em] text-slate-500 dark:text-white/55 w-[30%]">
                  Mapear para
                </th>
                <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-[0.04em] text-slate-500 dark:text-white/55">
                  Exemplo (1ª linha)
                </th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h, i) => {
                const example = previewRows[0]?.[i] || "—"
                const mapped = mapping[i] ?? "ignore"
                return (
                  <tr
                    key={i}
                    className="border-b border-black/[0.04] dark:border-white/[0.04] last:border-0"
                  >
                    <td className="px-3 py-1.5 text-slate-800 dark:text-white/85 font-medium truncate max-w-0">
                      {h || `Coluna ${i + 1}`}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={mapped}
                        onChange={(e) =>
                          onMapping({ ...mapping, [i]: e.target.value as ConvertfyField })
                        }
                        className="h-7 w-full rounded-[4px] bg-slate-50 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] px-2 text-[11px] text-slate-700 dark:text-white/80 cursor-pointer focus:outline-none focus:border-slate-300"
                      >
                        {(Object.keys(FIELD_LABELS) as ConvertfyField[]).map((f) => (
                          <option key={f} value={f}>
                            {FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 dark:text-white/45 truncate max-w-0 italic">
                      {example.length > 40 ? example.slice(0, 40) + "…" : example}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ResultStep({ result }: { result: ImportResult }) {
  const hasErrors = result.errors.length > 0
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-start gap-3 rounded-[8px] border px-4 py-3",
          hasErrors
            ? "bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-900/40"
            : "bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-900/40",
        )}
      >
        <div className="shrink-0">
          {hasErrors ? (
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[13px] font-semibold",
              hasErrors
                ? "text-amber-900 dark:text-amber-200"
                : "text-emerald-900 dark:text-emerald-200",
            )}
          >
            {hasErrors
              ? "Import concluido com avisos"
              : "Import concluido com sucesso"}
          </p>
          <p className="text-[12px] text-slate-700 dark:text-white/70 mt-0.5">
            <strong className="tabular-nums">{result.leadsCreated}</strong> leads criados ·{" "}
            <strong className="tabular-nums">{result.dealsCreated}</strong> deals
            adicionados ao pipeline
          </p>
        </div>
      </div>

      {hasErrors && (
        <div className="rounded-[6px] border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-[#1A1D27] overflow-hidden">
          <div className="px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04] bg-amber-50/60 dark:bg-amber-900/10">
            <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
              {result.errors.length} {result.errors.length === 1 ? "erro" : "erros"}
            </p>
          </div>
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.04] max-h-40 overflow-auto">
            {result.errors.slice(0, 20).map((e, idx) => (
              <li key={idx} className="px-3 py-2 text-[11px] text-slate-700 dark:text-white/70">
                <span className="font-mono text-slate-400 dark:text-white/40">
                  Linha ~{e.row + 1}:
                </span>{" "}
                {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
