/**
 * rendered-reference — o exemplo renderizado de uma variante serve como
 * referência de acabamento? (story CM-6)
 *
 * O campo `rendered_html` foi criado como "exemplo real do email
 * renderizado, colado manualmente" — a intenção é ser o PADRÃO DE
 * ACABAMENTO da variante: como ela fica quando bem executada.
 *
 * Na prática, o que está cadastrado não corresponde a isso. O comentário em
 * `html/hero-graft.ts` registra a constatação de quem implementou o
 * enxerto: "o `rendered_html` das variantes é um mockup-imagem de ~1.7KB,
 * não HTML estrutural". Por isso o modo `library` do agente de hero manda o
 * campo VAZIO.
 *
 * Decisão de 30/jul: a intenção do campo está certa, os DADOS estão
 * errados. Este módulo mede o que existe (classificador) e garante que o
 * que for usado não esteja velho (hash de origem), para que o renderizado
 * possa voltar ao prompt variante por variante, conforme a curadoria arruma
 * a biblioteca.
 *
 * Puro (zero I/O) — testável.
 */

import { createHash } from "node:crypto"

import type { EmailComponentVariant } from "@/types/email-generation"

// ── Classificação ──────────────────────────────────────────────────────

export type RenderedKind =
  /** HTML de email de verdade — serve de espelho de acabamento. */
  | "structural"
  /** Print/mockup embrulhado em HTML — não descreve estrutura. */
  | "mockup"
  /** Não cadastrado. */
  | "empty"

/**
 * Abaixo disso não cabe um email renderizado: os mockups encontrados na
 * biblioteca têm ~1.7KB, quase todo ele o atributo `src` de uma imagem.
 */
const MIN_STRUCTURAL_CHARS = 2_500

/**
 * Um exemplo renderizado carrega a variante inteira com conteúdo real, então
 * costuma ser MAIOR que o HTML autoral. Muito menor que a metade é sinal de
 * que não há estrutura ali.
 */
const MIN_RATIO_TO_SOURCE = 0.5

/** Um email renderizado tem várias linhas de tabela; um mockup tem uma. */
const MIN_TABLE_ROWS = 3

/**
 * Proporção máxima do documento ocupada por `src=`. Um mockup-imagem é
 * essencialmente uma URL longa (data: ou CDN) dentro de casca mínima.
 */
const MAX_SRC_RATIO = 0.5

export interface ClassifyResult {
  kind: RenderedKind
  /** Por que não é estrutural (vazio quando é). */
  reasons: string[]
  chars: number
  rows: number
}

/**
 * Classifica o `rendered_html` de uma variante. Os thresholds são
 * explícitos e nomeados de propósito: são heurística sobre dados de
 * cadastro, não uma verdade — e o pior caso de errar para `mockup` é o
 * comportamento de hoje (não enviar).
 */
export function classifyRenderedHtml(
  html: string | null | undefined,
  sourceHtml?: string | null,
): ClassifyResult {
  const rendered = (html ?? "").trim()
  if (!rendered) {
    return { kind: "empty", reasons: [], chars: 0, rows: 0 }
  }

  const rows = (rendered.match(/<tr[\s>]/gi) ?? []).length
  const srcChars = (rendered.match(/\ssrc\s*=\s*["'][^"']*["']/gi) ?? []).join("")
    .length
  const reasons: string[] = []

  if (rendered.length < MIN_STRUCTURAL_CHARS) reasons.push("curto_demais")
  if (rows < MIN_TABLE_ROWS) reasons.push("poucas_linhas")
  if (srcChars > rendered.length * MAX_SRC_RATIO) reasons.push("dominado_por_src")

  const source = (sourceHtml ?? "").trim()
  if (source && rendered.length < source.length * MIN_RATIO_TO_SOURCE) {
    reasons.push("menor_que_a_fonte")
  }

  return {
    kind: reasons.length > 0 ? "mockup" : "structural",
    reasons,
    chars: rendered.length,
    rows,
  }
}

// ── Hash de origem ─────────────────────────────────────────────────────

/**
 * SHA do `html` que originou o renderizado.
 *
 * Por que hash e não timestamp: existe um único `updated_at` por linha.
 * Salvar só a descrição já o move sem invalidar o renderizado, e editar o
 * `html` por SQL não move nada. O hash responde exatamente a pergunta
 * certa — "este renderizado foi feito a partir DESTE html?".
 */
export function sourceSha(html: string | null | undefined): string {
  return createHash("sha256")
    .update((html ?? "").trim(), "utf8")
    .digest("hex")
}

// ── Resolução para o prompt ────────────────────────────────────────────

export type RenderedSkipReason =
  /** Não cadastrado. */
  | "empty"
  /** Print/mockup — não serve de espelho. */
  | "mockup"
  /** O `html` mudou depois que o renderizado foi salvo. */
  | "stale"
  /** Cadastrado antes do hash existir: validade desconhecida. */
  | "unknown_sha"

export interface ResolvedRenderedReference {
  /** HTML a enviar ao agente, ou null quando não deve ser enviado. */
  html: string | null
  reason: RenderedSkipReason | null
  /** Para o selo dos logs (CM-7): o renderizado existe mas está velho. */
  stale: boolean
  kind: RenderedKind
}

type VariantLike = Pick<EmailComponentVariant, "html" | "rendered_html"> & {
  rendered_html_source_sha?: string | null
}

/**
 * Decide se o renderizado vai ao prompt. Só passa quando é estrutural E o
 * hash bate com o `html` atual — um exemplo de acabamento que descreve uma
 * versão antiga da variante é pior que exemplo nenhum.
 */
export function resolveRenderedReference(
  variant: VariantLike,
): ResolvedRenderedReference {
  const classified = classifyRenderedHtml(
    variant.rendered_html,
    variant.html,
  )

  if (classified.kind === "empty") {
    return { html: null, reason: "empty", stale: false, kind: "empty" }
  }
  if (classified.kind === "mockup") {
    return { html: null, reason: "mockup", stale: false, kind: "mockup" }
  }

  const stored = variant.rendered_html_source_sha?.trim()
  if (!stored) {
    // Backfill deixa NULL nas variantes antigas: "validade desconhecida" é
    // tratado como desatualizado até alguém regravar o exemplo.
    return {
      html: null,
      reason: "unknown_sha",
      stale: true,
      kind: "structural",
    }
  }
  if (stored !== sourceSha(variant.html)) {
    return { html: null, reason: "stale", stale: true, kind: "structural" }
  }

  return {
    html: (variant.rendered_html ?? "").trim(),
    reason: null,
    stale: false,
    kind: "structural",
  }
}
