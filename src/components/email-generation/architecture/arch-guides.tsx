"use client"

/**
 * Os três guias editoriais do e-mail, em acordeão — "Intenção do e-mail",
 * "O e-mail deve" e "O e-mail não deve".
 *
 * Fechado, cada guia mostra o RESUMO do que tem dentro (a primeira frase da
 * intenção, a contagem de diretrizes). É o que faz a tela caber sem rolagem:
 * a maquete abre um por vez e o curador vê o estado dos três de relance.
 *
 * "Deve" e "não deve" são listas de uma diretriz por linha — o textarea é só
 * a forma de digitar; quem persiste em lista é o `textToGuides` do módulo de
 * merge, para os dois lados usarem a mesma regra.
 */

import { useState } from "react"
import { Check, Clock, X } from "lucide-react"
import { HERDADO } from "@/lib/email-architecture/merge"
import { EGAccordionRow, EGTextarea } from "../ui/eg-atoms"
import { C, F } from "../ui/eg-theme"

type GuideKey = "intent" | "should" | "should_not"

interface GuideDef {
  key: GuideKey
  label: string
  icon: typeof Clock
  iconColor: string
  rows: number
  hint: string
  placeholder: string
  /** Lista → conta itens; texto → mostra a primeira linha. */
  kind: "text" | "list"
  unit?: string
  plural?: string
}

const GUIDES: GuideDef[] = [
  {
    key: "intent",
    label: "Intenção do e-mail",
    icon: Clock,
    iconColor: C.brand,
    rows: 3,
    hint: "Uma ou duas frases. É o resumo que a IA lê primeiro.",
    placeholder: "O que este e-mail precisa provocar em quem recebe.",
    kind: "text",
  },
  {
    key: "should",
    label: "O e-mail deve",
    icon: Check,
    iconColor: C.pos,
    rows: 6,
    hint: "Uma diretriz por linha.",
    placeholder: "Mostrar o produto abandonado com foto",
    kind: "list",
    unit: "diretriz",
    plural: "diretrizes",
  },
  {
    key: "should_not",
    label: "O e-mail não deve",
    icon: X,
    iconColor: C.neg,
    rows: 6,
    hint: "Uma restrição por linha. Vale para todos os blocos.",
    placeholder: "Oferecer desconto neste contato",
    kind: "list",
    unit: "restrição",
    plural: "restrições",
  },
]

interface Props {
  intent: string
  should: string[]
  shouldNot: string[]
  onChange: (patch: {
    intent?: string
    should?: string[]
    should_not?: string[]
  }) => void
}

export function ArchGuides({ intent, should, shouldNot, onChange }: Props) {
  const [open, setOpen] = useState<GuideKey | null>(null)

  const valueOf = (k: GuideKey) =>
    k === "intent" ? intent : (k === "should" ? should : shouldNot).join("\n")

  const setValue = (k: GuideKey, v: string) => {
    if (k === "intent") return onChange({ intent: v })
    // Preserva a linha em branco enquanto o usuário digita — só o save
    // normaliza (senão o Enter some embaixo do cursor).
    const lines = v.split("\n")
    onChange(k === "should" ? { should: lines } : { should_not: lines })
  }

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {GUIDES.map((g, i) => {
        const isOpen = open === g.key
        const raw = valueOf(g.key)
        const lines = raw
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
        const status = !lines.length
          ? "Não definido"
          : g.kind === "list"
            ? `${lines.length} ${lines.length === 1 ? g.unit : g.plural}`
            : lines[0].length > 54
              ? `${lines[0].slice(0, 54)}…`
              : lines[0]
        const Icon = g.icon

        return (
          <div key={g.key}>
            <EGAccordionRow
              icon={
                <Icon size={16} color={g.iconColor} style={{ flex: "0 0 16px" }} />
              }
              label={g.label}
              status={status}
              filled={lines.length > 0}
              open={isOpen}
              first={i === 0}
              onToggle={() => setOpen(isOpen ? null : g.key)}
            />

            {isOpen && (
              <div
                style={{
                  padding: "0 14px 14px",
                  background: C.g50,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {/* Cresce com o conteúdo: são estes campos que recebem a
                    re-curação inteira do texto, e altura fixa cortaria a
                    frase de quem está escrevendo. */}
                <EGTextarea
                  minRows={g.rows}
                  value={raw}
                  onChange={(v) => setValue(g.key, v)}
                  placeholder={g.placeholder}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: C.g900,
                    background: C.white,
                    fontFamily: F.sans,
                  }}
                />
                <span
                  style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}
                >
                  {g.hint}
                </span>
                {raw.includes(HERDADO) && (
                  <span
                    style={{
                      fontSize: 12,
                      color: C.warn,
                      background: C.warnBg,
                      border: `1px solid ${C.warnBorder}`,
                      borderRadius: 6,
                      padding: "8px 10px",
                      fontFamily: F.sans,
                    }}
                  >
                    As linhas marcadas com <b>{HERDADO.trim()}</b> vinham da
                    outra tela e diziam algo diferente do que estava aqui.
                    Aparecem para você decidir — aproveite ou apague. Ao salvar,
                    as duas fontes passam a dizer o mesmo.
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
