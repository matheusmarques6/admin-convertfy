"use client"

/**
 * Tabela de blocos do e-mail (Nº · Tipo · ordem · intenção) + a paleta das 8
 * categorias.
 *
 * A INTENÇÃO POR BLOCO (o `purpose`) voltou em 02/09 a pedido do owner. Ela
 * havia saído da maquete porque os três guias do topo (Intenção, O e-mail
 * deve, O e-mail não deve) dão a direção do e-mail inteiro — mas sem o campo
 * ninguém dizia o que UMA posição específica precisa fazer, e quem decidia
 * era o Curador (ou o Estruturador), inventando o papel de cada bloco a
 * partir da intenção geral. Agora a pessoa escreve; o agente detalha.
 *
 * É opcional por bloco (vazio = o Curador decide, como antes). Quando
 * preenchida, é a ÂNCORA da posição: vira o `componente` que o Curador lê,
 * a 1ª linha do purpose do blueprint e, por ele, chega à copy do n8n e ao
 * agente de imagem (`resolveStructure` + `combinarIntencaoComPapel`).
 * `mergeBlocks` a carrega para dentro do `ArchBlock` e `splitRow` a grava
 * de volta em `email_blueprints.blocks[].purpose` — nada de rota nova.
 *
 * O vocabulário é o das categorias da biblioteca — o mesmo que o Curador e o
 * Estruturador falam, e um `block_type` válido desde a migration 20261090.
 * A tela antiga oferecia 18 tipos técnicos; o que o pipeline consome de fato
 * são estas 8.
 *
 * O botão de imagem por bloco também SAIU. Ele acumulava três gestos num
 * ícone só (1º clique liga `needs_image`, 2º abre a direção de arte, Alt+
 * clique desliga) — indescobrível. `needs_image` e `image_brief` seguem no
 * dado, atravessando merge→split como o `purpose`, e o bloco novo herda a
 * regra do seed pelo `add()` abaixo. Se voltarem a precisar de edição, que
 * seja num painel próprio, não num ícone de três estados.
 */

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"
import type { ArchBlock } from "@/lib/email-architecture/types"
import { C, F } from "../ui/eg-theme"
import { CATEGORY_ICON, CategoryIcon } from "./category-icon"

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  COMPONENT_CATEGORIES.map((c) => [c.key, c.label]),
)

/** Rótulo curto para a linha e a paleta (o do DS é longo demais na tabela). */
const SHORT_LABEL: Record<string, string> = {
  header: "Header",
  hero: "Hero",
  body: "Body",
  products: "Produtos",
  reviews: "Prova Social",
  cta: "CTA",
  offer: "Oferta",
  footer: "Footer",
}

export const shortCategoryLabel = (key: string) =>
  SHORT_LABEL[key] ?? CATEGORY_LABEL[key] ?? key

const GRID = "40px minmax(0,1fr) 118px"

const th: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: C.g500,
  fontFamily: F.sans,
}

let seq = 0
const newId = () => `nb_${seq++}`

interface Props {
  blocks: ArchBlock[]
  onChange: (next: ArchBlock[]) => void
  /** Categorias que a Estrutura geral listava e a sequência não tem. */
  extras: string[]
}

const INTENCAO_MAX = 600

/**
 * Campo de intenção da posição. Uma linha vazia é discreta; com texto
 * cresce até 4 linhas. O contador só aparece perto do teto.
 */
function IntencaoDoBloco({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const linhas = Math.min(4, Math.max(1, value.split("\n").length + (value.length > 110 ? 1 : 0)))
  return (
    <div style={{ padding: "0 14px 8px 54px", display: "flex", flexDirection: "column", gap: 2 }}>
      <textarea
        value={value}
        rows={linhas}
        maxLength={INTENCAO_MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Intenção deste bloco — o que ele precisa fazer neste e-mail (vazio: o Curador decide)"
        aria-label="Intenção deste bloco"
        style={{
          width: "100%",
          resize: "none",
          border: `1px solid ${value.trim() ? C.border : "transparent"}`,
          borderRadius: 6,
          padding: "5px 8px",
          fontSize: 12.5,
          lineHeight: "17px",
          color: C.g900,
          background: value.trim() ? C.white : "transparent",
          fontFamily: F.sans,
          outline: "none",
          boxSizing: "border-box",
        }}
        onFocus={(e) => {
          e.currentTarget.style.border = `1px solid ${C.border}`
          e.currentTarget.style.background = C.white
        }}
        onBlur={(e) => {
          if (!e.currentTarget.value.trim()) {
            e.currentTarget.style.border = "1px solid transparent"
            e.currentTarget.style.background = "transparent"
          }
        }}
      />
      {value.length > INTENCAO_MAX - 80 && (
        <span style={{ fontSize: 11, color: C.g400, fontFamily: F.sans, alignSelf: "flex-end" }}>
          {value.length}/{INTENCAO_MAX}
        </span>
      )}
    </div>
  )
}

export function ArchBlocks({ blocks, onChange, extras }: Props) {
  const patch = (idx: number, p: Partial<ArchBlock>) =>
    onChange(blocks.map((b, i) => (i === idx ? { ...b, ...p } : b)))

  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir
    if (to < 0 || to >= blocks.length) return
    const next = blocks.slice()
    const [moved] = next.splice(idx, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  const add = (category: string) =>
    onChange([
      ...blocks,
      {
        id: newId(),
        category,
        label: shortCategoryLabel(category),
        purpose: "",
        // Espelha a regra do seed (`def.needs_image ?? def.type === "hero"`).
        // Gravar `false` cru num hero desligaria a imagem para sempre: o `??`
        // do seed não cobre `false`, e não há mais toggle na tela.
        needs_image: category === "hero",
        image_brief: null,
        legacy_type: null,
      },
    ])

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          background: C.g50,
          borderBottom: `1px solid ${C.border}`,
          padding: "9px 14px",
        }}
      >
        <span style={th}>Nº</span>
        <span style={th}>Tipo de bloco</span>
        <span style={{ ...th, textAlign: "right" }}>Ordem</span>
      </div>

      {blocks.length === 0 ? (
        <div
          style={{
            padding: "26px 14px",
            textAlign: "center",
            fontSize: 12.5,
            color: C.g400,
            fontFamily: F.sans,
          }}
        >
          Nenhum bloco. Monte a sequência pela paleta abaixo — a ordem aqui é a
          ordem no e-mail.
        </div>
      ) : (
        blocks.map((b, idx) => (
          <div
            key={b.id}
            style={{ borderBottom: `1px solid rgba(0,0,0,0.06)` }}
          >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              alignItems: "center",
              padding: "7px 14px 4px 14px",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.g400,
                fontFamily: F.sans,
              }}
            >
              {idx + 1}
            </span>

            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <CategoryIcon category={b.category} />
              <select
                value={b.category}
                onChange={(e) =>
                  patch(idx, {
                    category: e.target.value,
                    label: shortCategoryLabel(e.target.value),
                  })
                }
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.g900,
                  fontFamily: F.sans,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {COMPONENT_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {shortCategoryLabel(c.key)}
                  </option>
                ))}
              </select>
            </span>

            <span
              style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}
            >
              <IconBtn
                title="Subir"
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
              >
                <ArrowUp size={15} />
              </IconBtn>
              <IconBtn
                title="Descer"
                disabled={idx === blocks.length - 1}
                onClick={() => move(idx, 1)}
              >
                <ArrowDown size={15} />
              </IconBtn>
              <IconBtn
                title="Remover bloco"
                danger
                onClick={() => onChange(blocks.filter((_, i) => i !== idx))}
              >
                <Trash2 size={15} />
              </IconBtn>
            </span>
          </div>
          <IntencaoDoBloco
            value={b.purpose}
            onChange={(purpose) => patch(idx, { purpose })}
          />
          </div>
        ))
      )}

      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: C.g50,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: C.g500,
            fontFamily: F.sans,
          }}
        >
          Adicionar:
        </span>
        {COMPONENT_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => add(c.key)}
            title={c.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              color: C.g700,
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "5px 9px",
              cursor: "pointer",
              fontFamily: F.sans,
            }}
          >
            <CategoryIcon category={c.key} size={14} />
            {shortCategoryLabel(c.key)}
          </button>
        ))}
      </div>

      {extras.length > 0 && (
        <div
          style={{
            padding: "10px 14px",
            borderTop: `1px solid ${C.border}`,
            background: C.warnBg,
            color: C.warn,
            fontSize: 12,
            fontFamily: F.sans,
          }}
        >
          A Estrutura geral deste e-mail listava também{" "}
          <b>{extras.map(shortCategoryLabel).join(", ")}</b>, que a sequência
          não tem. Acrescente pela paleta se fizer sentido — salvar sem isso
          descarta a diferença.
        </div>
      )}

    </div>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: danger ? C.neg : C.g500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      {children}
    </button>
  )
}

export { CATEGORY_ICON }
