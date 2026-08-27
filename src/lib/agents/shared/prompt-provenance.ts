/**
 * prompt-provenance — segmentação do prompt por ORIGEM, no momento da
 * montagem (plano docs/architecture/plano-telemetria-proveniencia.md).
 *
 * O princípio: quem monta as vars de um prompt SABE de onde cada uma veio
 * (loja, biblioteca, vault, saída de outro agente…). Este módulo captura
 * essa informação enquanto o prompt é renderizado — nada é re-derivado
 * depois (a reconstrução a posteriori das runs de 24/08 é o modo de falha
 * que isto elimina).
 *
 * Invariante que os testes provam: a concatenação dos segmentos (resolvendo
 * refs pelo endpoint) é BYTE-IGUAL ao prompt enviado ao modelo. É o que
 * garante que a marcação não mente.
 *
 * Puro (zero I/O) — client-safe: a UI importa os tipos e as cores.
 */

import { resolveBlockHelpers } from "../image/template-renderer"

/** As 7 classes de proveniência (cores idênticas às dos artifacts). */
export type ProvClass =
  | "agente" // template do agente (in-code ou config da aba Agentes)
  | "loja" // dados da loja (client_stores, briefing, pesquisa, produtos)
  | "biblioteca" // biblioteca de componentes (catálogo, schemas, variantes)
  | "upstream" // saída de agente anterior do pipeline
  | "curadoria" // curadoria global (outlines, blueprints globais)
  | "vault" // material do vault (intenções, referências, aprendizados)
  | "sistema" // derivado por código (contagens, memória, anti-repetição)

export interface PromptSegment {
  cls: ProvClass
  /** Rótulo humano: "Dados da loja — client_stores", "SAÍDA do Curador"… */
  rotulo: string
  /** Texto do segmento. Ausente quando `ref` (segmento grande resolvível). */
  texto?: string
  chars: number
  /** Em qual mensagem o segmento viaja (a UI marca a fronteira). */
  parte?: "system" | "user"
  /** Segmento grande resolvível sob demanda (hoje só "catalogo"). */
  ref?: string
  /** sha256-hex-8 do conteúdo referenciado — a UI confere ao resolver. */
  sha8?: string
}

/** Item da aba Entrada estruturada (`input_summary`). */
export interface InputSummaryItem {
  rotulo: string
  cls: ProvClass
  valor: string
}

/** Origem declarada de UMA var do template. */
export interface SegmentOrigin {
  cls: ProvClass
  rotulo: string
  /**
   * Var cujo conteúdo NÃO vai no segmento (grande demais — caso único hoje:
   * o catálogo do Curador, ~120k). O segmento sai `{ref, sha8, chars}` e a
   * UI resolve via GET /api/admin/agents/prompt-segment. `sha8` obrigatório
   * junto (é a prova de que o resolvido é o que a run viu).
   */
  ref?: string
  sha8?: string
}

export interface SegmentedPromptResult {
  /** O prompt renderizado — byte-igual ao render de produção. */
  prompt: string
  /**
   * Segmentos na ordem. `null` só quando o corte é impossível — hoje,
   * nenhum caso conhecido: os block helpers são pré-resolvidos pela MESMA
   * função do renderer. O call site sempre confere a recomposição antes de
   * gravar, então um `null` aqui e uma divergência lá dão no mesmo:
   * a run guarda o prompt como texto, sem marcação.
   */
  segments: PromptSegment[] | null
}

// A MESMA regex de var simples do renderer de produção
// (image/template-renderer.ts:resolveSimpleVars) — o corte tem de cair
// exatamente onde o render cai, ou a recomposição deixa de ser byte-igual.
const SIMPLE_VAR_RE = /\{\{\s*([^#/\s}][^}]*?)\s*\}\}/g

/**
 * Dialeto de chave ÚNICA (`{VAR}`) — o do `renderImagePrompt`
 * (chains/image.chain.ts): `template.replace(/\{(\w+)\}/g, …)`.
 *
 * O prompt de imagem existe nos dois dialetos: `{{var}}` quando há config no
 * banco (renderImageTemplate) e `{var}` no default in-code. Cortar com a
 * regex errada produziria segmentos que não recompõem o prompt — e é
 * exatamente isso que o guard de recomposição do call site pega.
 */
const SINGLE_VAR_RE = /\{(\w+)\}/g

export type VarDialeto = "double" | "single"

function normalize(v: string | number | undefined | null): string {
  if (v === null || v === undefined) return ""
  return typeof v === "number" ? String(v) : v
}

const ROTULO_TEMPLATE = "Template do agente"

function pushSegment(
  out: PromptSegment[],
  seg: Omit<PromptSegment, "chars"> & { texto?: string },
): void {
  const chars = seg.texto?.length ?? 0
  if (chars === 0 && seg.ref == null) return // literal/var vazia não vira bloco
  if (seg.ref != null) {
    // ref: o texto NÃO viaja no segmento — só o endereço + hash + tamanho.
    out.push({
      cls: seg.cls,
      rotulo: seg.rotulo,
      chars,
      ...(seg.parte ? { parte: seg.parte } : {}),
      ref: seg.ref,
      ...(seg.sha8 ? { sha8: seg.sha8 } : {}),
    })
    return
  }
  const prev = out[out.length - 1]
  // Funde segmentos adjacentes da MESMA origem (dois literais separados por
  // var vazia, por exemplo) — menos ruído na UI, mesma recomposição.
  if (
    prev &&
    prev.ref == null &&
    prev.cls === seg.cls &&
    prev.rotulo === seg.rotulo &&
    prev.parte === seg.parte
  ) {
    prev.texto = (prev.texto ?? "") + (seg.texto ?? "")
    prev.chars = prev.texto.length
    return
  }
  out.push({
    cls: seg.cls,
    rotulo: seg.rotulo,
    texto: seg.texto ?? "",
    chars,
    ...(seg.parte ? { parte: seg.parte } : {}),
  })
}

/**
 * Renderiza um template PLAIN-VAR (sem `{{#if}}`/`{{#case}}`) segmentando
 * por origem — mesma semântica de `renderImageTemplate` para vars simples
 * (var desconhecida → "", nunca "undefined").
 *
 * - trecho literal do template → segmento `agente` ("Template do agente");
 * - var COM origem declarada → segmento com a origem;
 * - var SEM origem declarada → `sistema` + rótulo "(origem não declarada)"
 *   — visível na UI, nunca silencioso;
 * - origem com `ref` → segmento `{ref, sha8, chars}` sem texto (o prompt
 *   recomposto ainda carrega o texto — só o SEGMENTO não duplica).
 *
 * Template com `{{#if}}`/`{{#case}}`: os blocos são resolvidos ANTES do
 * corte, pela mesma função do renderer (`resolveBlockHelpers`) — o trecho
 * que sobreviveu ao condicional é template, e sai marcado como `agente`.
 */
export function buildSegmentedPrompt(
  template: string,
  vars: Record<string, string | number>,
  origins: Record<string, SegmentOrigin>,
  opts?: { parte?: "system" | "user"; dialeto?: VarDialeto },
): SegmentedPromptResult {
  const dialeto = opts?.dialeto ?? "double"
  // Block helper (`{{#if}}`/`{{#case}}`) só existe no dialeto `{{}}` — no
  // `{}` o renderer de imagem apenas substitui.
  //
  // Resolvidos ANTES do corte, pela MESMA função do renderer de produção:
  // o cortador sabe substituir vars, não executar condicional. Depois deste
  // passo o template é plano e o corte é exato; o trecho que sobreviveu ao
  // condicional É template, e sai marcado como tal. Era aqui que o
  // `campaign_image` (prompt do banco cheio de `{{#if}}`) ficava sem
  // proveniência nenhuma.
  const plano =
    dialeto === "double" && template.includes("{{#")
      ? resolveBlockHelpers(template, vars)
      : template

  const parte = opts?.parte
  const segments: PromptSegment[] = []
  let prompt = ""
  let cursor = 0

  const re = dialeto === "single" ? SINGLE_VAR_RE : SIMPLE_VAR_RE
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(plano)) !== null) {
    const literal = plano.slice(cursor, m.index)
    if (literal) {
      prompt += literal
      pushSegment(segments, { cls: "agente", rotulo: ROTULO_TEMPLATE, texto: literal, parte })
    }
    const name = m[1].trim()
    const value = normalize(vars[name])
    prompt += value
    const origin = origins[name]
    if (origin) {
      pushSegment(segments, {
        cls: origin.cls,
        rotulo: origin.rotulo,
        texto: value,
        parte,
        ...(origin.ref ? { ref: origin.ref, sha8: origin.sha8 } : {}),
      })
    } else {
      pushSegment(segments, {
        cls: "sistema",
        // O rótulo mostra o placeholder NO DIALETO do template — `{{x}}` num
        // template de chave única seria uma pista errada para quem procura.
        rotulo: `${m[0]} (origem não declarada)`,
        texto: value,
        parte,
      })
    }
    cursor = m.index + m[0].length
  }
  re.lastIndex = 0
  const tail = plano.slice(cursor)
  if (tail) {
    prompt += tail
    pushSegment(segments, { cls: "agente", rotulo: ROTULO_TEMPLATE, texto: tail, parte })
  }

  return { prompt, segments }
}

/**
 * Segmenta um SYSTEM montado por interpolação LITERAL (`interpolateSystem`
 * de llm-invoke.ts / o replaceAll do Estruturador): SÓ os placeholders das
 * chaves passadas são cortados; todo o resto — inclusive notação legítima
 * como `{{TAG}}` — fica byte a byte como segmento `agente`.
 *
 * Invariante: concat == interpolateSystem(systemPrompt, vars).
 */
export function buildInterpolatedSegments(
  systemPrompt: string,
  vars: Record<string, string>,
  origins: Record<string, SegmentOrigin>,
  opts?: { parte?: "system" | "user" },
): SegmentedPromptResult {
  const parte = opts?.parte
  const keys = Object.keys(vars)
  const segments: PromptSegment[] = []
  let prompt = ""

  // Varre o texto achando a PRÓXIMA ocorrência de qualquer `{{key}}` literal
  // (a mais à esquerda vence) — mesma ordem de substituição do replaceAll.
  let rest = systemPrompt
  for (;;) {
    let bestIdx = -1
    let bestKey: string | null = null
    for (const k of keys) {
      const idx = rest.indexOf(`{{${k}}}`)
      if (idx >= 0 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx
        bestKey = k
      }
    }
    if (bestKey === null) break
    const literal = rest.slice(0, bestIdx)
    if (literal) {
      prompt += literal
      pushSegment(segments, { cls: "agente", rotulo: ROTULO_TEMPLATE, texto: literal, parte })
    }
    const value = vars[bestKey]
    prompt += value
    const origin = origins[bestKey]
    if (origin) {
      pushSegment(segments, {
        cls: origin.cls,
        rotulo: origin.rotulo,
        texto: value,
        parte,
        ...(origin.ref ? { ref: origin.ref, sha8: origin.sha8 } : {}),
      })
    } else {
      pushSegment(segments, {
        cls: "sistema",
        rotulo: `{{${bestKey}}} (origem não declarada)`,
        texto: value,
        parte,
      })
    }
    rest = rest.slice(bestIdx + `{{${bestKey}}}`.length)
  }
  if (rest) {
    prompt += rest
    pushSegment(segments, { cls: "agente", rotulo: ROTULO_TEMPLATE, texto: rest, parte })
  }

  return { prompt, segments }
}

/** system + user numa lista só (a UI separa pela `parte`). */
export function concatSegments(
  ...parts: Array<PromptSegment[] | null | undefined>
): PromptSegment[] | null {
  // Qualquer parte fail-open (null) invalida o conjunto — meio prompt
  // segmentado mentiria sobre o todo.
  if (parts.some((p) => p == null)) return null
  return parts.flatMap((p) => p ?? [])
}

// ── Metadados de exibição (fonte única — UI e artifacts usam os mesmos) ──

export const PROV_CLASS_META: Record<
  ProvClass,
  { label: string; color: string; bg: string; border: string }
> = {
  agente: { label: "Template do agente", color: "#3F4045", bg: "#F5F5F3", border: "#9AA0A6" },
  loja: { label: "Dados da loja", color: "#1D4ED8", bg: "#EFF6FF", border: "#2563EB" },
  biblioteca: { label: "Biblioteca", color: "#6D28D9", bg: "#F5F3FF", border: "#7C3AED" },
  upstream: { label: "Saída de agente anterior", color: "#0F766E", bg: "#F0FDFA", border: "#0F766E" },
  curadoria: { label: "Curadoria global", color: "#BE185D", bg: "#FDF2F8", border: "#DB2777" },
  vault: { label: "Vault", color: "#0E7490", bg: "#ECFEFF", border: "#0E7490" },
  sistema: { label: "Derivado por código", color: "#B45309", bg: "#FFFBEB", border: "#C27803" },
}
