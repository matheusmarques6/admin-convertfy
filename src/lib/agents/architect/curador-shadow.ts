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
import { type BuildCatalogResult, type CatalogVaultExtra } from "./catalog-builder"
import {
  buildAprendizadosBlock,
  buildConvivenciaBlock,
  buildEstruturasRefResumo,
  buildLacunasBlock,
  buildProtocoloBlock,
  buildSecaoNotasBlock,
  momentoDoEmail,
  renderIndiceDoVault,
  renderUsageCounts,
  type AprendizadoResumo,
  type CuradorVaultKnowledge,
  type EstruturaRefResumo,
  type IndiceDoVault,
} from "./curador-vault"
import {
  extractJson,
  interpolateSystem,
  invokeAgent,
  type AgentInvokeConfig,
} from "./llm-invoke"
import { loadFinalistNotes, type FinalistNoteResult } from "./curador-vault-tools"
import { parseCuratorRanking, type ParsedRanking, type RankedChoice } from "./curator-ranking.parser"
import { normalizarSecao, podeRepetir } from "./repeticao"
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

import {
  conflitoDeContrato,
  indiceDeEliminadas,
  resumirContrato,
  type ContratoResumo,
  type EliminacaoDaPosicao,
} from "../shared/field-roles"

const log = logger.child("CuradorShadow")

/** `variant_id → contrato` a partir do catálogo servido. */
export function contratosDoCatalogo(sections: Array<{ variantes: Array<{ variant_id: string; contrato?: ContratoResumo }> }>): Map<string, ContratoResumo> {
  const m = new Map<string, ContratoResumo>()
  for (const s of sections) for (const v of s.variantes) if (v.contrato) m.set(v.variant_id, v.contrato)
  return m
}

const SHADOW_TOP_N = 1
const SHORTLIST_TOP_N = 3

export const DEFAULT_CURADOR_SHORTLIST_SYSTEM = `Você é o Curador de Componentes da Convertfy na etapa de SHORTLIST.
A estrutura e os papéis já foram decididos. Compare TODAS as variantes do índice compacto e selecione até 3 finalistas por posição. Não escolha a vencedora ainda e não invente ids.

<protocolo>{{protocolo}}</protocolo>
<indice_compacto>{{catalogo}}</indice_compacto>
<convivencia>{{convivencias}}</convivencia>

Responda APENAS um array JSON:
[{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"encaixe e risco principal"}]}]

Inclua toda posição da estrutura. Use escolhas vazias somente quando nenhuma variante da seção sobreviver às restrições.`

/** Shortlist estrita: nunca aceita variante de outra seção como fallback. */
export function parseValidatedShortlist(input: {
  raw: string
  sections: string[]
  typeIndex: Map<string, string>
  aliasIndex?: Map<string, string>
}): ParsedRanking {
  const parsed = parseCuratorRanking({ ...input, maxPerBlock: SHORTLIST_TOP_N })
  try {
    const rawItems = JSON.parse(extractJson(input.raw)) as unknown
    const mentioned = new Set(
      Array.isArray(rawItems)
        ? rawItems.map((item) => item && typeof item === "object" ? (item as { block_index?: unknown }).block_index : null)
            .filter((v): v is number => typeof v === "number" && Number.isInteger(v))
        : [],
    )
    if (input.sections.some((_, i) => !mentioned.has(i))) parsed.malformed = true
  } catch {
    parsed.malformed = true
  }
  for (const [block, choices] of parsed.byBlock) {
    const expected = normalizarSecao(input.sections[block] ?? "")
    const strict = choices.filter((choice) => normalizarSecao(input.typeIndex.get(choice.variant_id) ?? "") === expected)
    if (strict.length) parsed.byBlock.set(block, strict)
    else parsed.byBlock.delete(block)
  }
  parsed.emptyBlocks = input.sections.map((_, i) => i).filter((i) => !parsed.byBlock.has(i))
  return parsed
}

export function renderFinalistNotes(notes: readonly FinalistNoteResult[]): string {
  if (notes.length === 0) return "(nenhuma finalista validada)"
  return notes.map((note) => {
    if (note.status === "opened") return `<finalista variant_id="${note.variant_id}" caminho="${note.file_path ?? ""}">\n${note.body ?? ""}\n</finalista>`
    if (note.status === "missing") return `<finalista variant_id="${note.variant_id}" status="sem_nota_sincronizada" />`
    return `<finalista variant_id="${note.variant_id}" status="erro_de_banco" />`
  }).join("\n\n")
}

/** A decisão final só pode consumir ids autorizados NAQUELA posição. */
export function restrictRankingToShortlist(
  ranking: ParsedRanking,
  shortlist: ParsedRanking,
  positions: number,
): ParsedRanking {
  const byBlock = new Map<number, RankedChoice[]>()
  for (const [block, choices] of ranking.byBlock) {
    const allowed = new Set((shortlist.byBlock.get(block) ?? []).map((c) => c.variant_id))
    const valid = choices.filter((choice) => allowed.has(choice.variant_id))
    if (valid.length) byBlock.set(block, valid)
    for (const choice of choices) {
      if (!allowed.has(choice.variant_id)) ranking.invalidIds.push(choice.variant_id)
    }
  }
  ranking.byBlock = byBlock
  ranking.emptyBlocks = Array.from({ length: positions }, (_, i) => i).filter((i) => !byBlock.has(i))
  return ranking
}

/**
 * O que entra no lugar de um bloco que a decisão do Estruturador substitui.
 *
 * Exportada porque a ENTRADA da run (a aba do Estúdio) precisa dizer a mesma
 * coisa que o prompt: card mostrando o texto do outline enquanto o modelo
 * recebeu "(omitido…)" faz quem lê concluir que o Curador leu aquilo.
 */
export const BLOCO_OMITIDO_PELO_ESTRUTURADOR =
  "(omitido — a decisão do Estruturador em <decisao_do_estruturador> substitui este bloco)"

/** Modelo do shadow (e candidato do flip). Env sobrepõe sem deploy de config. */
/**
 * Último recurso quando ninguém disse qual modelo usar.
 *
 * Até 08/09 esta constante era a ÚNICA fonte: o Curador do vault ignorava
 * `email_agent_configs` e rodava sempre em Sonnet. Trocado o flow inteiro
 * para Fable, ele foi um dos dois agentes que não mudaram, e a telemetria
 * mostrava um modelo que ninguém tinha escolhido — sem nada na tela ligando
 * uma coisa à outra. O Curador LEGADO, que lê a config, mudou junto: os
 * dois compartilham o `agent_type` e divergiam no modelo.
 *
 * Precedência hoje: env > config do agente `assembler_chooser` > isto.
 */
export const CURADOR_SHADOW_MODEL_FALLBACK = "anthropic/claude-sonnet-4.6"

/**
 * Override sem deploy, para ensaiar um modelo sem tocar no banco. Vence a
 * config justamente por ser o mais explícito dos três.
 */
const CURADOR_SHADOW_MODEL_ENV = process.env.CURADOR_SHADOW_MODEL?.trim() || null

/** Resolve o modelo do Curador do vault. Puro fora da leitura do env. */
export function resolverModeloDoCurador(daConfig?: string | null): string {
  return CURADOR_SHADOW_MODEL_ENV || daConfig?.trim() || CURADOR_SHADOW_MODEL_FALLBACK
}

/**
 * Piso do teto de saída. Até 09/09 `max_tokens: 8192` era FIXO no código e a
 * config do banco (16000) era ignorada: o Sonnet raciocinou 8.327 tokens em
 * prosa, foi cortado antes do JSON e a resposta certa — que eliminava as
 * heroes com cupom obrigatório — virou `shadow_json_ilegivel` (batch
 * 644d86c5). A config passa a valer; o piso protege de config baixa demais.
 */
export const CURADOR_SHADOW_MAX_TOKENS_MIN = 8192

function tetoDoEnv(): number | null {
  const v = Number(process.env.CURADOR_SHADOW_MAX_TOKENS ?? "")
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null
}

/** Teto de saída: env > max(piso, config). Puro fora da leitura do env. */
export function resolverTetoDoCurador(daConfig?: number | null): number {
  const env = tetoDoEnv()
  if (env) return env
  const cfg = typeof daConfig === "number" && Number.isFinite(daConfig) ? Math.floor(daConfig) : 0
  return Math.max(CURADOR_SHADOW_MAX_TOKENS_MIN, cfg)
}

/** `CURADOR_SHADOW_RETOMADA=off` desliga a volta de retomada do JSON. */
export function retomadaLigada(): boolean {
  return (process.env.CURADOR_SHADOW_RETOMADA ?? "").trim().toLowerCase() !== "off"
}

/**
 * O que o modelo recebe quando a resposta final não trouxe o JSON. O
 * histórico inteiro vai junto (raciocínio, consultas ao vault): o pedido é
 * fechar o trabalho, não refazê-lo.
 */
export const MENSAGEM_RETOMADA_JSON =
  "Devolva agora APENAS o objeto JSON do formato pedido no system — sem texto antes ou depois, sem markdown — cobrindo TODAS as posições de <estrutura_do_email>. Se a resposta anterior foi cortada, complete-a a partir do que já decidiu. Não consulte mais nada."

/** Prefill do assistant na retomada (só provedores Anthropic aceitam). */
export const PREFILL_RETOMADA_JSON = '{"papeis"'

/**
 * Motivo da retomada, ou null quando a resposta serve. JSON legível com
 * `finish_reason: length` NÃO retoma: o corte veio depois do objeto.
 */
export function motivoDeRetomada(raw: string, finishReason?: string): string | null {
  if (parseCuradorVaultOutput(raw)) return null
  if (!raw.trim()) return finishReason === "length" || finishReason === "max_tokens" ? "vazio_por_teto" : "vazio"
  return finishReason === "length" || finishReason === "max_tokens" ? "cortado_antes_do_json" : "sem_json"
}

// ── Prompt do contrato AMPLIADO (o prompt do flip, ensaiado no shadow) ───

export const DEFAULT_CHOOSER_VAULT_SYSTEM = `Você é o Curador de Componentes de email da Convertfy. A ESTRUTURA do email já está decidida pelo Estruturador — a sequência de seções e o papel de cada posição chegam prontos em <decisao_do_estruturador> e <estrutura_do_email>. A sua função é ENCONTRAR NA BIBLIOTECA os blocos que encaixam perfeitamente em cada posição e conversam com essa proposta: para cada posição, A variante cuja ANATOMIA realiza o papel decidido — uma só, a que encaixa melhor. Você não decide estrutura, não reescreve papel, não discute a sequência.

Você decide pelo protocolo, pelos eixos e pelos metadados. Você NÃO recebe o HTML das variantes.

<protocolo_de_selecao>

{{protocolo}}
</protocolo_de_selecao>

<biblioteca>
Índice compacto completo, agrupado por tipo de seção. Dentro de cada tipo a ordem é alfabética e NÃO carrega julgamento. Cada linha traz identidade, primeira frase, contrato anatômico e eixos resumidos; as notas completas chegam separadamente apenas para as finalistas. O cadastro do sistema descreve a peça que será REALMENTE montada e prevalece sobre prosa divergente do vault.
{{catalogo}}
</biblioteca>

<convivencia>
Regras de coexistência entre variantes na MESMA peça:
{{convivencias}}
</convivencia>

Como decidir, na ordem:
1. LER A PROPOSTA DO ESTRUTURADOR: <decisao_do_estruturador> é o critério DOMINANTE por posição. Para cada posição de <estrutura_do_email>, extraia do \`estrutura[].papel\` (com \`adaptacao\` e \`porque\`) o que a ANATOMIA do bloco precisa ter para realizar aquele papel — quantos produtos mostra, se leva cupom em texto real, se tem depoimento com nome e nota, se isola em fundo contrastante, se abre ou fecha a peça, quantos itens de lista, se pede foto de uso real. É contra ISSO que as variantes são medidas. O \`fio_narrativo\` diz como as posições se ligam: as escolhas têm de conversar entre si (peso, convivência, linguagem visual) e com o arco. Os \`descartes\` dizem o que foi tirado de propósito — não recoloque o dispositivo por outra via (ex.: CTA isolado descartado não volta como body de CTA pesado). A objeção dominante do \`diagnostico\` é o alvo do eixo \`objecao\`. A sequência é FIXA. Não remova, não acrescente, não reordene, não substitua seção nenhuma. Papel vence memória e preferência estética; marca e viabilidade (produtos/dados) continuam vetos.
   Sem decisão em <decisao_do_estruturador> (o Estruturador falhou nesta geração): derive o papel de cada posição de <intencao_do_email> e da posição no arco — só nesse caso você escreve o papel; posição que traz \`intencao\` na sequência foi escrita pela pessoa na Arquitetura e ela É o papel daquela posição.
   <lacunas_da_biblioteca> lista o que a biblioteca sabidamente NÃO cobre. Lacuna NÃO elimina: pesa CONTRA no ranking, e quando a escolhida a carrega a \`justificativa\` a nomeia.
   As notas completas das finalistas foram carregadas pelo sistema em <notas_das_finalistas>. Ausência explícita de nota não elimina uma candidata; reduz apenas a evidência disponível. Você não pode escolher variante fora das finalistas.
2.  elimine por ativa/schema (já filtrados do catálogo) e por capacidade (product_slots × produtos com link — a loja não tem como preencher slot de produto que não existe). Elimine também por CONTRATO: o campo \`contrato\` de cada variante diz o que a ANATOMIA obriga a preencher (\`tem_cupom\`, \`tem_cta\`, \`tem_preco\`, \`tem_avaliacao\`, \`n_itens\`). Variante cujo contrato obriga um dado que <alvo> ou <decisao_do_estruturador> dizem NÃO existir — slot de cupom quando não há incentivo ativo, grade de 4 quando o papel pede 2 — é ELIMINADA neste passo, não desempatada: o slot fica no HTML com o texto de exemplo. Isto é diferente de \`proibido neste toque\`, que é restrição de redação e só desempata.  Material — foto, tipografia, tipo de campanha, qualquer ativo que você suponha faltar — não elimina ninguém: a imagem é gerada depois, e adequação de material se resolve no RANKING. Entre os sobreviventes, ENCAIXE PRIMEIRO: quem tem a anatomia que o papel decidido pede fica na frente de quem não tem — variante que não consegue realizar o papel (sem slot de cupom quando o papel entrega cupom; grade de 4 quando o papel pede 2; depoimento sem nome quando o papel pede voz com credencial) fica atrás mesmo que vença em todos os eixos. Depois rankeie por objecao → aliviador → profundidade → registro → paleta → papel_na_peca (lexicográfico com degradação: eixo que não separa é neutro). <alvo> traz a objeção que ESTE email ataca, o tipo de risco e o \`aliviador pedido\` — \`vault.objecao\` casa com o eixo equivalente do alvo, \`vault.aliviador\` com o aliviador pedido, \`vault.profundidade\` com a profundidade de prova. Aliviador é vocabulário fechado — não substitua por um "equivalente": prova_de_terceiro não é resolvido por prova_por_volume, e seguranca_de_pagamento não é resolvida por prova social. O \`proibido neste toque\` do alvo é restrição de REDAÇÃO: diz o que a COPY não pode afirmar, e vale para quem escreve o texto, não para a escolha do bloco. Ele NÃO elimina ninguém — "não prometer nota média" não desqualifica o bloco de avaliações, desqualifica a frase. Use-o só como DESEMPATE: entre equivalentes, fica atrás a variante cuja anatomia OBRIGA o item proibido (slot fixo de cupom quando cupom está proibido). Eliminar por proibição de copy esvazia a peça — já aconteceu de sobrar só o rodapé. Aliviador pedido que depende de um ativo da loja (prova_de_terceiro → três reviews distintos) entra na justificativa como "ativo sugerido" — ainda não é veto. Cheque convivência e o orçamento de peso contra as OUTRAS posições (evite pesado/peca-inteira em sequência). Desempate pela chave da nota de seção; empate total entre duplicatas envia e declara isso 
3. SOBREVIVEU, TEM DE SAIR ESCOLHIDA. \`escolhas: []\` é legítimo em UMA situação só: a eliminação (passos 3-6) zerou a lista. Se alguma candidata chegou ao passo 7, ela é escolhida — mesmo que TODOS os eixos empatem em neutro, mesmo que os eixos dela estejam vazios, mesmo que você não goste de nenhuma. Empate total não é lacuna: é o caso do passo 9, e o protocolo diz que o resultado nunca é sorteio — desempate pela nota de seção, depois menor uso em <memoria>, depois menor número no slug. "Nenhum eixo as separa" NUNCA justifica devolver lista vazia.
4. Zero candidata de verdade NÃO é erro E NÃO AUTORIZA remover a posição: declare-a com \`escolhas: []\` e a \`justificativa\` nomeando, candidata por candidata, em que passo e contra qual campo cada uma caiu — a posição continua na peça, o sistema cai no template global e a lacuna vira sinal para a curadoria da biblioteca.

O eixo \`momento\` foi APOSENTADO (07/09). O catálogo não traz \`momento\` nem \`momento_vetado\`, e nenhuma variante é eliminada nem rankeada por eles. Onde o protocolo do vault ou uma nota de seção falarem em momento — inclusive o passo 5 — está SUPERADO: ignore. Se topar com o campo numa nota lida por ferramenta, ele não vale.

Regras que continuam valendo do Curador atual: <perfil_marca> ancora identidade; <objecoes> é o que trava a compra (é o critério do eixo objecao só quando <alvo> declara ausência); <vocabulario> é literal; produtos cruzam com product_slots (nunca exigir mais produtos/links do que a loja tem); <memoria> é sinal, nunca regra; HERO É ÚNICA (no máximo uma posição com variante de hero); não invente variant_id.

REPETIR A MESMA VARIANTE EM DUAS POSIÇÕES É PERMITIDO (07/09), menos em "hero" e em "products" — a hero porque a fase 2 enxerta UMA região, o feed porque repetiria a mesma grade de produtos na mesma peça. Nas demais seções, escolha para cada posição o bloco que melhor realiza o papel dela: se for o mesmo das duas vezes, indique o mesmo. Não gaste critério buscando variedade, e não rebaixe o encaixe para evitar repetição — nenhuma etapa posterior vai desfazer a repetição, e a variedade não é um objetivo em si. Onde o protocolo do vault ou uma nota de seção pedirem variedade dentro da peça, está SUPERADO para fora de hero/products.

O OUTPUT SAI JUSTIFICADO — a decisão tem que ser auditável sem reler o catálogo:
- \`papeis\`: UMA frase por posição dizendo COMO a variante escolhida realiza o papel decidido pelo Estruturador (qual parte da anatomia entrega o quê). Não é lugar de reescrever o papel nem de propor outra sequência. Sem decisão do Estruturador, aí sim é o papel derivado da intenção.
- \`justificativa\` é OBRIGATÓRIA em toda posição: o TRAÇO da decisão em 2-4 frases — o que o papel pedia da anatomia e quem encaixou, quem foi eliminado e em que passo (capacidade), qual eixo do ranking decidiu e por quê ("ganhou porque objecao bateu; se não fosse isso, teria sido registro"), e o desempate quando houve.
- A escolha leva \`motivo\` (uma frase curta): por que ela venceu as outras candidatas da posição.

Responda APENAS o objeto JSON, sem markdown:

{"papeis":[{"block_index":0,"section":"hero","papel":"..."},{"block_index":1,"section":"offer","papel":"..."}],
 "fio_narrativo":"...",
 "escolhas":[{"block_index":0,
   "justificativa":"5 candidatas; nenhuma veta welcome-1. objecao decidiu: só hero-3 declara preco-valor, o alvo deste toque; hero-4 e hero-5 ficam atrás por registro (premium-editorial contra o popular desta marca).",
   "escolhas":[{"variant_id":"...","motivo":"..."}]}]}

- \`papeis\` traz UM item por posição de <estrutura_do_email>, na mesma ordem e com o mesmo \`block_index\` (0-based); \`escolhas\` usa esses mesmos índices.
- \`escolhas\` de cada posição traz UM item: a variante escolhida. Mais de um é ignorado — só o primeiro vale.`

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

<estruturas_de_referencia>
{{estruturas_ref}}
</estruturas_de_referencia>

<notas_de_secao>
{{secoes_notas}}
</notas_de_secao>

<lacunas_da_biblioteca>
{{lacunas_biblioteca}}
</lacunas_da_biblioteca>

<aprendizados>
{{aprendizados}}
</aprendizados>

<orientacao_do_coo>
Instrução direta de quem responde pelo método, escrita no Estúdio. Vale
sobre as notas do vault, sobre a memória e sobre sua preferência — só não
vence a sequência decidida pelo Estruturador nem a capacidade real da
biblioteca (não existe variante que não existe).
{{orientacao_coo}}
</orientacao_do_coo>

<revisao_humana>
{{revisao_humana}}
</revisao_humana>

<perfil_marca>
{{briefing_marca}}
</perfil_marca>

<alvo>
{{alvo}}
</alvo>

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

<indice_do_vault>
Pastas do Obsidian sincronizadas (consulta sob demanda, só se quiser conferir uma nota):
{{indice_vault}}
</indice_do_vault>

<decisao_do_estruturador>
{{estruturador_decisao}}
</decisao_do_estruturador>

<eliminadas_por_requisito>
Variantes que o CÓDIGO já eliminou por posição, cruzando os \`requisitos\` do Estruturador com o \`contrato\` da anatomia (slot de cupom quando a decisão nega cupom, grade maior que o máximo pedido, sem preço quando a decisão exige preço). NÃO as escolha para essas posições — escolhê-las é ignorar a decisão.
{{eliminadas_requisito}}
</eliminadas_por_requisito>

<estrutura_do_email>
Sequência FIXA deste email, decidida pelo Estruturador (o papel completo de
cada posição está em <decisao_do_estruturador>). Não remova, não acrescente,
não reordene. Sua tarefa: para cada posição, os blocos da biblioteca cuja
anatomia realiza o papel decidido e conversa com o fio.
{{blocks_json}}
</estrutura_do_email>

Selecione a variante de cada posição que realiza o papel decidido, diga em \`papeis\` como ela o realiza e justifique cada posição. A sequência não se discute. Responda APENAS o objeto JSON.`

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
    | "hero_dupla"
    | "variante_repetida"
    | "convivencia"
    // Objeções (set/2026): nenhuma posição realiza o aliviador pedido pelo
    // alvo / uma escolhida obriga algo proibido neste toque.
    | "aliviador_ausente"
    | "proibicao_violada"
    // 09/09: o rank-1 obriga (pelo contrato da anatomia) o que a decisão
    // nega — hoje só o cupom, via `incentivo_existe`.
    | "contrato_violado"
    // 09/09: o rank-1 estava na lista de eliminadas por requisito do
    // Estruturador × contrato — o Curador ignorou o filtro.
    | "requisito_violado"
  detalhe: string
}

/** O que o medidor precisa do alvo do Seletor (fase 4 passa; em shadow só mede). */
export interface AlvoParaMedicao {
  aliviador_pedido: string | null
  proibicoes: readonly string[]
  /**
   * Decisão de incentivo da loja (catálogo do Catalogador): `false` = sem
   * incentivo ativo → variante com slot de cupom é `contrato_violado`.
   * `null`/ausente = não se sabe, nada é medido.
   */
  incentivo_existe?: boolean | null
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

/** Proibição em prosa ↔ requisito/aliviador da variante (só o checável). */
function proibicaoBateNaVariante(proibicao: string, extra: CatalogVaultExtra | undefined): string | null {
  if (!extra) return null
  const p = norm(proibicao)
  const exige = extra.exige_medicao ?? []
  const aliv = extra.aliviador ?? []
  if (p.includes("cupom") || p.includes("incentivo")) {
    if (exige.includes("cupom-ativo")) return "exige cupom-ativo"
  }
  if (p.includes("prova social") || p.includes("depoimento")) {
    if (aliv.includes("prova_de_terceiro") || aliv.includes("prova_por_volume")) return `aliviador ${aliv.join("/")}`
  }
  if (p.includes("catalogo") || p.includes("catálogo")) {
    if (exige.includes("catalogo-de-variantes") || exige.includes("produtos-com-pagina-propria")) return "anatomia de catálogo"
  }
  if (p.includes("prazo") || p.includes("hora fechada")) {
    if (exige.includes("prazo-real")) return "exige prazo-real"
  }
  return null
}

/**
 * Mede violações mecanicamente checáveis do protocolo sobre os rank-1 de
 * cada posição. `exige` fica FORA de propósito: sem perfil de ativos da
 * loja, checá-lo seria o mesmo julgamento implícito que se quer medir.
 */
export function measureProtocolViolations(p: {
  rank1ByBlock: Map<number, string>
  extras: Map<string, CatalogVaultExtra>
  /** block_index → seção da posição. */
  sectionByBlock: Map<number, string>
  /** Alvo do Seletor (opcional — sem ele os dois tipos novos não são medidos). */
  alvo?: AlvoParaMedicao | null
  /** Contrato por variante (catálogo) — para `contrato_violado`. */
  contratos?: Map<string, ContratoResumo>
  /** `block_index → (variant_id → motivo)` das eliminadas por requisito — para `requisito_violado`. */
  eliminadasPorRequisito?: Map<number, Map<string, string>>
}): ProtocolViolation[] {
  const out: ProtocolViolation[] = []
  if (p.eliminadasPorRequisito) {
    for (const [block, variantId] of p.rank1ByBlock) {
      const motivo = p.eliminadasPorRequisito.get(block)?.get(variantId)
      if (motivo) out.push({ block_index: block, variant_id: variantId, tipo: "requisito_violado", detalhe: motivo })
    }
  }
  if (p.alvo && p.contratos && p.alvo.incentivo_existe === false) {
    for (const [block, variantId] of p.rank1ByBlock) {
      const motivo = conflitoDeContrato(p.contratos.get(variantId) ?? resumirContrato(null), { cupom: false })
      if (motivo) out.push({ block_index: block, variant_id: variantId, tipo: "contrato_violado", detalhe: motivo })
    }
  }
  if (p.alvo) {
    const pedido = p.alvo.aliviador_pedido
    if (pedido) {
      const alguma = Array.from(p.rank1ByBlock.values()).some((id) => (p.extras.get(id)?.aliviador ?? []).includes(pedido))
      if (!alguma) {
        out.push({ block_index: -1, variant_id: "", tipo: "aliviador_ausente", detalhe: `nenhuma posição realiza o aliviador pedido (${pedido})` })
      }
    }
    for (const [block, variantId] of p.rank1ByBlock) {
      for (const proib of p.alvo.proibicoes) {
        const bate = proibicaoBateNaVariante(proib, p.extras.get(variantId))
        if (bate) out.push({ block_index: block, variant_id: variantId, tipo: "proibicao_violada", detalhe: `"${proib}" × ${bate}` })
      }
    }
  }
  const heroBlocks: number[] = []
  const seenVariant = new Map<string, number>()
  const convivenciaSeen = new Map<string, number>()

  for (const [block, variantId] of p.rank1ByBlock) {
    const extra = p.extras.get(variantId)
    const section = p.sectionByBlock.get(block) ?? ""
    if (section === "hero") heroBlocks.push(block)

    const prev = seenVariant.get(variantId)
    if (prev !== undefined) {
      // Só hero e feed de produtos precisam ser únicos (ver `repeticao.ts`).
      // Nas demais seções repetir é composição legítima: acusar violação
      // ali contaminaria a contagem que a gente lê para julgar o Curador.
      // A repetição permitida sai por `repeticoesPermitidas`, como registro.
      if (!podeRepetir(section)) {
        out.push({
          block_index: block,
          variant_id: variantId,
          tipo: "variante_repetida",
          detalhe: `mesma variante no rank 1 das posições ${prev} e ${block} (seção ${normalizarSecao(section) || "?"} exige variante única)`,
        })
      }
    } else {
      seenVariant.set(variantId, block)
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

/** Repetição legítima (fora de hero/products): registro, não violação. */
export interface RepeticaoPermitida {
  variant_id: string
  section: string
  blocks: number[]
}

/**
 * As repetições que a regra PERMITE, para a telemetria.
 *
 * Elas continuam visíveis — repetir o mesmo corpo três vezes pode ser
 * pobreza de biblioteca, e é isso que a curadoria precisa enxergar —, só
 * não contam como quebra de protocolo.
 */
export function repeticoesPermitidas(p: {
  rank1ByBlock: Map<number, string>
  sectionByBlock: Map<number, string>
}): RepeticaoPermitida[] {
  const porVariante = new Map<string, RepeticaoPermitida>()
  for (const [block, variantId] of p.rank1ByBlock) {
    const section = p.sectionByBlock.get(block) ?? ""
    if (!podeRepetir(section)) continue
    const chave = `${variantId}|${normalizarSecao(section)}`
    const atual = porVariante.get(chave)
    if (atual) atual.blocks.push(block)
    else porVariante.set(chave, { variant_id: variantId, section: normalizarSecao(section), blocks: [block] })
  }
  return Array.from(porVariante.values())
    .filter((r) => r.blocks.length > 1)
    .map((r) => ({ ...r, blocks: r.blocks.sort((a, b) => a - b) }))
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
  /** Apelido (slug/nome) → variant_id — resolve escolha que veio sem UUID. */
  aliasIndex?: Map<string, string>
  /**
   * Seções da ARQUITETURA deste email (a sequência da aba, que o Curador
   * recebe e não altera). Continua servindo de base de comparação no shadow.
   */
  liveSections: string[]
  /**
   * Há decisão do Estruturador nesta geração (02/09). Com ela, as
   * <estruturas_de_referencia> e o <outline> são OMITIDOS — o Estruturador
   * já consumiu e traduziu esse material; servi-lo de novo é sinal
   * concorrente à decisão.
   */
  estruturadorOn?: boolean
  /** Índice de pastas do Obsidian (consulta sob demanda). */
  indiceDoVault?: IndiceDoVault
  /**
   * `on` = este call É o Curador: a saída volta para o pipeline. `shadow` =
   * ensaio em paralelo ao kimi, nada é consumido. Default shadow para o call
   * site antigo não mudar de comportamento por omissão.
   */
  modo?: "shadow" | "on"
  /**
   * Modelo vindo de `email_agent_configs` (agent_type `assembler_chooser`),
   * já resolvido pelo caller. Ausente → env, senão o fallback.
   *
   * Só o MODELO viaja: prompt, temperatura e teto continuam sendo os do
   * vault, que são outro contrato — a linha do banco guarda os do Curador
   * legado, e servi-los aqui trocaria o agente por outro.
   */
  modelo?: string | null
  /**
   * Teto de saída da config (`assembler_chooser.max_tokens`), já resolvido
   * pelo caller. Ver `resolverTetoDoCurador`.
   */
  maxTokens?: number | null
  /**
   * Recebe o que o JSON trouxe quando o resultado NÃO pôde ser consumido
   * (ids inválidos, escolhas malformadas) — o Curador legado herda as
   * justificativas em vez de escolher às cegas. Prosa não vira preferência.
   */
  onParcial?: (p: PreferenciasDoVault) => void
  /** Violações medidas sobre o rank-1 do Curador VIVO (comparação). */
  liveViolations: ProtocolViolation[]
  /**
   * Itens de Entrada do call vivo (loja, outline, intenções, perfil…). O
   * shadow montava só os 6 itens próprios e a aba Entrada do Estúdio ficava
   * pobre justamente no call que virou o vigente.
   */
  baseInputSummary?: InputSummaryItem[]
  liveRank1: Map<number, string>
  /** Alvo do Seletor para o medidor de veto (aliviador_ausente / proibicao_violada). */
  alvoMedicao?: AlvoParaMedicao | null
  /** Eliminadas por requisito do Estruturador × contrato (09/09) — telemetria + medidor. */
  eliminadasPorRequisito?: EliminacaoDaPosicao[]
}

/** O que o Curador legado herda de um JSON do vault que não pôde ser consumido. */
export interface PreferenciasDoVault {
  posicoes: Array<{
    block_index: number
    section: string
    justificativa: string
    escolhas: Array<{ variant_id: string; motivo: string }>
  }>
}

/** Bloco `<preferencias_do_vault>` do Curador legado. Puro. */
export function renderPreferenciasDoVault(p: PreferenciasDoVault | null): string {
  if (!p || p.posicoes.length === 0) {
    return "(nenhuma — o Curador do vault não rodou ou não deixou JSON aproveitável)"
  }
  return p.posicoes
    .map((pos) => {
      const esc = pos.escolhas.length
        ? pos.escolhas.map((e) => `  - ${e.variant_id}${e.motivo ? ` — ${e.motivo}` : ""}`).join("\n")
        : "  - (nenhuma candidata)"
      return `[${pos.block_index}] ${pos.section}${pos.justificativa ? `: ${pos.justificativa}` : ""}\n${esc}`
    })
    .join("\n")
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
  // Fora do try: o catch grava a run de erro e precisa do mesmo modelo.
  const modelo = resolverModeloDoCurador(p.modelo)
  const t0 = Date.now()
  let runId = ""
  try {
    const momento = momentoDoEmail(p.flowType, p.emailNumber)
    const maxTokens = resolverTetoDoCurador(p.maxTokens)
    const config: AgentInvokeConfig = {
      model: modelo,
      temperature: 0.2,
      max_tokens: maxTokens,
      system_prompt: DEFAULT_CHOOSER_VAULT_SYSTEM,
      user_template: DEFAULT_CHOOSER_VAULT_USER,
    }

    const estruturadorOn = p.estruturadorOn === true
    const OMITIDO = BLOCO_OMITIDO_PELO_ESTRUTURADOR
    const lacunasBlock = buildLacunasBlock(p.vault, p.liveSections)
    const vars: Record<string, string> = {
      ...p.baseVars,
      // Com decisão do Estruturador, referências e outline saem: ele já
      // traduziu esse material e a sequência é dele.
      estruturas_ref: estruturadorOn ? OMITIDO : buildEstruturasRefResumo(p.estruturasRef),
      ...(estruturadorOn
        ? { outline_objective: OMITIDO, outline_guidance: OMITIDO, outline_tone_hint: OMITIDO }
        : {}),
      secoes_notas: buildSecaoNotasBlock(p.vault, p.liveSections),
      lacunas_biblioteca: lacunasBlock,
      indice_vault: renderIndiceDoVault(p.indiceDoVault ?? { pastas: [] }),
      aprendizados: buildAprendizadosBlock(p.aprendizados),
      memoria: `${p.baseVars.memoria ?? ""}\n\n${renderUsageCounts(p.usageCounts, p.extras)}`.trim(),
    }
    const systemVars = {
      protocolo: buildProtocoloBlock(p.vault),
      convivencias: buildConvivenciaBlock(p.vault),
      catalogo: p.catalogComExtras.compact.text,
    }

    const catalogSha8 = crypto
      .createHash("sha256")
      .update(p.catalogComExtras.compact.text)
      .digest("hex")
      .slice(0, 8)
    const systemResolvido = interpolateSystem(DEFAULT_CURADOR_SHORTLIST_SYSTEM, systemVars)
    const segUser = buildSegmentedPrompt(config.user_template, vars, {
      ...p.origins,
      aprendizados: { cls: "vault", rotulo: "Aprendizados — email_learnings" },
      lacunas_biblioteca: { cls: "vault", rotulo: "Lacunas da biblioteca — email_vault_docs (componentes/lacunas)" },
      indice_vault: { cls: "vault", rotulo: "Índice de pastas do Obsidian — file_path das tabelas do vault" },
    }, { parte: "user" })
    const segSystem = buildInterpolatedSegments(DEFAULT_CURADOR_SHORTLIST_SYSTEM, systemVars, {
      catalogo: {
        cls: "biblioteca",
        rotulo: `Índice compacto da biblioteca — ${p.catalogComExtras.total} variantes`,
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
        rotulo: modo === "on" ? "Curador (vault) — shortlist" : "Shadow do Curador — shortlist",
        cls: "sistema",
        valor:
          modo === "on"
            ? `${modelo} · protocolo do vault · saída CONSUMIDA pelo pipeline`
            : `${modelo} · contrato ampliado (ensaio) — saída NÃO consumida`,
      },
      { rotulo: "Protocolo do vault", cls: "vault", valor: p.vault.protocolo ? "servido" : "AUSENTE (vault não sincronizado)" },
      { rotulo: "Índice compacto + eixos", cls: "biblioteca", valor: `${p.catalogComExtras.total} variantes · eixos em ${p.extras.size} · sha8 ${catalogSha8}` },
      { rotulo: "Momento", cls: "sistema", valor: momento ?? `(não mapeado p/ ${p.flowType})` },
      { rotulo: "Aprendizados", cls: "vault", valor: `${p.aprendizados.length} servidos` },
      {
        rotulo: "Estruturas de referência",
        cls: "vault",
        valor: estruturadorOn
          ? "omitidas — a decisão do Estruturador substitui"
          : `${p.estruturasRef.length} do flow`,
      },
      {
        rotulo: "Lacunas da biblioteca (vault)",
        cls: "vault",
        valor: p.vault.lacunas.length > 0 ? `${p.vault.lacunas.length} registrada(s) · ${lacunasBlock.startsWith("(") ? "nenhuma das seções deste email" : "servidas as das seções deste email"}` : "(nenhuma registrada)",
      },
      {
        rotulo: "Índice do vault (Obsidian)",
        cls: "vault",
        valor: `${(p.indiceDoVault?.pastas ?? []).length} pasta(s) · notas das finalistas carregadas em lote`,
      },
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

    // Progressive disclosure em duas chamadas. A shortlist vê apenas o
    // índice; o código valida ids/seções e carrega TODAS as notas em lote.
    const shortlistCall = await invokeAgent(
      { ...config, system_prompt: DEFAULT_CURADOR_SHORTLIST_SYSTEM, max_tokens: Math.min(maxTokens, 5000) },
      vars,
      systemVars,
    )
    const shortlist = parseValidatedShortlist({
      raw: shortlistCall.raw,
      sections: p.liveSections,
      typeIndex: p.typeIndex,
      aliasIndex: p.aliasIndex,
    })
    if (shortlist.malformed || shortlist.byBlock.size === 0) {
      throw new Error("curador_shortlist_invalida")
    }
    const finalistIds = Array.from(new Set(Array.from(shortlist.byBlock.values()).flatMap((choices) => choices.map((c) => c.variant_id))))
    const finalistNotes = await loadFinalistNotes(finalistIds)
    const finalVars = { ...vars, finalistas_notas: renderFinalistNotes(finalistNotes) }
    const finalConfig = {
      ...config,
      user_template: `${config.user_template}\n\n<notas_das_finalistas>\n{{finalistas_notas}}\n</notas_das_finalistas>\n\nEscolha SOMENTE entre as finalistas listadas acima.`,
    }
    let finalCall = await invokeAgent(finalConfig, finalVars, systemVars)
    let retomada: { feita: boolean; motivo: string; erro?: string; prefill_usado: boolean } | undefined
    // Uma retomada curta preserva o comportamento de recuperação do JSON,
    // sem reabrir ferramentas nem refazer a shortlist.
    const motivoRetomada = motivoDeRetomada(finalCall.raw, finalCall.finishReason)
    if (retomadaLigada() && motivoRetomada) {
      const retryVars = { ...finalVars, resposta_anterior: finalCall.raw }
      const retry = await invokeAgent(
        { ...finalConfig, user_template: `${finalConfig.user_template}\n\n<resposta_anterior>{{resposta_anterior}}</resposta_anterior>\n${MENSAGEM_RETOMADA_JSON}` },
        retryVars,
        systemVars,
      )
      finalCall = {
        ...retry,
        tokensInput: finalCall.tokensInput + retry.tokensInput,
        tokensOutput: finalCall.tokensOutput + retry.tokensOutput,
        costUsd: finalCall.costUsd + retry.costUsd,
      }
      retomada = { feita: true, motivo: motivoRetomada, prefill_usado: false }
    }
    const res = {
      ...finalCall,
      tokensInput: shortlistCall.tokensInput + finalCall.tokensInput,
      tokensOutput: shortlistCall.tokensOutput + finalCall.tokensOutput,
      costUsd: shortlistCall.costUsd + finalCall.costUsd,
      consultas: [],
      voltas: retomada?.feita ? 3 : 2,
      fallback_sem_ferramentas: false,
      shortlist,
      finalistNotes,
      finalistIds,
      retomada,
    }
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
    const finalistTypeIndex = new Map(
      res.finalistIds.map((id) => [id, p.typeIndex.get(id) ?? ""]),
    )
    const ranking = parsed
      ? restrictRankingToShortlist(parseCuratorRanking({
          raw: parsed.escolhasRaw,
          sections,
          typeIndex: finalistTypeIndex,
          maxPerBlock: SHADOW_TOP_N,
        }), res.shortlist, sections.length)
      : null

    const sectionByBlock = new Map(sections.map((s, i) => [i, s]))
    // Posição que o JSON nem MENCIONA (diferente de `escolhas: []`, que é
    // "sem candidata" declarado): é o rastro de um JSON completo mas
    // incompleto — o que a retomada tenta fechar.
    const mencionadas = new Set((parsed?.escolhasDetalhadas ?? []).map((e) => e.block_index))
    const posicoesSemResposta = parsed
      ? sections.map((section, i) => ({ block_index: i, section })).filter((x) => !mencionadas.has(x.block_index))
      : []
    const shadowRank1 = ranking ? rank1ByBlock(ranking.byBlock) : new Map<number, string>()
    const violations = measureProtocolViolations({
      rank1ByBlock: shadowRank1,
      extras: p.extras,
      sectionByBlock,
      alvo: p.alvoMedicao ?? null,
      contratos: contratosDoCatalogo(p.catalogComExtras.sections),
      eliminadasPorRequisito: indiceDeEliminadas(p.eliminadasPorRequisito ?? []),
    })
    // Repetir a mesma variante fora de hero/products é permitido (07/09) —
    // fica como registro para a curadoria ver quando é pobreza de acervo.
    const repeticoes = repeticoesPermitidas({ rank1ByBlock: shadowRank1, sectionByBlock })

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
      // 32k: é aqui que se lê o raciocínio quando o JSON não veio; 8k
      // cortava justamente a parte que explicava a eliminação.
      rawOutput: res.raw.slice(0, 32_000),
      parsedOutput: {
        progressive_disclosure: {
          initial_variants: p.catalogComExtras.total,
          finalists: res.finalistIds,
          notes_opened: res.finalistNotes.filter((n) => n.status === "opened").map((n) => n.variant_id),
          notes_missing: res.finalistNotes.filter((n) => n.status === "missing").map((n) => n.variant_id),
          notes_database_error: res.finalistNotes.filter((n) => n.status === "database_error").map((n) => n.variant_id),
          note_sources: res.finalistNotes.map((n) => ({
            variant_id: n.variant_id,
            status: n.status,
            file_path: n.file_path,
            chars: n.body?.length ?? 0,
            sha8: n.body ? crypto.createHash("sha256").update(n.body).digest("hex").slice(0, 8) : null,
          })),
          segments: {
            full_catalog_baseline: { chars: p.catalogComExtras.json.length, tokens_estimated: Math.ceil(p.catalogComExtras.json.length / 4) },
            compact_index: { chars: p.catalogComExtras.compact.text.length, tokens_estimated: Math.ceil(p.catalogComExtras.compact.text.length / 4) },
          },
          reduction: {
            chars: p.catalogComExtras.json.length - p.catalogComExtras.compact.text.length,
            percent_chars: p.catalogComExtras.json.length > 0
              ? Math.round((1 - p.catalogComExtras.compact.text.length / p.catalogComExtras.json.length) * 1000) / 10
              : 0,
          },
        },
        shadow: modo === "shadow",
        shadow_contract: "v2-justificado",
        curador_vault_mode: modo,
        finish_reason: res.finishReason ?? null,
        max_tokens_usado: maxTokens,
        raw_chars: res.raw.length,
        voltas_json: res.retomada?.feita ? 1 : 0,
        retomada_motivo: res.retomada?.motivo ?? null,
        retomada_erro: res.retomada?.erro ?? null,
        prefill_usado: res.retomada?.prefill_usado ?? false,
        posicoes_sem_resposta: posicoesSemResposta,
        eliminadas_por_requisito: p.eliminadasPorRequisito ?? [],
        // 02/09: a decisão do Estruturador entrou no template do vault (só
        // o legado tinha) e o Curador pode consultar o Obsidian.
        estruturador_consumido: estruturadorOn,
        lacunas_servidas: p.vault.lacunas.length,
        consultou_vault: res.consultas.length > 0,
        consultas_ao_vault: res.consultas,
        variantes_inicialmente_candidatas: p.catalogComExtras.sections.flatMap((s) => s.variantes.map((v) => v.variant_id)),
        tamanhos_segmentos: (promptSegments ?? []).map((s) => ({ rotulo: s.rotulo, parte: s.parte ?? null, chars: s.chars })),
        reducao_catalogo: {
          chars_catalogo_integral: p.catalogComExtras.json.length,
          chars_indice_compacto: p.catalogComExtras.enxuto.length,
          chars_reduzidos: Math.max(0, p.catalogComExtras.json.length - p.catalogComExtras.enxuto.length),
          tokens_estimados_reduzidos: Math.ceil(Math.max(0, p.catalogComExtras.json.length - p.catalogComExtras.enxuto.length) / 4),
        },
        voltas: res.voltas,
        fallback_sem_ferramentas: res.fallback_sem_ferramentas,
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
        ids_por_apelido: ranking?.resolvedByAlias ?? [],
        protocol_violations: violations,
        repeticoes,
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
      estruturadorOn,
      consultas: res.consultas.length,
      voltas: res.voltas,
      positions: ranking?.byBlock.size ?? 0,
      violations: violations.length,
      liveViolations: p.liveViolations.length,
      agreementPct: comparaveis > 0 ? Math.round((iguais / comparaveis) * 100) : null,
    })

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
      if (parsed && parsed.escolhasDetalhadas.length > 0 && p.onParcial) {
        p.onParcial({
          posicoes: parsed.escolhasDetalhadas.map((e) => ({
            block_index: e.block_index,
            section: sectionByBlock.get(e.block_index) ?? "",
            justificativa: e.justificativa,
            escolhas: e.escolhas.map((o) => ({
              variant_id: p.extras.get(o.variant_id)?.slug ?? o.variant_id,
              motivo: o.motivo,
            })),
          })),
        })
      }
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
        model: modelo,
        errorMessage: `shadow: ${msg}`,
        parsedOutput: { shadow: modo === "shadow", curador_vault_mode: modo },
        durationMs: Date.now() - t0,
      }).catch(() => {})
    }
    return null
  }
}
