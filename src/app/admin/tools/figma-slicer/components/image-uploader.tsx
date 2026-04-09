"use client"

import { useCallback, useRef, useState, type DragEvent } from "react"
import { Upload, ImagePlus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]
const PDF_MIME_TYPE = "application/pdf"
const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_TYPES, PDF_MIME_TYPE]
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024
const MIN_IMAGE_WIDTH = 200

interface ImageUploaderProps {
  // Para imagens, dimensions é extraído localmente. Para PDF,
  // dimensions é null — a API retornará o preview e as dimensões.
  onImageSelected: (
    file: File,
    dimensions: { width: number; height: number } | null
  ) => void
  isDisabled?: boolean
}

export function ImageUploader({ onImageSelected, isDisabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateAndLoad = useCallback(
    (file: File) => {
      setError(null)

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setError(
          `Tipo de arquivo não suportado: ${file.type}. Use PNG, JPG, WebP ou PDF.`
        )
        return
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError("Arquivo muito grande. Máximo 15MB.")
        return
      }

      // PDF: não tentar ler dimensões localmente, passar direto para a API
      if (file.type === PDF_MIME_TYPE) {
        onImageSelected(file, null)
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        const img = new Image()
        img.onload = () => {
          if (img.naturalWidth < MIN_IMAGE_WIDTH) {
            setError(
              `Imagem muito pequena (${img.naturalWidth}px). Mínimo ${MIN_IMAGE_WIDTH}px de largura.`
            )
            return
          }
          onImageSelected(file, {
            width: img.naturalWidth,
            height: img.naturalHeight,
          })
        }
        img.onerror = () => setError("Falha ao carregar a imagem.")
        img.src = dataUrl
      }
      reader.onerror = () => setError("Falha ao ler o arquivo.")
      reader.readAsDataURL(file)
    },
    [onImageSelected]
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDisabled) setIsDragging(true)
  }, [isDisabled])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (isDisabled) return
      const file = e.dataTransfer.files?.[0]
      if (file) validateAndLoad(file)
    },
    [isDisabled, validateAndLoad]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) validateAndLoad(file)
      // Reset for re-upload of the same file
      if (inputRef.current) inputRef.current.value = ""
    },
    [validateAndLoad]
  )

  return (
    <Card>
      <CardContent className="p-6">
        <div
          role="button"
          tabIndex={0}
          aria-label="Selecionar imagem do email"
          aria-disabled={isDisabled}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isDisabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !isDisabled) {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-[12px] border-2 border-dashed",
            "py-16 px-6 transition-colors cursor-pointer outline-none",
            "border-gray-300 dark:border-[#2E3347]",
            "bg-gray-50/50 dark:bg-[#1A1D27]/40",
            "hover:border-[#4E62D8] hover:bg-[#4E62D8]/5",
            "focus-visible:ring-2 focus-visible:ring-[#4E62D8] focus-visible:ring-offset-2",
            isDragging && "border-[#4E62D8] bg-[#4E62D8]/10",
            error && "border-red-400 bg-red-50/50 dark:bg-red-900/10",
            isDisabled && "opacity-60 cursor-not-allowed"
          )}
        >
          <div
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center",
              "bg-white border border-[rgba(0,0,0,0.08)] dark:bg-[#242836] dark:border-[rgba(255,255,255,0.08)]"
            )}
          >
            {isDragging ? (
              <ImagePlus className="h-6 w-6 text-[#4E62D8]" />
            ) : (
              <Upload className="h-6 w-6 text-gray-500 dark:text-[#8B92A5]" />
            )}
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
              {isDragging
                ? "Solte o arquivo para começar"
                : "Arraste o email (PNG, JPG, WebP ou PDF) ou clique para escolher"}
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5]">
              PNG, JPG, WebP ou PDF — até 15MB
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDisabled}
            onClick={(e) => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
          >
            Selecionar arquivo
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
            disabled={isDisabled}
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
