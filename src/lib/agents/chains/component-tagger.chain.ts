/**
 * Component Tagger Chain — Taguedor de Variantes (migration 20261040).
 *
 * Converte o HTML "exemplo pronto" de uma variante da biblioteca em
 * html_tagged: cada frase/URL de exemplo do output_schema vira o
 * placeholder {{UPPER(key)}}. Roda 1x por variante (cadastro/batch),
 * NUNCA por geração — o resultado fica como proposta PENDENTE revisável
 * (aba Componentes) e só entra no pipeline depois de aprovado.
 *
 * Modos de ancoragem por campo (relatório em tagging_meta):
 *   exact/fuzzy    — o example foi encontrado no HTML (match direto).
 *   inference      — example ausente (src="", frase editada): o LLM
 *                    escolheu a âncora mais provável; revisar com atenção.
 *   existing_tag   — o HTML já tinha {{TAG}} equivalente (modo sync).
 *   not_found      — sem âncora defensável; campo fica de fora.
 *
 * Config em email_agent_configs (agent_type='component_tagger'); prompt
 * vazio → defaults abaixo. Modelo default moonshotai/kimi-k3 (swap 20261047; seed original 20261040).
 */

import { logger } from "@/lib/logger"
import type {
  ComponentOutputField,
  TaggingFieldReport,
} from "@/types/email-generation"
import { auditSchemaTags } from "@/lib/email-workspace/schema-tag-coherence"
import { placeholderForKey } from "../shared/component-dimensions"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"

// Fonte única em shared/component-dimensions (client-safe pra UI de
// revisão); re-export mantém os importadores do chain funcionando.
export { placeholderForKey }

const log = logger.child("ComponentTaggerChain")

const DEFAULT_TIMEOUT_MS = 240_000
const timeoutMs = () => {
  const env = Number(process.env.COMPONENT_TAGGER_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const TAGGED_HTML_OPEN = "<CFY_TAGGED_HTML>"
export const TAGGED_HTML_CLOSE = "</CFY_TAGGED_HTML>"
export const TAGGING_REPORT_OPEN = "<CFY_TAGGING_REPORT>"
export const TAGGING_REPORT_CLOSE = "</CFY_TAGGING_REPORT>"

export class TaggerOutputInvalidError extends Error {
  readonly raw: string
  constructor(message: string, raw = "") {
    super(message)
    this.name = "TaggerOutputInvalidError"
    this.raw = raw
  }
}

export const DEFAULT_TAGGER_SYSTEM_PROMPT = `<role>
You are the VARIANT TAGGER of an email component library. A designer authored this component as a FINISHED example: the HTML contains real example phrases and image URLs. The schema describes each generated field: its key IS the placeholder name (uppercased), and its "example" references the exact phrase/URL sitting in the HTML. Your job: return the SAME HTML where every schema field is addressed by its own placeholder {{UPPER_KEY}} — nothing else changes.
</role>

<the_schema_is_the_law>
THE SCHEMA IS THE SINGLE SOURCE OF TRUTH. A field's address in the HTML is {{UPPER_KEY}} of its key, and nothing else. \`hero_headline\` lives in {{HERO_HEADLINE}}; it does NOT live in {{HERO_EYEBROW}}, {{HEADLINE}} or any other name that "means the same thing".
When you finish, EVERY field of the schema (except nature "asset_fixo") MUST appear in the HTML as its exact {{UPPER_KEY}}, exactly once per slot it occupies. Any placeholder name that is not a schema key is either a system tag (see below) or a leftover that you must report.
</the_schema_is_the_law>

<anchoring_rules>
For each schema field, locate its anchor in the HTML and substitute:
1. EXACT: the field's "example" appears verbatim → replace that occurrence with the placeholder. Report anchored_by:"exact".
2. FUZZY: the example appears with minor differences (whitespace, punctuation, casing, entity encoding like &rsquo;) → replace the real occurrence. Report "fuzzy".
3. RENAME: the field's slot already carries a {{PLACEHOLDER}} whose name is NOT this field's {{UPPER_KEY}} (e.g. the slot says {{HERO_CTA_LABEL}} and the field's key is \`cta_primary\`) → RENAME it to {{UPPER_KEY}}. Do not add a second tag, do not keep the old name. Report "renamed" with the old tag name in note.
4. INFERENCE: the example is NOT findable (empty src="", phrase edited after) → pick the most plausible anchor from the layout, the field's guidance/image_spec and its position, replace it, and report "inference" with a short note explaining the choice. These are flagged for extra human review.
5. MISSING ELEMENT: the example (or the field's role) is absent from the HTML but VISIBLE in <rendered_reference> — the finished example of this variant. The HTML layout is incomplete: INSERT a minimal new element for the placeholder at the position the rendered reference shows, cloning the markup style of the neighboring rows/cells (same table pattern, font stack, padding). The new element contains ONLY the placeholder. Report "inference" with note "inserted: element present in rendered reference but missing from HTML".
6. NOT FOUND: the example is absent from the HTML AND the rendered reference gives no position for it → change NOTHING for this field and report "not_found".
Duplicated examples (e.g. testimonial_1_* and testimonial_2_* sharing the same example text) are assigned in DOCUMENT ORDER: first occurrence → _1 field, second → _2.
</anchoring_rules>

<leftover_tags>
After tagging, a {{PLACEHOLDER}} that is NOT a schema key falls in one of two groups:
- SYSTEM TAG, filled by the platform, never by the copy of this component: {{LOGO}}, {{LOGO_URL}}, {{PREHEADER}}, {{EMAIL_TITLE}}, {{BRAND_NAME}}, {{YEAR}}, {{WEBSITE_URL}}, any tag ending in _URL, and any *_ALT. LEAVE THEM EXACTLY AS THEY ARE.
- LEFTOVER: everything else. Nobody fills it, so it reaches the finished email as raw text. Do NOT delete it, do NOT rename it into an unrelated field and do NOT invent a schema field for it — leave that markup untouched. The reviewer is shown the leftovers automatically and decides whether the schema is missing a field or the slot should go.
</leftover_tags>

<rendered_reference_role>
<rendered_reference> is the variant rendered as a real finished email (may include neighboring sections). Use it ONLY to (a) locate where a field lives visually when the source HTML lost it, and (b) model inserted markup (rule 5). NEVER tag the rendered reference itself, NEVER copy unrelated sections from it into the output.
</rendered_reference_role>

<nature_rules>
Each field carries a "nature":
- "copy": text the copy agent will write → replace the example TEXT with the placeholder.
- "imagem_gerada": image generated per store → replace the <img> src (or background-image url) with the placeholder. Keep width/height/style attributes as authored.
- "asset_fixo": shared library artwork — the ART stays EXACTLY as authored (do not touch its src/markup); only an overlaid TEXT that is itself a field gets a placeholder.
</nature_rules>

<hard_prohibitions>
- Do NOT change structure, tags, attributes, inline styles, comments or spacing — ONLY the substitutions described above and the minimal insertions of rule 5 (MISSING ELEMENT).
- Do NOT invent placeholders that are not in the schema. Renaming is allowed ONLY under rule 3, and only into a schema key.
- Do NOT rename or remove system tags, and do NOT touch leftover tags.
- Do NOT translate, rewrite or "improve" any remaining text.
</hard_prohibitions>

<output_contract>
Respond with EXACTLY two sections, nothing else:
${TAGGED_HTML_OPEN}
...the full HTML with substitutions...
${TAGGED_HTML_CLOSE}
${TAGGING_REPORT_OPEN}
[{"key":"section_headline","placeholder":"SECTION_HEADLINE","anchored_by":"exact","note":""}, ...]
${TAGGING_REPORT_CLOSE}
One report entry per schema field. No markdown fences, no commentary.
</output_contract>`

export const DEFAULT_TAGGER_USER_TEMPLATE = `<variant>
- name: {{variant_name}}
- section: {{block_type}}
</variant>

<schema>
{{schema_json}}
</schema>

<existing_placeholders_in_html>
{{existing_tags}}
</existing_placeholders_in_html>

<html>
{{html}}
</html>

<rendered_reference>
{{rendered_html}}
</rendered_reference>

Tag this variant now, following the output contract.`

export interface TaggerParseResult {
  htmlTagged: string
  report: TaggingFieldReport[]
}

const VALID_ANCHORS = new Set([
  "exact",
  "fuzzy",
  "inference",
  "renamed",
  // Legado — proposta antiga que manteve tag divergente. Hoje a validação
  // cobra o {{UPPER(key)}} mesmo assim.
  "existing_tag",
  "not_found",
])

/** Extrai html_tagged + relatório do output. Lança TaggerOutputInvalidError. */
export function parseTaggerOutput(raw: string): TaggerParseResult {
  const cleaned = raw.replace(/```(?:html|json)?\s*/gi, "").replace(/```/g, "")
  const hOpen = cleaned.indexOf(TAGGED_HTML_OPEN)
  const hClose = cleaned.indexOf(TAGGED_HTML_CLOSE)
  if (hOpen === -1 || hClose <= hOpen) {
    throw new TaggerOutputInvalidError("output sem CFY_TAGGED_HTML", raw)
  }
  const htmlTagged = cleaned
    .slice(hOpen + TAGGED_HTML_OPEN.length, hClose)
    .trim()
  if (!htmlTagged) {
    throw new TaggerOutputInvalidError("html tagueado vazio", raw)
  }

  const rOpen = cleaned.indexOf(TAGGING_REPORT_OPEN, hClose)
  const rClose = cleaned.indexOf(TAGGING_REPORT_CLOSE, hClose)
  if (rOpen === -1 || rClose <= rOpen) {
    throw new TaggerOutputInvalidError("output sem CFY_TAGGING_REPORT", raw)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(
      cleaned.slice(rOpen + TAGGING_REPORT_OPEN.length, rClose).trim(),
    )
  } catch {
    throw new TaggerOutputInvalidError("relatório não é JSON válido", raw)
  }
  if (!Array.isArray(parsed)) {
    throw new TaggerOutputInvalidError("relatório não é array", raw)
  }
  const report: TaggingFieldReport[] = []
  for (const r of parsed) {
    if (!r || typeof r !== "object") continue
    const rr = r as Record<string, unknown>
    if (typeof rr.key !== "string" || !rr.key) continue
    const anchoredBy =
      typeof rr.anchored_by === "string" && VALID_ANCHORS.has(rr.anchored_by)
        ? (rr.anchored_by as TaggingFieldReport["anchored_by"])
        : "inference"
    report.push({
      key: rr.key,
      placeholder:
        typeof rr.placeholder === "string" && rr.placeholder
          ? rr.placeholder
          : placeholderForKey(rr.key),
      anchored_by: anchoredBy,
      ...(typeof rr.note === "string" && rr.note ? { note: rr.note } : {}),
    })
  }
  return { htmlTagged, report }
}

const countTables = (s: string): number => (s.match(/<table[\s>]/gi) ?? []).length

/**
 * Validação da proposta (puro): estrutura preservada = hard fail; campos
 * esperados sem placeholder = issues (warning — o designer vê e decide).
 */
export function validateTaggedHtml(
  originalHtml: string,
  taggedHtml: string,
  schema: ComponentOutputField[],
  report: TaggingFieldReport[],
): { ok: boolean; reason?: string; issues: string[] } {
  const issues: string[] = []
  const to = countTables(originalHtml)
  const tt = countTables(taggedHtml)
  // Tabela SUMIU = estrutura perdida (hard fail). Até +2 tabelas são
  // toleradas: a regra MISSING ELEMENT insere elemento clonando o padrão
  // dos vizinhos, que pode envolver uma tabela aninhada.
  if (tt < to || tt > to + 2) {
    return { ok: false, reason: `table_count ${tt}!=${to}`, issues }
  }
  if (taggedHtml.length < originalHtml.length * 0.5) {
    return { ok: false, reason: "shrunk", issues }
  }

  // A proposta é medida contra o SCHEMA, não contra o relatório: o que vale
  // é `{{UPPER(key)}}` estar no HTML. O relatório só explica o caminho.
  const reportByKey = new Map(report.map((r) => [r.key, r]))
  const audit = auditSchemaTags(taggedHtml, schema)

  for (const m of audit.missing) {
    const rep = reportByKey.get(m.key)
    if (!rep) {
      issues.push(`campo ${m.key}: {{${m.placeholder}}} ausente e sem entrada no relatório`)
    } else if (rep.anchored_by === "not_found") {
      issues.push(`campo ${m.key}: âncora não encontrada (not_found)`)
    } else if (rep.anchored_by === "existing_tag") {
      // Modo legado: o agente manteve a tag divergente em vez de renomear.
      issues.push(
        `campo ${m.key}: tag divergente mantida${m.legacyTag ? ` ({{${m.legacyTag}}})` : ""} — deveria ser {{${m.placeholder}}}`,
      )
    } else {
      issues.push(
        `campo ${m.key}: relatório diz ${rep.anchored_by} mas {{${m.placeholder}}} não está no HTML`,
      )
    }
  }

  // Tags que sobraram: ninguém as preenche. Não invalidam a proposta (podem
  // ser slot legítimo esperando campo), mas o revisor precisa ver.
  for (const o of audit.orphans) {
    issues.push(
      `{{${o.tag}}}: ${o.kind === "copy" ? "tag de copy" : "tag"} sem campo no schema — crie o campo ou remova o slot`,
    )
  }

  return { ok: true, issues }
}

export interface InvokeTaggerResult extends TaggerParseResult {
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

export async function invokeComponentTagger(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeTaggerResult> {
  const { config, vars } = input

  const systemPrompt =
    config.system_prompt.trim() || DEFAULT_TAGGER_SYSTEM_PROMPT
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_TAGGER_USER_TEMPLATE,
    vars,
  )

  const t0 = Date.now()
  const res = await invokeFormatModel({
    model: config.model,
    systemPrompt,
    userMessage,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    timeoutMs: timeoutMs(),
    title: "Convertfy Admin Component Tagger",
    // Tagueamento é mecânico (troca frases por placeholders) — sem
    // thinking. FORMAT_OPS_REASONING=on re-liga.
    ...(process.env.FORMAT_OPS_REASONING === "on"
      ? {}
      : { reasoning: { enabled: false } }),
  })

  const parsed = parseTaggerOutput(res.text)
  log.info("tagger.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
    fields: parsed.report.length,
    htmlChars: parsed.htmlTagged.length,
  })

  return {
    ...parsed,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    rawOutput: res.text,
  }
}
