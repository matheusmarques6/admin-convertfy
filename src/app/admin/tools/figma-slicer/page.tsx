"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Scissors } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"
import type { ImageDimensions, SliceSection } from "@/types/slicer"
import { ImageUploader } from "./components/image-uploader"
import { SlicePreview } from "./components/slice-preview"
import { SliceList } from "./components/slice-list"
import { ExportButton } from "./components/export-button"

interface ImageData {
  file: File
  url: string // Object URL (for images) or data URL (for PDF preview)
  isObjectUrl: boolean // true if URL.revokeObjectURL is needed
  width: number
  height: number
}

type Step = "upload" | "analyzing" | "preview"

const PDF_MIME_TYPE = "application/pdf"

export default function FigmaSlicerPage() {
  const [step, setStep] = useState<Step>("upload")
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [sections, setSections] = useState<SliceSection[]>([])
  const [analysisTime, setAnalysisTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)

  // Persist the current image data so the cleanup effect can revoke the URL
  // even after the user resets state.
  const imageDataRef = useRef<ImageData | null>(null)
  useEffect(() => {
    imageDataRef.current = imageData
  }, [imageData])

  // Cleanup the object URL when the page unmounts
  useEffect(() => {
    return () => {
      if (imageDataRef.current?.isObjectUrl && imageDataRef.current?.url) {
        URL.revokeObjectURL(imageDataRef.current.url)
      }
    }
  }, [])

  const runAnalysis = useCallback(
    async (
      file: File
    ): Promise<
      | {
          ok: true
          previewImage: string | null
          previewDimensions: { width: number; height: number } | null
        }
      | { ok: false; error: string }
    > => {
      const formData = new FormData()
      formData.append("image", file)

      const response = await fetch("/api/tools/figma-slicer/analyze", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        return { ok: false, error: data.error || "Erro na análise" }
      }

      const sectionsWithIds: SliceSection[] = data.analysis.sections.map(
        (s: { name: string; y_start: number; y_end: number; description?: string }) => ({
          ...s,
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        })
      )

      setSections(sectionsWithIds)
      setAnalysisTime(data.duration_ms)
      return {
        ok: true,
        previewImage: data.preview_image ?? null,
        previewDimensions: data.preview_dimensions ?? null,
      }
    },
    []
  )

  const handleImageSelected = useCallback(
    async (file: File, dimensions: ImageDimensions | null) => {
      // Revoke previous URL if any
      if (imageDataRef.current?.isObjectUrl && imageDataRef.current?.url) {
        URL.revokeObjectURL(imageDataRef.current.url)
      }

      setError(null)
      setStep("analyzing")

      // For images we can set imageData immediately (the preview uses the
      // original file via object URL). For PDF we have to wait for the API
      // to return the PNG preview before we can render anything.
      const isPdf = file.type === PDF_MIME_TYPE

      if (!isPdf && dimensions) {
        const url = URL.createObjectURL(file)
        setImageData({
          file,
          url,
          isObjectUrl: true,
          width: dimensions.width,
          height: dimensions.height,
        })
      } else {
        // Clear any previous image data while analyzing PDF
        setImageData(null)
      }

      const result = await runAnalysis(file)
      if (!result.ok) {
        setError(result.error)
        setStep("upload")
        return
      }

      // For PDF: use the preview_image base64 returned by the API
      if (isPdf) {
        if (!result.previewImage || !result.previewDimensions) {
          setError("Falha ao gerar preview do PDF.")
          setStep("upload")
          return
        }
        setImageData({
          file,
          url: `data:image/png;base64,${result.previewImage}`,
          isObjectUrl: false,
          width: result.previewDimensions.width,
          height: result.previewDimensions.height,
        })
      }

      setStep("preview")
    },
    [runAnalysis]
  )

  const handleReanalyze = useCallback(async () => {
    if (!imageData) return
    setIsReanalyzing(true)
    setError(null)
    const result = await runAnalysis(imageData.file)
    if (!result.ok) setError(result.error)
    setIsReanalyzing(false)
  }, [imageData, runAnalysis])

  const handleExport = useCallback(async () => {
    if (!imageData || sections.length === 0) return

    setIsExporting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("image", imageData.file)
      formData.append(
        "sections",
        JSON.stringify(
          sections.map(({ name, y_start, y_end }) => ({ name, y_start, y_end }))
        )
      )

      const response = await fetch("/api/tools/figma-slicer/slice", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erro ao exportar" }))
        throw new Error(err.error || "Erro ao exportar")
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = `slices-${imageData.file.name.replace(/\.[^/.]+$/, "")}-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao exportar")
    } finally {
      setIsExporting(false)
    }
  }, [imageData, sections])

  const handleReset = useCallback(() => {
    if (imageDataRef.current?.isObjectUrl && imageDataRef.current?.url) {
      URL.revokeObjectURL(imageDataRef.current.url)
    }
    setImageData(null)
    setSections([])
    setError(null)
    setAnalysisTime(0)
    setStep("upload")
  }, [])

  const handleSectionsChange = useCallback((newSections: SliceSection[]) => {
    setSections(newSections)
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Scissors}
        title="Email Slicer"
        description="Corte automático de emails marketing com Claude Vision — arraste para ajustar"
        breadcrumb={[
          { label: "Ferramentas", href: ROUTES.ADMIN.TOOLS },
          { label: "Email Slicer" },
        ]}
        actions={
          step === "preview" ? (
            <Button variant="secondary" size="sm" onClick={handleReset}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Novo email
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

      {step === "upload" && <ImageUploader onImageSelected={handleImageSelected} />}

      {step === "analyzing" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="h-10 w-10 border-4 border-[#4E62D8]/30 border-t-[#4E62D8] rounded-full animate-spin" />
            <div className="text-center space-y-1">
              <p className="font-medium text-gray-900 dark:text-[#EAEDF3]">
                Analisando email com IA...
              </p>
              <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
                Claude está identificando as seções
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && imageData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 order-2 lg:order-1">
            <Card>
              <CardContent className="p-4">
                <SlicePreview
                  imageUrl={imageData.url}
                  imageDimensions={{ width: imageData.width, height: imageData.height }}
                  sections={sections}
                  onSectionsChange={handleSectionsChange}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 order-1 lg:order-2">
            <SliceList
              sections={sections}
              imageDimensions={{ width: imageData.width, height: imageData.height }}
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
