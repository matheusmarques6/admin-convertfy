"use client"

import { useCallback, useRef, useState, type DragEvent } from "react"
import { Upload, ImagePlus, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_SIZE_BYTES = 15 * 1024 * 1024

interface ManualUploadProps {
  onFileSelected: (file: File) => void
  isLoading: boolean
}

export function ManualUpload({ onFileSelected, isLoading }: ManualUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateAndUse = useCallback(
    (file: File) => {
      setError(null)
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Tipo não suportado: ${file.type}. Use PNG, JPG ou WebP.`)
        return
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError("Arquivo muito grande. Máximo 15MB.")
        return
      }
      onFileSelected(file)
    },
    [onFileSelected]
  )

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isLoading) setIsDragging(true)
    },
    [isLoading]
  )

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
      if (isLoading) return
      const file = e.dataTransfer.files?.[0]
      if (file) validateAndUse(file)
    },
    [isLoading, validateAndUse]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) validateAndUse(file)
      if (inputRef.current) inputRef.current.value = ""
    },
    [validateAndUse]
  )

  return (
    <Card>
      <CardContent className="p-6">
        <div
          role="button"
          tabIndex={0}
          aria-label="Selecionar imagem"
          aria-disabled={isLoading}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isLoading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !isLoading) {
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
            isLoading && "opacity-60 cursor-not-allowed"
          )}
        >
          <div className="h-14 w-14 rounded-full flex items-center justify-center bg-white border border-[rgba(0,0,0,0.08)] dark:bg-[#242836] dark:border-[rgba(255,255,255,0.08)]">
            {isLoading ? (
              <Loader2 className="h-6 w-6 text-[#4E62D8] animate-spin" />
            ) : isDragging ? (
              <ImagePlus className="h-6 w-6 text-[#4E62D8]" />
            ) : (
              <Upload className="h-6 w-6 text-gray-500 dark:text-[#8B92A5]" />
            )}
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
              {isLoading
                ? "Analisando..."
                : isDragging
                ? "Solte a imagem para começar"
                : "Arraste um PNG do email ou clique para escolher"}
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5]">
              PNG, JPG ou WebP — até 15MB
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoading}
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
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
