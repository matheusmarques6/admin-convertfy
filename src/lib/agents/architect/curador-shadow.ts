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
  buildSecaoNotasBlock,
  momentoDoEmail,
  renderUsageCounts,
  type AprendizadoResumo,
  type CuradorVaultKnowledge,
  type EstruturaRefResumo,
} from "./curador-vault"
import { interpolateSystem, invokeAgent, type AgentInvokeConfig } from "./llm-invoke"
import { parseCuratorRanking, type ParsedRanking, type RankedChoice } from "./curator-ranking.parser"
import {
  conformarEstrutura,
  resumoDaDivergencia,
  type EstruturaConformada,
} from "./curador-estrutura"
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
Protocolo canônico de seleção (vault de componentes). Ele é a LEI do processo: ELIMINAR ANTES DE RANKEAR, na ordem dos passos. Em conflito com qualquer regra desta mensagem, o protocolo vence — COM UMA ÚNICA EXCEÇÃO, declarada abaixo.

EMENDA-MOMENTO-01 (suspende parte do passo 5 e parte do passo 7)
O passo 5 manda eliminar por "declaração positiva": variante cujo \`momento\` é lista não vazia que não inclui o momento do e-mail seria eliminada. ESSA PARTE ESTÁ SUSPENSA. O passo 5 elimina SOMENTE por veto (\`momento_vetado\`, \`registro_vetado\`).
Motivo: \`momento\` foi escrito no vault para dizer ONDE A VARIANTE BRILHA, não onde ela é permitida. Lido como filtro, ele apagava seções inteiras — em 01/09, de 7 variantes de reviews, ZERO vetavam welcome-1 e as 7 foram eliminadas só por declararem outro momento; o e-mail saiu com 2 de 6 posições preenchidas.
Em troca, \`momento\` vira o PRIMEIRO eixo do ranking do passo 7, antes de \`objecao\`, nesta ordem:
  1º quem declara o momento pedido — foi feita para este e-mail;
  2º quem tem \`momento: []\` — não discrimina, serve a qualquer momento;
  3º quem declara outros momentos — serve, mas não é a vocação dela.
O trecho do passo 7 que diz que \`momento\` "não entra nesta lista" também está suspenso.
Fora isso, o protocolo vale integralmente.
{{protocolo}}
</protocolo_de_selecao>

<biblioteca>
Catálogo completo, agrupado por tipo de seção. Dentro de cada tipo a ordem é alfabética e NÃO carrega julgamento. Variantes com o campo \`vault\` trazem os eixos do protocolo (momento/objecao/registro/paleta/papel_na_peca + vetos), \`peso\`, \`convivencia\` e a capacidade (\`product_slots\`/\`itens\`) — onde o vault contradisser os metadados do banco, O VAULT VENCE.
{{catalogo}}
</biblioteca>

<convivencia>
Regras de coexistência entre variantes na MESMA peça:
{{convivencias}}
</convivencia>

Como decidir, na ordem:
1. PAPEL DE CADA POSIÇÃO: a sequência de <estrutura_do_email> é FIXA — foi desenhada por uma pessoa na aba Arquitetura. Não remova, não acrescente, não reordene, não substitua seção nenhuma. Sua tarefa é dizer por que cada posição existe: cruze <intencao_do_email> (a intenção, o que o email DEVE e o que NÃO DEVE) com a posição da seção no arco e escreva um papel de UMA frase para cada uma, na ordem em que elas vêm. O email inteiro recebe também um fio_narrativo curto (como as posições se ligam). Se uma posição lhe parecer errada para este email, o papel é o lugar de dizer isso — nunca a remoção.
2. SELEÇÃO por posição, seguindo os passos 3-9 do protocolo COM a EMENDA-MOMENTO-01: elimine por ativa/schema (já filtrados do catálogo), por momento SOMENTE quando <momento> estiver em \`momento_vetado\` (declarar outro momento NÃO elimina), e por capacidade (\`vault.product_slots\`/\`vault.itens\` × produtos com link — a loja não tem como preencher slot de produto que não existe). Essa é a lista COMPLETA do que elimina. Material — foto, tipografia, tipo de campanha, qualquer ativo que você suponha faltar — não elimina ninguém: a imagem é gerada depois, e adequação de material se resolve no RANKING. Rankeie os sobreviventes por momento → objecao → registro → paleta → papel_na_peca (lexicográfico com degradação: eixo que não separa é neutro). Cheque convivência e o orçamento de peso contra as OUTRAS posições (evite pesado/peca-inteira em sequência). Desempate pela chave da nota de seção; empate total entre duplicatas → menor número no slug (ou a menos usada em <memoria>, quando a contagem existir).
3. SOBREVIVEU, TEM DE SAIR ESCOLHIDA. \`escolhas: []\` é legítimo em UMA situação só: a eliminação (passos 3-6) zerou a lista. Se alguma candidata chegou ao passo 7, ela é escolhida — mesmo que TODOS os eixos empatem em neutro, mesmo que os eixos dela estejam vazios, mesmo que você não goste de nenhuma. Empate total não é lacuna: é o caso do passo 9, e o protocolo diz que o resultado nunca é sorteio — desempate pela nota de seção, depois menor uso em <memoria>, depois menor número no slug. "Nenhum eixo as separa" NUNCA justifica devolver lista vazia.
4. Zero candidata de verdade NÃO é erro E NÃO AUTORIZA remover a posição: declare-a com \`escolhas: []\` e a \`justificativa\` nomeando, candidata por candidata, em que passo e contra qual campo cada uma caiu — a posição continua na peça, o sistema cai no template global e a lacuna vira sinal para a curadoria da biblioteca.

Regras que continuam valendo do Curador atual: <perfil_marca> ancora identidade; <objecoes> é o que trava a compra; <vocabulario> é literal; produtos cruzam com \`vault.product_slots\`/\`vault.itens\` (nunca exigir mais produtos/links do que a loja tem); <memoria> é sinal, nunca regra; HERO É ÚNICA (no máximo uma posição com variante de hero); não invente variant_id.

O OUTPUT SAI JUSTIFICADO — a decisão tem que ser auditável sem reler o catálogo:
- \`justificativa\` é OBRIGATÓRIA em toda posição: o TRAÇO da decisão em 2-4 frases — quem foi eliminado e em que passo (momento vetado/capacidade), qual eixo do ranking decidiu e por quê ("ganhou porque objecao bateu; se não fosse isso, teria sido registro"), e o desempate quando houve.
- TODA escolha rankeada leva \`motivo\` (uma frase curta): na 1ª, por que ela venceu; nas demais, por que ficam atrás da anterior.

Responda APENAS o objeto JSON, sem markdown:

{"papeis":[{"block_index":0,"section":"hero","papel":"..."},{"block_index":1,"section":"offer","papel":"..."}],
 "fio_narrativo":"...",
 "escolhas":[{"block_index":0,
   "justificativa":"5 candidatas; nenhuma veta welcome-1. objecao decidiu: só hero-3 declara preco-valor, o alvo deste toque; hero-4 e hero-5 ficam atrás por registro (premium-editorial contra o popular desta marca).",
   "escolhas":[{"variant_id":"...","motivo":"..."},{"variant_id":"...","motivo":"..."}]}]}

- \`papeis\` traz UM item por posição de <estrutura_do_email>, na mesma ordem e com o mesmo \`block_index\` (0-based); \`escolhas\` usa esses mesmos índices.
- A ORDEM dentro de \`escolhas\` é a preferência.`

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

<intencao_do_email>
[do flow]
{{intencao_flow}}

[deste email]
{{intencao_email}}

[o email NÃO DEVE — restrições da aba Arquitetura]
{{outline_restricoes}}
</intencao_do_email>

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

<estrutura_do_email>
Sequência desenhada por uma pessoa na aba Arquitetura deste email. É FIXA:
não remova, não acrescente, não reordene. Cada posição existe por uma razão
— sua tarefa é dizer QUAL, a partir de <intencao_do_email>.
{{blocks_json}}
</estrutura_do_email>

Atribua o papel de cada posição, escreva o fio narrativo e selecione as até ${SHADOW_TOP_N} variantes por posição. A sequência não se discute. Responda APENAS o objeto JSON.`

// ── Parser do contrato ampliado (puro) ──────────────────────────────────

export interface EstruturaDecidida {
  section: string
  papel: string
  /** Posição declarada pelo agente. Confirmada pelo `conformarEstrutura`. */
  block_index?: number | null
}

export interface CuradorVaultOutput {
  estrutura: EstruturaDecidida[]
  fioNarrativo: string
  /** O array `escolhas` re-serializado — alimenta o parseCuratorRanking. */
  escolhasRaw: string
  /** block_index → traço da decisão (o output justificado). */
  justificativas: Record<number, string>
  /** Escolhas com motivo por rank, para a telemetria legível. */
  escolhasDetalhadas: Array<{
    block_index: number
    justificativa: string
    escolhas: Array<{ variant_id: string; motivo: string }>
  }>
}

/** Extrai o objeto do contrato ampliado; tolerante a fences/prosa. */
export function parseCuradorVaultOutput(raw: string): CuradorVaultOutput | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
    // `papeis` é o contrato novo (a sequência é dada, ele só nomeia o papel
    // de cada posição); `estrutura` é o nome antigo, quando ele ainda
    // decidia a sequência. Ler os dois mantém as runs históricas legíveis e
    // não quebra se o modelo devolver o nome velho.
    const cru = Array.isArray(obj.papeis)
      ? obj.papeis
      : Array.isArray(obj.estrutura)
        ? obj.estrutura
        : null
    const estrutura = cru
      ? cru
          .filter(
            (e): e is Record<string, unknown> =>
              !!e && typeof e === "object" && typeof (e as Record<string, unknown>).section === "string",
          )
          .map((e) => ({
            section: String(e.section).trim(),
            papel: typeof e.papel === "string" ? e.papel.trim() : "",
            block_index:
              typeof e.block_index === "number" ? e.block_index : null,
          }))
          .filter((e) => e.section.length > 0)
      : []
    const escolhas = Array.isArray(obj.escolhas) ? obj.escolhas : []
    const justificativas: Record<number, string> = {}
    const escolhasDetalhadas: CuradorVaultOutput["escolhasDetalhadas"] = []
    for (const e of escolhas) {
      if (!e || typeof e !== "object") continue
      const rec = e as Record<string, unknown>
      if (typeof rec.block_index !== "number") continue
      const just = typeof rec.justificativa === "string" ? rec.justificativa.trim() : ""
      if (just) justificativas[rec.block_index] = just
      const opts = Array.isArray(rec.escolhas) ? rec.escolhas : []
      escolhasDetalhadas.push({
        block_index: rec.block_index,
        justificativa: just,
        escolhas: opts
          .filter(
            (o): o is Record<string, unknown> =>
              !!o && typeof o === "object" && typeof (o as Record<string, unknown>).variant_id === "string",
          )
          .map((o) => ({
            variant_id: String(o.variant_id),
            motivo: typeof o.motivo === "string" ? o.motivo.trim() : "",
          })),
      })
    }
    return {
      estrutura,
      fioNarrativo: typeof obj.fio_narrativo === "string" ? obj.fio_narrativo.trim() : "",
      escolhasRaw: JSON.stringify(escolhas),
      justificativas,
      escolhasDetalhadas,
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
  /**
   * Seções da ARQUITETURA deste email (a sequência da aba, que o Curador
   * recebe e não altera). Continua servindo de base de comparação no shadow.
   */
  liveSections: string[]
  /**
   * `on` = este call É o Curador: a saída volta para o pipeline. `shadow` =
   * ensaio em paralelo ao kimi, nada é consumido. Default shadow para o call
   * site antigo não mudar de comportamento por omissão.
   */
  modo?: "shadow" | "on"
  /** Violações medidas sobre o rank-1 do Curador VIVO (comparação). */
  liveViolations: ProtocolViolation[]
  /**
   * Itens de Entrada do call vivo (loja, outline, intenções, perfil…). O
   * shadow montava só os 6 itens próprios e a aba Entrada do Estúdio ficava
   * pobre justamente no call que virou o vigente.
   */
  baseInputSummary?: InputSummaryItem[]
  liveRank1: Map<number, string>
}

/**
 * O que o pipeline consome quando o modo é `on`. `null` = não deu para usar
 * (JSON ilegível, escolhas malformadas ou erro) — o caller decide o fallback.
 */
export interface CuradorVaultResultado {
  /** Papéis alinhados à ARQUITETURA, índice a índice. `""` onde não veio. */
  papeis: string[]
  fioNarrativo: string
  ranking: ParsedRanking
  conformidade: EstruturaConformada
}

/**
 * Roda o Curador do vault. Nunca lança.
 *
 * Em `shadow` devolve `null` sempre (a saída é descartada por definição). Em
 * `on` devolve o resultado já CONFORMADO à arquitetura — a sequência da aba
 * vence, e os papéis vêm alinhados a ela.
 */
export async function runCuradorShadow(
  p: CuradorShadowParams,
): Promise<CuradorVaultResultado | null> {
  const modo = p.modo ?? "shadow"
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
    }, { parte: "system" })
    const promptSegments = concatSegments(
      segSystem.prompt === systemResolvido ? segSystem.segments : null,
      segUser.segments,
    )
    const inputSummary: InputSummaryItem[] = [
      {
        rotulo: modo === "on" ? "Curador (vault)" : "Shadow do Curador",
        cls: "sistema",
        valor:
          modo === "on"
            ? `${CURADOR_SHADOW_MODEL} · protocolo do vault · saída CONSUMIDA pelo pipeline`
            : `${CURADOR_SHADOW_MODEL} · contrato ampliado (ensaio) — saída NÃO consumida`,
      },
      { rotulo: "Protocolo do vault", cls: "vault", valor: p.vault.protocolo ? "servido" : "AUSENTE (vault não sincronizado)" },
      { rotulo: "Catálogo + eixos", cls: "biblioteca", valor: `${p.catalogComExtras.total} variantes · eixos em ${p.extras.size} · sha8 ${catalogSha8}` },
      ...(p.catalogComExtras.divergentes.length > 0
        ? [
            {
              rotulo: "Vault × banco",
              cls: "biblioteca" as const,
              valor: `${p.catalogComExtras.divergentes.length} variante(s) em que a prosa do vault descreve outra peça: ${p.catalogComExtras.divergentes
                .slice(0, 5)
                .map((d) => d.slug)
                .join(", ")}`,
            },
          ]
        : []),
      { rotulo: "Momento", cls: "sistema", valor: momento ?? `(não mapeado p/ ${p.flowType})` },
      { rotulo: "Aprendizados", cls: "vault", valor: `${p.aprendizados.length} servidos` },
      { rotulo: "Estruturas de referência", cls: "vault", valor: `${p.estruturasRef.length} do flow` },
      ...(p.baseInputSummary ?? []),
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
        shadow: modo === "shadow",
        shadow_contract: "v2-justificado",
        curador_vault_mode: modo,
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
    // A sequência é a da ARQUITETURA, sempre. O guard casa os papéis contra
    // ela e registra o que o agente tentou mudar; o `block_index` das
    // escolhas passa a se referir a esta lista, não à que ele devolveu.
    const conformidade = conformarEstrutura(
      p.liveSections.map((section) => ({ section })),
      parsed?.estrutura ?? [],
    )
    const divergencia = resumoDaDivergencia(conformidade)
    const sections = p.liveSections
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
        shadow: modo === "shadow",
        shadow_contract: "v2-justificado",
        curador_vault_mode: modo,
        // A estrutura VIGENTE (a da arquitetura, com os papéis casados) e,
        // separada, a que ele devolveu. Guardar as duas é o que permite ver
        // se ele obedeceu sem ter de reler o raw_output.
        estrutura: conformidade.posicoes,
        estrutura_devolvida: parsed?.estrutura ?? [],
        estrutura_conforme: conformidade.conforme,
        estrutura_divergente: divergencia,
        // Nome antigo, mantido para as runs da janela de shadow continuarem
        // comparáveis no mesmo gráfico.
        estrutura_adaptada: !conformidade.conforme,
        fio_narrativo: parsed?.fioNarrativo ?? "",
        positions_ranked: ranking?.byBlock.size ?? 0,
        // O output JUSTIFICADO: traço da decisão por posição + motivo por
        // rank, com o slug do vault no lugar do UUID (auditável sem cruzar).
        ranking_justificado: (parsed?.escolhasDetalhadas ?? []).map((b) => ({
          block_index: b.block_index,
          section: sectionByBlock.get(b.block_index) ?? "",
          justificativa: b.justificativa,
          escolhas: b.escolhas.map((o, idx) => ({
            rank: idx + 1,
            variant_id: o.variant_id,
            variante: p.extras.get(o.variant_id)?.slug ?? o.variant_id,
            motivo: o.motivo,
          })),
        })),
        empty_blocks: ranking?.emptyBlocks ?? [],
        // Com a sequência fixa, seção sem candidata elegível não some mais —
        // ela fica na peça e cai no template global. Nomear a lacuna aqui é
        // o que impede o bloco de chegar ao cliente com o texto do template
        // sem ninguém saber por quê.
        posicoes_sem_variante: (ranking?.emptyBlocks ?? []).map((b) => ({
          block_index: b,
          section: sectionByBlock.get(b) ?? "",
          justificativa: parsed?.justificativas?.[b] ?? "",
        })),
        invalid_ids: ranking?.invalidIds ?? [],
        // A contradição que era SILENCIOSA: `toEntry` sobrepõe a prosa do
        // vault ao cadastro do banco e o prompt diz que o vault vence. Onde
        // as duas descrevem peças diferentes, o Curador decidia sobre uma e
        // o pipeline montava a outra. Agora as duas viajam no catálogo e o
        // par fica registrado aqui, com o slug e o id para consertar no
        // Obsidian.
        catalogo_divergente: p.catalogComExtras.divergentes,
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
    log.info(modo === "on" ? "curador_vault.done" : "shadow.done", {
      storeId: p.storeId,
      flowType: p.flowType,
      emailNumber: p.emailNumber,
      positions: ranking?.byBlock.size ?? 0,
      violations: violations.length,
      liveViolations: p.liveViolations.length,
      agreementPct: comparaveis > 0 ? Math.round((iguais / comparaveis) * 100) : null,
    })

    // A tentativa de mexer na sequência é ALTA: o guard já a desarmou, mas
    // ela diz que o prompt parou de ser obedecido — e é assim que se
    // descobre antes de virar email torto.
    if (p.catalogComExtras.divergentes.length > 0) {
      log.warn("curador_vault.catalogo_divergente", {
        storeId: p.storeId,
        total: p.catalogComExtras.divergentes.length,
        variantes: p.catalogComExtras.divergentes
          .slice(0, 10)
          .map((d) => `${d.slug}:${d.similaridade}`),
        hint: "o doc do vault e a linha do banco descrevem peças diferentes — conferir o variant_id da nota no Obsidian",
      })
    }

    if (divergencia) {
      log.warn("curador_vault.estrutura_divergente", {
        storeId: p.storeId,
        flowType: p.flowType,
        emailNumber: p.emailNumber,
        modo,
        motivos: divergencia.motivos,
        detalhe: divergencia.detalhe,
      })
    }

    // Shadow devolve null por definição: a saída existe só como telemetria.
    if (modo !== "on") return null
    // Ranking vazio conta como falha: o caller cai no caminho do kimi, que
    // tem retry e fail-closed próprios. Devolver um ranking sem posição
    // levaria o assembler ao CuratorFailedError sem ter tentado o fallback.
    if (!parsed || !ranking || ranking.malformed || ranking.byBlock.size === 0) {
      return null
    }
    return {
      papeis: conformidade.papeis,
      fioNarrativo: parsed.fioNarrativo,
      ranking,
      conformidade,
    }
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
        parsedOutput: { shadow: modo === "shadow", curador_vault_mode: modo },
        durationMs: Date.now() - t0,
      }).catch(() => {})
    }
    return null
  }
}
