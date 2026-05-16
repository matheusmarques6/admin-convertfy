"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { ModalShell, Field, TextInput, TextArea } from "./modal-shell"
import type { PesquisaData } from "../pesquisa-section"

interface Milestone {
  year: string
  event: string
  highlight?: boolean
  muted?: boolean
}

export function EditLojaModal({
  data,
  onSave,
  onClose,
}: {
  data: PesquisaData
  onSave: (u: Partial<PesquisaData>) => Promise<void>
  onClose: () => void
}) {
  const [story, setStory] = useState(data.store_story ?? "")
  const [milestones, setMilestones] = useState<Milestone[]>(data.store_milestones ?? [])
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        store_story: story.trim() || null,
        store_milestones: milestones.filter((m) => m.year.trim() || m.event.trim()),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Editar · Sobre a loja"
      subtitle="Pilar 2 da Pesquisa & Diagnóstico"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
    >
      <Field label="História da loja — 3 parágrafos">
        <TextArea
          value={story}
          onChange={setStory}
          rows={10}
          placeholder={`§1 Fundação, fundador, histórico até hoje.\n\n§2 Operação atual (logística, fulfillment, planos).\n\n§3 Entrada na Convertfy e situação atual.`}
        />
      </Field>

      <Field label="Marcos da operação">
        <div className="flex flex-col gap-2">
          {milestones.map((m, idx) => (
            <div key={idx} className="bg-slate-50 rounded-md p-3 border" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
              <div className="grid grid-cols-[100px_1fr_auto] gap-2 items-start">
                <TextInput
                  value={m.year}
                  onChange={(v) => setMilestones(milestones.map((x, j) => (j === idx ? { ...x, year: v } : x)))}
                  placeholder="2024 / FEV 2026"
                />
                <TextInput
                  value={m.event}
                  onChange={(v) => setMilestones(milestones.map((x, j) => (j === idx ? { ...x, event: v } : x)))}
                  placeholder="Ex: Entrada na Convertfy · 38k contatos"
                />
                <button
                  onClick={() => setMilestones(milestones.filter((_, j) => j !== idx))}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                  title="Remover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px]">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!m.highlight}
                    onChange={(e) => setMilestones(milestones.map((x, j) => (j === idx ? { ...x, highlight: e.target.checked, muted: false } : x)))}
                  />
                  <span className="text-brand-700 font-medium">Destacar</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!m.muted}
                    onChange={(e) => setMilestones(milestones.map((x, j) => (j === idx ? { ...x, muted: e.target.checked, highlight: false } : x)))}
                  />
                  <span className="text-slate-500 font-medium">Futuro / atenuado</span>
                </label>
              </div>
            </div>
          ))}
          <button
            onClick={() => setMilestones([...milestones, { year: "", event: "" }])}
            className="h-9 px-3 rounded-md text-[12px] font-medium text-brand-600 hover:bg-brand-50 text-left border-2 border-dashed"
            style={{ borderColor: "rgba(78,98,216,0.20)" }}
          >
            + Adicionar marco
          </button>
        </div>
      </Field>
    </ModalShell>
  )
}
