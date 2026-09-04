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
  buildLacunasBlock,
  buildMomentoBlock,
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
  interpolateSystem,
  invokeAgent,
  invokeAgentWithTools,
  type AgentInvokeConfig,
  type InvokeWithToolsOptions,
  type ToolCallLog,
} from "./llm-invoke"
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

const SHADOW_TOP_N = 1

/** Modelo do shadow (e candidato do flip). Env sobrepõe sem deploy de config. */
export const CURADOR_SHADOW_MODEL =
  process.env.CURADOR_SHADOW_MODEL?.trim() || "anthropic/claude-sonnet-4.6"

// ── Prompt do contrato AMPLIADO (o prompt do flip, ensaiado no shadow) ───

export const DEFAULT_CHOOSER_VAULT_SYSTEM = `Você é o Curador de Componentes de email da Convertfy. A ESTRUTURA do email já está decidida pelo Estruturador — a sequência de seções e o papel de cada posição chegam prontos em <decisao_do_estruturador> e <estrutura_do_email>. A sua função é ENCONTRAR NA BIBLIOTECA os blocos que encaixam perfeitamente em cada posição e conversam com essa proposta: para cada posição, A variante cuja ANATOMIA realiza o papel decidido — uma só, a que encaixa melhor. Você não decide estrutura, não reescreve papel, não discute a sequência.

Você decide pelo protocolo, pelos eixos e pelos metadados. Você NÃO recebe o HTML das variantes.

<protocolo_de_selecao>

{{protocolo}}
</protocolo_de_selecao>

<biblioteca>
Catálogo completo, agrupado por tipo de seção. Dentro de cada tipo a ordem é alfabética e NÃO carrega julgamento. \`description\`, \`quando_usar\` e \`quando_nao_usar\` descrevem a peça que será REALMENTE montada — é o cadastro do sistema, e é ele que vale. Variantes com o campo \`vault\` trazem, ALÉM disso, os eixos do protocolo (momento/objecao/registro/paleta/papel_na_peca + vetos), \`peso\` e \`convivencia\`: o vault acrescenta o que o sistema não tem, nunca o contradiz.
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
   <indice_do_vault> é o mapa de pastas do Obsidian. Tudo que você precisa já está nesta mensagem; se quiser CONFERIR uma nota específica, use as ferramentas listar_pasta/ler_nota — no máximo 4 consultas, e só quando mudar a decisão.
2.  elimine por ativa/schema (já filtrados do catálogo), declarar outro momento NÃO elimina, e por capacidade (product_slots × produtos com link — a loja não tem como preencher slot de produto que não existe).  Material — foto, tipografia, tipo de campanha, qualquer ativo que você suponha faltar — não elimina ninguém: a imagem é gerada depois, e adequação de material se resolve no RANKING. Entre os sobreviventes, ENCAIXE PRIMEIRO: quem tem a anatomia que o papel decidido pede fica na frente de quem não tem — variante que não consegue realizar o papel (sem slot de cupom quando o papel entrega cupom; grade de 4 quando o papel pede 2; depoimento sem nome quando o papel pede voz com credencial) fica atrás mesmo que vença em todos os eixos. Depois rankeie por momento → objecao → registro → paleta → papel_na_peca (lexicográfico com degradação: eixo que não separa é neutro). Cheque convivência e o orçamento de peso contra as OUTRAS posições (evite pesado/peca-inteira em sequência). Desempate pela chave da nota de seção; empate total entre duplicatas envia e declara isso 
3. SOBREVIVEU, TEM DE SAIR ESCOLHIDA. \`escolhas: []\` é legítimo em UMA situação só: a eliminação (passos 3-6) zerou a lista. Se alguma candidata chegou ao passo 7, ela é escolhida — mesmo que TODOS os eixos empatem em neutro, mesmo que os eixos dela estejam vazios, mesmo que você não goste de nenhuma. Empate total não é lacuna: é o caso do passo 9, e o protocolo diz que o resultado nunca é sorteio — desempate pela nota de seção, depois menor uso em <memoria>, depois menor número no slug. "Nenhum eixo as separa" NUNCA justifica devolver lista vazia.
4. Zero candidata de verdade NÃO é erro E NÃO AUTORIZA remover a posição: declare-a com \`escolhas: []\` e a \`justificativa\` nomeando, candidata por candidata, em que passo e contra qual campo cada uma caiu — a posição continua na peça, o sistema cai no template global e a lacuna vira sinal para a curadoria da biblioteca.

Regras que continuam valendo do Curador atual: <perfil_marca> ancora identidade; <objecoes> é o que trava a compra; <vocabulario> é literal; produtos cruzam com product_slots (nunca exigir mais produtos/links do que a loja tem); <memoria> é sinal, nunca regra; HERO É ÚNICA (no máximo uma posição com variante de hero); não invente variant_id.

O OUTPUT SAI JUSTIFICADO — a decisão tem que ser auditável sem reler o catálogo:
- \`papeis\`: UMA frase por posição dizendo COMO a variante escolhida realiza o papel decidido pelo Estruturador (qual parte da anatomia entrega o quê). Não é lugar de reescrever o papel nem de propor outra sequência. Sem decisão do Estruturador, aí sim é o papel derivado da intenção.
- \`justificativa\` é OBRIGATÓRIA em toda posição: o TRAÇO da decisão em 2-4 frases — o que o papel pedia da anatomia e quem encaixou, quem foi eliminado e em que passo (momento vetado/capacidade), qual eixo do ranking decidiu e por quê ("ganhou porque objecao bateu; se não fosse isso, teria sido registro"), e o desempate quando houve.
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

<momento>
{{momento}}
</momento>

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
   * Há decisão do Estruturador nesta geração (02/09). Com ela, as
   * <estruturas_de_referencia> e o <outline> são OMITIDOS — o Estruturador
   * já consumiu e traduziu esse material; servi-lo de novo é sinal
   * concorrente à decisão.
   */
  estruturadorOn?: boolean
  /** Índice de pastas do Obsidian (consulta sob demanda). */
  indiceDoVault?: IndiceDoVault
  /** Ferramentas de consulta ao vault; ausente = call sem ferramentas. */
  ferramentas?: Pick<InvokeWithToolsOptions, "tools" | "executar" | "maxCalls">
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

    const estruturadorOn = p.estruturadorOn === true
    const OMITIDO = "(omitido — a decisão do Estruturador em <decisao_do_estruturador> substitui este bloco)"
    const lacunasBlock = buildLacunasBlock(p.vault, p.liveSections)
    const vars: Record<string, string> = {
      ...p.baseVars,
      momento: buildMomentoBlock(p.vault, p.flowType, p.emailNumber),
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
      lacunas_biblioteca: { cls: "vault", rotulo: "Lacunas da biblioteca — email_vault_docs (componentes/lacunas)" },
      indice_vault: { cls: "vault", rotulo: "Índice de pastas do Obsidian — file_path das tabelas do vault" },
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
        valor: `${(p.indiceDoVault?.pastas ?? []).length} pasta(s) · consulta sob demanda ${p.ferramentas ? `(até ${p.ferramentas.maxCalls ?? 4})` : "desligada"}`,
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

    // Com ferramentas o modelo pode consultar o Obsidian antes de responder;
    // cada consulta fica em `consultas` (telemetria) e os tokens somam todas
    // as voltas.
    const res = p.ferramentas
      ? await invokeAgentWithTools(config, vars, systemVars, {
          tools: p.ferramentas.tools,
          executar: p.ferramentas.executar,
          maxCalls: p.ferramentas.maxCalls ?? 4,
        })
      : { ...(await invokeAgent(config, vars, systemVars)), consultas: [] as ToolCallLog[], voltas: 1, fallback_sem_ferramentas: false }
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
        // 02/09: a decisão do Estruturador entrou no template do vault (só
        // o legado tinha) e o Curador pode consultar o Obsidian.
        estruturador_consumido: estruturadorOn,
        lacunas_servidas: p.vault.lacunas.length,
        consultou_vault: res.consultas.length > 0,
        consultas_ao_vault: res.consultas,
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
      estruturadorOn,
      consultas: res.consultas.length,
      voltas: res.voltas,
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
