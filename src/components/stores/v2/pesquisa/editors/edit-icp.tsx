"use client"

import { useState } from "react"
import { ModalShell, Field, TextInput, TextArea, ListEditor } from "./modal-shell"
import type { PesquisaData } from "../pesquisa-section"

export function EditIcpModal({
  data,
  onSave,
  onClose,
}: {
  data: PesquisaData
  onSave: (u: Partial<PesquisaData>) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(data.icp_persona?.name ?? "")
  const [age, setAge] = useState(data.icp_persona?.age ?? "")
  const [city, setCity] = useState(data.icp_persona?.city ?? "")
  const [monogram, setMonogram] = useState(data.icp_persona?.monogram ?? "")

  const [ageRange, setAgeRange] = useState(data.icp_demographics?.age_range ?? "")
  const [income, setIncome] = useState(data.icp_demographics?.income ?? "")
  const [education, setEducation] = useState(data.icp_demographics?.education ?? "")
  const [occupation, setOccupation] = useState(data.icp_demographics?.occupation ?? "")
  const [religion, setReligion] = useState(data.icp_demographics?.religion ?? "")

  const [dayInLife, setDayInLife] = useState(data.icp_day_in_life ?? "")
  const [motivations, setMotivations] = useState<string[]>(data.icp_motivations ?? [])
  const [frictions, setFrictions] = useState<string[]>(data.icp_frictions ?? [])
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const personaFilled = name.trim() || age.trim() || city.trim() || monogram.trim()
      const demoFilled = ageRange.trim() || income.trim() || education.trim() || occupation.trim() || religion.trim()
      await onSave({
        icp_persona: personaFilled ? { name: name.trim(), age: age.trim(), city: city.trim(), monogram: monogram.trim() || name.slice(0, 2).toUpperCase() } : null,
        icp_demographics: demoFilled
          ? {
              age_range: ageRange.trim(),
              income: income.trim(),
              education: education.trim(),
              occupation: occupation.trim(),
              religion: religion.trim(),
            }
          : null,
        icp_day_in_life: dayInLife.trim() || null,
        icp_motivations: motivations.map((m) => m.trim()).filter(Boolean),
        icp_frictions: frictions.map((m) => m.trim()).filter(Boolean),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Editar · Cliente Ideal"
      subtitle="Pilar 3 da Pesquisa & Diagnóstico"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
    >
      <Field label="Persona principal">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <TextInput value={name} onChange={setName} placeholder="Nome (ex: Mariana Souza)" />
          <TextInput value={age} onChange={setAge} placeholder="Idade (ex: 34 anos)" />
          <TextInput value={city} onChange={setCity} placeholder="Cidade (ex: Joinville, SC)" />
          <TextInput value={monogram} onChange={setMonogram} placeholder="Monograma (ex: MS) — opcional" />
        </div>
      </Field>

      <Field label="Demografia">
        <div className="grid grid-cols-1 gap-2">
          <TextInput value={ageRange} onChange={setAgeRange} placeholder="Faixa etária · ex: 28-45 anos" />
          <TextInput value={income} onChange={setIncome} placeholder="Renda familiar · ex: R$ 4.000-9.000" />
          <TextInput value={education} onChange={setEducation} placeholder="Educação · ex: Ensino superior" />
          <TextInput value={occupation} onChange={setOccupation} placeholder="Profissão típica · ex: Mãe, professora, empreendedora" />
          <TextInput value={religion} onChange={setReligion} placeholder="Religião · ex: Católica / Evangélica" />
        </div>
      </Field>

      <Field label="Um dia na vida — 3 parágrafos">
        <TextArea
          value={dayInLife}
          onChange={setDayInLife}
          rows={8}
          placeholder={`§1 Rotina (acorda, trabalha, cuida da família).\n\n§2 Consumo digital (Instagram, TikTok, e-mail).\n\n§3 Comportamento de compra (impulso vs pesquisa, fator decisivo).`}
        />
      </Field>

      <Field label="O que ela quer · motivações">
        <ListEditor values={motivations} onChange={setMotivations} placeholder="Ex: Roupas que expressem sua fé" max={6} />
      </Field>

      <Field label="O que a faz hesitar · fricções">
        <ListEditor values={frictions} onChange={setFrictions} placeholder="Ex: Frete caro e demorado" max={6} />
      </Field>
    </ModalShell>
  )
}
