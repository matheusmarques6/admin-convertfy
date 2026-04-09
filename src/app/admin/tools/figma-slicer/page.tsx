"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Scissors, Link as LinkIcon, Upload } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ROUTES } from "@/lib/routes"
import type {
  FigmaEmail,
  FigmaFileStructure,
  ImageDimensions,
  SliceSection,
} from "@/types/slicer"
import { FigmaConnect } from "./components/figma-connect"
import { FunnelBrowser } from "./components/funnel-browser"
import { ImageUploader } from "./components/image-uploader"
import { SlicePreview } from "./components/slice-preview"
import { SliceList } from "./components/slice-list"
import { ExportButton } from "./components/export-button"

interface ImageData {
  url: string
  width: number
  height: number
  // Origem: file local ou base64 vindo do Figma
  file: File | null
  base64: string | null
  isObjectUrl: boolean
}

type Step = "connect" | "browsing" | "analyzing" | "slicing"

export default function FigmaSlicerPage() {
  const [step, setStep] = useState<Step>("connect")
  const [tab, setTab] = useState<"figma" | "upload">("figma")

  // Figma state
  const [figmaStructure, setFigmaStructure] =
    useState<FigmaFileStructure | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<FigmaEmail | null>(null)
  const [selectedFunnelName, setSelectedFunnelName] = useState<string | null>(
    null
  )

  // Slicing state
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [sections, setSections] = useState<SliceSection[]>([])
  const [analysisTime, setAnalysisTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)

  // Cleanup de Object URLs
  const imageDataRef = useRef<ImageData | null>(null)
  useEffect(() => {
    imageDataRef.current = imageData
  }, [imageData])
  useEffect(() => {
    return () => {
      if (imageDataRef.current?.isObjectUrl && imageDataRef.current?.url) {
        URL.revokeObjectURL(imageDataRef.current.url)
      }
    }
  }, [])

  // ===== Figma flow =====

  const handleFigmaConnected = useCallback((structure: FigmaFileStructure) => {
    setFigmaStructure(structure)
    setStep("browsing")
    setError(null)
  }, [])

  const handleBackToConnect = useCallback(() => {
    setFigmaStructure(null)
    setStep("connect")
    setError(null)
  }, [])

  const runAnalysisFromBase64 = useCallback(
    async (base64: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const formData = new FormData()
      formData.append("imageBase64", base64)

      const res = await fetch("/api/tools/figma-slicer/analyze", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || "Erro na análise" }
      }

      const sectionsWithIds: SliceSection[] = data.analysis.sections.map(
        (s: {
          name: string
          y_start: number
          y_end: number
          description?: string
        }) => ({
          ...s,
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        })
      )

      setSections(sectionsWithIds)
      setAnalysisTime(data.duration_ms)
      return { ok: true }
    },
    []
  )

  const runAnalysisFromFile = useCallback(
    async (file: File): Promise<{ ok: true } | { ok: false; error: string }> => {
      const formData = new FormData()
      formData.append("image", file)

      const res = await fetch("/api/tools/figma-slicer/analyze", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || "Erro na análise" }
      }

      const sectionsWithIds: SliceSection[] = data.analysis.sections.map(
        (s: {
          name: string
          y_start: number
          y_end: number
          description?: string
        }) => ({
          ...s,
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        })
      )

      setSections(sectionsWithIds)
      setAnalysisTime(data.duration_ms)
      return { ok: true }
    },
    []
  )

  const handleEmailSelected = useCallback(
    async (email: FigmaEmail, funnelName: string) => {
      if (!figmaStructure) return

      // Limpa imageData anterior
      if (imageDataRef.current?.isObjectUrl && imageDataRef.current?.url) {
        URL.revokeObjectURL(imageDataRef.current.url)
      }
      setImageData(null)
      setSections([])
      setError(null)
      setSelectedEmail(email)
      setSelectedFunnelName(funnelName)
      setStep("analyzing")

      try {
        // 1. Exporta o email do Figma (PNG 600px)
        const exportRes = await fetch(
          "/api/tools/figma-slicer/figma/export",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileKey: figmaStructure.fileKey,
              nodeId: email.id,
            }),
          }
        )
        const exportData = await exportRes.json()
        if (!exportRes.ok || !exportData.success) {
          throw new Error(exportData.error || "Erro ao exportar do Figma")
        }

        const dimensions = exportData.dimensions as ImageDimensions
        const imgBase64: string = exportData.imageBase64

        // 2. Configura imageData com data URL (sem Object URL)
        setImageData({
          url: `data:image/png;base64,${imgBase64}`,
          width: dimensions.width,
          height: dimensions.height,
          file: null,
          base64: imgBase64,
          isObjectUrl: false,
        })

        // 3. Analisa as seções
        const result = await runAnalysisFromBase64(imgBase64)
        if (!result.ok) throw new Error(result.error)

        setStep("slicing")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao processar email")
        setStep("browsing")
      }
    },
    [figmaStructure, runAnalysisFromBase64]
  )

  // ===== Upload manual flow =====

  const handleUploadSelected = useCallback(
    async (file: File, dimensions: ImageDimensions) => {
      // Limpa imageData anterior
      if (imageDataRef.current?.isObjectUrl && imageDataRef.current?.url) {
        URL.revokeObjectURL(imageDataRef.current.url)
      }

      const url = URL.createObjectURL(file)
      setImageData({
        url,
        width: dimensions.width,
        height: dimensions.height,
        file,
        base64: null,
        isObjectUrl: true,
      })
      setSections([])
      setError(null)
      setStep("analyzing")

      const result = await runAnalysisFromFile(file)
      if (!result.ok) {
        setError(result.error)
        setStep("connect")
        return
      }
      setStep("slicing")
    },
    [runAnalysisFromFile]
  )

  // ===== Reanalyze =====

  const handleReanalyze = useCallback(async () => {
    if (!imageData) return
    setIsReanalyzing(true)
    setError(null)
    const result = imageData.base64
      ? await runAnalysisFromBase64(imageData.base64)
      : imageData.file
      ? await runAnalysisFromFile(imageData.file)
      : { ok: false as const, error: "Nenhuma imagem disponível" }
    if (!result.ok) setError(result.error)
    setIsReanalyzing(false)
  }, [imageData, runAnalysisFromBase64, runAnalysisFromFile])

  // ===== Export ZIP =====

  const handleExport = useCallback(async () => {
    if (!imageData || sections.length === 0) return

    setIsExporting(true)
    setError(null)
    try {
      const formData = new FormData()
      if (imageData.base64) {
        formData.append("imageBase64", imageData.base64)
      } else if (imageData.file) {
        formData.append("image", imageData.file)
      }
      formData.append(
        "sections",
        JSON.stringify(
          sections.map(({ name, y_start, y_end }) => ({
            name,
            y_start,
            y_end,
          }))
        )
      )

      const res = await fetch("/api/tools/figma-slicer/slice", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Erro ao exportar" }))
        throw new Error(err.error || "Erro ao exportar")
      }

      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const baseName = selectedEmail?.name || imageData.file?.name || "email"
      a.href = downloadUrl
      a.download = `slices-${baseName.replace(/[^a-zA-Z0-9]+/g, "_")}-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar")
    } finally {
      setIsExporting(false)
    }
  }, [imageData, sections, selectedEmail])

  // ===== Reset / novo email =====

  const handleNewEmail = useCallback(() => {
    if (imageDataRef.current?.isObjectUrl && imageDataRef.current?.url) {
      URL.revokeObjectURL(imageDataRef.current.url)
    }
    setImageData(null)
    setSections([])
    setError(null)
    setAnalysisTime(0)
    setSelectedEmail(null)
    setSelectedFunnelName(null)

    // Se tem estrutura Figma carregada, volta pro browser; senão pro connect
    if (figmaStructure) {
      setStep("browsing")
    } else {
      setStep("connect")
    }
  }, [figmaStructure])

  const handleSectionsChange = useCallback((newSections: SliceSection[]) => {
    setSections(newSections)
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Scissors}
        title="Email Slicer"
        description="Corte automático de emails marketing — conecte ao Figma ou faça upload"
        breadcrumb={[
          { label: "Ferramentas", href: ROUTES.ADMIN.TOOLS },
          { label: "Email Slicer" },
        ]}
        actions={
          step === "slicing" ? (
            <Button variant="secondary" size="sm" onClick={handleNewEmail}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {figmaStructure ? "Outro email" : "Novo email"}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.ADMIN.TOOLS}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
          )
        }
      />

      {error && (
        <div className="rounded-[8px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Breadcrumbs Figma no slicing */}
      {step === "slicing" && figmaStructure && selectedEmail && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#8B92A5]">
          <button
            type="button"
            onClick={() => {
              setStep("browsing")
              setImageData(null)
              setSections([])
            }}
            className="hover:underline hover:text-gray-700 dark:hover:text-[#EAEDF3]"
          >
            {figmaStructure.name}
          </button>
          <span>›</span>
          <span>{selectedFunnelName}</span>
          <span>›</span>
          <span className="text-gray-900 dark:text-[#EAEDF3] font-medium">
            {selectedEmail.name}
          </span>
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
            <ImageUploader onImageSelected={handleUploadSelected} />
          </TabsContent>
        </Tabs>
      )}

      {/* Step: Browsing (grid de funis) */}
      {step === "browsing" && figmaStructure && (
        <FunnelBrowser
          structure={figmaStructure}
          onEmailSelected={handleEmailSelected}
          onBack={handleBackToConnect}
        />
      )}

      {/* Step: Analyzing (loader) */}
      {step === "analyzing" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="h-10 w-10 border-4 border-[#4E62D8]/30 border-t-[#4E62D8] rounded-full animate-spin" />
            <div className="text-center space-y-1">
              <p className="font-medium text-gray-900 dark:text-[#EAEDF3]">
                Analisando email com IA...
              </p>
              <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
                {selectedEmail
                  ? `Exportando "${selectedEmail.name}" do Figma e detectando seções`
                  : "Claude está identificando as seções"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Slicing (preview + lista + export) */}
      {step === "slicing" && imageData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 order-2 lg:order-1">
            <Card>
              <CardContent className="p-4">
                <SlicePreview
                  imageUrl={imageData.url}
                  imageDimensions={{
                    width: imageData.width,
                    height: imageData.height,
                  }}
                  sections={sections}
                  onSectionsChange={handleSectionsChange}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 order-1 lg:order-2">
            <SliceList
              sections={sections}
              imageDimensions={{
                width: imageData.width,
                height: imageData.height,
              }}
              onSectionsChange={handleSectionsChange}
              analysisTime={analysisTime}
              onReanalyze={handleReanalyze}
              isReanalyzing={isReanalyzing}
            />

            <ExportButton
              onExport={handleExport}
              isExporting={isExporting}
              sectionsCount={sections.length}
            />
          </div>
        </div>
      )}
    </div>
  )
}
