"use client"

import { AlertTriangle } from "lucide-react"
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
    // Cabeçalho de seção (HERO/REVIEW/FOOTER…) pra "Copiar tudo" sair seccionado.
    if (block.section) lines.push(`## ${block.section}`, "")
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

/** Rótulo de contagem: "N seções" quando os blocos têm rótulo de seção
 *  (HERO/REVIEW/FOOTER…); senão "N blocos" — comportamento antigo. */
export function blockCountLabel(blocks: EmailDraftBlock[]): string {
  const n = blocks.length
  if (blocks.some((b) => b.section)) return `${n} ${n === 1 ? "seção" : "seções"}`
  return `${n} ${n === 1 ? "bloco" : "blocos"}`
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

export type CopyOriginTone = "n8n" | "ai" | "fallback" | "legacy"

/**
 * Deriva um rótulo de ORIGEM da copy a partir de `generated_via`. Existe pra
 * que o COO nunca confunda a copy real do n8n com o fallback genérico que o
 * watchdog injeta quando o n8n não responde a tempo — foi a causa de uma
 * confusão real. Retorna `null` quando a origem é desconhecida (entries antigas
 * sem o campo), pra não poluir a UI nesses casos.
 */
export function copyOriginMeta(
  entry: CopyResultEntry,
): { label: string; tone: CopyOriginTone } | null {
  switch (entry.generated_via) {
    case "n8n":
      return { label: "via n8n", tone: "n8n" }
    case "ai_master_adapt":
      return { label: "via IA", tone: "ai" }
    case "inline_fallback":
      return { label: "fallback genérica", tone: "fallback" }
    case "subject_only_legacy":
      return { label: "legado", tone: "legacy" }
    default:
      return null
  }
}

/**
 * Badge compacto de origem da copy. `fallback` ganha tom de aviso (âmbar) pra
 * sinalizar que NÃO é a copy do n8n; as demais origens usam tom neutro. Renderiza
 * `null` quando a origem é desconhecida.
 */
export function CopyOriginBadge({ entry }: { entry: CopyResultEntry }) {
  const origin = copyOriginMeta(entry)
  if (!origin) return null
  const isFallback = origin.tone === "fallback"
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[10px] font-semibold ${
        isFallback
          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400"
          : "border-border bg-muted/50 text-muted-foreground"
      }`}
      title={
        isFallback
          ? "Copy genérica de fallback — o n8n não respondeu a tempo. Não é a copy gerada pelo n8n."
          : `Origem da copy: ${origin.label}`
      }
    >
      {isFallback && <AlertTriangle size={10} />}
      {origin.label}
    </span>
  )
}

/** Primeiro campo de texto não-vazio (após trim). O n8n às vezes coloca o
 *  conteúdo num campo diferente do canônico do tipo (ex.: texto em `headline`
 *  num bloco que a normalização converteu pra `text`, que só lê `value`);
 *  varrer os campos evita que conteúdo real "suma" do preview. */
function firstNonEmpty(...vals: Array<string | undefined>): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v
  }
  return ""
}

/** Marca visível pra um bloco sem conteúdo. Garante que TODO bloco ocupe
 *  espaço — senão o "(N blocos)" do rótulo não bate com o que aparece na tela
 *  (blocos vazios sumiam como um <div> de altura ~0). Tom âmbar discreto pra
 *  sinalizar "vazio" sem competir com a copy real. */
function EmptyBlockMark({ kind }: { kind: string }) {
  return (
    <div className="rounded-[4px] border border-dashed border-amber-300/60 bg-amber-50/40 px-2.5 py-1.5 text-[11px] italic text-amber-700/80 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-500/80">
      bloco de {kind} sem conteúdo
    </div>
  )
}

/** Corpo de um bloco (render por tipo). O cabeçalho de seção é adicionado pelo
 *  BlockPreview wrapper. Nenhum bloco renderiza vazio: ou mostra o conteúdo (de
 *  qualquer campo disponível), ou uma marca de "sem conteúdo" — pra o total do
 *  rótulo bater com a tela. */
function BlockBody({ block }: { block: EmailDraftBlock }) {
  switch (block.type) {
    case "image":
      return (
        <div className="rounded-[4px] border border-dashed border-border bg-muted px-2 py-3 font-mono text-[10.5px] text-muted-foreground">
          [Imagem] {firstNonEmpty(block.caption, block.value, block.headline)}
        </div>
      )
    case "heading": {
      const head = firstNonEmpty(block.headline, block.value)
      const sub = firstNonEmpty(block.sub, block.caption)
      if (!head && !sub) return <EmptyBlockMark kind="título" />
      return (
        <div>
          {head && (
            <div className="text-[17px] font-bold leading-snug text-foreground">{head}</div>
          )}
          {sub && <div className="mt-1 text-[13px] text-muted-foreground">{sub}</div>}
        </div>
      )
    }
    case "text": {
      const txt = firstNonEmpty(block.value, block.headline, block.sub, block.caption)
      return txt ? (
        <div className="text-[13px] leading-relaxed text-foreground/85">{txt}</div>
      ) : (
        <EmptyBlockMark kind="texto" />
      )
    }
    case "offer": {
      const txt = firstNonEmpty(block.value, block.headline, block.caption)
      return txt ? (
        <div className="rounded-[4px] border border-primary/20 bg-primary/5 px-3 py-2.5 text-center text-[13px] font-semibold text-primary">
          {txt}
        </div>
      ) : (
        <EmptyBlockMark kind="oferta" />
      )
    }
    case "button": {
      const txt = firstNonEmpty(block.value, block.headline, block.caption)
      return txt ? (
        <div className="text-center">
          <span className="inline-block rounded-[4px] bg-primary px-5 py-2.5 text-[13px] font-semibold text-white">
            {txt}
          </span>
        </div>
      ) : (
        <EmptyBlockMark kind="botão" />
      )
    }
    case "divider":
      return <hr className="border-border" />
    case "footer": {
      const txt = firstNonEmpty(block.value, block.sub, block.caption)
      return txt ? (
        <div className="text-center text-[11px] leading-relaxed text-muted-foreground/70">
          {txt}
        </div>
      ) : (
        <EmptyBlockMark kind="rodapé" />
      )
    }
    case "products": {
      const items = block.items ?? []
      if (items.length === 0) return <EmptyBlockMark kind="produtos" />
      const cols = block.columns ?? 3
      return (
        <div className={`grid gap-3 ${cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {items.map((it, i) => (
            <div key={i} className="rounded-[4px] border border-border bg-card p-2">
              <div className="mb-1.5 flex h-20 items-center justify-center rounded-[3px] border border-dashed border-border/70 bg-muted/60 px-1.5 text-center text-[10px] leading-tight text-muted-foreground">
                {it.image_caption ?? ""}
              </div>
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
      return <EmptyBlockMark kind="desconhecido" />
  }
}

/** Render read-only de um bloco. Quando o bloco tem `section` (HERO/REVIEW/
 *  FOOTER…), exibe um cabeçalho de seção acima do conteúdo — é o que separa
 *  visualmente a copy pros designers. Sem ele, renderiza só o corpo. */
export function BlockPreview({ block }: { block: EmailDraftBlock }) {
  if (!block.section) return <BlockBody block={block} />
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-foreground/70">
          {block.section}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <BlockBody block={block} />
    </div>
  )
}
