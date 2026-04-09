"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Link as LinkIcon, Loader2, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FigmaFileStructure } from "@/types/slicer"

const LS_KEY = "figma_slicer_last_url"

interface FigmaConnectProps {
  onConnected: (structure: FigmaFileStructure) => void
  isLoading: boolean
  setIsLoading: (v: boolean) => void
}

export function FigmaConnect({
  onConnected,
  isLoading,
  setIsLoading,
}: FigmaConnectProps) {
  const [figmaUrl, setFigmaUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) setFigmaUrl(saved)
    } catch {
      // ignora
    }
  }, [])

  const handleConnect = useCallback(async () => {
    if (!figmaUrl.trim()) {
      setError("Cole o link do arquivo Figma.")
      inputRef.current?.focus()
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/tools/figma-slicer/figma-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUrl: figmaUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao conectar ao Figma")
      }
      try {
        localStorage.setItem(LS_KEY, figmaUrl.trim())
      } catch {
        // ignora
      }
      onConnected(data.structure as FigmaFileStructure)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar")
    } finally {
      setIsLoading(false)
    }
  }, [figmaUrl, onConnected, setIsLoading])

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#4E62D8]/10 flex items-center justify-center">
            <LinkIcon className="h-5 w-5 text-[#4E62D8]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
              Conectar ao Figma
            </h3>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5]">
              Cole o link do arquivo e o sistema lista os funis e emails
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="figma-url" className="text-xs">
            Link do Figma
          </Label>
          <Input
            ref={inputRef}
            id="figma-url"
            type="url"
            placeholder="https://figma.com/design/abc123/Nome-do-arquivo"
            value={figmaUrl}
            onChange={(e) => {
              setFigmaUrl(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) handleConnect()
            }}
            disabled={isLoading}
            className="font-mono text-xs"
          />
        </div>

        {error && (
          <div className="rounded-[6px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <Button
          type="button"
          onClick={handleConnect}
          disabled={isLoading || !figmaUrl.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Conectando ao Figma...
            </>
          ) : (
            <>
              Conectar
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] text-center">
          O token do Figma é configurado no servidor — você não precisa informar nada.
        </p>
      </CardContent>
    </Card>
  )
}
