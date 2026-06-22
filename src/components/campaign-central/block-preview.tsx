"use client"

import type { CopyResultEntry, EmailDraftBlock } from "@/types/campaign-central"

/**
 * Helpers de visualização de copy por loja — compartilhados entre o
 * CopyPanel (painel lateral) e o CopyPreviewModal (pop-up). Extraídos
 * pra que os dois renderizem os blocos e derivem o status de forma idêntica.
 */

/** Serializa a copy (assunto + preview + blocos) em texto pra clipboard. */
export function copyBlocksToText(entry: CopyResultEntry): string {
  const lines: string[] = []
  lines.push(`Assunto: ${entry.subject}`)
  lines.push(`Preview: ${entry.preheader ?? entry.preview}`)
  lines.push("")
  for (const block of entry.blocks ?? []) {
    switch (block.type) {
      case "heading":
        if (block.headline) lines.push(`# ${block.headline}`)
        if (block.sub) lines.push(block.sub)
        lines.push("")
        break
      case "text":
        if (block.value) lines.push(block.value, "")
        break
      case "image":
        if (block.caption) lines.push(`[Imagem: ${block.caption}]`, "")
        break
      case "offer":
        if (block.value) lines.push(`>> ${block.value}`, "")
        break
      case "button":
        if (block.value) lines.push(`>> [${block.value}]`, "")
        break
      case "divider":
        lines.push("---", "")
        break
      case "footer":
        if (block.value) lines.push(block.value)
        break
      case "products":
        for (const item of block.items ?? []) {
          lines.push(`• ${item.name ?? "Produto"} — ${item.price ?? ""}`)
        }
        lines.push("")
        break
    }
  }
  return lines.join("\n").trim()
}

export type CopyStatusKind = "pending" | "error" | "approved" | "ready"

/**
 * Deriva o estado de uma copy por loja a partir SÓ da entry persistida.
 * `pending` = dispatch enfileirado, copy ainda não chegou. `ready` = copy
 * chegou e aguarda avaliação. Usado pela flag de status nos cards e no pop-up.
 */
export function copyStatusMeta(entry: CopyResultEntry): { kind: CopyStatusKind; label: string } {
  if (entry.status === "pending") return { kind: "pending", label: "Gerando…" }
  if (entry.status === "error") return { kind: "error", label: "Erro" }
  if (entry.quality === "good") return { kind: "approved", label: "Aprovada" }
  return { kind: "ready", label: "em avaliação" }
}

/** Render read-only de um bloco do email (esqueleto + copy adaptada). */
export function BlockPreview({ block }: { block: EmailDraftBlock }) {
  switch (block.type) {
    case "image":
      return (
        <div className="rounded-[4px] border border-dashed border-border bg-muted px-2 py-3 font-mono text-[10.5px] text-muted-foreground">
          [Imagem] {block.caption ?? ""}
        </div>
      )
    case "heading":
      return (
        <div>
          <div className="text-[17px] font-bold leading-snug text-foreground">
            {block.headline ?? "—"}
          </div>
          {block.sub && (
            <div className="mt-1 text-[13px] text-muted-foreground">{block.sub}</div>
          )}
        </div>
      )
    case "text":
      return (
        <div className="text-[13px] leading-relaxed text-foreground/85">{block.value}</div>
      )
    case "offer":
      return (
        <div className="rounded-[4px] border border-primary/20 bg-primary/5 px-3 py-2.5 text-center text-[13px] font-semibold text-primary">
          {block.value}
        </div>
      )
    case "button":
      return (
        <div className="text-center">
          <span className="inline-block rounded-[4px] bg-primary px-5 py-2.5 text-[13px] font-semibold text-white">
            {block.value}
          </span>
        </div>
      )
    case "divider":
      return <hr className="border-border" />
    case "footer":
      return (
        <div className="text-center text-[11px] leading-relaxed text-muted-foreground/70">
          {block.value}
        </div>
      )
    case "products": {
      const cols = block.columns ?? 3
      return (
        <div className={`grid gap-3 ${cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {(block.items ?? []).map((it, i) => (
            <div key={i} className="rounded-[4px] border border-border bg-card p-2">
              <div className="mb-1.5 h-20 rounded-[3px] border border-dashed border-border/70 bg-muted/60" />
              <div className="truncate text-[12px] font-semibold text-foreground">
                {it.name ?? "—"}
              </div>
              <div className="text-[12px] font-bold text-primary">{it.price ?? ""}</div>
            </div>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}
