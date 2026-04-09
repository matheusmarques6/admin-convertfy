"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Scissors, Link as LinkIcon, Upload } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ROUTES } from "@/lib/routes"
import type {
  EmailResult,
  FigmaFileStructure,
  FigmaFunnel,
  ProcessingStatus as Status,
  SliceSection,
  SlicerStep,
} from "@/types/slicer"
import { FigmaConnect } from "./components/figma-connect"
import { FunnelList } from "./components/funnel-list"
import { ProcessingStatus } from "./components/processing-status"
import { ResultsDashboard } from "./components/results-dashboard"
import { EmailSliceEditor } from "./components/email-slice-editor"
import { ManualUpload } from "./components/manual-upload"
import {
  buildFunnelZipClientSide,
  normalizeFileTo600pxBase64,
  sanitizeFsName,
  triggerBlobDownload,
} from "./lib/client-slicer"

/**
 * Helper pra ler a resposta de um fetch de forma segura.
 * Em caso de timeout/erro 5xx, o response pode vir como HTML ou texto —
 * fazendo .json() direto estoura "Unexpected token 'A'". Este helper
 * tenta JSON, cai pra text, e devolve um erro amigável.
 */
async function safeJsonResponse<T = unknown>(
  res: Response,
  fallbackErrorMessage: string
): Promise<T> {
  const contentType = res.headers.get("content-type") || ""
  const text = await res.text()

  // Se não é JSON, tenta extrair algo útil do HTML/texto
  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      // Timeout do Vercel tipicamente devolve "An error occurred..."
      const preview = text.slice(0, 200).trim()
      throw new Error(
        `${fallbackErrorMessage} (HTTP ${res.status}): ${preview || "resposta vazia"}`
      )
    }
    throw new Error(`${fallbackErrorMessage}: resposta não é JSON`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${fallbackErrorMessage}: JSON inválido`)
  }
}

export default function FigmaSlicerPage() {
  // Step global da UI
  const [step, setStep] = useState<SlicerStep>("connect")
  const [tab, setTab] = useState<"figma" | "upload">("figma")

  // Figma
  const [structure, setStructure] = useState<FigmaFileStructure | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  // Processamento batch
  const [currentFunnel, setCurrentFunnel] = useState<FigmaFunnel | null>(null)
  const [processingStatus, setProcessingStatus] = useState<Status>({
    phase: "exporting",
    current: 0,
    total: 0,
  })

  // Resultados
  const [results, setResults] = useState<EmailResult[]>([])
  const [editingResult, setEditingResult] = useState<EmailResult | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  // Cache de funis já processados: funnelId → EmailResult[]
  // Permite navegar entre funis sem perder o trabalho já feito.
  const [processedCache, setProcessedCache] = useState<
    Map<string, EmailResult[]>
  >(new Map())

  // Upload manual
  const [manualLoading, setManualLoading] = useState(false)
  const [manualResult, setManualResult] = useState<EmailResult | null>(null)

  // Erros globais
  const [error, setError] = useState<string | null>(null)

  // ===== FIGMA CONNECT =====

  const handleFigmaConnected = useCallback(
    (newStructure: FigmaFileStructure) => {
      setStructure(newStructure)
      setStep("browsing")
      setError(null)
    },
    []
  )

  const handleBackToConnect = useCallback(() => {
    setStructure(null)
    setCurrentFunnel(null)
    setResults([])
    setProcessedCache(new Map()) // limpa cache ao trocar arquivo
    setError(null)
    setStep("connect")
  }, [])

  // ===== BATCH PROCESSING =====

  const handleProcessFunnel = useCallback(
    async (funnel: FigmaFunnel, forceReprocess = false) => {
      if (!structure) return
      setCurrentFunnel(funnel)
      setError(null)

      // Cache hit: se já processamos este funil e não é force reprocess,
      // restaura os resultados e pula direto pro dashboard.
      if (!forceReprocess) {
        const cached = processedCache.get(funnel.id)
        if (cached && cached.length > 0) {
          setResults(cached)
          setStep("results")
          return
        }
      }

      setResults([])
      setStep("processing")
      setProcessingStatus({
        phase: "exporting",
        current: 0,
        total: funnel.emails.length,
      })

      try {
        // Passo 1: exportar todos os emails numa única chamada
        const exportRes = await fetch(
          "/api/tools/figma-slicer/figma-export-batch",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileKey: structure.fileKey,
              nodeIds: funnel.emails.map((e) => e.id),
            }),
          }
        )
        const exportData = await safeJsonResponse<{
          success: boolean
          error?: string
          images?: Record<
            string,
            { base64: string; width: number; height: number } | null
          >
        }>(exportRes, "Erro ao exportar do Figma")
        if (!exportData.success) {
          throw new Error(exportData.error || "Erro ao exportar do Figma")
        }

        // Passo 2: analisar cada email sequencialmente (evita sobrecarga)
        setProcessingStatus({
          phase: "analyzing",
          current: 0,
          total: funnel.emails.length,
        })

        const newResults: EmailResult[] = []

        for (let i = 0; i < funnel.emails.length; i++) {
          const email = funnel.emails[i]
          setProcessingStatus({
            phase: "analyzing",
            current: i + 1,
            total: funnel.emails.length,
          })

          const imageData = exportData.images?.[email.id] ?? null

          if (!imageData) {
            newResults.push({
              email,
              sections: [],
              imageBase64: "",
              dimensions: null,
              error: "Falha ao exportar do Figma",
            })
            continue
          }

          const formData = new FormData()
          formData.append("imageBase64", imageData.base64)

          try {
            const analyzeRes = await fetch(
              "/api/tools/figma-slicer/analyze-pixels",
              {
                method: "POST",
                body: formData,
              }
            )
            const analyzeData = await safeJsonResponse<{
              success: boolean
              error?: string
              analysis?: {
                width: number
                height: number
                sections: Array<{
                  name: string
                  y_start: number
                  y_end: number
                }>
              }
            }>(analyzeRes, "Erro na análise")

            if (!analyzeData.success) {
              newResults.push({
                email,
                sections: [],
                imageBase64: imageData.base64,
                dimensions: { width: imageData.width, height: imageData.height },
                error: analyzeData.error || "Erro na análise",
              })
              continue
            }

            if (!analyzeData.analysis) {
              newResults.push({
                email,
                sections: [],
                imageBase64: imageData.base64,
                dimensions: { width: imageData.width, height: imageData.height },
                error: "Análise sem resposta válida",
              })
              continue
            }

            const sectionsWithIds: SliceSection[] =
              analyzeData.analysis.sections.map((s) => ({
                ...s,
                id:
                  typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random()}`,
              }))

            newResults.push({
              email,
              sections: sectionsWithIds,
              imageBase64: imageData.base64,
              dimensions: { width: imageData.width, height: imageData.height },
              error: null,
            })
          } catch (err) {
            newResults.push({
              email,
              sections: [],
              imageBase64: imageData.base64,
              dimensions: { width: imageData.width, height: imageData.height },
              error: err instanceof Error ? err.message : "Erro",
            })
          }
        }

        // Salva no cache pra permitir navegação livre sem reprocessar
        setProcessedCache((prev) => {
          const next = new Map(prev)
          next.set(funnel.id, newResults)
          return next
        })

        setResults(newResults)
        setStep("results")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao processar funil")
        setStep("browsing")
      }
    },
    [structure, processedCache]
  )

  // ===== RESULTS =====

  const handleBackToBrowsing = useCallback(() => {
    setResults([])
    setCurrentFunnel(null)
    setEditingResult(null)
    setError(null)
    setStep("browsing")
  }, [])

  const handleEditEmail = useCallback((result: EmailResult) => {
    setEditingResult(result)
    setStep("editing")
  }, [])

  const handleBackFromEdit = useCallback(
    (updatedSections: SliceSection[]) => {
      if (editingResult) {
        // Atualiza o result no array
        const updater = (prev: EmailResult[]): EmailResult[] =>
          prev.map((r) =>
            r.email.id === editingResult.email.id
              ? { ...r, sections: updatedSections }
              : r
          )

        setResults((prev) => {
          const next = updater(prev)
          // Propaga a edição pro cache do funil atual
          if (currentFunnel) {
            setProcessedCache((cachePrev) => {
              const cacheNext = new Map(cachePrev)
              cacheNext.set(currentFunnel.id, next)
              return cacheNext
            })
          }
          return next
        })
      }
      setEditingResult(null)
      if (manualResult && editingResult?.email.id === manualResult.email.id) {
        // Upload manual: voltar para manual
        setManualResult({ ...manualResult, sections: updatedSections })
        setStep("manual")
      } else {
        setStep("results")
      }
    },
    [editingResult, manualResult, currentFunnel]
  )

  // ===== DOWNLOAD ZIP BATCH (client-side, zero body-size issues) =====

  const handleDownloadZip = useCallback(async () => {
    if (!currentFunnel) return
    const validResults = results.filter(
      (r) => r.sections.length > 0 && r.imageBase64 && r.dimensions
    )
    if (validResults.length === 0) {
      setError("Nenhum email válido para exportar")
      return
    }

    setIsDownloading(true)
    setError(null)
    try {
      const { blob, totalSlices } = await buildFunnelZipClientSide({
        funnelName: currentFunnel.name,
        emails: validResults.map((r) => ({
          emailName: r.email.name,
          imageBase64: r.imageBase64,
          width: r.dimensions!.width,
          height: r.dimensions!.height,
          sections: r.sections.map((s) => ({
            name: s.name,
            y_start: s.y_start,
            y_end: s.y_end,
          })),
        })),
      })

      if (totalSlices === 0) {
        throw new Error("Nenhuma fatia válida para exportar")
      }

      triggerBlobDownload(
        blob,
        `${sanitizeFsName(currentFunnel.name, "funnel")}-slices.zip`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao baixar ZIP")
    } finally {
      setIsDownloading(false)
    }
  }, [currentFunnel, results])

  // ===== UPLOAD MANUAL =====

  const handleManualFileSelected = useCallback(async (file: File) => {
    setManualLoading(true)
    setError(null)
    try {
      // 1. Normaliza pra 600px NO CLIENTE — garantimos que a escala do
      // base64 guardado bate com a escala das coordenadas do analyze.
      const normalized = await normalizeFileTo600pxBase64(file)

      // 2. Envia o base64 já normalizado pro analyze (para o servidor
      // não precisar redimensionar de novo e as coords virem no sistema
      // que já está salvo no client).
      const formData = new FormData()
      formData.append("imageBase64", normalized.base64)
      const analyzeRes = await fetch("/api/tools/figma-slicer/analyze-pixels", {
        method: "POST",
        body: formData,
      })
      const analyzeData = await safeJsonResponse<{
        success: boolean
        error?: string
        analysis?: {
          width: number
          height: number
          sections: Array<{
            name: string
            y_start: number
            y_end: number
          }>
        }
      }>(analyzeRes, "Erro na análise")
      if (!analyzeData.success || !analyzeData.analysis) {
        throw new Error(analyzeData.error || "Erro na análise")
      }

      const sectionsWithIds: SliceSection[] = analyzeData.analysis.sections.map(
        (s) => ({
          ...s,
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        })
      )

      const fakeEmail = {
        id: `manual-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        width: normalized.width,
        height: normalized.height,
      }

      const result: EmailResult = {
        email: fakeEmail,
        sections: sectionsWithIds,
        imageBase64: normalized.base64,
        dimensions: {
          width: normalized.width,
          height: normalized.height,
        },
        error: null,
      }

      setManualResult(result)
      setStep("manual")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar arquivo")
    } finally {
      setManualLoading(false)
    }
  }, [])

  const handleManualEdit = useCallback(() => {
    if (manualResult) {
      setEditingResult(manualResult)
      setStep("editing")
    }
  }, [manualResult])

  const handleManualDownload = useCallback(async () => {
    if (!manualResult || !manualResult.dimensions) return
    const validSections = manualResult.sections.filter(
      (s) => s.y_end - s.y_start > 0
    )
    if (validSections.length === 0) {
      setError("Nenhuma seção válida")
      return
    }

    setIsDownloading(true)
    setError(null)
    try {
      const { blob, totalSlices } = await buildFunnelZipClientSide({
        funnelName: "Manual",
        emails: [
          {
            emailName: manualResult.email.name,
            imageBase64: manualResult.imageBase64,
            width: manualResult.dimensions.width,
            height: manualResult.dimensions.height,
            sections: validSections.map((s) => ({
              name: s.name,
              y_start: s.y_start,
              y_end: s.y_end,
            })),
          },
        ],
      })

      if (totalSlices === 0) {
        throw new Error("Nenhuma fatia válida para exportar")
      }

      triggerBlobDownload(
        blob,
        `${sanitizeFsName(manualResult.email.name, "email")}-slices.zip`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao baixar ZIP")
    } finally {
      setIsDownloading(false)
    }
  }, [manualResult])

  const handleResetManual = useCallback(() => {
    setManualResult(null)
    setEditingResult(null)
    setError(null)
    setStep("connect")
    setTab("upload")
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Scissors}
        title="Email Slicer"
        description="Corte automático de emails do Figma — conecte, processe o funil inteiro, exporte ZIP"
        breadcrumb={[
          { label: "Ferramentas", href: ROUTES.ADMIN.TOOLS },
          { label: "Email Slicer" },
        ]}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.ADMIN.TOOLS}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      {error && (
        <div className="rounded-[8px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Step: Connect (tabs Figma / Upload) */}
      {step === "connect" && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "figma" | "upload")}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="figma">
              <LinkIcon className="mr-2 h-4 w-4" />
              Conectar Figma
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="figma" className="mt-4">
            <FigmaConnect
              onConnected={handleFigmaConnected}
              isLoading={isConnecting}
              setIsLoading={setIsConnecting}
            />
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <ManualUpload
              onFileSelected={handleManualFileSelected}
              isLoading={manualLoading}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Step: Browsing */}
      {step === "browsing" && structure && (
        <FunnelList
          structure={structure}
          processedCache={processedCache}
          onProcessFunnel={handleProcessFunnel}
          onBack={handleBackToConnect}
        />
      )}

      {/* Step: Processing */}
      {step === "processing" && currentFunnel && (
        <ProcessingStatus
          status={processingStatus}
          funnelName={currentFunnel.name}
        />
      )}

      {/* Step: Results (Figma) */}
      {step === "results" && currentFunnel && (
        <ResultsDashboard
          funnel={currentFunnel}
          results={results}
          onBack={handleBackToBrowsing}
          onEditEmail={handleEditEmail}
          onDownloadZip={handleDownloadZip}
          onReprocess={() => handleProcessFunnel(currentFunnel, true)}
          isDownloading={isDownloading}
        />
      )}

      {/* Step: Editing (de result do Figma OU manual) */}
      {step === "editing" && editingResult && (
        <EmailSliceEditor
          result={editingResult}
          funnelName={
            currentFunnel?.name || (manualResult ? "Upload manual" : "Email")
          }
          onBack={handleBackFromEdit}
        />
      )}

      {/* Step: Manual (resultado do upload manual) */}
      {step === "manual" && manualResult && (
        <ManualResultView
          result={manualResult}
          onEdit={handleManualEdit}
          onDownload={handleManualDownload}
          onReset={handleResetManual}
          isDownloading={isDownloading}
        />
      )}
    </div>
  )
}

// =============================================================================
// Sub-componente: ManualResultView (mini-dashboard para upload manual)
// =============================================================================

function ManualResultView({
  result,
  onEdit,
  onDownload,
  onReset,
  isDownloading,
}: {
  result: EmailResult
  onEdit: () => void
  onDownload: () => void
  onReset: () => void
  isDownloading: boolean
}) {
  return (
    <ResultsDashboard
      funnel={{
        id: "manual",
        name: "Upload manual",
        emailCount: 1,
        emails: [result.email],
      }}
      results={[result]}
      onBack={onReset}
      onEditEmail={onEdit}
      onDownloadZip={onDownload}
      isDownloading={isDownloading}
    />
  )
}
