"use client"

import { useState } from "react"
import { ModalShell, Field, TextInput, TextArea } from "./modal-shell"
import type { PesquisaData } from "../pesquisa-section"

interface Pillar {
  number: string
  label: string
  text: string
}

export function EditMarcaModal({
  data,
  onSave,
  onClose,
}: {
  data: PesquisaData
  onSave: (u: Partial<PesquisaData>) => Promise<void>
  onClose: () => void
}) {
  const [thesis, setThesis] = useState(data.brand_thesis ?? "")
  const [about, setAbout] = useState(data.brand_about ?? "")
  const [presence, setPresence] = useState(data.brand_presence ?? "")
  const [pillars, setPillars] = useState<Pillar[]>(
    data.brand_pillars && data.brand_pillars.length === 3
      ? data.brand_pillars
      : [
          { number: "01", label: "", text: "" },
          { number: "02", label: "", text: "" },
          { number: "03", label: "", text: "" },
        ],
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        brand_thesis: thesis.trim() || null,
        brand_about: about.trim() || null,
        brand_presence: presence.trim() || null,
        brand_pillars: pillars.filter((p) => p.label.trim() || p.text.trim()),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Editar · Perfil da Marca"
      subtitle="Pilar 1 da Pesquisa & Diagnóstico"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
    >
      <Field label="Tese da marca (pull-quote)">
        <TextArea
          value={thesis}
          onChange={setThesis}
          rows={3}
          placeholder='Ex: "Blessed Choice é um manifesto de fé acessível — moda como linguagem para mulheres que carregam a espiritualidade no cotidiano."'
        />
      </Field>

      <Field label="Sobre a marca — origem, propósito, diferencial">
        <TextArea
          value={about}
          onChange={setAbout}
          rows={8}
          placeholder="Parágrafos longos contando a história, propósito e diferença vs concorrentes. Use linhas em branco entre parágrafos."
        />
      </Field>

      <Field label="Presença digital">
        <TextArea
          value={presence}
          onChange={setPresence}
          rows={3}
          placeholder="Onde a marca está presente digitalmente · Instagram, TikTok, e-mail, etc."
        />
      </Field>

      <Field label="3 pilares-conceito">
        <div className="space-y-3">
          {pillars.map((p, idx) => (
            <div key={idx} className="bg-slate-50 rounded-md p-3 border" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
              <div className="grid grid-cols-[56px_1fr] gap-2 mb-2">
                <TextInput
                  value={p.number}
                  onChange={(v) => setPillars(pillars.map((x, j) => (j === idx ? { ...x, number: v } : x)))}
                  placeholder="01"
                />
                <TextInput
                  value={p.label}
                  onChange={(v) => setPillars(pillars.map((x, j) => (j === idx ? { ...x, label: v } : x)))}
                  placeholder="Ex: Fé como identidade"
                />
              </div>
              <TextArea
                value={p.text}
                onChange={(v) => setPillars(pillars.map((x, j) => (j === idx ? { ...x, text: v } : x)))}
                rows={2}
                placeholder="Frase curta explicando o pilar (1 sentença)"
              />
            </div>
          ))}
        </div>
      </Field>
    </ModalShell>
  )
}
