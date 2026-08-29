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
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : g.key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                border: "none",
                borderTop: i === 0 ? "none" : `1px solid rgba(0,0,0,0.06)`,
                background: isOpen ? C.g50 : C.white,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: F.sans,
              }}
            >
              <Icon size={16} color={g.iconColor} style={{ flex: "0 0 16px" }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: C.g900 }}>
                {g.label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  color: lines.length ? C.g500 : C.g400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 420,
                }}
              >
                {status}
              </span>
              <Chevron open={isOpen} />
            </button>

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
                <textarea
                  rows={g.rows}
                  value={raw}
                  onChange={(e) => setValue(g.key, e.target.value)}
                  placeholder={g.placeholder}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "10px 12px",
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: C.g900,
                    background: C.white,
                    fontFamily: F.sans,
                    outline: "none",
                  }}
                />
                <span
                  style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}
                >
                  {g.hint}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={C.g400}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "0 0 16px" }}
      aria-hidden
    >
      <path d={open ? "M8 14l4-4 4 4" : "M8 10l4 4 4-4"} />
    </svg>
  )
}
