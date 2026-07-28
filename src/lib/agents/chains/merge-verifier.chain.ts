/**
 * merge-verifier.chain — Verificador de merge (7b, arquitetura por views).
 *
 * Roda logo após o copy_merge (estágio de CÓDIGO) e audita o resultado
 * com julgamento semântico: valor no slot errado, valor vazio/truncado,
 * copy órfã que pertence a um slot sobrando, slot que deve ser removido.
 *
 * Recebe SÓ views (relatório do merge + slots preenchidos/sobrando +
 * copy não usada) — NUNCA o documento. Devolve a fila de exceções
 * padronizada que alimenta o agente de exceção (text_format modo
 * exception_slots). Não escreve HTML em hipótese alguma — o output é
 * roteamento puro.
 *
 * Falha aqui NUNCA derruba a geração: o runner cai no comportamento
 * mecânico (fila = left_for_llm do relatório).
 */

import { logger } from "@/lib/logger"

import { renderImageTemplate } from "../image/template-renderer"
import { extractJson } from "../architect/llm-invoke"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"

const log = logger.child("MergeVerifierChain")

const DEFAULT_TIMEOUT_MS = 60_000

function timeoutMs(): number {
  const n = Number(process.env.MERGE_VERIFIER_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS
}

// ── Contrato de output ────────────────────────────────────────────────

export interface MergeVerifierExcecao {
  block_id: string | null
  tag: string
  /** Diagnóstico curto (slot_vazio, valor_no_slot_errado, sem_copy...). */
  motivo: string
  /** Copy pareada pra preencher o slot (quando existe candidata). */
  copy_candidata: { key: string; valor: string } | null
  acao_sugerida: "preencher" | "remove_row" | null
}

export interface MergeVerifierResult {
  aprovado: boolean
  excecoes: MergeVerifierExcecao[]
}

export const DEFAULT_MERGE_VERIFIER_SYSTEM_PROMPT = `<role>
You are the MERGE VERIFIER of an email pipeline. A deterministic merge just placed anchored copy into the email's slots. You audit the RESULT and triage exceptions for a downstream fixer agent. You never see or write the document — only the views provided.
</role>

<what_to_judge>
1. filled slots (tag + applied value): flag a slot ONLY if the value is clearly wrong for the tag's semantic role (e.g. a CTA label inside a LEGAL_LINE), empty-ish, or truncated mid-sentence.
2. leftover slots (tag + row_html): every one of them MUST appear in your queue — either paired with the right unused copy (acao_sugerida "preencher") or marked for removal (acao_sugerida "remove_row") when no copy belongs there.
3. unused copy: if a piece clearly belongs to a leftover slot, pair it via copy_candidata (verbatim — never rewrite, translate or invent text).
</what_to_judge>

<rules>
- Be conservative on filled slots: the merge is code and usually right. Only flag real defects.
- One entry per tag, only tags present in the provided views.
- copy_candidata.valor must be VERBATIM from the unused copy list.
- ESP merge tags ([unsubscribe_link], *|FNAME|*) are not slots — ignore.
</rules>

<output_contract>
Respond with ONLY this JSON object — no markdown fences, no commentary:
{"aprovado": true, "excecoes": [{"block_id": "uuid-or-null", "tag": "TAG", "motivo": "slot_vazio", "copy_candidata": {"key": "campo", "valor": "texto verbatim"}, "acao_sugerida": "preencher"}]}
"aprovado" = true when the merged slots look correct (exceções may still list leftover-slot work). Empty "excecoes" = nothing left to do.
</output_contract>`

export const DEFAULT_MERGE_VERIFIER_USER_TEMPLATE = `<relatorio_merge>
{{relatorio_merge_json}}
</relatorio_merge>

<slots_preenchidos>
{{slots_preenchidos_json}}
</slots_preenchidos>

<slots_sobrando>
{{slots_sobrando_json}}
</slots_sobrando>

<copy_nao_usada>
{{copy_nao_usada_json}}
</copy_nao_usada>

Audit the merge and emit the exceptions queue JSON now.`

/**
 * Parse defensivo do output (exportado pra teste). Lança em JSON inválido
 * ou shape errado — o caller trata como falha do verificador (fallback
 * mecânico), nunca como falha do email.
 */
export function parseMergeVerifierOutput(raw: string): MergeVerifierResult {
  const json = JSON.parse(extractJson(raw)) as unknown
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("output do verificador não é objeto")
  }
  const o = json as Record<string, unknown>
  const excecoesRaw = Array.isArray(o.excecoes) ? o.excecoes : null
  if (excecoesRaw === null) {
    throw new Error('output do verificador sem array "excecoes"')
  }
  const excecoes: MergeVerifierExcecao[] = []
  for (const e of excecoesRaw) {
    if (!e || typeof e !== "object") continue
    const x = e as Record<string, unknown>
    if (typeof x.tag !== "string" || !x.tag) continue
    const cand = x.copy_candidata as Record<string, unknown> | null | undefined
    const copyCandidata =
      cand &&
      typeof cand === "object" &&
      typeof cand.key === "string" &&
      typeof cand.valor === "string" &&
      cand.valor.trim() !== ""
        ? { key: cand.key, valor: cand.valor }
        : null
    const acao =
      x.acao_sugerida === "preencher" || x.acao_sugerida === "remove_row"
        ? x.acao_sugerida
        : null
    excecoes.push({
      block_id: typeof x.block_id === "string" && x.block_id ? x.block_id : null,
      tag: x.tag.replace(/[{}\s]/g, ""),
      motivo: typeof x.motivo === "string" ? x.motivo : "",
      copy_candidata: copyCandidata,
      acao_sugerida: acao,
    })
  }
  return { aprovado: o.aprovado !== false, excecoes }
}

export interface InvokeMergeVerifierResult {
  result: MergeVerifierResult
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

export async function invokeMergeVerifierChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeMergeVerifierResult> {
  const { config, vars } = input
  const systemPrompt =
    config.system_prompt.trim() || DEFAULT_MERGE_VERIFIER_SYSTEM_PROMPT
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_MERGE_VERIFIER_USER_TEMPLATE,
    vars,
  )
  const t0 = Date.now()
  const res = await invokeFormatModel({
    model: config.model,
    systemPrompt,
    userMessage,
    maxTokens: Math.min(config.max_tokens, 4096),
    temperature: config.temperature,
    timeoutMs: timeoutMs(),
    title: "Convertfy Admin Merge Verifier",
    // Julgamento curto em JSON — sem thinking (FORMAT_OPS_REASONING=on re-liga).
    ...(process.env.FORMAT_OPS_REASONING === "on"
      ? {}
      : { reasoning: { enabled: false } }),
  })
  const result = parseMergeVerifierOutput(res.text)
  log.info("merge_verifier.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
    excecoes: result.excecoes.length,
    aprovado: result.aprovado,
  })
  return {
    result,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    rawOutput: res.text,
  }
}
