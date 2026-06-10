"use client"

import { useState } from "react"
import { Plus, X, Copy, GripVertical, Trash2, Type, FileText, Image as ImageIcon, Zap, MousePointerClick, Minus } from "lucide-react"
import { BlockContent } from "./block-content"
import { defaultBlock } from "./default-draft"
import type { EmailDraftBlock } from "@/types/campaign-central"

const BLOCK_NAME: Record<string, string> = {
  heading: "Cabeçalho",
  text: "Texto",
  image: "Imagem",
  offer: "Oferta · destaque",
  button: "Botão",
  divider: "Divisória",
  footer: "Rodapé",
}

const BLOCK_CATALOG: Array<{ type: EmailDraftBlock["type"]; label: string; Icon: typeof Type }> = [
  { type: "heading", label: "Cabeçalho", Icon: Type },
  { type: "text", label: "Texto", Icon: FileText },
  { type: "image", label: "Imagem", Icon: ImageIcon },
  { type: "offer", label: "Oferta", Icon: Zap },
  { type: "button", label: "Botão", Icon: MousePointerClick },
  { type: "divider", label: "Divisória", Icon: Minus },
]

interface Props {
  blocks: EmailDraftBlock[]
  mobile: boolean
  onChange: (blocks: EmailDraftBlock[]) => void
}

export function BlockCanvas({ blocks, mobile, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const updateBlock = (id: string, patch: Partial<EmailDraftBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  const removeBlock = (id: string) => onChange(blocks.filter((b) => b.id !== id))

  const copyBlock = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id)
    if (i < 0) return
    const dup = { ...blocks[i], id: defaultBlock(blocks[i].type).id }
    const next = [...blocks]
    next.splice(i + 1, 0, dup)
    onChange(next)
  }

  const addBlock = (type: EmailDraftBlock["type"]) => {
    onChange([...blocks, defaultBlock(type)])
    setAddOpen(false)
  }

  const reorder = (fromId: string | null, toId: string) => {
    if (!fromId || fromId === toId) return
    const arr = [...blocks]
    const fi = arr.findIndex((b) => b.id === fromId)
    const ti = arr.findIndex((b) => b.id === toId)
    if (fi < 0 || ti < 0) return
    const [moved] = arr.splice(fi, 1)
    arr.splice(ti, 0, moved)
    onChange(arr)
  }

  return (
    <>
      {blocks.map((b) => (
        <div
          key={b.id}
          className={`group border-b border-border/50 px-4 py-3.5 transition-colors ${
            dragId === b.id ? "bg-muted/60" : ""
          } ${overId === b.id && dragId !== b.id ? "border-t-2 border-t-primary" : "border-t-2 border-t-transparent"}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (overId !== b.id) setOverId(b.id)
          }}
          onDrop={(e) => {
            e.preventDefault()
            reorder(dragId, b.id)
            setOverId(null)
            setDragId(null)
          }}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground/70">
              {BLOCK_NAME[b.type] ?? b.type}
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => copyBlock(b.id)}
                title="Duplicar bloco"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <Copy size={13} />
              </button>
              <span
                draggable
                onDragStart={() => setDragId(b.id)}
                onDragEnd={() => {
                  setDragId(null)
                  setOverId(null)
                }}
                title="Arraste para reordenar"
                className="cursor-grab rounded p-0.5 text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical size={14} />
              </span>
              <button
                onClick={() => removeBlock(b.id)}
                title="Remover bloco"
                className="rounded p-0.5 text-muted-foreground/60 hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <BlockContent block={b} mobile={mobile} onUpdate={(patch) => updateBlock(b.id, patch)} />
        </div>
      ))}

      {/* Adicionar bloco */}
      <div className="bg-muted/30 p-3.5">
        {!addOpen ? (
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-border bg-card py-2.5 text-[12.5px] font-semibold text-primary hover:border-primary/40"
          >
            <Plus size={14} /> Adicionar bloco
          </button>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                Escolha um bloco
              </span>
              <button
                onClick={() => setAddOpen(false)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BLOCK_CATALOG.map(({ type, label, Icon }) => (
                <button
                  key={type}
                  onClick={() => addBlock(type)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:border-primary/40 hover:text-primary"
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
