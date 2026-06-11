"use client"

import { Trash2 } from "lucide-react"
import { EditBlock } from "./edit-block"
import type { EmailDraftBlock } from "@/types/campaign-central"

export function BlockContent({
  block,
  mobile,
  onUpdate,
}: {
  block: EmailDraftBlock
  mobile: boolean
  onUpdate: (patch: Partial<EmailDraftBlock>) => void
}) {
  switch (block.type) {
    case "image":
      return (
        <div
          className={`flex items-center justify-center rounded-[6px] border border-dashed border-border font-mono text-[11px] text-muted-foreground ${
            mobile ? "h-[120px]" : "h-[150px]"
          }`}
          style={{
            background:
              "repeating-linear-gradient(45deg, #F8FAFC, #F8FAFC 10px, #F3F4F6 10px, #F3F4F6 20px)",
          }}
        >
          {block.caption}
        </div>
      )
    case "heading":
      return (
        <div>
          <EditBlock
            value={block.headline}
            onChange={(v) => onUpdate({ headline: v })}
            placeholder="Título principal"
            className={`font-bold leading-tight tracking-tight text-foreground ${
              mobile ? "text-[18px]" : "text-[21px]"
            }`}
          />
          <EditBlock
            value={block.sub}
            onChange={(v) => onUpdate({ sub: v })}
            placeholder="Subtítulo"
            className={`mt-1 text-muted-foreground ${mobile ? "text-[13px]" : "text-[14px]"}`}
          />
        </div>
      )
    case "text":
      return (
        <EditBlock
          value={block.value}
          onChange={(v) => onUpdate({ value: v })}
          placeholder="Corpo do email"
          className={`leading-relaxed text-muted-foreground ${mobile ? "text-[13px]" : "text-[13.5px]"}`}
        />
      )
    case "offer":
      return (
        <div className="rounded-[6px] border border-primary/20 bg-primary/5 px-3 py-2.5">
          <EditBlock
            value={block.value}
            onChange={(v) => onUpdate({ value: v })}
            placeholder="Oferta em destaque"
            className="text-center text-[13.5px] font-semibold text-primary"
          />
        </div>
      )
    case "button":
      return (
        <div className="text-center">
          <div className="inline-block rounded-[6px] bg-primary px-5 py-2.5">
            <EditBlock
              value={block.value}
              onChange={(v) => onUpdate({ value: v })}
              placeholder="Texto do botão"
              className="text-[14px] font-semibold text-white hover:bg-white/10 focus:bg-white/10"
            />
          </div>
        </div>
      )
    case "divider":
      return <div className="my-1 h-px bg-border" />
    case "footer":
      return (
        <EditBlock
          value={block.value}
          onChange={(v) => onUpdate({ value: v })}
          placeholder="Rodapé"
          className="text-center text-[11px] leading-normal text-muted-foreground/80"
        />
      )
    case "products": {
      const items = block.items ?? []
      const cols = block.columns ?? 3
      // mobile sempre 2 colunas (cabe melhor); desktop respeita columns
      const gridCols = mobile ? "grid-cols-2" : cols === 2 ? "grid-cols-2" : "grid-cols-3"

      const updateItem = (idx: number, patch: Partial<NonNullable<typeof items>[number]>) => {
        const next = [...items]
        next[idx] = { ...next[idx], ...patch }
        onUpdate({ items: next })
      }
      const removeItem = (idx: number) => {
        const next = items.filter((_, i) => i !== idx)
        onUpdate({ items: next })
      }
      const addItem = () => {
        onUpdate({ items: [...items, { name: "Produto", price: "R$ —" }] })
      }
      const setCols = (c: 2 | 3) => onUpdate({ columns: c })

      return (
        <div>
          <div className="mb-2 flex items-center justify-end gap-3 text-[10.5px]">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground/70">
              Colunas:
            </span>
            {[2, 3].map((c) => (
              <button
                key={c}
                onClick={() => setCols(c as 2 | 3)}
                className={`rounded-[4px] border px-2 py-0.5 font-semibold ${
                  cols === c
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className={`grid gap-2.5 ${gridCols}`}>
            {items.map((item, i) => (
              <div
                key={i}
                className="group/item relative rounded-[6px] border border-border bg-card p-2"
              >
                <button
                  onClick={() => removeItem(i)}
                  className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground/40 opacity-0 hover:text-red-600 group-hover/item:opacity-100"
                  title="Remover produto"
                >
                  <Trash2 size={11} />
                </button>
                <div
                  className="mb-1.5 flex items-center justify-center rounded-[4px] border border-dashed border-border font-mono text-[9.5px] text-muted-foreground/70"
                  style={{
                    height: mobile ? 70 : 90,
                    background:
                      "repeating-linear-gradient(45deg, #F8FAFC, #F8FAFC 8px, #F3F4F6 8px, #F3F4F6 16px)",
                  }}
                >
                  produto
                </div>
                <EditBlock
                  value={item.name}
                  onChange={(v) => updateItem(i, { name: v })}
                  placeholder="Nome do produto"
                  className="truncate text-[11.5px] font-semibold text-foreground"
                />
                <EditBlock
                  value={item.price}
                  onChange={(v) => updateItem(i, { price: v })}
                  placeholder="Preço"
                  className="text-[11px] font-bold text-primary"
                />
              </div>
            ))}
          </div>
          {items.length < 6 && (
            <button
              onClick={addItem}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-[4px] border border-dashed border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              + Adicionar produto
            </button>
          )}
        </div>
      )
    }
    default:
      return null
  }
}
