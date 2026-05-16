"use client"

/**
 * LeadsImportWizard — wizard de 4 etapas pra importar leads de CSV.
 *
 * Etapas:
 *   1) Arquivo:    drag-drop CSV/Excel, parse no client
 *   2) Verificacao: tabela das primeiras linhas, mapeia cada coluna pro
 *                   campo do sistema (Nome, Email, Telefone, etc).
 *                   Toggle 'Ignorar cabecalho'.
 *   3) Atribuicao: campos aplicados em massa (Tags, Origem, Pipeline +
 *                   Stage, DDI do telefone, Atendente)
 *   4) Conclusao:  preview de cada lead processado com pesquisa +
 *                   excluir antes de finalizar. Botao 'Completar importacao'
 *                   dispara POST /api/crm/leads/import.
 *
 * Layout/UX: copiado do datacrazy (stepper 4 circulos no topo).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Upload, Check, ChevronDown, X, Info, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { TagsSelector } from "./tags-selector"

// ── Tipos ────────────────────────────────────────────────────────────────────

const SYSTEM_FIELDS = [
  { value: "name", label: "Nome (obrigatório)", required: true },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "company", label: "Empresa" },
  { value: "role", label: "Cargo / Função" },
  { value: "source", label: "Origem" },
  { value: "notes", label: "Notas / Observações" },
  { value: "tags", label: "Tags (separadas por vírgula)" },
  { value: "status", label: "Status do lead (new/qualified/unqualified/converted/lost)" },
  { value: "created_at", label: "Criado em (data)" },
  { value: "created_by_external", label: "Criado por (nome externo)" },
  { value: "updated_at", label: "Modificada em (data)" },
  { value: "closed_at", label: "Fechado às (data)" },
  { value: "deal_value", label: "Valor do negócio (R$)" },
  { value: "deal_stage_name", label: "Nome da etapa (Funil)" },
  { value: "deal_title", label: "Título do negócio" },
  { value: "external_id", label: "ID externo" },
  { value: "custom", label: "Campo adicional (custom field)" },
  { value: "ignore", label: "— Ignorar coluna —" },
] as const

type SystemField = (typeof SYSTEM_FIELDS)[number]["value"]

interface ColumnMapping {
  systemField: SystemField
  customName?: string // usado quando systemField === 'custom'
}

interface ParsedFile {
  fileName: string
  headers: string[] // Coluna 1, Coluna 2... (header bruto se houver)
  rows: string[][] // linhas (incluindo possivel cabecalho)
}

interface BulkAttribution {
  tags: string[]
  source: string
  phone_ddi: string
  pipeline_id: string | null
  stage_id: string | null
  assigned_to: string | null
}

interface Member {
  id: string
  name: string
}

interface Pipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string }>
}

interface LeadsImportWizardProps {
  open: boolean
  onClose: () => void
  onImported: (result: { imported: number; deals_created: number }) => void
}

// ── CSV parser inline (sem dep externa) ──────────────────────────────────────

// parseDateMaybeKommo: aceita formato Kommo (13.11.2025 12:00:10) ou ISO
function parseDateMaybeKommo(s: string): string | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  // Kommo: DD.MM.YYYY [HH:MM:SS]
  const m = trimmed.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (m) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  // ISO ou outro formato — deixa o Date parsear
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ",") {
        cur.push(field)
        field = ""
      } else if (c === "\n") {
        cur.push(field)
        rows.push(cur)
        cur = []
        field = ""
      } else if (c === "\r") {
        // ignora \r (CRLF)
      } else {
        field += c
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

// ── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = [
    { id: 1, label: "Arquivo" },
    { id: 2, label: "Verificação" },
    { id: 3, label: "Atribuição" },
    { id: 4, label: "Conclusão" },
  ] as const
  return (
    <div className="flex items-center justify-center gap-0 py-4">
      {steps.map((s, i) => {
        const done = current > s.id
        const active = current === s.id
        const isLast = i === steps.length - 1
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-[12.5px] font-semibold transition-colors",
                  done
                    ? "bg-brand-500 text-white"
                    : active
                      ? "bg-white text-brand-600 border-2 border-brand-500"
                      : "bg-white text-slate-400 border border-slate-200",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : s.id}
              </div>
              <span
                className={cn(
                  "text-[13px]",
                  done || active ? "text-slate-900 font-medium" : "text-slate-400",
                )}
              >
                {s.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "h-px w-12 transition-colors",
                  done ? "bg-brand-500" : "bg-slate-200",
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Wizard ───────────────────────────────────────────────────────────────────

export function LeadsImportWizard({
  open,
  onClose,
  onImported,
}: LeadsImportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [skipHeader, setSkipHeader] = useState(true)
  const [mapping, setMapping] = useState<ColumnMapping[]>([])
  const [bulk, setBulk] = useState<BulkAttribution>({
    tags: [],
    source: "",
    phone_ddi: "55",
    pipeline_id: null,
    stage_id: null,
    assigned_to: null,
  })
  const [previewSearch, setPreviewSearch] = useState("")
  const [excludedRowIdx, setExcludedRowIdx] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    deals_created: number
    errors: number
    errorMessages: string[]
  } | null>(null)

  // Carrega members + pipelines pra dropdowns
  const [members, setMembers] = useState<Member[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])

  useEffect(() => {
    if (!open) return
    // /api/productivity retorna members no shape esperado (id, name)
    fetch("/api/productivity")
      .then((r) => r.json())
      .then((j) => {
        const data = j.data ?? j
        const ms = (data.members ?? []) as Array<{ id: string; name: string }>
        setMembers(ms)
      })
      .catch(() => setMembers([]))
    fetch("/api/crm/pipelines")
      .then((r) => r.json())
      .then((j) =>
        setPipelines(
          ((j.data ?? j.pipelines ?? []) as Array<Pipeline>).filter(
            (p) => p.stages && p.stages.length > 0,
          ),
        ),
      )
      .catch(() => setPipelines([]))
  }, [open])

  // Reset quando fecha
  useEffect(() => {
    if (!open) {
      setStep(1)
      setParsed(null)
      setMapping([])
      setExcludedRowIdx(new Set())
      setResult(null)
      setPreviewSearch("")
    }
  }, [open])

  // Drop / upload handler
  const handleFile = useCallback((file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      alert("Arquivo muito grande. Maximo 4MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "")
      const rows = parseCSV(text)
      if (rows.length === 0) {
        alert("Nenhuma linha encontrada no arquivo.")
        return
      }
      const cols = rows[0].length
      // Headers default: Coluna 1, Coluna 2...
      const headers = Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`)
      setParsed({ fileName: file.name, headers, rows })
      // Auto-detect mapeamento via heuristica (header da primeira linha)
      const firstRow = rows[0].map((c) => c.toLowerCase().trim())
      const auto: ColumnMapping[] = firstRow.map((h) => {
        if (/^id$|^lead\s*id$/.test(h)) return { systemField: "external_id" }
        if (/lead\s*t[ií]tulo|nome|name|t[ií]tulo/.test(h)) return { systemField: "name" }
        if (/email|e-?mail/.test(h)) return { systemField: "email" }
        if (/telefone|phone|celular|whats/.test(h)) return { systemField: "phone" }
        if (/empresa|company/.test(h)) return { systemField: "company" }
        if (/cargo|role|fun[cç][aã]o/.test(h)) return { systemField: "role" }
        if (/origem|source|utm_source/.test(h)) return { systemField: "source" }
        if (/notas?|observa|comenta/.test(h)) return { systemField: "notes" }
        if (/tags?|etiquetas?/.test(h)) return { systemField: "tags" }
        if (/status\s*do\s*lead|status$/.test(h)) return { systemField: "status" }
        if (/criado\s*em|created\s*at|criada\s*em|data\s*cria/.test(h)) return { systemField: "created_at" }
        if (/criado\s*por|usu[aá]rio\s*respons|created\s*by/.test(h)) return { systemField: "created_by_external" }
        if (/modificad[ao]|atualizado|updated\s*at|modified/.test(h)) return { systemField: "updated_at" }
        if (/fechado|closed|ganho|perdido|fechad[ao]\s*[aà]s|fechad[ao]\s*em/.test(h)) return { systemField: "closed_at" }
        if (/valor|venda|amount|r\$/.test(h)) return { systemField: "deal_value" }
        if (/etapa.*lead|stage|funil/.test(h)) return { systemField: "deal_stage_name" }
        return { systemField: "ignore" }
      })
      setMapping(auto)
      setStep(2)
    }
    reader.readAsText(file, "utf-8")
  }, [])

  const previewRows = useMemo(() => {
    if (!parsed) return []
    const dataRows = skipHeader ? parsed.rows.slice(1) : parsed.rows
    return dataRows.slice(0, 200) // limita preview a 200 linhas
  }, [parsed, skipHeader])

  // Processa rows aplicando mapping (extrai leads)
  const processedLeads = useMemo(() => {
    if (!parsed) return []
    const dataRows = skipHeader ? parsed.rows.slice(1) : parsed.rows
    return dataRows.map((row, idx) => {
      const lead: {
        name: string
        email?: string | null
        phone?: string | null
        company?: string | null
        role?: string | null
        source?: string | null
        notes?: string | null
        tags?: string[]
        status?: string | null
        created_at?: string | null
        created_by_external?: string | null
        updated_at?: string | null
        closed_at?: string | null
        deal_value?: number | null
        deal_stage_name?: string | null
        deal_title?: string | null
        external_id?: string | null
        custom_fields?: Record<string, unknown>
      } = { name: "" }
      mapping.forEach((m, i) => {
        const value = row[i]?.trim() ?? ""
        if (!value || m.systemField === "ignore") return
        switch (m.systemField) {
          case "name":
            lead.name = value
            break
          case "email":
            lead.email = value
            break
          case "phone":
            lead.phone = value
            break
          case "company":
            lead.company = value
            break
          case "role":
            lead.role = value
            break
          case "source":
            lead.source = value
            break
          case "notes":
            lead.notes = (lead.notes ? lead.notes + "\n" : "") + value
            break
          case "tags":
            lead.tags = [
              ...(lead.tags ?? []),
              ...value.split(/[,;|]/).map((t) => t.trim()).filter(Boolean),
            ]
            break
          case "deal_value": {
            const n = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."))
            if (!Number.isNaN(n)) lead.deal_value = n
            break
          }
          case "deal_stage_name":
            lead.deal_stage_name = value
            break
          case "deal_title":
            lead.deal_title = value
            break
          case "external_id":
            lead.external_id = value
            break
          case "status": {
            // Aceita varias variacoes; mapeia pra enum lead_status
            const v = value.toLowerCase()
            if (/new|novo/.test(v)) lead.status = "new"
            else if (/qualif/.test(v)) lead.status = "qualified"
            else if (/desqualif|unqualif/.test(v)) lead.status = "unqualified"
            else if (/convert/.test(v)) lead.status = "converted"
            else if (/perdid|lost/.test(v)) lead.status = "lost"
            break
          }
          case "created_at": {
            const iso = parseDateMaybeKommo(value)
            if (iso) lead.created_at = iso
            break
          }
          case "created_by_external":
            lead.created_by_external = value
            break
          case "updated_at": {
            const iso = parseDateMaybeKommo(value)
            if (iso) lead.updated_at = iso
            break
          }
          case "closed_at": {
            // Ignora valores 'nao fechado'
            if (/n[aã]o\s*fechado|n\/a|nao\s*fechado/i.test(value)) break
            const iso = parseDateMaybeKommo(value)
            if (iso) lead.closed_at = iso
            break
          }
          case "custom":
            if (!lead.custom_fields) lead.custom_fields = {}
            lead.custom_fields[m.customName || `Campo ${i + 1}`] = value
            break
        }
      })
      return { ...lead, _rowIdx: idx }
    })
  }, [parsed, mapping, skipHeader])

  const filteredPreview = useMemo(() => {
    if (!previewSearch.trim()) return processedLeads
    const q = previewSearch.toLowerCase()
    return processedLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q),
    )
  }, [processedLeads, previewSearch])

  const validLeads = useMemo(
    () =>
      processedLeads.filter(
        (l) => l.name.trim() && !excludedRowIdx.has(l._rowIdx),
      ),
    [processedLeads, excludedRowIdx],
  )

  const hasNameMapping = mapping.some((m) => m.systemField === "name")

  const handleSubmit = async () => {
    if (validLeads.length === 0) {
      alert("Nenhum lead valido pra importar.")
      return
    }
    setSubmitting(true)
    try {
      const body = {
        pipeline_id: bulk.pipeline_id || undefined,
        default_stage_id: bulk.stage_id || undefined,
        create_deals: Boolean(bulk.pipeline_id && bulk.stage_id),
        bulk: {
          tags: bulk.tags,
          source: bulk.source || undefined,
          assigned_to: bulk.assigned_to,
          phone_ddi: bulk.phone_ddi || undefined,
        },
        rows: validLeads.map((l) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _rowIdx, ...rest } = l
          return rest
        }),
      }
      const res = await fetch("/api/crm/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`Falha: ${json.error?.message ?? json.message ?? res.statusText}`)
        return
      }
      const data = json.data ?? json
      // Extrai mensagens unicas dos erros pra mostrar no resumo
      const errArr = (data.errors ?? []) as Array<{ error?: string; row?: number }>
      const errorMessages = Array.from(
        new Set(errArr.map((e) => e.error).filter(Boolean) as string[]),
      )
      setResult({
        imported: data.leadsCreated ?? data.imported ?? validLeads.length,
        deals_created: data.dealsCreated ?? 0,
        errors: errArr.length,
        errorMessages,
      })
      onImported({
        imported: data.leadsCreated ?? data.imported ?? 0,
        deals_created: data.dealsCreated ?? 0,
      })
    } catch (e) {
      alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="bg-white w-[90vw] max-w-[1100px] max-h-[90vh] rounded-[10px] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-start justify-between gap-3"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        >
          <div>
            <h2 className="text-[18px] font-bold text-slate-900 m-0 tracking-tight">
              Importação de negócios
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Aqui você pode importar sua planilha Excel/CSV com seus negócios
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              title="Saiba mais"
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stepper */}
        <div className="bg-slate-50/60" style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
          <Stepper current={step} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <Step1Upload onSelect={handleFile} />
          )}
          {step === 2 && parsed && (
            <Step2Verify
              parsed={parsed}
              skipHeader={skipHeader}
              setSkipHeader={setSkipHeader}
              mapping={mapping}
              setMapping={setMapping}
            />
          )}
          {step === 3 && (
            <Step3Attribute
              bulk={bulk}
              setBulk={setBulk}
              members={members}
              pipelines={pipelines}
            />
          )}
          {step === 4 && (
            <Step4Confirm
              leads={filteredPreview}
              totalValid={validLeads.length}
              excludedRowIdx={excludedRowIdx}
              setExcludedRowIdx={setExcludedRowIdx}
              search={previewSearch}
              setSearch={setPreviewSearch}
              bulk={bulk}
              pipelines={pipelines}
              result={result}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3.5 border-t flex items-center justify-between gap-2"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        >
          <div className="text-[11.5px] text-slate-500">
            {parsed && (
              <>
                <span className="font-semibold text-slate-700">
                  {parsed.fileName}
                </span>
                {" · "}
                {previewRows.length} linha{previewRows.length === 1 ? "" : "s"}
                {step === 4 && (
                  <> · {validLeads.length} prontos pra importar</>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step > 1 && !result && (
              <button
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                className="h-9 px-4 rounded-[6px] border text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              >
                Voltar
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => {
                  if (!hasNameMapping) {
                    alert("Mapeie pelo menos uma coluna como 'Nome'.")
                    return
                  }
                  setStep(3)
                }}
                className="h-9 px-4 rounded-[6px] bg-brand-500 text-white text-[12.5px] font-semibold hover:bg-brand-600"
              >
                Próximo
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => setStep(4)}
                className="h-9 px-4 rounded-[6px] bg-brand-500 text-white text-[12.5px] font-semibold hover:bg-brand-600"
              >
                Próximo
              </button>
            )}
            {step === 4 && !result && (
              <button
                onClick={handleSubmit}
                disabled={submitting || validLeads.length === 0}
                className="h-9 px-4 rounded-[6px] bg-brand-500 text-white text-[12.5px] font-semibold hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Importando…" : `Completar importação (${validLeads.length})`}
              </button>
            )}
            {result && (
              <button
                onClick={onClose}
                className="h-9 px-4 rounded-[6px] bg-emerald-500 text-white text-[12.5px] font-semibold hover:bg-emerald-600"
              >
                Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Upload ───────────────────────────────────────────────────────────

function Step1Upload({ onSelect }: { onSelect: (f: File) => void }) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div className="py-8">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (f) onSelect(f)
        }}
        className={cn(
          "block border-2 border-dashed rounded-[10px] py-14 px-10 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-brand-500 bg-brand-50/40"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/30",
        )}
      >
        <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Upload className="h-6 w-6 text-slate-600" />
        </div>
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          Arraste e solte os arquivos aqui ou clique para selecionar
        </p>
        <p className="text-[12.5px] text-slate-500">
          Você pode enviar um arquivo com 4 MB
        </p>
        <input
          type="file"
          accept=".csv,text/csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onSelect(f)
          }}
        />
      </label>
    </div>
  )
}

// ── Step 2: Verify (mapping) ─────────────────────────────────────────────────

function Step2Verify({
  parsed,
  skipHeader,
  setSkipHeader,
  mapping,
  setMapping,
}: {
  parsed: ParsedFile
  skipHeader: boolean
  setSkipHeader: (v: boolean) => void
  mapping: ColumnMapping[]
  setMapping: (next: ColumnMapping[]) => void
}) {
  const previewRows = skipHeader ? parsed.rows.slice(1) : parsed.rows
  const allRows = parsed.rows
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12.5px] text-slate-600">
          Mapeie cada coluna do arquivo pro campo do sistema. As primeiras{" "}
          {Math.min(10, previewRows.length)} linhas estão sendo mostradas como preview.
        </p>
        <label className="inline-flex items-center gap-2 cursor-pointer text-[12.5px] text-slate-700">
          <input
            type="checkbox"
            checked={skipHeader}
            onChange={(e) => setSkipHeader(e.target.checked)}
            className="h-4 w-4 accent-brand-500"
          />
          Ignorar cabeçalho
        </label>
      </div>
      <div className="border rounded-[8px] overflow-x-auto" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50">
            <tr>
              {parsed.headers.map((h, i) => (
                <th key={i} className="text-left p-3 align-top min-w-[180px]" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="font-semibold text-slate-700 mb-1.5">{h}</div>
                  <select
                    value={mapping[i]?.systemField ?? "ignore"}
                    onChange={(e) => {
                      const next = [...mapping]
                      next[i] = { systemField: e.target.value as SystemField }
                      setMapping(next)
                    }}
                    className="w-full h-8 px-2 text-[11.5px] rounded-[5px] border bg-white outline-none focus:border-brand-500"
                    style={{ borderColor: "rgba(0,0,0,0.10)" }}
                  >
                    {SYSTEM_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  {mapping[i]?.systemField === "custom" && (
                    <input
                      type="text"
                      placeholder="Nome do campo (ex: Faturamento)"
                      value={mapping[i].customName ?? ""}
                      onChange={(e) => {
                        const next = [...mapping]
                        next[i] = { ...next[i], customName: e.target.value }
                        setMapping(next)
                      }}
                      className="mt-1.5 w-full h-7 px-2 text-[11px] rounded-[5px] border outline-none focus:border-brand-500"
                      style={{ borderColor: "rgba(0,0,0,0.10)" }}
                    />
                  )}
                </th>
              ))}
            </tr>
            {!skipHeader && (
              <tr>
                {allRows[0]?.map((c, i) => (
                  <th
                    key={`hr-${i}`}
                    className="text-left p-2 text-[11px] text-slate-500 font-medium"
                    style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", background: "#FCFCFD" }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {previewRows.slice(0, 10).map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50/40">
                {row.map((c, ci) => (
                  <td
                    key={ci}
                    className="p-2 text-slate-700 truncate max-w-[200px]"
                    style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
                    title={c}
                  >
                    {c || <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Step 3: Bulk attribution ─────────────────────────────────────────────────

function Step3Attribute({
  bulk,
  setBulk,
  members,
  pipelines,
}: {
  bulk: BulkAttribution
  setBulk: (next: BulkAttribution) => void
  members: Member[]
  pipelines: Pipeline[]
}) {
  const selectedPipeline = pipelines.find((p) => p.id === bulk.pipeline_id)
  return (
    <div className="max-w-[520px] mx-auto py-4">
      <p className="text-center text-[13px] text-slate-600 mb-5 leading-relaxed">
        Adicione informações importantes para todos os seus leads de uma só vez,
        facilitando a organização e o processo.
      </p>
      <div
        className="border rounded-[10px] p-5 bg-white space-y-4"
        style={{ borderColor: "rgba(0,0,0,0.08)" }}
      >
        {/* Tags em massa (com cadastro/persistencia na org) */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-800 mb-1.5">
            Tags
          </label>
          <TagsSelector
            entity="lead"
            selected={bulk.tags}
            onChange={(next) => setBulk({ ...bulk, tags: next })}
            placeholder="Buscar ou criar tag…"
          />
          <p className="text-[11px] text-slate-400 mt-1.5">
            Tags ficam salvas na org pra reuso em importações futuras.
          </p>
        </div>

        {/* Origem em massa */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-800 mb-1.5">
            Origem (aplicada quando linha não tem origem)
          </label>
          <input
            value={bulk.source}
            onChange={(e) => setBulk({ ...bulk, source: e.target.value })}
            placeholder="Ex: Kommo, Instagram, Indicação..."
            className="w-full h-9 px-2 rounded-[6px] border text-[12.5px] outline-none focus:border-brand-500"
            style={{ borderColor: "rgba(0,0,0,0.10)" }}
          />
        </div>

        {/* Pipeline + stage (cria deals) */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-800 mb-1.5">
            Pipeline (cria deal pra cada lead)
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <select
                value={bulk.pipeline_id ?? ""}
                onChange={(e) =>
                  setBulk({
                    ...bulk,
                    pipeline_id: e.target.value || null,
                    stage_id: null,
                  })
                }
                className="w-full h-9 pl-2 pr-7 rounded-[6px] border text-[12.5px] outline-none appearance-none bg-white focus:border-brand-500"
                style={{ borderColor: "rgba(0,0,0,0.10)" }}
              >
                <option value="">Não criar deals</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
            {selectedPipeline && (
              <div className="flex-1 relative">
                <select
                  value={bulk.stage_id ?? ""}
                  onChange={(e) =>
                    setBulk({ ...bulk, stage_id: e.target.value || null })
                  }
                  className="w-full h-9 pl-2 pr-7 rounded-[6px] border text-[12.5px] outline-none appearance-none bg-white focus:border-brand-500"
                  style={{ borderColor: "rgba(0,0,0,0.10)" }}
                >
                  <option value="">Selecionar etapa</option>
                  {selectedPipeline.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* Atendente */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-800 mb-1.5">
            Atendente / Responsável
          </label>
          <div className="relative">
            <select
              value={bulk.assigned_to ?? ""}
              onChange={(e) => setBulk({ ...bulk, assigned_to: e.target.value || null })}
              className="w-full h-9 pl-2 pr-7 rounded-[6px] border text-[12.5px] outline-none appearance-none bg-white focus:border-brand-500"
              style={{ borderColor: "rgba(0,0,0,0.10)" }}
            >
              <option value="">Não atribuir</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* DDI do telefone */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-800 mb-1.5">
            DDI do telefone (aplicado quando não tem)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[14px]">🇧🇷</span>
            <input
              value={bulk.phone_ddi}
              onChange={(e) =>
                setBulk({ ...bulk, phone_ddi: e.target.value.replace(/[^\d]/g, "") })
              }
              placeholder="55"
              maxLength={3}
              className="w-20 h-9 px-2 rounded-[6px] border text-[12.5px] outline-none focus:border-brand-500"
              style={{ borderColor: "rgba(0,0,0,0.10)" }}
            />
            <span className="text-[11.5px] text-slate-500">
              ex: 55 (Brasil), 1 (EUA)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 4: Confirm + preview ────────────────────────────────────────────────

function Step4Confirm({
  leads,
  totalValid,
  excludedRowIdx,
  setExcludedRowIdx,
  search,
  setSearch,
  bulk,
  pipelines,
  result,
}: {
  leads: Array<{
    name: string
    email?: string | null
    phone?: string | null
    company?: string | null
    tags?: string[]
    deal_stage_name?: string | null
    _rowIdx: number
  }>
  totalValid: number
  excludedRowIdx: Set<number>
  setExcludedRowIdx: (s: Set<number>) => void
  search: string
  setSearch: (s: string) => void
  bulk: BulkAttribution
  pipelines: Pipeline[]
  result: { imported: number; deals_created: number; errors: number; errorMessages: string[] } | null
}) {
  const pipeline = pipelines.find((p) => p.id === bulk.pipeline_id)
  const stage = pipeline?.stages.find((s) => s.id === bulk.stage_id)

  if (result) {
    const allFailed = result.imported === 0 && result.errors > 0
    const partialFailed = result.imported > 0 && result.errors > 0

    return (
      <div className="py-8 max-w-[600px] mx-auto">
        <div
          className={cn(
            "mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4",
            allFailed
              ? "bg-red-100"
              : partialFailed
                ? "bg-amber-100"
                : "bg-emerald-100",
          )}
        >
          {allFailed ? (
            <X className="h-8 w-8 text-red-600" />
          ) : (
            <Check
              className={cn(
                "h-8 w-8",
                partialFailed ? "text-amber-600" : "text-emerald-600",
              )}
            />
          )}
        </div>
        <h3 className="text-[18px] font-bold text-slate-900 mb-2 text-center">
          {allFailed
            ? "Importação falhou"
            : partialFailed
              ? "Importação parcial"
              : "Importação concluída!"}
        </h3>
        <p className="text-[13px] text-slate-600 mb-4 text-center">
          <span className="font-semibold text-slate-900">{result.imported}</span>{" "}
          {result.imported === 1 ? "lead criado" : "leads criados"}
          {result.deals_created > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-slate-900">
                {result.deals_created}
              </span>{" "}
              {result.deals_created === 1 ? "negócio criado" : "negócios criados"}
            </>
          )}
          {result.errors > 0 && (
            <>
              {" · "}
              <span className="text-red-600 font-semibold">
                {result.errors} erro(s)
              </span>
            </>
          )}
        </p>

        {/* Detalhe dos erros — mostra mensagens unicas pra debugging */}
        {result.errorMessages.length > 0 && (
          <div
            className="mt-4 p-4 rounded-[8px] border bg-red-50/40"
            style={{ borderColor: "#FECACA" }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[16px]">⚠</span>
              <span className="text-[12.5px] font-bold text-red-700">
                Detalhe do{result.errorMessages.length === 1 ? "" : "s"} erro
                {result.errorMessages.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="space-y-1.5 ml-1">
              {result.errorMessages.map((msg, i) => (
                <li
                  key={i}
                  className="text-[12px] text-red-800 font-mono leading-snug pl-3 border-l-2 border-red-300 break-all"
                >
                  {msg}
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t border-red-200 text-[11.5px] text-slate-600">
              💡 <span className="font-medium">Dica:</span> copie a mensagem
              acima e mostre pro time técnico. Geralmente é problema de
              mapeamento de coluna, formato inesperado, ou enum/banco.
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-[300px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-2 rounded-[6px] border text-[12.5px] outline-none focus:border-brand-500"
            style={{ borderColor: "rgba(0,0,0,0.10)" }}
          />
        </div>
        <span className="text-[12px] text-slate-500">
          {totalValid} leads prontos · {excludedRowIdx.size} excluídos
        </span>
      </div>
      <div className="border rounded-[8px] overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50">
            <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <th className="text-left p-2.5 font-semibold text-slate-700">Nome</th>
              <th className="text-left p-2.5 font-semibold text-slate-700">Email / Telefone</th>
              <th className="text-left p-2.5 font-semibold text-slate-700">Empresa</th>
              <th className="text-left p-2.5 font-semibold text-slate-700">Tags</th>
              <th className="text-left p-2.5 font-semibold text-slate-700">Pipeline</th>
              <th className="text-right p-2.5 font-semibold text-slate-700 w-16">Ação</th>
            </tr>
          </thead>
          <tbody>
            {leads.slice(0, 50).map((l) => {
              const excluded = excludedRowIdx.has(l._rowIdx)
              const noName = !l.name.trim()
              const mergedTags = Array.from(
                new Set([...(l.tags ?? []), ...bulk.tags].filter(Boolean)),
              )
              return (
                <tr
                  key={l._rowIdx}
                  className={cn(
                    excluded && "opacity-40 line-through",
                    noName && "bg-red-50/30",
                  )}
                  style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
                >
                  <td className="p-2.5 text-slate-800 font-medium">
                    {l.name || <span className="text-red-600 italic">(sem nome — será ignorado)</span>}
                  </td>
                  <td className="p-2.5 text-slate-600">
                    {l.email && <div className="truncate max-w-[180px]">{l.email}</div>}
                    {l.phone && <div className="text-slate-500 text-[11.5px] font-mono">{l.phone}</div>}
                    {!l.email && !l.phone && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2.5 text-slate-600 truncate max-w-[120px]">
                    {l.company ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2.5">
                    {mergedTags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {mergedTags.slice(0, 3).map((t, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-brand-50 text-brand-700 border border-brand-200"
                          >
                            {t}
                          </span>
                        ))}
                        {mergedTags.length > 3 && (
                          <span className="text-[10.5px] text-slate-400">
                            +{mergedTags.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="p-2.5 text-slate-600 text-[11.5px]">
                    {pipeline && stage ? (
                      <div>
                        <div className="font-medium text-slate-700">{pipeline.name}</div>
                        <div className="text-slate-400">› {stage.name}</div>
                      </div>
                    ) : l.deal_stage_name ? (
                      <span className="italic">{l.deal_stage_name}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="p-2.5 text-right">
                    <button
                      onClick={() => {
                        const next = new Set(excludedRowIdx)
                        if (next.has(l._rowIdx)) next.delete(l._rowIdx)
                        else next.add(l._rowIdx)
                        setExcludedRowIdx(next)
                      }}
                      className={cn(
                        "px-2 py-1 rounded text-[11px] font-medium",
                        excluded
                          ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          : "bg-red-50 text-red-600 hover:bg-red-100",
                      )}
                    >
                      {excluded ? "Restaurar" : "Excluir"}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {leads.length > 50 && (
          <div className="px-3 py-2 bg-slate-50 text-[11.5px] text-slate-500 text-center">
            Mostrando 50 de {leads.length} · todos serão importados ao confirmar
          </div>
        )}
      </div>
    </div>
  )
}
