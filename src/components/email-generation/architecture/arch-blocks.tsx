"use client"

/**
 * Tabela de blocos do e-mail (Nº · Tipo · ordem) + a paleta das 8 categorias.
 *
 * A maquete previa uma coluna "O que entra nele" (o `purpose` de cada bloco);
 * ela SAIU de propósito. Os três guias do topo — Intenção, O e-mail deve, O
 * e-mail não deve — já dão a direção editorial do e-mail inteiro, e repeti-la
 * por bloco obrigava a reescrever a mesma coisa fatiada em 6 a 16 linhas.
 * Aqui se desenha a SEQUÊNCIA; o que ela diz vem de cima.
 *
 * O `purpose` continua existindo no dado e chegando ao n8n: `mergeBlocks` o
 * carrega para dentro do `ArchBlock` e `splitRow` o grava de volta, então ele
 * atravessa a edição sem ser tocado. Sem UI, mas sem perda.
 *
 * O vocabulário é o das categorias da biblioteca — o mesmo que o Curador e o
 * Estruturador falam, e um `block_type` válido desde a migration 20261090.
 * A tela antiga oferecia 18 tipos técnicos; o que o pipeline consome de fato
 * são estas 8.
 *
 * O popover de direção de arte veio do `blueprint-blocks-editor` que esta
 * tela substitui: `image_brief` não tem outro editor no admin, e some com
 * ele se não for portado.
 */

import { useState } from "react"
import { ArrowDown, ArrowUp, Image as ImageIcon, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"
import type { ArchBlock } from "@/lib/email-architecture/types"
import { C, F } from "../ui/eg-theme"
import { EGBtn } from "../ui/eg-atoms"
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

export function ArchBlocks({ blocks, onChange, extras }: Props) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState("")

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
        needs_image: false,
        image_brief: null,
        legacy_type: null,
      },
    ])

  const openArt = (idx: number) => {
    setDraft(blocks[idx].image_brief ?? "")
    setEditing(idx)
  }

  const applyArt = () => {
    if (editing == null) return
    patch(editing, { image_brief: draft.trim() || null })
    setEditing(null)
  }

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
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              alignItems: "center",
              padding: "7px 14px",
              borderBottom: `1px solid rgba(0,0,0,0.06)`,
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
                title={
                  b.needs_image
                    ? "Bloco com imagem gerada — editar a direção de arte"
                    : "Marcar que este bloco leva imagem gerada"
                }
                active={b.needs_image}
                onClick={() =>
                  b.needs_image
                    ? openArt(idx)
                    : patch(idx, { needs_image: true })
                }
                onAltClick={
                  b.needs_image
                    ? () => patch(idx, { needs_image: false, image_brief: null })
                    : undefined
                }
              >
                <ImageIcon size={15} />
              </IconBtn>
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

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Direção de arte do bloco</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Descreva a imagem deste bloco. Ex: Fachada de loja física com vitrine que sugere o nicho; placa em branco para o logo."
          />
          <p style={{ fontSize: 11, color: C.g400, fontFamily: F.sans }}>
            Aplica ao bloco. Salve a sequência para persistir. Clique com Alt no
            ícone da imagem para desmarcar o bloco.
          </p>
          <DialogFooter>
            <EGBtn onClick={() => setEditing(null)}>Cancelar</EGBtn>
            <EGBtn variant="dark" onClick={applyArt}>
              Aplicar
            </EGBtn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  onAltClick,
  disabled,
  title,
  danger,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  onAltClick?: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => (e.altKey && onAltClick ? onAltClick() : onClick())}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        border: "none",
        background: active ? C.blue50 : "transparent",
        color: danger ? C.neg : active ? C.brand : C.g500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      {children}
    </button>
  )
}

export { CATEGORY_ICON }
