/**
 * curador-shadow — fase 1 do plano "Curador com o cérebro do vault"
 * (docs/email-generation/plano-curador-cerebro-vault.md).
 *
 * Com `curador_vault_mode='shadow'`, DEPOIS do Curador vivo (kimi, prompt
 * atual) roda-se um call PARALELO com sonnet-4.6 + protocolo do vault, no
 * CONTRATO AMPLIADO do flip (estrutura + papel por posição + fio narrativo
 * + rankings). A run é gravada (`parsed_output.shadow=true`) e NADA dela é
 * consumido — o pipeline segue no vivo. É o ensaio do flip: mesmo prompt,
 * mesmo parser e o medidor de veto que decide a fase 3.
 *
 * Nunca lança: qualquer erro fecha a própria run como error e loga.
 */

import crypto from "crypto"

import { logger } from "@/lib/logger"
import { buildCatalog, type BuildCatalogResult, type CatalogVaultExtra } from "./catalog-builder"
import {
  buildAprendizadosBlock,
  buildConvivenciaBlock,
  buildEstruturasRefResumo,
  buildMomentoBlock,
  buildProtocoloBlock,
  buildRequisitosGlossario,
  buildSecaoNotasBlock,
  momentoDoEmail,
  renderUsageCounts,
  type AprendizadoResumo,
  type CuradorVaultKnowledge,
  type EstruturaRefResumo,
} from "./curador-vault"
import { interpolateSystem, invokeAgent, type AgentInvokeConfig } from "./llm-invoke"
import { parseCuratorRanking, type RankedChoice } from "./curator-ranking.parser"
import {
  buildInterpolatedSegments,
  buildSegmentedPrompt,
  concatSegments,
  type InputSummaryItem,
  type SegmentOrigin,
} from "@/lib/agents/shared/prompt-provenance"
import {
  finishGenerationRun,
  resolveCostCents,
  startGenerationRun,
} from "@/lib/agents/callbacks/telemetry.callback"

const log = logger.child("CuradorShadow")

const SHADOW_TOP_N = 3

/** Modelo do shadow (e candidato do flip). Env sobrepõe sem deploy de config. */
export const CURADOR_SHADOW_MODEL =
  process.env.CURADOR_SHADOW_MODEL?.trim() || "anthropic/claude-sonnet-4.6"

// ── Prompt do contrato AMPLIADO (o prompt do flip, ensaiado no shadow) ───

export const DEFAULT_CHOOSER_VAULT_SYSTEM = `Você é o Curador de Componentes de email da Convertfy. Num único passe você decide a ESTRUTURA de um email (sequência de seções + papel narrativo de cada posição + fio narrativo) e seleciona da biblioteca as ATÉ ${SHADOW_TOP_N} variantes que melhor servem a cada posição, em ordem de preferência.

Você decide pelo protocolo, pelos eixos e pelos metadados. Você NÃO recebe o HTML das variantes.

<protocolo_de_selecao>
Protocolo canônico de seleção (vault de componentes). Ele é a LEI do processo: ELIMINAR ANTES DE RANKEAR, na ordem dos passos. Em conflito com qualquer regra desta mensagem, o protocolo vence.
{{protocolo}}
</protocolo_de_selecao>

<biblioteca>
Catálogo completo, agrupado por tipo de seção. Dentro de cada tipo a ordem é alfabética e NÃO carrega julgamento. Variantes com o campo \`vault\` trazem os eixos do protocolo (momento/objecao/registro/paleta/papel_na_peca + vetos), \`exige\`, \`peso\` e \`convivencia\` — onde o vault contradisser os metadados do banco, O VAULT VENCE.
{{catalogo}}
</biblioteca>

<convivencia>
Regras de coexistência entre variantes na MESMA peça:
{{convivencias}}
</convivencia>

<requisitos>
Glossário dos requisitos de \`vault.exige\` — cada um é ELIMINATÓRIO quando a loja não tem o ativo:
{{requisitos}}
</requisitos>

Como decidir, na ordem:
1. ESTRUTURA: parta de <sequencia_sugerida> e da intenção deste email (passos 1-2 do protocolo: intenção decide a objeção-alvo e o papel de cada posição; estrutura de referência, quando cobre este email, decide ordem e papéis). Você PODE adaptar a sequência — trocar/remover/reordenar seções — desde que toda seção usada tenha variante elegível na biblioteca e o arco sirva à intenção. Nunca emita header nem cta como seções próprias (são absorvidas). Cada posição recebe um papel de UMA frase e o email inteiro recebe um fio_narrativo curto (como as posições se ligam).
2. SELEÇÃO por posição, seguindo os passos 3-9 do protocolo: elimine por ativa/schema (já filtrados do catálogo), por \`exige\` contra o que a loja comprovadamente tem (<perfil_marca>, <top_products>, cupom/oferta no contexto — sem evidência do ativo a variante é IMPOSSÍVEL, não pior), por momento (veto e declaração positiva contra <momento>), por capacidade (product_slots × produtos com link). Rankeie os sobreviventes por objecao → registro → paleta → papel_na_peca (lexicográfico com degradação: eixo que não separa é neutro). Cheque convivência e o orçamento de peso contra as OUTRAS posições (evite pesado/peca-inteira em sequência). Desempate pela chave da nota de seção; empate total entre duplicatas → menor número no slug (ou a menos usada em <memoria>, quando a contagem existir).
3. Zero candidata sobrevivendo numa seção NÃO é erro: declare a posição com \`escolhas: []\` e siga — o sistema cai no template global e a lacuna vira sinal.

Regras que continuam valendo do Curador atual: <perfil_marca> ancora identidade; <objecoes> é o que trava a compra; <vocabulario> é literal; produtos cruzam com product_slots (nunca exigir mais produtos/links do que a loja tem); <memoria> é sinal, nunca regra; HERO É ÚNICA (no máximo uma posição com variante de hero); não invente variant_id.

Responda APENAS o objeto JSON, sem markdown:

{"estrutura":[{"section":"hero","papel":"..."},{"section":"reviews","papel":"..."}],
 "fio_narrativo":"...",
 "escolhas":[{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"..."},{"variant_id":"..."}]}]}

- \`estrutura\` na ordem final do email; \`block_index\` das escolhas refere-se a ESSA estrutura (0-based).
- Só a 1ª escolha de cada posição leva \`motivo\` (máx 20 palavras); a ORDEM é a preferência.`

export const DEFAULT_CHOOSER_VAULT_USER = `<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
</store>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<intencao>
[do flow]
{{intencao_flow}}

[deste email]
{{intencao_email}}
</intencao>

<momento>
{{momento}}
</momento>

<estruturas_de_referencia>
{{estruturas_ref}}
</estruturas_de_referencia>

<notas_de_secao>
{{secoes_notas}}
</notas_de_secao>

<aprendizados>
{{aprendizados}}
</aprendizados>

<revisao_humana>
{{revisao_humana}}
</revisao_humana>

<perfil_marca>
{{briefing_marca}}
</perfil_marca>

<objecoes>
{{objecoes}}
</objecoes>

<vocabulario>
{{vocabulario}}
</vocabulario>

<top_products>
{{top_products}}
</top_products>

<memoria>
{{memoria}}
</memoria>

<sequencia_sugerida>
{{blocks_json}}
</sequencia_sugerida>

Decida a estrutura final e selecione as até ${SHADOW_TOP_N} variantes por posição. Responda APENAS o objeto JSON.`

// ── Parser do contrato ampliado (puro) ──────────────────────────────────

export interface EstruturaDecidida {
  section: string
  papel: string
}

export interface CuradorVaultOutput {
  estrutura: EstruturaDecidida[]
  fioNarrativo: string
  /** O array `escolhas` re-serializado — alimenta o parseCuratorRanking. */
  escolhasRaw: string
}

/** Extrai o objeto do contrato ampliado; tolerante a fences/prosa. */
export function parseCuradorVaultOutput(raw: string): CuradorVaultOutput | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
    const estrutura = Array.isArray(obj.estrutura)
      ? obj.estrutura
          .filter(
            (e): e is Record<string, unknown> =>
              !!e && typeof e === "object" && typeof (e as Record<string, unknown>).section === "string",
          )
          .map((e) => ({
            section: String(e.section).trim(),
            papel: typeof e.papel === "string" ? e.papel.trim() : "",
          }))
          .filter((e) => e.section.length > 0)
      : []
    const escolhas = Array.isArray(obj.escolhas) ? obj.escolhas : []
    return {
      estrutura,
      fioNarrativo: typeof obj.fio_narrativo === "string" ? obj.fio_narrativo.trim() : "",
      escolhasRaw: JSON.stringify(escolhas),
    }
  } catch {
    return null
  }
}

// ── Medidor de veto (puro) — a métrica que decide o flip ────────────────

export interface ProtocolViolation {
  block_index: number
  variant_id: string
  tipo:
    | "momento_vetado"
    | "momento_nao_declarado"
    | "hero_dupla"
    | "variante_repetida"
    | "convivencia"
  detalhe: string
}

/**
 * Mede violações mecanicamente checáveis do protocolo sobre os rank-1 de
 * cada posição. `exige` fica FORA de propósito: sem perfil de ativos da
 * loja, checá-lo seria o mesmo julgamento implícito que se quer medir.
 */
export function measureProtocolViolations(p: {
  rank1ByBlock: Map<number, string>
  extras: Map<string, CatalogVaultExtra>
  momento: string | null
  /** block_index → seção da posição. */
  sectionByBlock: Map<number, string>
}): ProtocolViolation[] {
  const out: ProtocolViolation[] = []
  const heroBlocks: number[] = []
  const seenVariant = new Map<string, number>()
  const convivenciaSeen = new Map<string, number>()

  for (const [block, variantId] of p.rank1ByBlock) {
    const extra = p.extras.get(variantId)
    const section = p.sectionByBlock.get(block) ?? ""
    if (section === "hero") heroBlocks.push(block)

    const prev = seenVariant.get(variantId)
    if (prev !== undefined) {
      out.push({
        block_index: block,
        variant_id: variantId,
        tipo: "variante_repetida",
        detalhe: `mesma variante no rank 1 das posições ${prev} e ${block}`,
      })
    } else {
      seenVariant.set(variantId, block)
    }

    if (extra && p.momento) {
      if ((extra.momento_vetado ?? []).includes(p.momento)) {
        out.push({
          block_index: block,
          variant_id: variantId,
          tipo: "momento_vetado",
          detalhe: `momento_vetado inclui ${p.momento}`,
        })
      } else if ((extra.momento ?? []).length > 0 && !(extra.momento ?? []).includes(p.momento)) {
        out.push({
          block_index: block,
          variant_id: variantId,
          tipo: "momento_nao_declarado",
          detalhe: `momento [${(extra.momento ?? []).join(", ")}] não inclui ${p.momento}`,
        })
      }
    }

    for (const slug of extra?.convivencia ?? []) {
      const other = convivenciaSeen.get(slug)
      if (other !== undefined && other !== block) {
        out.push({
          block_index: block,
          variant_id: variantId,
          tipo: "convivencia",
          detalhe: `${slug} também na posição ${other}`,
        })
      } else {
        convivenciaSeen.set(slug, block)
      }
    }
  }

  if (heroBlocks.length > 1) {
    for (const b of heroBlocks.slice(1)) {
      out.push({
        block_index: b,
        variant_id: p.rank1ByBlock.get(b) ?? "",
        tipo: "hero_dupla",
        detalhe: `hero também na posição ${heroBlocks[0]}`,
      })
    }
  }
  return out
}

/** rank-1 por posição a partir do byBlock do parser. */
export function rank1ByBlock(byBlock: Map<number, RankedChoice[]>): Map<number, string> {
  const out = new Map<number, string>()
  for (const [b, choices] of byBlock) {
    const id = choices[0]?.variant_id
    if (id) out.set(b, id)
  }
  return out
}

// ── O call shadow ───────────────────────────────────────────────────────

export interface CuradorShadowParams {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  emailId?: string | null
  flowId?: string | null
  /** Vars do Curador VIVO (loja/outline/intenções/perfil/memória/sequência). */
  baseVars: Record<string, string>
  origins: Record<string, SegmentOrigin>
  vault: CuradorVaultKnowledge
  extras: Map<string, CatalogVaultExtra>
  catalogComExtras: BuildCatalogResult
  estruturasRef: EstruturaRefResumo[]
  aprendizados: AprendizadoResumo[]
  usageCounts: Map<string, number>
  /** variant_id → block_type (validação das escolhas). */
  typeIndex: Map<string, string>
  /** Seções da sequência do VIVO (fallback quando a estrutura não vem). */
  liveSections: string[]
  /** Violações medidas sobre o rank-1 do Curador VIVO (comparação). */
  liveViolations: ProtocolViolation[]
  liveRank1: Map<number, string>
}

/** Roda o shadow completo. Nunca lança. */
export async function runCuradorShadow(p: CuradorShadowParams): Promise<void> {
  const t0 = Date.now()
  let runId = ""
  try {
    const momento = momentoDoEmail(p.flowType, p.emailNumber)
    const config: AgentInvokeConfig = {
      model: CURADOR_SHADOW_MODEL,
      temperature: 0.2,
      max_tokens: 8192,
      system_prompt: DEFAULT_CHOOSER_VAULT_SYSTEM,
      user_template: DEFAULT_CHOOSER_VAULT_USER,
    }

    const vars: Record<string, string> = {
      ...p.baseVars,
      momento: buildMomentoBlock(p.vault, p.flowType, p.emailNumber),
      estruturas_ref: buildEstruturasRefResumo(p.estruturasRef),
      secoes_notas: buildSecaoNotasBlock(p.vault, p.liveSections),
      aprendizados: buildAprendizadosBlock(p.aprendizados),
      memoria: `${p.baseVars.memoria ?? ""}\n\n${renderUsageCounts(p.usageCounts, p.extras)}`.trim(),
    }
    const systemVars = {
      protocolo: buildProtocoloBlock(p.vault),
      convivencias: buildConvivenciaBlock(p.vault),
      requisitos: buildRequisitosGlossario(p.vault),
      catalogo: p.catalogComExtras.json,
    }

    const catalogSha8 = crypto
      .createHash("sha256")
      .update(p.catalogComExtras.json)
      .digest("hex")
      .slice(0, 8)
    const systemResolvido = interpolateSystem(config.system_prompt, systemVars)
    const segUser = buildSegmentedPrompt(config.user_template, vars, {
      ...p.origins,
      aprendizados: { cls: "vault", rotulo: "Aprendizados — email_learnings" },
    }, { parte: "user" })
    const segSystem = buildInterpolatedSegments(config.system_prompt, systemVars, {
      catalogo: {
        cls: "biblioteca",
        rotulo: `Catálogo da biblioteca — ${p.catalogComExtras.total} variantes + eixos do vault`,
        ref: "catalogo",
        sha8: catalogSha8,
      },
      protocolo: { cls: "vault", rotulo: "Protocolo de seleção — email_vault_docs" },
      convivencias: { cls: "vault", rotulo: "Regras de convivência — email_vault_docs" },
      requisitos: { cls: "vault", rotulo: "Glossário de requisitos — email_vault_docs" },
    }, { parte: "system" })
    const promptSegments = concatSegments(
      segSystem.prompt === systemResolvido ? segSystem.segments : null,
      segUser.segments,
    )
    const inputSummary: InputSummaryItem[] = [
      { rotulo: "Shadow do Curador", cls: "sistema", valor: `${CURADOR_SHADOW_MODEL} · contrato ampliado (fase 1 do plano) — saída NÃO consumida` },
      { rotulo: "Protocolo do vault", cls: "vault", valor: p.vault.protocolo ? "servido" : "AUSENTE (vault não sincronizado)" },
      { rotulo: "Catálogo + eixos", cls: "biblioteca", valor: `${p.catalogComExtras.total} variantes · eixos em ${p.extras.size} · sha8 ${catalogSha8}` },
      { rotulo: "Momento", cls: "sistema", valor: momento ?? `(não mapeado p/ ${p.flowType})` },
      { rotulo: "Aprendizados", cls: "vault", valor: `${p.aprendizados.length} servidos` },
      { rotulo: "Estruturas de referência", cls: "vault", valor: `${p.estruturasRef.length} do flow` },
    ]

    runId = await startGenerationRun({
      storeId: p.storeId,
      triggeredBy: p.triggeredBy,
      emailId: p.emailId ?? undefined,
      flowId: p.flowId ?? undefined,
      batchId: p.batchId,
      agent: "assembler_chooser",
      model: config.model,
      inputVars: {
        shadow: true,
        curador_vault_mode: "shadow",
        catalog_sha8: catalogSha8,
        vault_docs: p.vault.total,
        momento,
      },
      renderedPrompt: segUser.segments ? segUser.prompt : undefined,
      promptSegments,
      inputSummary,
    })

    const res = await invokeAgent(config, vars, systemVars)
    const parsed = parseCuradorVaultOutput(res.raw)
    const sections = (parsed?.estrutura.length ? parsed.estrutura.map((e) => e.section) : p.liveSections)
    const ranking = parsed
      ? parseCuratorRanking({
          raw: parsed.escolhasRaw,
          sections,
          typeIndex: p.typeIndex,
          maxPerBlock: SHADOW_TOP_N,
        })
      : null

    const sectionByBlock = new Map(sections.map((s, i) => [i, s]))
    const shadowRank1 = ranking ? rank1ByBlock(ranking.byBlock) : new Map<number, string>()
    const violations = measureProtocolViolations({
      rank1ByBlock: shadowRank1,
      extras: p.extras,
      momento,
      sectionByBlock,
    })

    // Concordância rank-1 com o vivo, nas posições comparáveis (mesma
    // estrutura por índice — estrutura adaptada zera a base de comparação).
    let comparaveis = 0
    let iguais = 0
    for (const [b, id] of p.liveRank1) {
      const sh = shadowRank1.get(b)
      if (!sh) continue
      if ((sectionByBlock.get(b) ?? "") !== (p.liveSections[b] ?? "")) continue
      comparaveis++
      if (sh === id) iguais++
    }

    await finishGenerationRun(runId, {
      storeId: p.storeId,
      triggeredBy: p.triggeredBy,
      emailId: p.emailId ?? undefined,
      flowId: p.flowId ?? undefined,
      batchId: p.batchId,
      agent: "assembler_chooser",
      status: parsed && ranking && !ranking.malformed ? "success" : "error",
      model: config.model,
      errorMessage: !parsed
        ? "shadow_json_ilegivel"
        : ranking?.malformed
          ? "shadow_escolhas_malformadas"
          : undefined,
      rawOutput: res.raw.slice(0, 8000),
      parsedOutput: {
        shadow: true,
        curador_vault_mode: "shadow",
        estrutura: parsed?.estrutura ?? [],
        estrutura_adaptada: Boolean(
          parsed?.estrutura.length &&
            (parsed.estrutura.length !== p.liveSections.length ||
              parsed.estrutura.some((e, i) => e.section !== p.liveSections[i])),
        ),
        fio_narrativo: parsed?.fioNarrativo ?? "",
        positions_ranked: ranking?.byBlock.size ?? 0,
        empty_blocks: ranking?.emptyBlocks ?? [],
        invalid_ids: ranking?.invalidIds ?? [],
        protocol_violations: violations,
        live_violations: p.liveViolations,
        live_rank1_agreement: {
          comparaveis,
          iguais,
          pct: comparaveis > 0 ? Math.round((iguais / comparaveis) * 100) : null,
        },
      },
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
      costCents: resolveCostCents({
        model: config.model,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
        costUsd: res.costUsd,
      }),
      durationMs: Date.now() - t0,
    })
    log.info("shadow.done", {
      storeId: p.storeId,
      flowType: p.flowType,
      emailNumber: p.emailNumber,
      positions: ranking?.byBlock.size ?? 0,
      violations: violations.length,
      liveViolations: p.liveViolations.length,
      agreementPct: comparaveis > 0 ? Math.round((iguais / comparaveis) * 100) : null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("shadow.failed", { storeId: p.storeId, flowType: p.flowType, emailNumber: p.emailNumber, error: msg })
    if (runId) {
      await finishGenerationRun(runId, {
        storeId: p.storeId,
        batchId: p.batchId,
        agent: "assembler_chooser",
        status: "error",
        model: CURADOR_SHADOW_MODEL,
        errorMessage: `shadow: ${msg}`,
        parsedOutput: { shadow: true, curador_vault_mode: "shadow" },
        durationMs: Date.now() - t0,
      }).catch(() => {})
    }
  }
}
