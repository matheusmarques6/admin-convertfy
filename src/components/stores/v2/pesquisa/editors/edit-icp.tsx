"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { ModalShell, Field, TextInput, TextArea, ListEditor, NumberInput, Select } from "./modal-shell"
import type { PesquisaData } from "../pesquisa-section"

// Buckets canônicos (Schwartz) — seed quando icp_awareness é null
const AWARENESS_SEED: NonNullable<PesquisaData["icp_awareness"]>["levels"] = [
  { key: "unaware", label: "Unaware", pct: 0 },
  { key: "problem", label: "Problem aware", pct: 0 },
  { key: "solution", label: "Solution aware", pct: 0 },
  { key: "product", label: "Product aware", pct: 0 },
  { key: "most", label: "Most aware", pct: 0 },
]

// Eixos canônicos do Starving Crowd — seed quando icp_starving_crowd é null
const STARVING_SEED: NonNullable<PesquisaData["icp_starving_crowd"]>["scores"] = [
  { key: "urgency", label: "Urgência", value: 0, note: "" },
  { key: "pain_cost", label: "Custo da dor", value: 0, note: "" },
  { key: "frequency", label: "Frequência", value: 0, note: "" },
  { key: "trend", label: "Tendência", value: 0, note: "" },
]

const VOCAB_TYPES = ["Dor", "Desejo", "Objeção", "Marca"]

const clampPct = (n: number) => Math.max(0, Math.min(100, Number(n) || 0))
const clamp05 = (n: number) => Math.max(0, Math.min(5, Number(n) || 0))

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

  // Blocos avançados
  const [awDominant, setAwDominant] = useState(data.icp_awareness?.dominant ?? "")
  const [awLevels, setAwLevels] = useState<NonNullable<PesquisaData["icp_awareness"]>["levels"]>(
    data.icp_awareness?.levels?.length ? data.icp_awareness.levels : AWARENESS_SEED,
  )
  const [awImplication, setAwImplication] = useState(data.icp_awareness?.copy_implication ?? "")

  const [scVerdict, setScVerdict] = useState(data.icp_starving_crowd?.verdict ?? "")
  const [scScores, setScScores] = useState<NonNullable<PesquisaData["icp_starving_crowd"]>["scores"]>(
    data.icp_starving_crowd?.scores?.length ? data.icp_starving_crowd.scores : STARVING_SEED,
  )

  const [umHeadline, setUmHeadline] = useState(data.icp_unique_mechanism?.headline ?? "")
  const [umBody, setUmBody] = useState(data.icp_unique_mechanism?.body ?? "")

  const [objections, setObjections] = useState<NonNullable<PesquisaData["icp_objections"]>>(
    data.icp_objections ?? [],
  )
  const [vocabulary, setVocabulary] = useState<NonNullable<PesquisaData["icp_vocabulary"]>>(
    data.icp_vocabulary ?? [],
  )

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const personaFilled = name.trim() || age.trim() || city.trim() || monogram.trim()
      const demoFilled = ageRange.trim() || income.trim() || education.trim() || occupation.trim() || religion.trim()

      const awFilled = awDominant.trim() || awImplication.trim() || awLevels.some((l) => l.pct > 0)
      const scFilled = scVerdict.trim() || scScores.some((s) => s.value > 0 || s.note.trim())
      const umFilled = umHeadline.trim() || umBody.trim()
      const cleanObjections = objections
        .map((o) => ({ objection: o.objection.trim(), treatment: o.treatment.trim() }))
        .filter((o) => o.objection && o.treatment)
      const cleanVocab = vocabulary
        .map((v) => ({ type: v.type, channel: v.channel.trim(), quote: v.quote.trim() }))
        .filter((v) => v.quote)

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
        icp_awareness: awFilled
          ? {
              dominant: awDominant.trim(),
              levels: awLevels.map((l) => ({ ...l, pct: clampPct(l.pct) })),
              copy_implication: awImplication.trim(),
            }
          : null,
        icp_starving_crowd: scFilled
          ? {
              verdict: scVerdict.trim(),
              scores: scScores.map((s) => ({ ...s, value: clamp05(s.value), note: s.note.trim() })),
              total: scScores.reduce((t, s) => t + clamp05(s.value), 0),
            }
          : null,
        icp_unique_mechanism: umFilled ? { headline: umHeadline.trim(), body: umBody.trim() } : null,
        icp_objections: cleanObjections.length ? cleanObjections : null,
        icp_vocabulary: cleanVocab.length ? cleanVocab : null,
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

      {/* ─── Blocos analíticos · avançado ─── */}
      <div className="mt-6 mb-4 pt-4 border-t" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#2137B6" }}>
          Blocos analíticos · avançado
        </div>
        <p className="text-[11px] text-slate-500 m-0">
          Normalmente preenchidos pela IA/n8n — edite à mão para ajustar.
        </p>
      </div>

      <Field label="Nível de consciência · dominante">
        <Select value={awDominant} options={awLevels.map((l) => l.label)} placeholder="— escolher dominante —" onChange={setAwDominant} />
      </Field>

      <Field label="Distribuição de consciência (%)">
        <AwarenessLevelsEditor levels={awLevels} onChange={setAwLevels} />
      </Field>

      <Field label="Implicação para copy">
        <TextArea value={awImplication} onChange={setAwImplication} rows={3} placeholder="O que essa distribuição significa para a copy de aquisição (aceita **negrito**)." />
      </Field>

      <Field label="Starving Crowd · veredito">
        <TextInput value={scVerdict} onChange={setScVerdict} placeholder="Ex: Warm / Hot / Cold" />
      </Field>

      <Field label="Starving Crowd · sub-scores (0–5)">
        <StarvingScoresEditor scores={scScores} onChange={setScScores} />
      </Field>

      <Field label="Mecanismo único · título">
        <TextInput value={umHeadline} onChange={setUmHeadline} placeholder="Ex: Por que a [marca] resolve o que ninguém resolveu" />
      </Field>

      <Field label="Mecanismo único · texto">
        <TextArea value={umBody} onChange={setUmBody} rows={5} placeholder="Diferente de X e de Y, a marca entrega **Z**… (aceita **negrito**)." />
      </Field>

      <Field label="Objeções principais (máx 8)">
        <ObjectionsEditor items={objections} onChange={setObjections} />
      </Field>

      <Field label="Vocabulário literal (máx 16)">
        <VocabularyEditor items={vocabulary} onChange={setVocabulary} />
      </Field>
    </ModalShell>
  )
}

// ─── Editores estruturados (co-localizados) ──────────────

function AwarenessLevelsEditor({
  levels,
  onChange,
}: {
  levels: NonNullable<PesquisaData["icp_awareness"]>["levels"]
  onChange: (l: NonNullable<PesquisaData["icp_awareness"]>["levels"]) => void
}) {
  const total = levels.reduce((t, l) => t + (Number(l.pct) || 0), 0)
  return (
    <div className="flex flex-col gap-1.5">
      {levels.map((l, i) => (
        <div key={l.key} className="flex items-center gap-2">
          <span className="flex-1 text-[12px] text-slate-600">{l.label}</span>
          <div className="w-24">
            <NumberInput
              value={l.pct}
              min={0}
              max={100}
              onChange={(v) => onChange(levels.map((x, j) => (j === i ? { ...x, pct: v } : x)))}
            />
          </div>
          <span className="text-[11px] text-slate-400 w-3">%</span>
        </div>
      ))}
      <div className="text-[11px] mt-0.5" style={{ color: total === 100 ? "#065F46" : "#92400E" }}>
        soma: {total}%{total !== 100 ? " (ideal: 100%)" : ""}
      </div>
    </div>
  )
}

function StarvingScoresEditor({
  scores,
  onChange,
}: {
  scores: NonNullable<PesquisaData["icp_starving_crowd"]>["scores"]
  onChange: (s: NonNullable<PesquisaData["icp_starving_crowd"]>["scores"]) => void
}) {
  const total = scores.reduce((t, s) => t + (Number(s.value) || 0), 0)
  return (
    <div className="flex flex-col gap-1.5">
      {scores.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className="w-24 text-[12px] text-slate-600 shrink-0">{s.label}</span>
          <div className="w-16 shrink-0">
            <NumberInput
              value={s.value}
              min={0}
              max={5}
              onChange={(v) => onChange(scores.map((x, j) => (j === i ? { ...x, value: v } : x)))}
            />
          </div>
          <span className="text-[11px] text-slate-400 shrink-0">/5</span>
          <div className="flex-1">
            <TextInput
              value={s.note}
              onChange={(v) => onChange(scores.map((x, j) => (j === i ? { ...x, note: v } : x)))}
              placeholder="Nota curta (ex: Compra com regularidade)"
            />
          </div>
        </div>
      ))}
      <div className="text-[11px] text-slate-500 mt-0.5">
        Score total: <strong className="text-slate-700">{total}</strong> / 20
      </div>
    </div>
  )
}

function ObjectionsEditor({
  items,
  onChange,
}: {
  items: NonNullable<PesquisaData["icp_objections"]>
  onChange: (v: NonNullable<PesquisaData["icp_objections"]>) => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div key={i} className="rounded-md border p-2.5 flex flex-col gap-1.5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Objeção {i + 1}</span>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-red-600"
              title="Remover"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <TextArea
            value={it.objection}
            rows={2}
            onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, objection: v } : x)))}
            placeholder="Dúvida na voz da cliente (ex: Será que o tecido é fininho?)"
          />
          <TextArea
            value={it.treatment}
            rows={2}
            onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, treatment: v } : x)))}
            placeholder="Como tratar (prova, oferta, conteúdo)"
          />
        </div>
      ))}
      {items.length < 8 && (
        <button
          onClick={() => onChange([...items, { objection: "", treatment: "" }])}
          className="h-9 px-3 rounded-md text-[12px] font-medium text-brand-600 hover:bg-brand-50 text-left border-2 border-dashed"
          style={{ borderColor: "rgba(78,98,216,0.20)" }}
        >
          + Adicionar objeção
        </button>
      )}
    </div>
  )
}

function VocabularyEditor({
  items,
  onChange,
}: {
  items: NonNullable<PesquisaData["icp_vocabulary"]>
  onChange: (v: NonNullable<PesquisaData["icp_vocabulary"]>) => void
}) {
  type VocabItem = NonNullable<PesquisaData["icp_vocabulary"]>[number]
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-md border p-2.5 flex flex-col gap-1.5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <div className="flex items-center gap-2">
            <div className="w-28 shrink-0">
              <Select
                value={it.type}
                options={VOCAB_TYPES}
                onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, type: v as VocabItem["type"] } : x)))}
              />
            </div>
            <div className="flex-1">
              <TextInput
                value={it.channel}
                onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, channel: v } : x)))}
                placeholder="Canal (ex: ad hook, email subject)"
              />
            </div>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-red-600 shrink-0"
              title="Remover"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <TextInput
            value={it.quote}
            onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, quote: v } : x)))}
            placeholder="Frase literal da cliente"
          />
        </div>
      ))}
      {items.length < 16 && (
        <button
          onClick={() => onChange([...items, { type: "Dor", channel: "", quote: "" }])}
          className="h-9 px-3 rounded-md text-[12px] font-medium text-brand-600 hover:bg-brand-50 text-left border-2 border-dashed"
          style={{ borderColor: "rgba(78,98,216,0.20)" }}
        >
          + Adicionar frase
        </button>
      )}
    </div>
  )
}
