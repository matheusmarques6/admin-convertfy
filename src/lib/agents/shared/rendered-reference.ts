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
 * errados — e o exemplo vai ao agente MESMO ASSIM. Um print ainda mostra o
 * acabamento pretendido (proporções, hierarquia, peso visual), e a
 * estrutura o agente tira do `html` da variante, não do exemplo.
 *
 * Este módulo então não decide se o exemplo é bom o bastante para ir; ele
 * MEDE (classificador) e detecta desatualização (hash de origem) para
 * alimentar o selo dos logs e o aviso na aba Componentes. A curadoria usa
 * isso para saber onde melhorar; o pipeline usa o exemplo do jeito que
 * estiver.
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
 * cadastro, não uma verdade. Errar aqui não muda o que o agente recebe —
 * a classificação informa, não bloqueia.
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

/**
 * Por que o exemplo NÃO chegou ao agente. Só uma razão é bloqueante hoje —
 * `empty`, que é ausência de dado. As demais são ADVERTÊNCIAS: acompanham o
 * envio em vez de impedi-lo.
 */
export type RenderedSkipReason =
  /** Não cadastrado — a única razão que realmente impede o envio. */
  | "empty"

/** Ressalva sobre o exemplo enviado. Informa, não bloqueia. */
export type RenderedCaveat =
  /** Parece print embrulhado em HTML, não email estrutural. */
  | "mockup"
  /** O `html` mudou depois que o exemplo foi salvo. */
  | "stale"
  /** Cadastrado antes do hash existir: validade desconhecida. */
  | "unknown_sha"

export interface ResolvedRenderedReference {
  /** HTML a enviar ao agente. Null só quando não há exemplo cadastrado. */
  html: string | null
  /** Razão de não enviar (hoje, só ausência). */
  reason: RenderedSkipReason | null
  /** Ressalvas sobre o que foi enviado — telemetria e aviso na UI. */
  caveats: RenderedCaveat[]
  /** Para o selo dos logs: o exemplo existe mas não corresponde ao html. */
  stale: boolean
  kind: RenderedKind
}

type VariantLike = Pick<EmailComponentVariant, "html" | "rendered_html"> & {
  rendered_html_source_sha?: string | null
}

/**
 * Resolve o exemplo renderizado para o prompt.
 *
 * **Decisão de 30/jul (Matheus): o exemplo SEMPRE vai quando existe.**
 * Classificar como mockup ou detectar hash divergente não impede o envio —
 * vira ressalva registrada, não bloqueio. A razão é simples: mesmo um print
 * mostra o acabamento pretendido (proporções, hierarquia, peso visual), e o
 * agente já tem no prompt que a estrutura vem do `html` da variante, não do
 * exemplo. Perder o espelho custa mais do que usá-lo com ressalva.
 *
 * O que a classificação e o hash continuam fazendo: alimentar o selo dos
 * logs e o aviso na aba Componentes, para a curadoria saber onde melhorar.
 */
export function resolveRenderedReference(
  variant: VariantLike,
): ResolvedRenderedReference {
  const classified = classifyRenderedHtml(variant.rendered_html, variant.html)

  if (classified.kind === "empty") {
    return {
      html: null,
      reason: "empty",
      caveats: [],
      stale: false,
      kind: "empty",
    }
  }

  const caveats: RenderedCaveat[] = []
  if (classified.kind === "mockup") caveats.push("mockup")

  const stored = variant.rendered_html_source_sha?.trim()
  if (!stored) {
    // Backfill deixa NULL nas variantes antigas: sem saber de qual versão do
    // html o exemplo veio, a validade é desconhecida.
    caveats.push("unknown_sha")
  } else if (stored !== sourceSha(variant.html)) {
    caveats.push("stale")
  }

  return {
    html: (variant.rendered_html ?? "").trim(),
    reason: null,
    caveats,
    // `stale` no sentido do selo: o exemplo não corresponde ao html atual.
    stale: caveats.includes("stale") || caveats.includes("unknown_sha"),
    kind: classified.kind,
  }
}
