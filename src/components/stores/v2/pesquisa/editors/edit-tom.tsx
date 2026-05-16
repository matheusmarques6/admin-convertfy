"use client"

import { useState } from "react"
import { ModalShell, Field, TextArea, ListEditor } from "./modal-shell"
import type { PesquisaData } from "../pesquisa-section"

export function EditTomModal({
  data,
  onSave,
  onClose,
}: {
  data: PesquisaData
  onSave: (u: Partial<PesquisaData>) => Promise<void>
  onClose: () => void
}) {
  const [description, setDescription] = useState(data.tone_description ?? "")
  const [doList, setDoList] = useState<string[]>(data.tone_do ?? [])
  const [dontList, setDontList] = useState<string[]>(data.tone_dont ?? [])
  const [useWords, setUseWords] = useState<string[]>(data.tone_use_words ?? [])
  const [avoidWords, setAvoidWords] = useState<string[]>(data.tone_avoid_words ?? [])
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        tone_description: description.trim() || null,
        tone_do: doList.map((s) => s.trim()).filter(Boolean),
        tone_dont: dontList.map((s) => s.trim()).filter(Boolean),
        tone_use_words: useWords.map((s) => s.trim()).filter(Boolean),
        tone_avoid_words: avoidWords.map((s) => s.trim()).filter(Boolean),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Editar · Tom de Comunicação"
      subtitle="Pilar 4 da Pesquisa & Diagnóstico"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
    >
      <Field label="Como a marca fala — 2 parágrafos">
        <TextArea
          value={description}
          onChange={setDescription}
          rows={6}
          placeholder={`§1 Tom de voz, ritmo, postura.\n\n§2 O que a marca evita, uso de referências, emojis, etc.`}
        />
      </Field>

      <Field label='Como falamos — 4 frases-exemplo'>
        <ListEditor values={doList} onChange={setDoList} placeholder='Ex: "Que sua fé floresça em cada detalhe"' max={6} />
      </Field>

      <Field label='Como NUNCA falamos — 4 frases-exemplo'>
        <ListEditor values={dontList} onChange={setDontList} placeholder='Ex: "Aproveite essa oferta IMPERDÍVEL!!!"' max={6} />
      </Field>

      <Field label="Palavras a USAR">
        <ListEditor values={useWords} onChange={setUseWords} placeholder='Ex: fé, propósito, jornada' max={20} />
      </Field>

      <Field label="Palavras a EVITAR">
        <ListEditor values={avoidWords} onChange={setAvoidWords} placeholder='Ex: oferta, imperdível, último' max={20} />
      </Field>
    </ModalShell>
  )
}
