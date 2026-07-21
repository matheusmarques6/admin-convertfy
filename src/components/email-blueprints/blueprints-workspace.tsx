"use client"

/**
 * Root client da página /admin/email-blueprints.
 *
 * Layout 3 colunas (>= xl):
 *   - lista de emails do flow_type ativo (esquerda)
 *   - editor do blueprint selecionado (centro)
 *   - preview do reference template vinculado (direita)
 *
 * Estado de blueprints vem do server (initial). Após salvar/criar, o editor
 * chama `router.refresh()` pra re-fetch o RSC e remontar o initial.
 */
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Mail } from "lucide-react"
import { EGFlowPills, EGNotice, EGSecTitle } from "@/components/email-generation/ui/eg-atoms"
import type { BlueprintRow } from "@/lib/email-blueprints/types"
import { BlueprintList } from "./blueprint-list"
import { BlueprintEditor } from "./blueprint-editor"
import { BlueprintReferencePreview } from "./blueprint-reference-preview"

interface Props {
  initial: BlueprintRow[]
}

export function BlueprintsWorkspace({ initial }: Props) {
  const router = useRouter()
  const blueprints = initial

  const flowTypes = useMemo(() => {
    const set = new Set<string>()
    blueprints.forEach((b) => set.add(b.flow_type))
    return Array.from(set).sort()
  }, [blueprints])

  const [selectedFlowType, setSelectedFlowType] = useState<string>(
    flowTypes[0] ?? "welcome",
  )
  const [selectedEmailNumber, setSelectedEmailNumber] = useState<number | null>(
    null,
  )

  const filtered = useMemo(
    () => blueprints.filter((b) => b.flow_type === selectedFlowType),
    [blueprints, selectedFlowType],
  )

  const effectiveNumber =
    selectedEmailNumber ?? filtered[0]?.email_number ?? null
  const selectedBlueprint =
    filtered.find((b) => b.email_number === effectiveNumber) ?? null

  return (
    <div className="space-y-4">
      <EGSecTitle
        icon={<Mail size={18} />}
        title="Email / Blueprints"
        sub="Estrutura de blocos por flow_type › email_number. Edite a composição usada em futuras lojas seedadas."
      />

      <EGNotice tone="warn">
        Mudanças aqui só afetam <b>lojas geradas no futuro</b> (ou re-seed
        manual). Emails de lojas existentes mantêm a composição original.
      </EGNotice>

      <EGFlowPills
        items={flowTypes.map((ft) => ({ key: ft, label: ft }))}
        value={selectedFlowType}
        onChange={(v) => {
          setSelectedFlowType(v)
          setSelectedEmailNumber(null)
        }}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_380px]">
        <BlueprintList
          blueprints={filtered}
          selectedEmailNumber={effectiveNumber}
          onSelect={(n) => setSelectedEmailNumber(n)}
        />

        {selectedBlueprint ? (
          <BlueprintEditor
            key={`${selectedBlueprint.flow_type}:${selectedBlueprint.email_number}`}
            blueprint={selectedBlueprint}
            onSaved={() => router.refresh()}
          />
        ) : (
          <div className="rounded-[6px] border border-slate-200 bg-white p-6 text-[13px] text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-white/40">
            Selecione um email na lista para editar.
          </div>
        )}

        <BlueprintReferencePreview flowType={selectedFlowType} />
      </div>
    </div>
  )
}
