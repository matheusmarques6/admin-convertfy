"use client"

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
    default:
      return null
  }
}
