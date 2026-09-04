/**
 * Component Assembler — a arquitetura do email de uma loja (épico CM).
 *
 * Três etapas, nesta ordem:
 *
 *   1. CURADOR (LLM) — recebe o catálogo INTEIRO da biblioteca no system
 *      prompt e rankeia até 3 variantes por posição, em ordem de
 *      preferência. Decide por descrição e metadados; não vê HTML nem
 *      schema.
 *   2. MONTADOR (LLM) — recebe os finalistas de TODAS as posições de uma vez,
 *      mais o `output_schema` de cada um, e escolhe UMA por posição olhando o
 *      email inteiro (coerência do conjunto e viabilidade de dados). Não
 *      escreve HTML nem copy.
 *   3. MONTAGEM (código) — concatena os HTMLs canônicos das escolhidas na
 *      ordem, dentro do shell de 600px, com os marcadores `cfy:block`. O
 *      resultado é persistido em `store_email_references` junto do
 *      `slot_map`, e passa a ocupar o papel do reference_html (build-vars).
 *
 * Modos de falha, deliberadamente diferentes:
 *   - Curador sem ranking utilizável → retry 1× e `CuratorFailedError`, sem
 *     gravar arquitetura. Não há mais score para servir de fallback, e
 *     composição arbitrária é pior que falha visível.
 *   - Montador falhando → cai no rank 1 do Curador e o email sai. Aqui o
 *     fallback é legítimo: o ranking já é uma composição avaliada posição a
 *     posição.
 *   - Nenhum bloco montável → nada é persistido e o consumidor cai no
 *     template global.
 */

import crypto from "crypto"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  EmailComponentVariant,
  ReferenceSlotMapEntry,
} from "@/types/email-generation"

import {
  logGenerationRun,
  resolveCostCents,
  finishGenerationRun,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import { buildCatalog, buildTypeIndex } from "./catalog-builder"
import {
  buildCatalogVaultExtras,
  buildConvivenciaBlock,
  buildEstruturasRefResumo,
  buildMomentoBlock,
  buildProtocoloBlock,
  buildSecaoNotasBlock,
  emptyCuradorVaultKnowledge,
  loadAprendizadosResumo,
  loadCuradorVaultKnowledge,
  loadCuradorVaultMode,
  loadEstruturaRefsResumo,
  loadVariantUsageCounts,
  momentoDoEmail,
  loadIndiceDoVault,
  loadMontadorMode,
  type MontadorMode,
} from "./curador-vault"
import { VAULT_TOOLS, executarFerramentaDoVault } from "./curador-vault-tools"
import {
  measureProtocolViolations,
  rank1ByBlock,
  runCuradorShadow,
  type CuradorVaultResultado,
} from "./curador-shadow"
import { fieldOrMissing, renderTopProducts } from "./store-context"
import { garantirHeroUnica } from "./hero-unica"
import type { TopProduct } from "@/types/email-workspace"
import { loadOrientacoes } from "../shared/orientacoes-loader"
import {
  aplicaveis as aplicaveisAoEmail,
  montarBlocoOrientacoes,
} from "../estruturador/orientacoes"
import {
  montarBlocoRevisao,
  type RevisaoHumana,
} from "../shared/revisao-humana"
import {
  parseCuratorRanking,
  rankingIds,
  type ParsedRanking,
  type RankedChoice,
} from "./curator-ranking.parser"
import {
  parseAssemblerChoices,
  decisionMap,
  type ParsedAssemblerChoices,
} from "./assembler-choice.parser"
import {
  deriveFieldNature,
} from "../shared/component-dimensions"
import { variantIsFillable as coherenceVariantIsFillable } from "@/lib/email-workspace/schema-example-coherence"
import { assembleDocument, validateBlockMarkers } from "./assemble-document"
import type { OutlineSection } from "./outline-sections"
import {
  interpolateSystem,
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "./llm-invoke"
import { renderImageTemplate } from "../image/template-renderer"
import {
  buildInterpolatedSegments,
  buildSegmentedPrompt,
  concatSegments,
  type InputSummaryItem,
  type SegmentOrigin,
} from "../shared/prompt-provenance"
import {
  loadCuradorMemory,
  logCuradorChoice,
  renderCuradorMemory,
  type ChoiceEntry,
} from "./curador-memory"

const log = logger.child("ComponentAssembler")

// ── PASSO A — Curador: rankeia até 3 variant_id por posição (story CM-3) ──
// O pré-filtro determinístico (score objectives/tones/density, top-8) SAIU: ele
// decidia quem o LLM podia ver a partir de três campos categóricos, antes de
// qualquer leitura de marca. Agora o Curador recebe o catálogo INTEIRO — no
// system prompt, para ser cacheável — e é ele quem corta.
const DEFAULT_CHOOSER_MODEL = "anthropic/claude-sonnet-4.6"

/** Teto de finalistas por posição (o Montador escolhe entre eles — CM-4). */
export const CHOOSER_TOP_N = 3

/**
 * Quantas finalistas o Curador legado devolve por posição, dado o
 * `montador_mode` (set/2026). Com o Montador desligado (20261107) só o
 * rank 1 é consumido — pedir 3 era pagar tokens por duas finalistas que
 * ninguém lia. O vault já roda com 1 (`SHADOW_TOP_N`); isto alinha o
 * fallback do kimi.
 */
export function chooserTopN(montadorMode: MontadorMode): number {
  return montadorMode === "on" ? CHOOSER_TOP_N : 1
}

/**
 * Tentativas do Curador antes de desistir. Sem o score do pré-filtro não há
 * fallback determinístico: uma composição escolhida por critério arbitrário
 * seria pior que uma falha visível (decisão CM-3).
 */
export const CHOOSER_MAX_ATTEMPTS = 2

/** Var do catálogo no system prompt — ausência é falha, não degradação. */
export const CATALOG_VAR = "{{catalogo}}"

/**
 * Teto de output do Curador. 12 posições × 3 UUIDs (≈20 tokens cada) + 12
 * motivos curtos ≈ 2,5k — os 2048 anteriores estourariam, e o parser não
 * recupera JSON truncado. Teto não é custo: cobra-se o que sai.
 */
export const CHOOSER_MAX_TOKENS = 8192

/**
 * O Curador não produziu composição utilizável. Sobe para o caller
 * (`generateBlueprintAndReference`) em vez de gravar arquitetura arbitrária.
 */
export class CuratorFailedError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`curador_failed:${reason}`)
    this.name = "CuratorFailedError"
    this.reason = reason
  }
}

/** `block_index` → motivo da 1ª indicação (telemetria). */
function topMotivos(parsed: ParsedRanking): Record<number, string> {
  const out: Record<number, string> = {}
  for (const [block, choices] of parsed.byBlock) {
    const m = choices[0]?.motivo
    if (m) out[block] = m
  }
  return out
}

/**
 * O ranking com NOME por posição (telemetria legível).
 *
 * `rankingIds` devolve `Record<block_index, variant_id[]>` — auditar
 * curadoria a partir disso exige cruzar UUID com a biblioteca à mão. Aqui o
 * nome viaja junto, mais a seção e o papel daquela posição.
 */
export function rankingDetalhado(
  ranking: Map<number, RankedChoice[]>,
  byId: Map<string, EmailComponentVariant>,
  sections: string[],
  labels: string[],
): Array<Record<string, unknown>> {
  return Array.from(ranking.keys())
    .sort((a, b) => a - b)
    .map((blockIndex) => ({
      block_index: blockIndex,
      section: sections[blockIndex] ?? "",
      label: labels[blockIndex] ?? sections[blockIndex] ?? "",
      opcoes: (ranking.get(blockIndex) ?? []).map((c, idx) => ({
        rank: idx + 1,
        variant_id: c.variant_id,
        name: byId.get(c.variant_id)?.name ?? "(variante fora do catálogo)",
        // Só o rank 1 tem motivo — é a tese do Curador para a posição.
        ...(idx === 0 && c.motivo ? { motivo: c.motivo } : {}),
      })),
    }))
}

export const DEFAULT_CHOOSER_SYSTEM = `Você é o Curador de Componentes de email da Convertfy. Para CADA posição da sequência de um email, você seleciona da biblioteca as ATÉ {{top_n}} variantes que melhor servem àquele email e àquela loja, em ordem de preferência.

Você decide pelo nome, pela descrição e pelos metadados de cada variante. Você NÃO recebe o HTML delas.

<protocolo_de_selecao>
Protocolo canônico de seleção (vault de componentes). Quando presente, ele é a LEI do processo: ELIMINAR ANTES DE RANKEAR, na ordem dos passos. As regras desta mensagem o complementam; em conflito, o protocolo vence.
{{protocolo}}
</protocolo_de_selecao>

<biblioteca>
Catálogo completo, agrupado por tipo de seção. Dentro de cada tipo a ordem é alfabética e NÃO carrega julgamento nenhum — não trate posição na lista como sinal de qualidade. Variantes com o campo \`vault\` trazem os eixos do protocolo (momento/objecao/registro/paleta/papel_na_peca + vetos), \`peso\` e \`convivencia\`.
{{catalogo}}
</biblioteca>

<convivencia>
Regras de coexistência entre variantes na MESMA peça (vault). O campo \`vault.convivencia\` de cada variante cita os slugs abaixo:
{{convivencias}}
</convivencia>

Como usar os eixos do vault (variantes com campo \`vault\`):
- momento SÓ elimina por VETO: se <momento> do email está em \`vault.momento_vetado\`, a variante está FORA. Declarar outro momento NÃO elimina — \`vault.momento\` diz onde a variante brilha, não onde ela é permitida. Ele é o PRIMEIRO eixo do ranking, nesta ordem: 1º quem declara o momento pedido, 2º quem tem lista vazia, 3º quem declara outros momentos.
- Material que a variante pede (foto, tipografia, tipo de campanha) NÃO elimina ninguém: a imagem é gerada depois. Adequação de material entra no ranking, nunca no corte.
- Ranking LEXICOGRÁFICO com degradação, na ordem: objecao → registro → paleta → papel_na_peca. Compare \`vault.objecao\` com a objeção-alvo deste email (da intenção/decisão servidas ou de <objecoes>); eixo que não separa os candidatos daquela seção é NEUTRO — desça para o próximo. \`registro_vetado\` que casa com o registro da marca elimina.
- \`vault.peso\` é orçamento QUALITATIVO da peça: evite indicar pesado/peca-inteira em posições consecutivas sem leve/medio entre elas — olhe o conjunto das posições, não cada uma isolada.
- \`vault.convivencia\`: respeite as regras de <convivencia> contra as variantes que você indica nas OUTRAS posições da mesma peça (ex.: prova social não duplica; grade de produtos não convive com review-vitrine).
- Empate total entre duplicatas de cadastro (mesmos eixos): vence o MENOR número no slug.
- Variante SEM campo \`vault\`: decida pelos metadados do banco (quando_usar/quando_nao_usar/objectives/tones) como sempre.

Regras de seleção:
- Para cada block_index da sequência, escolha SOMENTE entre variantes cujo tipo de seção é o daquela posição.
- Devolva ATÉ {{top_n}} por posição, em ordem de preferência — a 1ª é a sua recomendação. Se o tipo tiver menos de {{top_n}} variantes adequadas, devolva quantas houver: nunca complete a lista com uma variante que você rejeitaria.
- Respeite quando_nao_usar: se o contexto do email casa com um "quando NÃO usar", a variante está fora, não em último lugar.
- Prefira variantes cujos objectives/tones batem com o objetivo do outline e o tom de voz da loja.
- Use <perfil_marca> como âncora de identidade: a variante precisa caber na MARCA, não só no objetivo do email.
- <objecoes> é o que trava a compra desta loja. A variante escolhida precisa ter ANATOMIA para responder à objeção que este email enfrenta (prova social, FAQ, garantia, comparativo, demonstração). Bloco bonito que não responde a nenhuma objeção perde para o que responde.
- <vocabulario> é literal: são as palavras que esta marca usa e as que ela não usa. Variante cuja orientacao_copy exige o registro proibido (jargão que está em "Evitar") está fora — não é ajuste de copy, é incompatibilidade de marca.
- Produtos: cruze product_slots com <top_products>. NUNCA indique variante que exige mais produtos do que a loja tem cadastrado. Produto sem LINK não sustenta slot que precisa levar a uma página de produto.
- Use orientacao_copy como sinal de viabilidade: bloco que exige dado que a loja não tem (campo de cupom sem oferta no contexto) fica fora.
- Use <intencao> como contrato editorial: a intenção do FLOW diz o que a sequência inteira protege; a intenção DESTE email diz o que este toque precisa entregar ao terminar de ser lido. Variante que trai a intenção deste email está fora, mesmo que sirva ao objetivo genérico do outline. Se <intencao> declarar ausência, ignore o critério.
- Posição de <sequencia_do_email> com \`intencao\` foi escrita pela pessoa na aba Arquitetura: ela É o papel daquela posição. Rankeie por ela ANTES da intenção geral do email — variante cuja anatomia não entrega a intenção da posição fica atrás, mesmo que sirva ao email como um todo.
- Quando <decisao_do_estruturador> trouxer uma decisão, ela é o critério DOMINANTE por posição: o campo \`componente\` de cada posição de <sequencia_do_email> é o PAPEL que aquela posição cumpre no arco. Escolha a variante cuja ANATOMIA entrega aquele papel — a objeção dominante diz o que a posição precisa provar, o fio narrativo diz como as posições se ligam, e o porquê de cada papel diz o que NÃO pode se perder na escolha. Papel vence memória e vence preferência estética; marca e viabilidade (produtos/dados) continuam vetos absolutos.
- Use <memoria> como sinal, nunca como regra:
  - <email_anterior_desta_loja>: as variantes escolhidas no email ANTERIOR do MESMO flow desta loja. Busque COERÊNCIA visual — mesma linguagem de layout — sem copiar cegamente: cada email tem seu objetivo.
  - <mesmo_email_em_outras_lojas>: as variantes que ESTE mesmo email recebeu em OUTRAS lojas recentes. Busque VARIEDADE quando houver alternativa igualmente adequada à marca e ao objetivo.
  - Adequação à marca e ao objetivo SEMPRE vence a memória.
- HERO É ÚNICA: no máximo UMA posição do email pode receber variante da seção "hero" — é a abertura, e o email só tem uma. Para as demais posições, indique variantes de outra forma, mesmo que a anatomia da hero pareça servir.
- Duas posições do mesmo tipo (dois blocos de corpo, por exemplo) podem receber as mesmas indicações. Rankeie cada posição pelo mérito dela: quem garante variedade dentro do email é a etapa seguinte, não você.
- Se a descrição estiver vazia, decida pelo nome e pelos demais metadados.
- Não invente variant_id: use apenas ids presentes em <biblioteca>.

Responda APENAS o array JSON, sem markdown e sem texto ao redor. A ORDEM do array \`escolhas\` É a ordem de preferência. Somente a 1ª de cada posição leva \`motivo\` — uma frase de no máximo 20 palavras:

[{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"..."},{"variant_id":"..."},{"variant_id":"..."}]}]`

export const DEFAULT_CHOOSER_USER = `<store>
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

<decisao_do_estruturador>
{{estruturador_decisao}}
</decisao_do_estruturador>

<orientacao_do_coo>
Instrução direta de quem responde pelo método, escrita no Estúdio. Vale
sobre a memória e sobre sua preferência.
{{orientacao_coo}}
</orientacao_do_coo>

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

<momento>
{{momento}}
</momento>

<estruturas_de_referencia>
Referências concretas catalogadas para este flow (passo 2 do protocolo — quando alguma cobre este email, ela orienta papel e desempate):
{{estruturas_ref}}
</estruturas_de_referencia>

<notas_de_secao>
Notas de seção do vault para as seções DESTE email — cobertura e CHAVE DE DESEMPATE (passo 9 do protocolo):
{{secoes_notas}}
</notas_de_secao>

<memoria>
{{memoria}}
</memoria>

<sequencia_do_email>
{{blocks_json}}
</sequencia_do_email>

Para CADA block_index de <sequencia_do_email>, selecione em <biblioteca> as até {{top_n}} variantes do tipo daquela posição, em ordem de preferência. Responda APENAS o array JSON.`

// ── PASSO B — Montador: escolhe 1 entre os finalistas, olhando o email
// INTEIRO (story CM-4). Ele não escreve HTML nem copy: decide a COMPOSIÇÃO.
const DEFAULT_ASSEMBLER_MODEL = "anthropic/claude-opus-4.8"

/**
 * Teto de output do Montador. Era 16384 quando ele gerava o documento; agora
 * o output é um JSON de ~500 tokens.
 */
export const ASSEMBLER_MAX_TOKENS = 2048

export const DEFAULT_ASSEMBLER_SYSTEM = `Você é o Montador de Composição de email da Convertfy. O Curador já rankeou, para cada posição do email, até ${CHOOSER_TOP_N} variantes da biblioteca. Sua tarefa: escolher UMA por posição, olhando o EMAIL INTEIRO.

Você não escreve HTML e não escreve copy. Você decide a COMPOSIÇÃO.

O que só você vê: o schema de output de cada finalista — os campos que aquele bloco vai exigir da copy e das imagens, com tipo, limite e obrigatoriedade.

Como decidir:
- PADRÃO: fique com a 1ª indicação do Curador. Ela é o mérito daquela posição avaliada isoladamente. Você só sai dela por uma das razões abaixo.
- Quando <decisao_do_estruturador> trouxer uma decisão, o \`label\` de cada posição é o PAPEL que ela cumpre no arco — avalie os finalistas contra ele: a razão de CONJUNTO se mede pelo fio narrativo (as posições precisam conversar na ordem decidida) e a de VIABILIDADE pelo que o papel exige dos dados da loja. Finalista que não consegue CUMPRIR o papel é caso de viabilidade, mesmo sendo o rank 1. <intencao> protege o contrato do flow na escolha final (ex.: regra "sem desconto neste toque" derruba variante com slot de cupom obrigatório).
- Razão de CONJUNTO: duas posições ficariam com a mesma variante, ou com variantes de linguagem visual idêntica (mesma faixa, mesma anatomia); o email ficaria monótono ou desequilibrado na densidade; abertura e fechamento não conversam.
- Razão de VIABILIDADE: o schema do 1º exige dado que esta loja não tem (campo obrigatório de cupom sem oferta no contexto, mais slots de produto do que <top_products>) e o 2º ou o 3º resolve.
- Razão de HISTÓRICO: <memoria> mostra que a 1ª indicação já ocupou posição equivalente no email anterior desta loja, ou vem se repetindo em outras lojas, e existe finalista igualmente adequada.
- Razão de MARCA: o 1º choca com <perfil_marca> (anatomia que esta marca não usa) ou com <vocabulario> (a orientacao_copy dele exige o registro que a marca proíbe), e um finalista resolve.
- Razão de OBJEÇÃO: <objecoes> é o que trava a compra desta loja. O Curador rankeou cada posição ISOLADA — só você vê o email inteiro, e portanto só você percebe quando NENHUMA posição responde à objeção que este email enfrenta. Nesse caso, troque a posição onde a troca custa menos ao arco por um finalista que responda (prova social, FAQ, garantia, comparativo, demonstração). Uma resposta bem colocada basta: não transforme o email inteiro em quebra de objeção.
- HERO É ÚNICA: no máximo UMA posição do email pode ficar com variante da seção "hero" — é a abertura. Se dois finalistas de posições diferentes forem heroes, deixe a hero na posição cujo papel É a abertura e escolha outra forma para a outra; o código desfaz isso de qualquer jeito, e desfazer cega custa o bloco.
- Toda posição que tem finalistas recebe uma escolha. Descartar posição é decisão do sistema, não sua — nunca devolva posição em branco.
- Nunca escolha um variant_id que não esteja entre os finalistas daquela posição.

Responda APENAS o array JSON, sem markdown e sem texto ao redor. Uma entrada por posição, na ordem de block_index. \`rank\` é a colocação da variante escolhida no ranking do Curador (1, 2 ou 3). \`motivo\` é OBRIGATÓRIO quando rank for diferente de 1 e PROIBIDO quando rank for 1:

[{"block_index":0,"variant_id":"...","rank":1},{"block_index":1,"variant_id":"...","rank":2,"motivo":"..."}]`

export const DEFAULT_ASSEMBLER_USER = `<store>
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

<decisao_do_estruturador>
{{estruturador_decisao}}
</decisao_do_estruturador>

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

<finalistas_por_posicao>
{{finalists_json}}
</finalistas_por_posicao>

Escolha AGORA uma variante por posição, olhando o email inteiro. Responda APENAS o array JSON.`

export interface AssemblerChoice {
  block_index: number
  variant_id: string
  reasoning?: string
  brand_evidence?: string
}

// Tags de imagem canônicas ({{HERO_IMAGE}}, {{PRODUCT_1_THUMB_2}}...).
const IMAGE_TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*(?:IMAGE|THUMB)[A-Z0-9_]*)\s*\}\}/g

/**
 * Guard determinístico: tags de imagem presentes nos HTMLs das variantes
 * escolhidas mas AUSENTES no documento montado — o Montador as removeu ao
 * harmonizar (bug provado na Luxe Lift welcome#3: hero/products/body com
 * slot tagueado no input, zero tags de imagem no output → email em branco).
 * Puro, testável.
 */
export function findDroppedImageTags(
  chosenHtml: string,
  outputHtml: string,
): string[] {
  const collect = (s: string) =>
    new Set(Array.from(s.matchAll(IMAGE_TAG_PATTERN), (m) => m[1]))
  const input = collect(chosenHtml)
  const output = collect(outputHtml)
  return Array.from(input)
    .filter((t) => !output.has(t))
    .sort()
}

// ── Parsing + resolução (puro, testável) ───────────────────────────

/** Extrai o array de escolhas do output do LLM. Vazio se inválido. */
export function parseAssemblerOutput(raw: string): AssemblerChoice[] {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown
    if (!Array.isArray(json)) return []
    return json
      .filter(
        (c): c is Record<string, unknown> =>
          !!c &&
          typeof c === "object" &&
          typeof (c as Record<string, unknown>).block_index === "number" &&
          typeof (c as Record<string, unknown>).variant_id === "string",
      )
      .map((c) => ({
        block_index: c.block_index as number,
        variant_id: c.variant_id as string,
        // Campos auxiliares opcionais (telemetria/auditoria) — ignorados na
        // montagem, guardados para inspeção.
        ...(typeof c.reasoning === "string" ? { reasoning: c.reasoning } : {}),
        ...(typeof c.brand_evidence === "string"
          ? { brand_evidence: c.brand_evidence }
          : {}),
      }))
  } catch {
    return []
  }
}

/**
 * Aplica as escolhas do LLM sobre os finalistas de cada bloco, com
 * fallback determinístico para o top-1. Blocos sem candidato são pulados.
 */
export function resolveChoices(
  candidatesByBlock: EmailComponentVariant[][],
  llmChoices: AssemblerChoice[],
): EmailComponentVariant[] {
  const choiceMap = new Map(llmChoices.map((c) => [c.block_index, c.variant_id]))
  const out: EmailComponentVariant[] = []
  candidatesByBlock.forEach((finalists, i) => {
    if (finalists.length === 0) return // sem candidato → pula bloco
    const chosenId = choiceMap.get(i)
    const chosen = chosenId
      ? finalists.find((v) => v.id === chosenId)
      : undefined
    out.push(chosen ?? finalists[0]) // fallback top-1
  })
  return out
}

/** Slot ordenado da estrutura do email: ou uma variante escolhida, ou um bloco
 * sem variante na biblioteca (que vira placeholder com nota no fallback). */
export type AssemblySlot =
  | { kind: "variant"; variant: EmailComponentVariant; section: string; label: string }
  | { kind: "missing"; section: string; label: string }

/**
 * Escolha do Curador/Montador por parte do email — persistida em
 * store_email_references.slot_map. Missing → variant_id null. Pura.
 *
 * `skipped` (stats da montagem) marca quais slots NÃO entraram no
 * documento. Ter variante não basta: a montagem também descarta HTML vazio
 * e fragmento irrecuperável. Sem esse dado o dispatch pediria copy para
 * seção que não existe no email.
 */
export function slotMapFromSlots(
  slots: AssemblySlot[],
  skipped: ReadonlyArray<{ block_index: number }> = [],
): ReferenceSlotMapEntry[] {
  const fora = new Set(skipped.map((s) => s.block_index))
  return slots.map((s, i) => ({
    block_index: i,
    section: s.section,
    label: s.label,
    variant_id: s.kind === "variant" ? s.variant.id : null,
    variant_name: s.kind === "variant" ? s.variant.name : null,
    assembled: s.kind === "variant" && !fora.has(i),
  }))
}

/** Extrai o documento HTML do output do LLM (remove fences + prosa ao redor). */
export function extractHtml(raw: string): string {
  let s = raw.replace(/```(?:html)?\s*/gi, "").replace(/```/g, "").trim()
  const doctype = s.search(/<!DOCTYPE html/i)
  if (doctype > 0) {
    s = s.slice(doctype)
  } else {
    const htmlOpen = s.search(/<html[\s>]/i)
    if (htmlOpen > 0) s = s.slice(htmlOpen)
  }
  const end = s.toLowerCase().lastIndexOf("</html>")
  if (end >= 0) s = s.slice(0, end + "</html>".length)
  return s.trim()
}

/** Heurística: o output parece um documento HTML de email utilizável. */
export function looksLikeHtml(s: string): boolean {
  return /<\/html>/i.test(s) && /<(div|table|body)[\s>]/i.test(s)
}

// ── Orquestração (I/O) ─────────────────────────────────────────────

export interface AssembleReferenceInput {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  /**
   * Email/flow desta geração — vão nas runs de telemetria. A fase 1 opera
   * por (loja × flow × número), mas sem estes ids as runs ficam invisíveis
   * na UI (resolvida por email). null quando o email não está seedado.
   */
  emailId?: string | null
  flowId?: string | null
  brandName: string
  nicho: string
  posicionamento: string
  tomVoz: string
  mood: string
  persona: string
  // Perfil da marca já resolvido pelo chamador (briefing curado quando
  // existe, senão a Pesquisa & Diagnóstico SEM o review de anúncios). O nome
  // antigo era `briefingJson` e mentia: desde o fallback de ago/2026 isto
  // raramente é JSON de briefing.
  perfilMarca: string
  /**
   * Revisões humanas de estrutura aplicáveis (migration 20261088). O Curador
   * e o Montador só recebem as que o operador MARCOU para eles — a ordem é
   * trabalho do Estruturador, e nem toda correção de ordem diz algo sobre
   * escolha de variante.
   */
  revisoes?: RevisaoHumana[]
  // Objeções do cliente ideal, já renderizadas (`resolveObjecoes`).
  objecoes: string
  // Vocabulário literal da marca, já renderizado (`resolveVocabulario`).
  vocabulario: string
  // Top 5 produtos da loja (rank asc), com preço e link quando existem — o
  // Curador cruza com product_slots dos candidatos. Vazio quando a loja não
  // tem produtos cadastrados.
  topProducts: TopProduct[]
  // Diretriz de alto nível do outline (estrutura geral): objetivo + guidance + tom.
  outlineObjective: string
  outlineGuidance: string
  outlineToneHint: string
  /** "O e-mail não deve" da aba Arquitetura (uma restrição por linha). */
  outlineRestricoes?: string
  // Template de referência curado global (email_reference_templates) p/ este
  // flow×email — guia de estrutura/estilo para a escolha das variantes (NÃO é
  // copiado). "" quando não há curado. Independe do papel de fallback que a
  // mesma fonte mantém no build-vars (consumidor).
  referenceTemplateHtml: string
  // Estrutura geral do outline (categoria + rótulo original), na ordem. É o
  // que o Montador segue pra gerar 1 bloco por componente.
  structure: OutlineSection[]
  // Modelo default da aba Configurações — usado nos fallbacks quando o
  // agente (Curador/Montador) NÃO tem config ativa em email_agent_configs.
  defaultModel?: string | null
  // Fontes aprovadas da loja (store_brand_identity). Normalizam a
  // tipografia do documento montado: componentes vêm de origens diferentes
  // (Arial, Courier, Trebuchet) e sem isso o email sai com 3 tipografias.
  // O phase2 normaliza de novo a cada geração — a loja pode trocar de fonte
  // sem invalidar a arquitetura persistida.
  fontHeading?: string | null
  fontBody?: string | null
  fontHeadingWeight?: string | null
  fontBodyWeight?: string | null
  // ── Contrato editorial do vault (email_intents) — critério do Curador ──
  // Intenção do FLOW (o que a sequência inteira protege) e DESTE email (o
  // que este toque precisa entregar). null = vault sem material — o prompt
  // declara a ausência em vez de mandar string vazia.
  intencaoFlow?: string | null
  intencaoEmail?: string | null
  // Decisão do Estruturador (saída completa, JSON) — só chega quando
  // o modo é 'on' e a run validou (em shadow o pipeline não vê a decisão).
  // Papéis na MESMA ordem da structure/<sequencia_do_email>.
  estruturadorDecisao?: string | null
}

// "code" = documento concatenado pelo código a partir das variantes
//   escolhidas (story CM-2 — substituiu o "llm" do Montador).
// "store" = reference+blueprint já persistidos foram REUSADOS sem regerar
//   (guard de reuso do generate.service; só com force=false).
// "llm" = legado: reference gravada pelo Montador LLM antes do CM-2.
export type ReferenceSource = "llm" | "code" | "global" | "none" | "store"

/**
 * A <sequencia_do_email> que os dois Curadores leem. `componente` é o
 * rótulo por posição (papel do Estruturador, intenção humana truncada ou
 * rótulo do outline); `intencao` só aparece quando a pessoa a escreveu na
 * Arquitetura — é a âncora da posição. Puro, exportado para teste.
 */
export function sequenciaParaJson(
  structure: ReadonlyArray<{ section: string; label: string; intencao?: string | null }>,
): string {
  return JSON.stringify(
    structure.map((s, i) => ({
      block_index: i,
      section: s.section,
      componente: s.label,
      ...((s.intencao ?? "").trim() ? { intencao: (s.intencao ?? "").trim() } : {}),
    })),
  )
}

export interface AssembleReferenceResult {
  html: string | null
  variantIds: string[]
  // Fonte do reference HTML deste run — informa o dispatch (settle) e a página
  // de Logs de geração: "llm" = Montador gerou; "global" = caiu no template
  // curado (email_reference_templates); "none" = sem LLM e sem global curado.
  source: ReferenceSource
  // Slots ordenados da estrutura (variante escolhida ou missing) — insumo do
  // builder determinístico de blueprint NO MESMO RUN. Não confundir com
  // variantIds (que pula os missing e por isso não casa com a estrutura).
  slots: AssemblySlot[]
  /**
   * Curador do vault (modo `on`): papel de cada posição, alinhado à
   * ESTRUTURA de entrada (índice a índice, `""` onde não veio), e o fio
   * narrativo. `null` quando o Curador vigente é o antigo — aí o consumidor
   * segue no que já fazia. É por aqui que a decisão editorial do Curador
   * chega ao `purpose` de cada bloco.
   */
  papeisPorPosicao: string[] | null
  fioNarrativo: string | null
}

/**
 * Guard de elegibilidade (D8, 20/08): variante é PREENCHÍVEL quando tem
 * schema E pelo menos uma âncora real no HTML — example de texto
 * encontrável OU token de imagem casável (a régua única de
 * schema-example-coherence, a MESMA do merge em produção). O guard antigo
 * exigia {{TAG}} e excluía as 30 variantes autoradas da biblioteca real —
 * que nunca adotaram placeholder e sempre foram preenchíveis por example.
 */
export function variantIsFillable(v: EmailComponentVariant): boolean {
  return coherenceVariantIsFillable({
    html: v.html ?? "",
    output_schema: v.output_schema ?? null,
  })
}

/**
 * Carrega as variantes ativas agrupadas por block_type.
 *
 * Exportada porque a resolução do segmento `catalogo` (a UI do Estúdio pede
 * o catálogo de ~120k que não viaja na run) TEM de usar exatamente o mesmo
 * pool desta função — reimplementar o filtro de elegibilidade lá faria o
 * sha8 divergir e o painel acusar "biblioteca mudou" sem ter mudado.
 */
export async function loadActiveVariantsByType(): Promise<{
  /** Todas as elegíveis, em ordem de chegada (o catálogo reordena). */
  all: EmailComponentVariant[]
  byType: Map<string, EmailComponentVariant[]>
  excludedUntagged: Record<string, string[]>
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_component_variants")
    .select("*")
    .eq("is_active", true)
  const all: EmailComponentVariant[] = []
  const byType = new Map<string, EmailComponentVariant[]>()
  const excludedUntagged: Record<string, string[]> = {}
  if (error) {
    log.error("variants.load_failed", { error: error.message })
    return { all, byType, excludedUntagged }
  }
  for (const v of (data as EmailComponentVariant[] | null) ?? []) {
    if (!variantIsFillable(v)) {
      ;(excludedUntagged[v.block_type] ??= []).push(v.name)
      continue
    }
    all.push(v)
    const arr = byType.get(v.block_type) ?? []
    arr.push(v)
    byType.set(v.block_type, arr)
  }
  if (Object.keys(excludedUntagged).length > 0) {
    log.warn("chooser.candidates_excluded_unfillable", { excludedUntagged })
  }
  return { all, byType, excludedUntagged }
}

/**
 * Finalistas por posição para o Montador (story CM-4).
 *
 * Cada opção leva os metadados do Curador MAIS o `output_schema` COMPACTO —
 * `key`, `label`, `type`, `nature`, `max_len`, `required`. É o insumo
 * exclusivo dele: revela que um bloco vai EXIGIR campo obrigatório de cupom
 * ou 4 slots de produto numa loja com 2.
 *
 * `example` e `guidance` do schema ficam de fora: servem à copy e à imagem,
 * não à escolha. HTML também não entra — o Montador não escreve nada.
 */
export function buildFinalistsJson(params: {
  ranking: Map<number, RankedChoice[]>
  byId: Map<string, EmailComponentVariant>
  sections: string[]
  labels: string[]
}): string {
  const { ranking, byId, sections, labels } = params
  const positions = Array.from(ranking.keys())
    .sort((a, b) => a - b)
    .map((blockIndex) => ({
      block_index: blockIndex,
      section: sections[blockIndex] ?? "",
      label: labels[blockIndex] ?? sections[blockIndex] ?? "",
      opcoes: (ranking.get(blockIndex) ?? []).flatMap((choice, idx) => {
        const v = byId.get(choice.variant_id)
        if (!v) return []
        return [
          {
            rank: idx + 1,
            variant_id: v.id,
            name: v.name,
            description: v.description ?? "",
            quando_usar: v.when_use ?? "",
            quando_nao_usar: v.when_not_use ?? "",
            product_slots: v.product_slots ?? 0,
            orientacao_copy: v.copy_guidance ?? "",
            notas_implementacao: v.long_description ?? "",
            // Só no rank 1: é a tese do Curador para aquela posição.
            ...(idx === 0 && choice.motivo
              ? { motivo_curador: choice.motivo }
              : {}),
            campos: (v.output_schema ?? []).map((f) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              nature: deriveFieldNature(f),
              max_len: f.max_len ?? 0,
              required: f.required === true,
            })),
          },
        ]
      }),
    }))
  return JSON.stringify(positions)
}

/**
 * Notas do vault podem ser longas; acima disso o critério vira ruído no
 * prompt do Curador. Corta com marcador explícito (nunca em silêncio).
 */
const PROMPT_TEXT_MAX = 4000

function clampPromptText(v: string | null | undefined, ausente: string): string {
  const t = v?.trim()
  if (!t) return ausente
  if (t.length <= PROMPT_TEXT_MAX) return t
  return `${t.slice(0, PROMPT_TEXT_MAX)}\n(… truncado)`
}

// ── Resumos da aba "Entrada" do Estúdio ────────────────────────────────
// O painel mostra O QUE o agente recebeu, não o conteúdo inteiro: dizer
// "5 objeções" ou "22 usar / 28 evitar" é o que deixa "não recebeu nada"
// distinguível de "recebeu e ignorou" sem abrir o prompt.

function resumoObjecoes(bloco: string): string {
  const n = bloco.split("\n").filter((l) => l.trim().startsWith("- ")).length
  return n > 0 ? `${n} objeções` : "(não cadastradas)"
}

function resumoVocabulario(bloco: string): string {
  const conta = (prefixo: string): number => {
    const linha = bloco.split("\n").find((l) => l.startsWith(prefixo))
    if (!linha) return 0
    return linha.slice(prefixo.length).split(",").filter((w) => w.trim()).length
  }
  const usar = conta("Usar: ")
  const evitar = conta("Evitar: ")
  return usar + evitar > 0
    ? `${usar} usar / ${evitar} evitar`
    : "(não cadastrado)"
}

function resumoProdutos(produtos: ReadonlyArray<TopProduct>): string {
  if (produtos.length === 0) return "(sem produtos)"
  const comLink = produtos.filter((p) => p.url?.trim()).length
  return `${produtos.map((p) => p.name).join("; ")} — ${comLink}/${produtos.length} com link`
}

// ── Proveniência (plano telemetria 26/08): origem de cada var do prompt ──
// Compartilhadas entre Curador e Montador (os templates repetem as vars).

const LOJA = { cls: "loja" as const, rotulo: "Dados da loja — client_stores" }

function editorialOrigins(estruturadorOn: boolean): Record<string, SegmentOrigin> {
  return {
    brand_name: LOJA,
    nicho: LOJA,
    posicionamento: LOJA,
    persona: LOJA,
    tom_voz: LOJA,
    outline_objective: { cls: "curadoria", rotulo: "Outline global — email_outline_templates" },
    // Com o Estruturador 'on', o guidance É o fio narrativo dele.
    outline_guidance: estruturadorOn
      ? { cls: "upstream", rotulo: "Fio narrativo — SAÍDA do Estruturador" }
      : { cls: "curadoria", rotulo: "Outline global — email_outline_templates" },
    outline_tone_hint: { cls: "curadoria", rotulo: "Outline global — email_outline_templates" },
    outline_restricoes: {
      cls: "curadoria",
      rotulo: "O e-mail NÃO deve — aba Arquitetura",
    },
    intencao_flow: { cls: "vault", rotulo: "Intenção do flow — email_intents" },
    intencao_email: { cls: "vault", rotulo: "Intenção DESTE email — email_intents" },
    estruturador_decisao: { cls: "upstream", rotulo: "Decisão do Estruturador — saída completa (JSON)" },
    briefing_marca: {
      cls: "loja",
      rotulo: "Perfil da marca — store_briefings ou Pesquisa (sem o review de anúncios)",
    },
    objecoes: {
      cls: "loja",
      rotulo: "Objeções do cliente ideal — client_stores.icp_objections",
    },
    top_n: { cls: "sistema", rotulo: "Teto de finalistas por posição — montador_mode (código)" },
    // Diretriz viva do COO (migration 20261111) — NÃO é vault: o vault é o
    // corpus curado, isto é instrução direta e de efeito imediato. Sem esta
    // linha o guard de recomposição derruba os segmentos da run inteira.
    orientacao_coo: {
      cls: "curadoria",
      rotulo: "Orientação do COO ao Curador — estruturador_orientacoes (agente=curador)",
    },
    revisao_humana: {
      cls: "curadoria",
      rotulo: "Revisão humana da estrutura — email_structure_reviews",
    },
    vocabulario: {
      cls: "loja",
      rotulo: "Vocabulário literal — client_stores.tone_use_words / tone_avoid_words",
    },
    top_products: {
      cls: "loja",
      rotulo: "Produtos da loja — store_top_products (nome, preço e link)",
    },
    blocks_json: estruturadorOn
      ? { cls: "upstream", rotulo: "Sequência do email — decidida pelo Estruturador" }
      : { cls: "sistema", rotulo: "Sequência do email — derivada do outline por código" },
    memoria: { cls: "sistema", rotulo: "Memória do Curador — escolhas anteriores (código)" },
    finalists_json: { cls: "upstream", rotulo: "Finalistas — SAÍDA do Curador + schemas da biblioteca" },
    // Cérebro do vault de componentes (31/08).
    momento: { cls: "sistema", rotulo: "Momento do email — derivado de flow_type/número (código) + nota do eixo (vault)" },
    estruturas_ref: { cls: "vault", rotulo: "Estruturas de referência do flow — email_structure_refs" },
    secoes_notas: { cls: "vault", rotulo: "Notas de seção — email_vault_docs (componentes/secoes)" },
  }
}

/**
 * Monta o reference HTML da loja a partir dos blocos do blueprint.
 * Retorna `html: null` quando não há nenhuma variante (consumidor cai no
 * template global).
 */
export async function assembleStoreReference(
  input: AssembleReferenceInput,
): Promise<AssembleReferenceResult> {
  const sections = input.structure.map((s) => s.section)
  const { all: eligible, byType: poolByType, excludedUntagged } =
    await loadActiveVariantsByType()

  // Cérebro do vault de componentes (31/08): protocolo de seleção, eixos
  // por variante, notas de seção e convivência — sincronizados
  // em email_vault_docs. O call VIVO só os recebe no modo 'on' do rollout
  // (curador_vault_mode); em 'off'/'shadow' as vars declaram ausência e o
  // comportamento vivo é o de sempre (o shadow roda em call paralelo).
  // Fail-open em tudo: sem sync/tabela/coluna, degrada para 'off'.
  const curadorVaultMode = await loadCuradorVaultMode(input.storeId)
  // Orientações do COO ao CURADOR (migration 20261111). Fail-open no
  // loader: sem a coluna `agente`, volta vazio e o prompt declara ausência.
  const orientacoesCurador = await loadOrientacoes("curador")
  // Conhecimento carregado em shadow E on (o shadow precisa dele); as vars
  // do call VIVO só o recebem em 'on'.
  const vaultKnowledge =
    curadorVaultMode !== "off"
      ? await loadCuradorVaultKnowledge()
      : emptyCuradorVaultKnowledge()
  const estruturasRefAll =
    curadorVaultMode !== "off" ? await loadEstruturaRefsResumo(input.flowType) : []
  const vault = curadorVaultMode === "on" ? vaultKnowledge : emptyCuradorVaultKnowledge()
  const vaultExtras = buildCatalogVaultExtras(vault, eligible)
  const estruturasRef = curadorVaultMode === "on" ? estruturasRefAll : []

  // Catálogo COMPLETO (todas as seções) em ordem estável — vai no system
  // prompt para ser cacheado, e cache é endereçado por conteúdo: filtrar por
  // email ou embaralhar por loja mataria o cache (story CM-3). Os extras do
  // vault entram POR variante (mesma ordem estável — continua cacheável).
  const catalog = buildCatalog(eligible, vaultExtras)
  const typeIndex = buildTypeIndex(eligible)

  const blocksJson = sequenciaParaJson(input.structure)
  const intencoesHumanas = input.structure.filter((s) => (s.intencao ?? "").trim()).length
  const curatedReference = input.referenceTemplateHtml.trim()
  const t0 = Date.now()

  // Nenhuma seção da estrutura tem variante elegível → nem chama o LLM. Não
  // persiste: o consumidor (build-vars) cai no template global.
  if (sections.every((section) => (poolByType.get(section) ?? []).length === 0)) {
    log.warn("assembler.library_covers_nothing", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      sections,
    })
    return {
      html: curatedReference || "",
      variantIds: [],
      source: curatedReference ? "global" : "none",
      slots: sections.map((section, i) => ({
        kind: "missing" as const,
        section,
        label: input.structure[i]?.label ?? section,
      })),
      papeisPorPosicao: null,
      fioNarrativo: null,
    }
  }

  // Memória do Curador: escolha do email anterior desta loja (coerência) +
  // escolhas do mesmo email em outras lojas do org (variedade). Best-effort —
  // nunca derruba a geração; org_id resolvido aqui é reusado no log.
  const memory = await loadCuradorMemory(
    input.storeId,
    input.flowType,
    input.emailNumber,
  )

  // Kill-switch do Montador (migration 20261107), lido ANTES do Curador
  // porque decide quantas finalistas pedir: desligado, só o rank 1 é
  // consumido e o teto cai para 1 (set/2026).
  const montadorMode = await loadMontadorMode(input.storeId)
  const topN = chooserTopN(montadorMode)

  // ── PASSO A — Curador: rankeia até `topN` por posição.
  // O HTML das variantes NÃO entra: o catálogo é só nome + descrição +
  // metadados, e vai no SYSTEM para ser cacheável.
  //
  // Prompt vazio na config → cai no DEFAULT in-code, como nos chains da fase
  // 2. É o que a migration do CM-3 grava (corte seco: system_prompt = '') e
  // também o que faz o guard de {{catalogo}} não disparar em falso.
  const chooserRow = await loadActiveAgentConfig("assembler_chooser")
  const chooserConfig: AgentInvokeConfig = {
    model: chooserRow?.model || input.defaultModel || DEFAULT_CHOOSER_MODEL,
    temperature: chooserRow?.temperature ?? 0.2,
    max_tokens: chooserRow?.max_tokens ?? CHOOSER_MAX_TOKENS,
    system_prompt: chooserRow?.system_prompt?.trim() || DEFAULT_CHOOSER_SYSTEM,
    user_template: chooserRow?.user_template?.trim() || DEFAULT_CHOOSER_USER,
  }

  const chooserVars: Record<string, string> = {
    brand_name: input.brandName,
    // Campo vazio é ruído que o modelo pula; o marcador redireciona para
    // <perfil_marca>, que agora carrega a Pesquisa quando não há briefing.
    nicho: fieldOrMissing(input.nicho),
    posicionamento: fieldOrMissing(input.posicionamento),
    persona: fieldOrMissing(input.persona),
    tom_voz: fieldOrMissing(input.tomVoz),
    outline_objective: input.outlineObjective,
    outline_guidance: input.outlineGuidance,
    outline_tone_hint: input.outlineToneHint,
    outline_restricoes: (input.outlineRestricoes ?? "").trim() || "(sem restrições declaradas)",
    // Contrato editorial do vault. Ausência é DECLARADA (não string vazia):
    // instrui o modelo a ignorar o critério em vez de alucinar intenção.
    intencao_flow: clampPromptText(
      input.intencaoFlow,
      "(não catalogada — siga o outline e o perfil da marca)",
    ),
    intencao_email: clampPromptText(
      input.intencaoEmail,
      "(não catalogada — siga o outline e o perfil da marca)",
    ),
    // Decisão do Estruturador (só no modo 'on' com run ok). SEM o clamp de
    // 4000 do clampPromptText: é a saída COMPLETA em JSON (~10k chars na
    // Innova) e cortá-la a 4000 deixaria o Curador sem as posições finais,
    // o fio e os descartes — exatamente o que o owner pediu que chegasse
    // inteiro (02/09). O teto de segurança (24k) já vive em
    // `decisaoCompletaParaCurador`.
    estruturador_decisao:
      input.estruturadorDecisao?.trim() ||
      "(sem decisão do Estruturador nesta geração — siga o outline)",
    // Perfil da marca — ancora a escolha na identidade, não só no objetivo
    // do email.
    briefing_marca: input.perfilMarca,
    // Objeções e vocabulário em blocos PRÓPRIOS (27/08). Os dois já viajavam
    // dentro do perfil, enterrados em "O que a faz hesitar" e "Vocabulário ·
    // Usar/Evitar" — dado presente que ninguém usava como critério.
    objecoes: input.objecoes,
    vocabulario: input.vocabulario,
    top_n: String(topN),
    // Orientação do COO ao CURADOR (migration 20261111) — a do Estruturador
    // não entra aqui: são papéis diferentes e a tabela as separa por
    // `agente`.
    orientacao_coo: montarBlocoOrientacoes(
      aplicaveisAoEmail(orientacoesCurador, input.flowType, input.emailNumber),
    ),
    revisao_humana: montarBlocoRevisao(input.revisoes ?? [], "curador"),
    // Top 5 produtos com preço e LINK — cruza com product_slots (não indicar
    // bloco de 4 produtos em loja com 2, nem slot que leva a lugar nenhum).
    top_products: renderTopProducts(input.topProducts),
    blocks_json: blocksJson,
    memoria: renderCuradorMemory(memory),
    // Cérebro do vault (31/08): momento deste email (filtro do passo 5),
    // estruturas de referência do flow (passo 2) e notas de seção com a
    // chave de desempate (passo 9). Ausência sempre DECLARADA.
    momento: buildMomentoBlock(vault, input.flowType, input.emailNumber),
    estruturas_ref: buildEstruturasRefResumo(estruturasRef),
    secoes_notas: buildSecaoNotasBlock(vault, sections),
  }

  // Blocos de SYSTEM do vault — conteúdo idêntico entre lojas (cacheável),
  // interpolados junto com o catálogo.
  const vaultSystemVars = {
    protocolo: buildProtocoloBlock(vault),
    convivencias: buildConvivenciaBlock(vault),
  }

  // Guard: o system é editável na aba Agentes. Sem o catálogo o Curador
  // escolheria no vazio — falha explícita é melhor que escolha inventada.
  if (!chooserConfig.system_prompt.includes(CATALOG_VAR)) {
    log.error("assembler.chooser_catalog_missing", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      hasActiveConfig: Boolean(chooserRow),
    })
    throw new CuratorFailedError("catalogo_ausente")
  }

  // Auditoria do Estúdio (26/08 — "cadê o prompt do Curador?"): a run passa
  // a guardar o USER prompt RENDERIZADO (o MESMO userMessage do invoke) e os
  // sha8 do system resolvido e do catálogo. O system de ~120k chars fica de
  // fora do rendered_prompt de propósito (é o catálogo cacheável,
  // reconstruível por conteúdo via buildCatalog + sha); o prompt de user —
  // loja, perfil, sequência, intenções — NÃO era reconstruível sem isso.
  const catalogSha8 = crypto
    .createHash("sha256")
    .update(catalog.json)
    .digest("hex")
    .slice(0, 8)
  const chooserSystemResolvido = interpolateSystem(chooserConfig.system_prompt, {
    catalogo: catalog.json,
    ...vaultSystemVars,
  })
  const chooserSystemSha8 = crypto
    .createHash("sha256")
    .update(chooserSystemResolvido)
    .digest("hex")
    .slice(0, 8)

  const estruturadorOn = Boolean(input.estruturadorDecisao?.trim())
  const origins = editorialOrigins(estruturadorOn)

  // Proveniência: user via helper (fail-open p/ template custom com {{#}});
  // system = [regras agente] + [catálogo por ref+sha8] + [regras agente] —
  // os ~120k do catálogo NÃO viajam no segmento, a UI resolve sob demanda.
  const segChooserUser = buildSegmentedPrompt(
    chooserConfig.user_template,
    chooserVars,
    origins,
    { parte: "user" },
  )
  const chooserUserPrompt = segChooserUser.segments
    ? segChooserUser.prompt
    : renderImageTemplate(chooserConfig.user_template, chooserVars)
  const segChooserSystem = buildInterpolatedSegments(
    chooserConfig.system_prompt,
    { catalogo: catalog.json, ...vaultSystemVars },
    {
      catalogo: {
        cls: "biblioteca",
        rotulo: `Catálogo da biblioteca — ${catalog.total} variantes (buildCatalog${vaultExtras.size > 0 ? ` + eixos do vault em ${vaultExtras.size}` : ""})`,
        ref: "catalogo",
        sha8: catalogSha8,
      },
      protocolo: { cls: "vault", rotulo: "Protocolo de seleção — email_vault_docs (componentes)" },
      convivencias: { cls: "vault", rotulo: "Regras de convivência — email_vault_docs (componentes)" },
    },
    { parte: "system" },
  )
  const chooserPromptSegments = concatSegments(
    segChooserSystem.prompt === chooserSystemResolvido
      ? segChooserSystem.segments
      : null,
    segChooserUser.segments,
  )
  const chooserInputSummary: InputSummaryItem[] = [
    { rotulo: "Loja", cls: "loja", valor: `${input.brandName} — ${fieldOrMissing(input.nicho)}` },
    { rotulo: "Email", cls: "sistema", valor: `${input.flowType} #${input.emailNumber} · ${input.structure.length} posições` },
    { rotulo: "Catálogo da biblioteca", cls: "biblioteca", valor: `${catalog.total} variantes · ${catalog.types.length} tipos · sha8 ${catalogSha8}` },
    { rotulo: "Outline", cls: "curadoria", valor: input.outlineObjective || "(sem objetivo)" },
    {
      rotulo: "Sequência do email",
      cls: estruturadorOn ? "upstream" : "sistema",
      valor: estruturadorOn
        ? "decidida pelo Estruturador (papéis por posição)"
        : "derivada do outline por código",
    },
    { rotulo: "Intenção do flow (vault)", cls: "vault", valor: input.intencaoFlow?.trim() ? "servida" : "(não catalogada)" },
    { rotulo: "Intenção deste email (vault)", cls: "vault", valor: input.intencaoEmail?.trim() ? "servida" : "(não catalogada)" },
    { rotulo: "Intenções por bloco (Arquitetura)", cls: "curadoria", valor: `${intencoesHumanas} de ${input.structure.length} posições` },
    { rotulo: "Decisão do Estruturador", cls: "upstream", valor: estruturadorOn ? "servida — saída completa (diagnóstico, posições, fio, fontes, descartes)" : "(sem decisão nesta geração)" },
    { rotulo: "Perfil da marca", cls: "loja", valor: `${input.perfilMarca.length.toLocaleString("pt-BR")} chars (sem o review de anúncios)` },
    {
      rotulo: "Orientação do COO",
      cls: "curadoria",
      valor: (() => {
        const n = aplicaveisAoEmail(
          orientacoesCurador,
          input.flowType,
          input.emailNumber,
        ).filter((o) => (o.texto ?? "").trim()).length
        return n > 0 ? `${n} escrita(s) para o Curador` : "(nenhuma registrada)"
      })(),
    },
    { rotulo: "Objeções", cls: "loja", valor: resumoObjecoes(input.objecoes) },
    { rotulo: "Vocabulário", cls: "loja", valor: resumoVocabulario(input.vocabulario) },
    { rotulo: "Top produtos", cls: "loja", valor: resumoProdutos(input.topProducts) },
    { rotulo: "Memória do Curador", cls: "sistema", valor: renderCuradorMemory(memory).slice(0, 200) },
    {
      rotulo: "Vault de componentes",
      cls: "vault",
      valor:
        vault.total > 0
          ? `modo ${curadorVaultMode} · protocolo ${vault.protocolo ? "servido" : "AUSENTE"} · eixos em ${vaultExtras.size}/${catalog.total} variantes · ${vault.secoes.size} notas de seção · ${vault.convivencias.length} convivências`
          : `modo ${curadorVaultMode} — call vivo pelos metadados do banco`,
    },
    {
      rotulo: "Momento do email",
      cls: "sistema",
      valor: momentoDoEmail(input.flowType, input.emailNumber) ?? `(não mapeado p/ ${input.flowType})`,
    },
    {
      rotulo: "Estruturas de referência",
      cls: "vault",
      valor: estruturasRef.length > 0 ? `${estruturasRef.length} do flow ${input.flowType}` : "(nenhuma catalogada)",
    },
  ]
  const chooserInputVars = {
    sections: input.structure.length,
    catalog_variants: catalog.total,
    catalog_sha8: catalogSha8,
    system_sha8: chooserSystemSha8,
    // Critérios editoriais servidos nesta run (auditoria do Estúdio).
    has_intencao_flow: Boolean(input.intencaoFlow?.trim()),
    has_intencao_email: Boolean(input.intencaoEmail?.trim()),
    // Posições com intenção escrita na Arquitetura (02/09) — a âncora que
    // o papel do Curador tem de servir.
    intencoes_humanas: intencoesHumanas,
    estruturador_consumido: Boolean(input.estruturadorDecisao?.trim()),
    // Cérebro do vault (31/08).
    curador_vault_mode: curadorVaultMode,
    vault_docs_total: vault.total,
    vault_protocolo: Boolean(vault.protocolo),
    vault_variantes_com_eixos: vaultExtras.size,
    vault_secoes_notas: vault.secoes.size,
    momento: momentoDoEmail(input.flowType, input.emailNumber),
    estruturas_ref: estruturasRef.length,
  }

  // ── Modo `on`: o Curador do vault É o call vigente ──────────────────
  //
  // Sonnet + protocolo do vault, no lugar do kimi — não além dele. Dando
  // certo, o call do kimi abaixo nem acontece: um run por email, e o nó do
  // Estúdio deixa de ter dois candidatos (era isso que fazia a tela mostrar
  // o shadow descartado e esconder o que decidiu o email).
  //
  // Falhou (JSON ilegível, nenhuma escolha, erro)? Devolve null e o caminho
  // do kimi roda como sempre, com retry e fail-closed. O custo dobra só
  // nesse caso — que é exatamente quando vale pagar.
  let vaultResultado: CuradorVaultResultado | null = null
  if (curadorVaultMode === "on") {
    const [aprendizadosOn, usageCountsOn, indiceDoVault] = await Promise.all([
      loadAprendizadosResumo(input.flowType),
      loadVariantUsageCounts(),
      loadIndiceDoVault(),
    ])
    vaultResultado = await runCuradorShadow({
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      batchId: input.batchId,
      triggeredBy: input.triggeredBy,
      emailId: input.emailId,
      flowId: input.flowId,
      baseVars: chooserVars,
      origins,
      vault: vaultKnowledge,
      extras: vaultExtras,
      catalogComExtras: catalog,
      estruturasRef: estruturasRefAll,
      aprendizados: aprendizadosOn,
      usageCounts: usageCountsOn,
      typeIndex,
      liveSections: sections,
      // 02/09: decisão do Estruturador (saída completa) no template, lacunas
      // do vault e índice do Obsidian com consulta sob demanda.
      estruturadorOn,
      indiceDoVault,
      ferramentas: { tools: VAULT_TOOLS, executar: executarFerramentaDoVault, maxCalls: 4 },
      // Sem call vivo não há com o que comparar — a comparação era da fase
      // de ensaio.
      liveViolations: [],
      liveRank1: new Map(),
      baseInputSummary: chooserInputSummary,
      modo: "on",
    })
  }

  // Run 'running' visível na live view enquanto o LLM roda. Só quando o
  // caminho do kimi vai de fato rodar.
  const chooserRunId = vaultResultado
    ? ""
    : await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    emailId: input.emailId ?? undefined,
    flowId: input.flowId ?? undefined,
    batchId: input.batchId,
    agent: "assembler_chooser",
    agentConfigId: chooserRow?.id,
    model: chooserConfig.model,
    inputVars: chooserInputVars,
    renderedPrompt: chooserUserPrompt,
    promptSegments: chooserPromptSegments,
    inputSummary: chooserInputSummary,
  })

  // Retry 1x. Sem o score do pré-filtro não existe mais fallback determinístico
  // possível: composição arbitrária é pior que falha visível (decisão CM-3).
  let chooserRaw = ""
  let chooserTokensIn = 0
  let chooserTokensOut = 0
  let chooserCostUsd = 0
  let ranking: ParsedRanking | null = vaultResultado?.ranking ?? null
  let chooserError: string | null = null
  let attempts = 0

  for (
    let attempt = 1;
    !vaultResultado && attempt <= CHOOSER_MAX_ATTEMPTS;
    attempt++
  ) {
    attempts = attempt
    try {
      const res = await invokeAgent(chooserConfig, chooserVars, {
        // Catálogo no SYSTEM: prefixo idêntico entre lojas → cacheável.
        // Substituição LITERAL (interpolateSystem), nunca pelo renderer —
        // ele apagaria notação como as tags {{TAG}} de outros prompts (CM-1).
        catalogo: catalog.json,
        top_n: String(topN),
      })
      chooserRaw = res.raw
      chooserTokensIn += res.tokensInput
      chooserTokensOut += res.tokensOutput
      chooserCostUsd += res.costUsd
      const parsed = parseCuratorRanking({
        raw: res.raw,
        sections,
        typeIndex,
        maxPerBlock: topN,
      })
      ranking = parsed
      // JSON ilegível ou nada aproveitável → vale uma segunda tentativa.
      if (!parsed.malformed && parsed.byBlock.size > 0) {
        chooserError = null
        break
      }
      chooserError = parsed.malformed ? "json_malformado" : "nenhuma_escolha_valida"
    } catch (err) {
      chooserError = err instanceof Error ? err.message : String(err)
    }
    log.warn("assembler.chooser_attempt_failed", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      attempt,
      error: chooserError,
    })
  }

  const rankingByBlock = ranking?.byBlock ?? new Map<number, RankedChoice[]>()
  const byId = new Map<string, EmailComponentVariant>(
    eligible.map((v) => [v.id, v]),
  )

  const chooserTelemetry = {
    sections: input.structure.length,
    catalog_variants: catalog.total,
    catalog_types: catalog.types.length,
    attempts,
    positions_ranked: rankingByBlock.size,
    // Ranking completo — insumo do Montador e auditoria da curadoria.
    ranking: ranking ? rankingIds(ranking) : {},
    motivos: ranking ? topMotivos(ranking) : {},
    // Mesmo ranking, legível: `ranking` guarda só UUID, e ninguém audita
    // curadoria lendo uma lista de ids. O nome está aqui em `byId` — não
    // custa nada carregá-lo junto, e é o que a aba Saída do Estúdio mostra.
    ranking_detalhado: rankingDetalhado(
      rankingByBlock,
      byId,
      sections,
      input.structure.map((st, i) => st.label ?? sections[i]),
    ),
    // Validações do parser (o catálogo vai inteiro, então o modelo pode
    // indicar id inexistente ou de outra seção).
    invalid_ids: ranking?.invalidIds ?? [],
    retyped_positions: ranking?.retypedChoices ?? [],
    unknown_blocks: ranking?.unknownBlocks ?? [],
    duplicate_ids: ranking?.duplicateIds ?? [],
    // Posições sem nenhum finalista válido → saem do email (selo nos logs).
    empty_blocks: ranking?.emptyBlocks ?? [],
    // Variantes ativas SEM placeholder ficaram fora do pool (pressão de
    // curadoria — ver variantIsFillable).
    candidates_excluded_unfillable: excludedUntagged,
  }

  // O modelo apontou para fora da seção proposta. Dois sinais diferentes,
  // e só um deles é problema de biblioteca:
  //   recusada → havia variante da seção; o papel venceu (o que se quer).
  //              Número alto aqui é sinal sobre o PROMPT do Curador.
  //   aceita   → não havia NENHUMA variante elegível daquela categoria e a
  //              posição teria ficado vazia. Lacuna de cadastro.
  const foraDaSecao = ranking?.retypedChoices ?? []
  const recusadas = foraDaSecao.filter((r) => !r.aceito)
  const aceitasPorFalta = foraDaSecao.filter((r) => r.aceito)
  if (recusadas.length > 0) {
    log.warn("assembler.escolha_fora_da_secao", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      recusadas,
    })
  }
  if (aceitasPorFalta.length > 0) {
    log.error("assembler.secao_sem_variante", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      posicoes: aceitasPorFalta,
      hint: "nenhuma variante elegível da categoria pedida — cadastrar na aba Componentes",
    })
  }

  // Nenhuma posição recebeu finalista depois do retry → não há o que
  // escolher. Falha explícita, sem gravar arquitetura e sem invocar o
  // Montador: mandá-lo decidir sobre um ranking vazio seria pagar um LLM
  // para não decidir nada.
  if (rankingByBlock.size === 0) {
    if (chooserRunId) {
      await finishGenerationRun(chooserRunId, {
      storeId: input.storeId,
      triggeredBy: input.triggeredBy,
      emailId: input.emailId ?? undefined,
      flowId: input.flowId ?? undefined,
      batchId: input.batchId,
      agent: "assembler_chooser",
      agentConfigId: chooserRow?.id,
      status: "error",
      model: chooserConfig.model,
      errorMessage: chooserError ?? "curador_sem_escolhas",
      inputVars: chooserInputVars,
      renderedPrompt: chooserUserPrompt,
      promptSegments: chooserPromptSegments,
      inputSummary: chooserInputSummary,
      rawOutput: chooserRaw.slice(0, 8000),
      parsedOutput: chooserTelemetry,
      tokensInput: chooserTokensIn,
      tokensOutput: chooserTokensOut,
      costCents: resolveCostCents({
        model: chooserConfig.model,
        tokensInput: chooserTokensIn,
        tokensOutput: chooserTokensOut,
          costUsd: chooserCostUsd,
        }),
        durationMs: Date.now() - t0,
      })
    }
    throw new CuratorFailedError(
      chooserError === "json_malformado" || chooserError === null
        ? "curador_sem_escolhas"
        : "curador_failed",
    )
  }

  // ── Fase 1 do plano curador-cerebro-vault: SHADOW do Curador. Sonnet +
  // protocolo do vault, no contrato ampliado, em paralelo ao vivo — a run
  // é gravada (parsed_output.shadow=true) e NADA é consumido. Awaited de
  // propósito (promise solta morre com o serverless); falha nunca propaga.
  if (curadorVaultMode === "shadow") {
    const shadowExtras = buildCatalogVaultExtras(vaultKnowledge, eligible)
    const [aprendizados, usageCounts] = await Promise.all([
      loadAprendizadosResumo(input.flowType),
      loadVariantUsageCounts(),
    ])
    const liveRank1 = rank1ByBlock(rankingByBlock)
    await runCuradorShadow({
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      batchId: input.batchId,
      triggeredBy: input.triggeredBy,
      emailId: input.emailId,
      flowId: input.flowId,
      baseVars: chooserVars,
      origins,
      vault: vaultKnowledge,
      extras: shadowExtras,
      catalogComExtras: buildCatalog(eligible, shadowExtras),
      estruturasRef: estruturasRefAll,
      aprendizados,
      usageCounts,
      typeIndex,
      liveSections: sections,
      liveViolations: measureProtocolViolations({
        rank1ByBlock: liveRank1,
        extras: shadowExtras,
        momento: momentoDoEmail(input.flowType, input.emailNumber),
        sectionByBlock: new Map(sections.map((s, i) => [i, s])),
      }),
      liveRank1,
    })
  }

  // ── PASSO B — Montador: escolhe 1 entre os finalistas de CADA posição,
  // vendo o email inteiro de uma vez (story CM-4).
  //
  // Kill-switch `montador_mode` (migration 20261107). Desligado, o passo B
  // não chama LLM: a escolha de cada posição é o rank 1 do Curador (que hoje
  // devolve UMA variante por posição) e o documento vai direto para a
  // montagem por código. A run `assembler` é gravada como `skipped` com as
  // stats da montagem — o nó continua existindo no mapa e na aba Teste.
  // (`montadorMode` foi carregado antes do passo A — o teto de finalistas
  // do Curador depende dele.)
  const montadorOn = montadorMode === "on"
  const asmRow = montadorOn ? await loadActiveAgentConfig("assembler") : null
  const asmConfig: AgentInvokeConfig = {
    model: asmRow?.model || input.defaultModel || DEFAULT_ASSEMBLER_MODEL,
    temperature: asmRow?.temperature ?? 0.3,
    max_tokens: asmRow?.max_tokens ?? ASSEMBLER_MAX_TOKENS,
    system_prompt: asmRow?.system_prompt?.trim() || DEFAULT_ASSEMBLER_SYSTEM,
    user_template: asmRow?.user_template?.trim() || DEFAULT_ASSEMBLER_USER,
  }

  const finalistsJson = buildFinalistsJson({
    ranking: rankingByBlock,
    byId,
    sections,
    labels: input.structure.map((st, i) => st.label ?? sections[i]),
  })

  const asmVars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: fieldOrMissing(input.nicho),
    posicionamento: fieldOrMissing(input.posicionamento),
    persona: fieldOrMissing(input.persona),
    tom_voz: fieldOrMissing(input.tomVoz),
    outline_objective: input.outlineObjective,
    outline_guidance: input.outlineGuidance,
    outline_tone_hint: input.outlineToneHint,
    outline_restricoes: (input.outlineRestricoes ?? "").trim() || "(sem restrições declaradas)",
    // Mesmos critérios editoriais do Curador (26/08): a escolha FINAL também
    // precisa entender O QUE cada posição faz no arco e por quê — sem isso o
    // Montador desempata por estética contra a decisão do Estruturador.
    intencao_flow: clampPromptText(
      input.intencaoFlow,
      "(não catalogada — siga o outline e o perfil da marca)",
    ),
    intencao_email: clampPromptText(
      input.intencaoEmail,
      "(não catalogada — siga o outline e o perfil da marca)",
    ),
    estruturador_decisao:
      input.estruturadorDecisao?.trim() ||
      "(sem decisão do Estruturador nesta geração — siga o outline)",
    // Os mesmos blocos da loja que o Curador recebeu (27/08). A escolha
    // FINAL é onde marca e objeção se decidem de verdade: o Curador rankeia
    // posição a posição, isolada; só o Montador vê se o email INTEIRO
    // responde à objeção e se a composição soa como esta marca.
    briefing_marca: input.perfilMarca,
    objecoes: input.objecoes,
    vocabulario: input.vocabulario,
    revisao_humana: montarBlocoRevisao(input.revisoes ?? [], "montador"),
    top_products: renderTopProducts(input.topProducts),
    // Mesma memória que o Curador recebeu — carregada uma vez, sem query
    // nova. É insumo da razão de HISTÓRICO da escolha final.
    memoria: renderCuradorMemory(memory),
    finalists_json: finalistsJson,
  }
  // Mesma auditoria do Curador: o prompt REAL do Montador fica na run,
  // agora segmentado por origem (o system dele não tem var — é 100% agente).
  const segAsmUser = buildSegmentedPrompt(
    asmConfig.user_template,
    asmVars,
    origins,
    { parte: "user" },
  )
  const asmUserPrompt = segAsmUser.segments
    ? segAsmUser.prompt
    : renderImageTemplate(asmConfig.user_template, asmVars)
  const asmPromptSegments = concatSegments(
    [
      {
        cls: "agente" as const,
        rotulo: "Template do agente",
        texto: asmConfig.system_prompt,
        chars: asmConfig.system_prompt.length,
        parte: "system" as const,
      },
    ],
    segAsmUser.segments,
  )
  const asmInputSummary: InputSummaryItem[] = [
    { rotulo: "Loja", cls: "loja", valor: `${input.brandName} — ${fieldOrMissing(input.nicho)}` },
    { rotulo: "Posições com finalistas", cls: "upstream", valor: `${rankingByBlock.size} (ranking do Curador)` },
    {
      rotulo: "Finalistas + schemas",
      cls: "upstream",
      valor: `${finalistsJson.length.toLocaleString("pt-BR")} chars — SAÍDA do Curador + output_schema da biblioteca`,
    },
    { rotulo: "Outline", cls: "curadoria", valor: input.outlineObjective || "(sem objetivo)" },
    { rotulo: "Intenção do flow (vault)", cls: "vault", valor: input.intencaoFlow?.trim() ? "servida" : "(não catalogada)" },
    { rotulo: "Intenção deste email (vault)", cls: "vault", valor: input.intencaoEmail?.trim() ? "servida" : "(não catalogada)" },
    {
      rotulo: "Decisão do Estruturador",
      cls: "upstream",
      valor: estruturadorOn ? "servida (papéis por posição + fio)" : "(sem decisão nesta geração)",
    },
    { rotulo: "Perfil da marca", cls: "loja", valor: `${input.perfilMarca.length.toLocaleString("pt-BR")} chars (sem o review de anúncios)` },
    {
      rotulo: "Orientação do COO",
      cls: "curadoria",
      valor: (() => {
        const n = aplicaveisAoEmail(
          orientacoesCurador,
          input.flowType,
          input.emailNumber,
        ).filter((o) => (o.texto ?? "").trim()).length
        return n > 0 ? `${n} escrita(s) para o Curador` : "(nenhuma registrada)"
      })(),
    },
    { rotulo: "Objeções", cls: "loja", valor: resumoObjecoes(input.objecoes) },
    { rotulo: "Vocabulário", cls: "loja", valor: resumoVocabulario(input.vocabulario) },
    { rotulo: "Top produtos", cls: "loja", valor: resumoProdutos(input.topProducts) },
    { rotulo: "Memória do Curador", cls: "sistema", valor: renderCuradorMemory(memory).slice(0, 200) },
  ]

  const t1 = Date.now()
  const asmRunId: string | null = !montadorOn ? null : await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    emailId: input.emailId ?? undefined,
    flowId: input.flowId ?? undefined,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: asmRow?.id,
    model: asmConfig.model,
    inputVars: {
      positions: rankingByBlock.size,
      estruturador_consumido: Boolean(input.estruturadorDecisao?.trim()),
    },
    renderedPrompt: asmUserPrompt,
    promptSegments: asmPromptSegments,
    inputSummary: asmInputSummary,
  })


  let asmRaw = ""
  let asmTokensIn = 0
  let asmTokensOut = 0
  let asmCostUsd = 0
  let asmError: string | null = null
  let decisions: ParsedAssemblerChoices | null = null
  if (!montadorOn) {
    // Sem agente: a "resposta" é o rank 1 de cada posição, no mesmo contrato
    // do Montador, para que o parser (dedup entre posições, telemetria)
    // continue sendo o único caminho.
    asmRaw = JSON.stringify(
      Array.from(rankingByBlock.entries())
        .filter(([, finalists]) => finalists.length > 0)
        .sort(([a], [b]) => a - b)
        .map(([block_index, finalists]) => ({
          block_index,
          variant_id: finalists[0].variant_id,
          rank: 1,
        })),
    )
  } else try {
    const res = await invokeAgent(asmConfig, asmVars)
    asmRaw = res.raw
    asmTokensIn = res.tokensInput
    asmTokensOut = res.tokensOutput
    asmCostUsd = res.costUsd
  } catch (err) {
    asmError = err instanceof Error ? err.message : String(err)
    log.warn("assembler.choice_failed", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      error: asmError,
    })
  }

  // Duração do LLM medida aqui: o run só é fechado depois da montagem (para
  // carregar as stats dela), e a concatenação é instantânea.
  const asmDurationMs = Date.now() - t1

  // Aqui o fallback é LEGÍTIMO, ao contrário do Curador: o ranking já é uma
  // composição válida, avaliada posição por posição. Erro do Montador degrada
  // para o rank 1, nunca derruba o email.
  decisions = parseAssemblerChoices({ raw: asmRaw, ranking: rankingByBlock })
  const escolhidoPorPosicao = decisionMap(decisions)

  // ── Uma hero por email ──────────────────────────────────────────────
  // A posição adota a forma da variante escolhida (27/08) — menos quando a
  // forma é `hero`: o documento marca cada bloco com ela, e o localizador
  // recusa por ambiguidade com duas heroes, derrubando a geração inteira
  // (Innova, welcome #1: o Montador pôs "hero section 10" na posição do
  // body). A regra é na ESCOLHA, não no localizador — que segue como
  // última defesa.
  const heroUnica = garantirHeroUnica(
    sections.map((papel, i) => ({
      index: i,
      papel,
      escolhido: escolhidoPorPosicao.get(i) ?? null,
      finalistas: (rankingByBlock.get(i) ?? []).map((c) => c.variant_id),
    })),
    (id) => byId.get(id)?.block_type,
  )
  const chosenById = new Map(
    heroUnica.escolhas
      .filter((e) => e.variant_id != null)
      .map((e) => [e.index, e.variant_id as string]),
  )
  if (heroUnica.trocas.length > 0) {
    log.warn("assembler.hero_duplicada", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      trocas: heroUnica.trocas,
    })
  }

  const slots: AssemblySlot[] = sections.map((section, i) => {
    const label = input.structure[i]?.label ?? section
    const id = chosenById.get(i)
    const variant = id ? byId.get(id) : undefined
    if (!variant) return { kind: "missing", section, label }
    // A seção sai da VARIANTE, não do outline. O outline e o Estruturador
    // propõem a forma; quem decide é o Curador, e a posição adota a forma
    // escolhida. Manter a seção proposta faria o marcador do documento
    // (`cfy:block:{i}:{section}`), o slot_map, o blueprint e o
    // `email_blocks.block_type` dizerem "body" com um `offer` dentro. O
    // `label` continua sendo o da posição: papel e forma são coisas
    // diferentes.
    return { kind: "variant", variant, section: variant.block_type, label }
  })

  const chosen = slots.flatMap((s) => (s.kind === "variant" ? [s.variant] : []))

  // Registra as escolhas desta geração no histórico append-only (memória do
  // Curador). Fire-and-forget: não bloqueia o run nem falha a geração.
  const choiceEntries: ChoiceEntry[] = slots.flatMap((s) =>
    s.kind === "variant"
      ? [{ section: s.section, variant_id: s.variant.id, variant_name: s.variant.name }]
      : [],
  )
  void logCuradorChoice({
    storeId: input.storeId,
    orgId: memory.orgId,
    flowType: input.flowType,
    emailNumber: input.emailNumber,
    batchId: input.batchId,
    choices: choiceEntries,
  })

  // Com o Curador do vault vigente, quem fechou o run foi ele.
  if (chooserRunId) {
    await finishGenerationRun(chooserRunId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    emailId: input.emailId ?? undefined,
    flowId: input.flowId ?? undefined,
    batchId: input.batchId,
    agent: "assembler_chooser",
    agentConfigId: chooserRow?.id,
    status: "success",
    model: chooserConfig.model,
    inputVars: chooserInputVars,
    renderedPrompt: chooserUserPrompt,
    promptSegments: chooserPromptSegments,
    inputSummary: chooserInputSummary,
    rawOutput: chooserRaw.slice(0, 8000),
    parsedOutput: chooserTelemetry,
    tokensInput: chooserTokensIn,
    tokensOutput: chooserTokensOut,
    costCents: resolveCostCents({
      model: chooserConfig.model,
      tokensInput: chooserTokensIn,
      tokensOutput: chooserTokensOut,
      costUsd: chooserCostUsd,
    }),
    durationMs: Date.now() - t0,
    })
  }

  // ── PASSO B — Montagem por CÓDIGO (story CM-2) ─────────────────────
  // O documento é a concatenação dos HTMLs canônicos das variantes
  // escolhidas. Nenhum LLM participa: não há como achatar a variante,
  // remover tag de imagem ou emitir marcador inválido.
  const assembled = assembleDocument({
    slots,
    fonts: {
      heading: input.fontHeading,
      body: input.fontBody,
      headingWeight: input.fontHeadingWeight,
      bodyWeight: input.fontBodyWeight,
    },
  })
  let html = assembled.html
  const variantIds = chosen.map((v) => v.id)

  // Self-check: marcadores emitidos pelo próprio código. Status diferente
  // de "ok" com blocos presentes é BUG de código — loga error e segue sem
  // marcadores (a fase 2 cai no tag-locator).
  const markerCheck = validateBlockMarkers(html, assembled.stats.expected)
  html = markerCheck.html
  if (assembled.stats.blocks > 0 && markerCheck.status !== "ok") {
    log.error("assembler.marker_selfcheck_failed", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      status: markerCheck.status,
      blocks: assembled.stats.blocks,
    })
  }

  // Self-check: nenhuma tag de imagem das variantes pode ter se perdido na
  // concatenação. Diferente de zero é bug de código.
  const droppedImageTags = findDroppedImageTags(
    slots
      .flatMap((sl) => (sl.kind === "variant" ? [sl.variant.html] : []))
      .join("\n"),
    html,
  )
  if (droppedImageTags.length > 0) {
    log.error("assembler.image_tags_dropped", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      droppedImageTags,
    })
  }

  if (assembled.stats.skipped.length > 0) {
    log.warn("assembler.blocks_skipped", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      skipped: assembled.stats.skipped,
    })
  }

  const source: ReferenceSource = assembled.stats.blocks > 0 ? "code" : "none"

  if (source === "code") {
    await upsertStoreReference(
      input,
      html,
      variantIds,
      "code",
      slots,
      assembled.stats.skipped,
    )
  } else {
    // Nenhum bloco entrou (toda variante recusada/vazia): não persiste, o
    // consumidor cai no template global.
    html = curatedReference
    log.warn("assembler.no_block_assembled", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      skipped: assembled.stats.skipped,
    })
  }

  const asmParsedOutput = {
      degraded: Boolean(asmError) || decisions.malformed,
      escolhas: decisions.decisions.map((d) => ({
        block_index: d.block_index,
        variant_id: d.variant_id,
        rank: d.rank,
        // Nome, seção e papel junto do id: sem eles a composição final só
        // era auditável cruzando UUID com a biblioteca à mão.
        variant_name: byId.get(d.variant_id)?.name ?? null,
        section: sections[d.block_index] ?? null,
        label: input.structure[d.block_index]?.label ?? null,
      })),
      // Métrica do épico: com que frequência o Montador corrige o Curador.
      // Perto de 0 → a segunda passada é barata; acima de ~40% → o critério
      // do Curador precisa revisão.
      desvios: decisions.desvios.length,
      desvios_por_posicao: decisions.desvios.map((d) => ({
        block_index: d.block_index,
        variant_id: d.variant_id,
        rank: d.rank,
        motivo: d.motivo ?? null,
        variant_name: byId.get(d.variant_id)?.name ?? null,
        section: sections[d.block_index] ?? null,
        label: input.structure[d.block_index]?.label ?? null,
      })),
      // Uma hero por email: o que a regra trocou depois da escolha do
      // Montador. Lista vazia = a regra não precisou agir. Sem isto, a
      // troca vira silêncio — e foi o silêncio da colisão que fez a
      // geração da Innova aparecer só como um email quebrado.
      heroes_desambiguados: heroUnica.trocas.map((t) => ({
        block_index: t.index,
        papel: t.papel,
        de: t.de,
        de_nome: byId.get(t.de)?.name ?? null,
        para: t.para,
        para_nome: t.para ? (byId.get(t.para)?.name ?? null) : null,
        motivo: t.motivo,
      })),
      forced_rank1: decisions.forcedRank1,
      missing_motivo: decisions.missingMotivo,
      extra_motivo: decisions.extraMotivo,
      rank_mismatch: decisions.rankMismatch,
      // Repetição de variante entre posições, desfeita por CÓDIGO. O
      // prompt do Curador manda ignorar repetição e o do Montador só a
      // evita como exceção — sem esta medida, a troca vira silêncio e
      // ninguém sabe se o Curador está entregando finalistas variados o
      // bastante. `dedup_sem_alternativa` é o sinal de que não está.
      dedup: decisions.dedup,
      dedup_sem_alternativa: decisions.dedupSemAlternativa,
      // Resultado da MONTAGEM (código). Vive no run do Montador porque é o
      // desfecho da composição que ele decidiu — e é o que alimenta o selo
      // "seções puladas" nos logs.
      blocks_assembled: assembled.stats.blocks,
      blocks_skipped: assembled.stats.skipped,
      wrapped_unknown: assembled.stats.wrappedUnknown,
      // Variantes cadastradas como documento completo: a casca foi removida
      // antes do encaixe. Sem isto a montagem embrulhava o documento inteiro
      // numa célula e o defeito só aparecia como erro do agente de hero.
      variants_unshelled: assembled.stats.unshelled,
      fonts_normalized: assembled.stats.fontsNormalized,
      weights_normalized: assembled.stats.weightsNormalized,
      reference_source: source,
      html_chars: html.length,
      // Self-checks da concatenação: os dois têm de ser sempre limpos.
      marker_selfcheck: markerCheck.status,
      image_tags_dropped: droppedImageTags,
  }

  if (asmRunId !== null) await finishGenerationRun(asmRunId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    emailId: input.emailId ?? undefined,
    flowId: input.flowId ?? undefined,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: asmRow?.id,
    // O email é gerado de qualquer forma (fallback para o rank 1); o status
    // reflete o AGENTE, e `degraded` no parsed_output reflete a COMPOSIÇÃO.
    status: asmError || decisions.malformed ? "error" : "success",
    model: asmConfig.model,
    errorMessage: asmError ?? (decisions.malformed ? "json_malformado" : undefined),
    inputVars: {
      positions: rankingByBlock.size,
      estruturador_consumido: Boolean(input.estruturadorDecisao?.trim()),
    },
    renderedPrompt: asmUserPrompt,
    promptSegments: asmPromptSegments,
    inputSummary: asmInputSummary,
    rawOutput: asmRaw.slice(0, 8000),
    parsedOutput: asmParsedOutput,
    tokensInput: asmTokensIn,
    tokensOutput: asmTokensOut,
    costCents: resolveCostCents({
      model: asmConfig.model,
      tokensInput: asmTokensIn,
      tokensOutput: asmTokensOut,
      costUsd: asmCostUsd,
    }),
    durationMs: asmDurationMs,
  })
  if (asmRunId === null) {
    // Montador desligado: mesma run, mesmo contrato de chaves, status
    // `skipped` — a aba Teste e o Estúdio mostram "desligado" em vez de
    // "pendente" para sempre. Nenhum prompt foi renderizado para LLM.
    await logGenerationRun({
      storeId: input.storeId,
      triggeredBy: input.triggeredBy,
      emailId: input.emailId ?? undefined,
      flowId: input.flowId ?? undefined,
      batchId: input.batchId,
      agent: "assembler",
      status: "skipped",
      model: "desligado",
      inputVars: {
        positions: rankingByBlock.size,
        estruturador_consumido: Boolean(input.estruturadorDecisao?.trim()),
        montador_mode: montadorMode,
      },
      inputSummary: [
        {
          rotulo: "Modo",
          cls: "sistema",
          valor:
            "desligado em Configurações → Montador (a variante escolhida pelo Curador em cada posição vai direto para a montagem por código)",
        },
        ...asmInputSummary.slice(1, 3),
      ],
      parsedOutput: { skip_reason: "montador_mode_off", ...asmParsedOutput },
      costCents: 0,
      durationMs: 0,
    }).catch(() => {})
  }


  return {
    html,
    variantIds,
    source,
    slots,
    // Só existem quando o Curador do vault foi o vigente (modo `on`) e
    // devolveu algo aproveitável. No fallback para o kimi seguem null e o
    // consumidor não muda de comportamento.
    papeisPorPosicao: vaultResultado?.papeis ?? null,
    fioNarrativo: vaultResultado?.fioNarrativo ?? null,
  }
}

async function upsertStoreReference(
  input: AssembleReferenceInput,
  html: string,
  variantIds: string[],
  model: string | null,
  slots: AssemblySlot[],
  skipped: ReadonlyArray<{ block_index: number }>,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("store_email_references").upsert(
    {
      store_id: input.storeId,
      flow_type: input.flowType,
      email_number: input.emailNumber,
      html,
      variant_ids: variantIds,
      // Escolha por parte do email (migration 20261039) — fonte primária do
      // agente hero_section pra resolver a variante da hero na fase 2.
      slot_map: slotMapFromSlots(slots, skipped),
      source: "ai",
      model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,flow_type,email_number" },
  )
  if (error) {
    log.error("reference.upsert_failed", {
      storeId: input.storeId,
      error: error.message,
    })
  }
}
