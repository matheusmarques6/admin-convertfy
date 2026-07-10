"use client"

/**
 * Secao de Configuracoes "implementation" — corpo extraido de
 * src/app/admin/settings/implementation/page.tsx (jul/2026) para ser
 * renderizavel tanto na pagina cheia (rota preservada) quanto no
 * SettingsModal global. Conteudo movido, nao reescrito.
 */

import { useEffect, useMemo, useState } from "react"
import { Send } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { SaveBar } from "@/components/ui/save-bar"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/lib/hooks/use-toast"
import type { FlowType } from "@/types/email-workspace"
import {
  FLOW_META_DEFAULTS,
  IMPLEMENTATION_FLOW_TYPES,
} from "@/lib/email-workspace/implementation/flow-meta"
import {
  resolveFlowSetup,
  type FlowSetupConfig,
  type ResolvedFlowSetup,
} from "@/lib/email-workspace/implementation/flow-settings"

const FIELD_DEFS: Array<{ key: keyof FlowSetupConfig; label: string; hint?: string }> = [
  { key: "trigger", label: "Gatilho", hint: "O que dispara a automação no ESP" },
  { key: "audience", label: "Público", hint: "Quem entra na automação" },
  { key: "metricEvent", label: "Evento / métrica", hint: "Evento nativo do ESP" },
  { key: "utmSource", label: "UTM source" },
  { key: "utmMedium", label: "UTM medium" },
]

export function ImplementationSection() {
  const { toast } = useToast()
  const [data, setData] = useState<ResolvedFlowSetup>(() => resolveFlowSetup())
  const [original, setOriginal] = useState<ResolvedFlowSetup>(() => resolveFlowSetup())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/settings/implementation-flow")
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || "Falha ao carregar")
        const flows = (json?.data?.flows ?? json?.flows) as ResolvedFlowSetup
        if (!cancelled && flows) {
          setData(flows)
          setOriginal(flows)
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Erro ao carregar",
          description: err instanceof Error ? err.message : "Erro desconhecido",
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  const hasChanges = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(original),
    [data, original],
  )

  const setField = (ft: string, key: keyof FlowSetupConfig, value: string) => {
    setData((prev) => ({ ...prev, [ft]: { ...prev[ft], [key]: value } }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/implementation-flow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flows: data }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Falha ao salvar")
      const flows = (json?.data?.flows ?? json?.flows) as ResolvedFlowSetup
      setData(flows ?? data)
      setOriginal(flows ?? data)
      toast({ title: "Salvo!", description: "Setup de implementação atualizado." })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup de Implementação"
        description="Gatilho, público, evento e UTM por flow — usados na tela de Modo Implementação. Valem para todas as lojas."
      />

      {loading ? (
        <div className="space-y-4 max-w-3xl">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="max-w-3xl space-y-5 pb-24">
          {IMPLEMENTATION_FLOW_TYPES.map((ft: FlowType) => {
            const cfg = data[ft]
            if (!cfg) return null
            return (
              <Card key={ft}>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Send className="h-4 w-4 text-slate-400" />
                  <CardTitle className="text-sm font-semibold">
                    {FLOW_META_DEFAULTS[ft]?.label ?? ft}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {FIELD_DEFS.map((f) => (
                    <FormField key={f.key} label={f.label} htmlFor={`${ft}-${f.key}`}>
                      <Input
                        id={`${ft}-${f.key}`}
                        value={cfg[f.key] ?? ""}
                        onChange={(e) => setField(ft, f.key, e.target.value)}
                      />
                      {f.hint && (
                        <p className="text-[11px] text-slate-400 mt-1">{f.hint}</p>
                      )}
                    </FormField>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <SaveBar
        isSaving={saving}
        onSave={handleSave}
        onCancel={() => setData(original)}
        hasChanges={hasChanges}
      />
    </div>
  )
}
