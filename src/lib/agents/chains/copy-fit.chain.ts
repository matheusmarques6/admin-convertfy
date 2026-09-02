/**
 * copy_fit — conserta a copy que o n8n devolveu: tamanho, travessão e idioma.
 *
 * Por que existe: os limites vão no payload (`schema.campos.*.max_caracteres`,
 * 40 de 40 campos no batch cc71e995) e o n8n não os respeita — entre 20 e
 * 27/08, TODO run de copy voltou com estouro. `findFieldDeviations` media e
 * gravava em `parsed_output.desvios`, "observabilidade apenas", e nada lia.
 * A frase longa seguia pelo `copy_merge` até vazar da caixa no email.
 *
 * O que este agente faz: recebe SÓ os campos com problema, com o limite e a
 * orientação de cada um, e devolve a versão corrigida. Não vê o HTML, não
 * escreve no documento, não toca em campo que já estava certo.
 *
 * O terceiro motivo é o IDIOMA (01/09). A ordem de idioma sai no payload do
 * n8n em três lugares, em inglês, e a copy da Innova Bay — loja `en` —
 * voltou em português dentro do mesmo bloco. O flow não referencia os
 * campos novos: pedir mais alto seria repetir o que já falhou, então a
 * correção passou para cá, onde o veredicto é do código.
 *
 * Quem decide o que entra é o CÓDIGO: cada reescrita passa por
 * `aceitarReescrita` (`email-workspace/copy-fit.ts`) — vazio, ainda longo,
 * maior que o original, idêntico ou abaixo do mínimo é RECUSADO, com o
 * motivo registrado. A saída do modelo é proposta, não decisão.
 *
 * Fail-open: qualquer erro mantém a copy original e devolve lista vazia. A
 * geração nunca cai por causa do encurtador — mesma doutrina do
 * `merge_verifier` e do carregador de revisões humanas.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  aceitarReescrita,
  contarTracos,
  encurtarPorFrase,
  type MotivoDeAlvo,
  type AlvoDeEncurtamento,
  type MotivoDeRecusa,
} from "@/lib/email-workspace/copy-fit"
import {
  detectarIdioma,
  type IdiomaDetectado,
} from "@/lib/email-workspace/idioma-copy"
import { languageCodeToLabel } from "@/lib/i18n/store-language"
import {
  resolveCostCents,
  finishGenerationRun,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "../architect/llm-invoke"
import { renderImageTemplate } from "../image/template-renderer"
import {
  buildSegmentedPrompt,
  concatSegments,
  type InputSummaryItem,
  type SegmentOrigin,
} from "../shared/prompt-provenance"

const log = logger.child("CopyFit")

// Fallback usado só se email_agent_configs não tiver row ativa para
// agent_type='copy_fit' (a migration 20261089 semeia a versão canônica).
//
// Forma SLASH de propósito: o `invokeAgent` roteia pelo id — sem "/" vai no
// SDK da Anthropic, com "/" vai no OpenRouter. O default nasceu
// 'claude-haiku-4-5-20251001' e foi o ÚNICO agente ativo do pipeline fora
// do OpenRouter; quando a conta direta da Anthropic zerou, o encurtador
// morreu com 400 "credit balance is too low" e o fail-open engoliu. Mesmo
// modelo, mesmo preço (normalizeModelKey tira o vendor), outro caminho.
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5"

const DEFAULT_SYSTEM = `Você corrige copy de email de e-commerce: encurta o que passou do limite da caixa, tira o travessão e reescreve no idioma da loja o campo que voltou na língua errada.

REGRAS
- Reescreva CADA campo recebido para caber em max_caracteres. O limite é o tamanho real do slot no HTML: passar dele faz o texto vazar da caixa.
- Preserve a MENSAGEM: o argumento central, os números, os nomes de produto e a chamada para ação continuam. Corte redundância, adjetivo decorativo e frase de apoio — nunca o fato.
- IDIOMA: escreva SEMPRE no idioma declarado em IDIOMA DA LOJA. NUNCA traduza para outro idioma — nem para o idioma em que estas instruções estão escritas. O campo que já está no idioma da loja continua com as palavras dele; você só encurta ou tira o traço. O campo que chegou em outro idioma é reescrito no idioma da loja, preservando o argumento, os números, os códigos de cupom e os nomes de produto — esse pode mudar de tamanho para mais ou para menos, desde que caiba em max_caracteres.
- Mantenha o mesmo tom do texto original.
- Não use reticências nem corte a frase no meio: entregue frase inteira e bem terminada.
- Não invente informação que não esteja no texto original.
- Respeite min_caracteres quando existir.
- TRAVESSÃO: campo marcado com remover_travessao tem de voltar SEM travessão (—) e SEM meia-risca (–). Não troque o traço por hífen nem por reticências: use vírgula, ponto ou uma conjunção, o que soar natural NO IDIOMA DO TEXTO. Hífen DENTRO de palavra (OBD-II, e-mail, zero-risk) é parte da palavra: não mexa.
- Campo com remover_travessao e sem encurtar pode ficar um pouco maior que o original, desde que caiba em max_caracteres — tirar o traço às vezes custa uma conjunção.

SAÍDA
Responda APENAS JSON, sem comentário nem cerca de código:
{"campos":{"<id>":"<texto reescrito>"}}
Use exatamente os \`id\` recebidos, um por campo. Não inclua campo que você não reescreveu.`

const DEFAULT_USER = `LOJA: {{brand_name}} — TOM DE VOZ: {{tom_voz}}
IDIOMA DA LOJA: {{idioma_alvo}} — toda a copy deste email é escrita neste idioma.

CONTRATO DOS CAMPOS (label, limite e orientação de cada um):
{{contrato_json}}

COPY ATUAL (o que precisa encurtar, com o tamanho de agora):
{{copy_atual_json}}

Devolva o JSON agora.`

/**
 * Proveniência (plano de telemetria, 26/08): a origem fica AO LADO de quem
 * monta a var. Por isso a copy do n8n e os limites da variante são vars
 * SEPARADAS, casadas pelo `id`: juntá-las num único bloco misturaria
 * `upstream` com `curadoria` dentro do mesmo segmento e a tela do Estúdio
 * passaria a mentir sobre de onde o texto veio.
 */
const COPY_FIT_ORIGINS: Record<string, SegmentOrigin> = {
  brand_name: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  tom_voz: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  idioma_alvo: { cls: "loja", rotulo: "Idioma da loja — client_stores.language" },
  contrato_json: {
    cls: "curadoria",
    rotulo: "Contrato do bloco — output_schema da variante",
  },
  copy_atual_json: {
    cls: "upstream",
    rotulo: "Copy acima do limite — SAÍDA do n8n",
  },
}

export type CopyFitMode = "on" | "off"

/**
 * Kill-switch por org (`email_generation_settings.copy_fit_mode`).
 *
 * Sem org, sem linha de settings ou com a migration não aplicada, o default
 * é `on`: o encurtador é a correção do comportamento quebrado, não um
 * experimento a ser optado. Erro de leitura também cai em `on` — falhar
 * aqui desligaria a correção em silêncio.
 */
export async function loadCopyFitMode(
  orgId: string | null | undefined,
): Promise<CopyFitMode> {
  if (!orgId) return "on"
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("email_generation_settings")
      .select("copy_fit_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    return (data as { copy_fit_mode?: string } | null)?.copy_fit_mode === "off"
      ? "off"
      : "on"
  } catch {
    return "on"
  }
}

export interface ReescritaAceita {
  id: string
  position: number
  block_id: string | null
  key: string
  texto: string
}

export interface DePara {
  id: string
  position: number
  key: string
  antes: string
  antes_len: number
  depois: string | null
  depois_len: number | null
  max: number
  aceito: boolean
  /** Por que o campo entrou na lista (estouro, travessão, idioma). */
  motivos: MotivoDeAlvo[]
  tracos_antes: number
  /** No texto que fica: o reescrito quando aceito, o original quando não. */
  tracos_depois: number
  /** Só nos alvos de idioma: o que o detector viu antes e no texto que fica. */
  idioma_antes?: IdiomaDetectado
  idioma_depois?: IdiomaDetectado
  motivo?: MotivoDeRecusa | "sem_resposta" | "fallback_codigo"
}

export interface CopyFitResult {
  aceitas: ReescritaAceita[]
  de_para: DePara[]
  /** Nenhum alvo, modo desligado ou falha — o callback não regrava nada. */
  rodou: boolean
  /**
   * A mensagem do erro quando o fail-open engoliu um. O callback a copia
   * para o `parsed_output` do run `copy`: o run PRÓPRIO do copy_fit é o
   * lugar natural desse dado, mas ele é justamente o que some quando a
   * telemetria falha — e foi assim que quatro dias de `corrigidos: 0`
   * passaram sem explicação. Dois lugares, uma verdade.
   */
  erro?: string
}

const VAZIO: CopyFitResult = { aceitas: [], de_para: [], rodou: false }

function contratoDe(alvos: ReadonlyArray<AlvoDeEncurtamento>): string {
  return JSON.stringify(
    alvos.map((a) => ({
      id: a.id,
      bloco: a.type,
      campo: a.label,
      max_caracteres: a.max,
      // Mira abaixo do teto. Em 02/09 o modelo devolveu ~250 para max 200 e
      // ~150 para max 130, duas vezes seguidas: pedido "até N" vira "N e
      // um pouco". Com alvo em 85% ele erra para dentro.
      alvo_caracteres: a.motivos.includes("max_len") ? Math.floor(a.max * 0.85) : undefined,
      min_caracteres: a.min,
      // Só quando é o caso: um `false` em todo campo ensinaria o modelo a
      // ignorar a chave.
      remover_travessao: a.motivos.includes("travessao") || undefined,
      encurtar: a.motivos.includes("max_len") || undefined,
      // O idioma NÃO é marca por campo. Era, até 01/09: o contrato trazia
      // `reescrever_no_idioma` só nos campos divergentes e o prompt dizia
      // "por padrão mantenha o mesmo idioma; a única exceção é…". Essa
      // construção condicional ensinou o modelo a trocar de língua, e ele
      // trocou nos 14 campos — inclusive nos 14 que não tinham a marca.
      // Agora o idioma é UMA declaração no topo, igual para todo campo.
      traduzir_para_o_idioma_da_loja: a.motivos.includes("idioma") || undefined,
      orientacao: a.orientacao || undefined,
    })),
    null,
    2,
  )
}

/** `"en"` → `"en (Inglês)"`. Sem rótulo canônico devolve o código cru. */
function nomeDoIdioma(code: string | null | undefined): string {
  const c = (code ?? "").trim()
  if (!c) return ""
  const label = languageCodeToLabel(c)
  return label ? `${c} (${label})` : c
}

function copyAtualDe(alvos: ReadonlyArray<AlvoDeEncurtamento>): string {
  return JSON.stringify(
    alvos.map((a) => ({
      id: a.id,
      caracteres_agora: a.texto.length,
      travessoes_agora: a.tracos || undefined,
      idioma_agora: a.idioma_detectado || undefined,
      texto: a.texto,
    })),
    null,
    2,
  )
}

/** `{"campos":{"0.headline":"..."}}` → Map. Formato torto → Map vazio. */
function parseCampos(raw: string): Map<string, unknown> {
  const out = new Map<string, unknown>()
  const json = JSON.parse(extractJson(raw)) as Record<string, unknown>
  const campos = json?.campos
  if (campos && typeof campos === "object" && !Array.isArray(campos)) {
    for (const [k, v] of Object.entries(campos as Record<string, unknown>)) {
      out.set(k, v)
    }
  }
  return out
}

export interface CopyFitInput {
  storeId: string
  /** "" quando a geração não veio de um batch — mesma convenção do run `copy`. */
  batchId: string
  triggeredBy?: string
  emailId?: string | null
  flowId?: string | null
  brandName: string
  tomVoz: string
  alvos: AlvoDeEncurtamento[]
}

/**
 * Encurta os campos que estouraram. Uma retentativa, só com o que ainda não
 * coube — o modelo erra o limite por pouco com frequência, e uma segunda
 * passada barata resolve; a terceira não resolveria.
 */
export async function runCopyFit(input: CopyFitInput): Promise<CopyFitResult> {
  if (input.alvos.length === 0) return VAZIO

  const cfgRow = await loadActiveAgentConfig("copy_fit")
  const config: AgentInvokeConfig = cfgRow
    ? {
        model: cfgRow.model,
        temperature: cfgRow.temperature,
        max_tokens: cfgRow.max_tokens,
        system_prompt: cfgRow.system_prompt,
        user_template: cfgRow.user_template,
      }
    : {
        model: DEFAULT_MODEL,
        temperature: 0.4,
        max_tokens: 1500,
        system_prompt: DEFAULT_SYSTEM,
        user_template: DEFAULT_USER,
      }

  const vars: Record<string, string> = {
    brand_name: input.brandName,
    tom_voz: input.tomVoz,
    idioma_alvo:
      nomeDoIdioma(input.alvos.find((a) => a.idioma_esperado)?.idioma_esperado) ||
      "(não configurado — mantenha o idioma de cada texto)",
    contrato_json: contratoDe(input.alvos),
    copy_atual_json: copyAtualDe(input.alvos),
  }

  const segUser = buildSegmentedPrompt(config.user_template, vars, COPY_FIT_ORIGINS, {
    parte: "user",
  })
  const renderedPrompt = segUser.segments
    ? segUser.prompt
    : renderImageTemplate(config.user_template, vars)
  const promptSegments = concatSegments(
    [
      {
        cls: "agente" as const,
        rotulo: "Template do agente",
        texto: config.system_prompt,
        chars: config.system_prompt.length,
        parte: "system" as const,
      },
    ],
    segUser.segments,
  )
  const inputSummary: InputSummaryItem[] = [
    { rotulo: "Loja", cls: "loja", valor: input.brandName || "(sem nome)" },
    {
      // "acima do limite" era mentira para o alvo que entrou por travessão
      // e cabe na caixa. O motivo vai junto de cada campo.
      rotulo: "Campos a corrigir",
      cls: "upstream",
      valor: input.alvos
        .map((a) => {
          const tamanho = a.motivos.includes("max_len")
            ? ` ${a.texto.length}/${a.max}`
            : ""
          const traco = a.motivos.includes("travessao")
            ? ` ${a.tracos} travessão(ões)`
            : ""
          const idioma = a.motivos.includes("idioma")
            ? ` idioma ${a.idioma_detectado}→${a.idioma_esperado}`
            : ""
          return `${a.key}${tamanho}${traco}${idioma}`
        })
        .join(" · "),
    },
    {
      rotulo: "Contrato",
      cls: "curadoria",
      valor: `${input.alvos.length} campo(s) de ${new Set(input.alvos.map((a) => a.position)).size} bloco(s)`,
    },
  ]

  const t0 = Date.now()
  const runId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    emailId: input.emailId ?? undefined,
    flowId: input.flowId ?? undefined,
    batchId: input.batchId,
    agent: "copy_fit",
    agentConfigId: cfgRow?.id,
    model: config.model,
    renderedPrompt,
    promptSegments,
    inputSummary,
  })

  const aceitas = new Map<string, ReescritaAceita>()
  const motivos = new Map<string, MotivoDeRecusa | "sem_resposta">()
  let tokensInput = 0
  let tokensOutput = 0
  let custoUsd = 0
  let raw = ""
  let tentativas = 0
  // Contado NA passada, não no de_para: o plano B pode aceitar depois um
  // corte do código para o mesmo campo, e a tradução recusada tem de
  // continuar contando — é o número que diz se o prompt está escorregando.
  let traducoesRecusadas = 0

  try {
    let pendentes = input.alvos
    for (let passada = 0; passada < 2 && pendentes.length > 0; passada++) {
      const varsDaPassada =
        passada === 0
          ? vars
          : {
              ...vars,
              contrato_json: contratoDe(pendentes),
              copy_atual_json: copyAtualDe(pendentes),
            }
      const res = await invokeAgent(config, varsDaPassada)
      tentativas++
      tokensInput += res.tokensInput ?? 0
      tokensOutput += res.tokensOutput ?? 0
      custoUsd += res.costUsd ?? 0
      raw = res.raw
      const campos = parseCampos(res.raw)

      const aindaFora: AlvoDeEncurtamento[] = []
      for (const alvo of pendentes) {
        if (!campos.has(alvo.id)) {
          motivos.set(alvo.id, "sem_resposta")
          aindaFora.push(alvo)
          continue
        }
        const proposta = campos.get(alvo.id)
        const veredicto = aceitarReescrita(alvo.texto, proposta, {
          max: alvo.max,
          min: alvo.min,
          motivos: alvo.motivos,
          idiomaEsperado: alvo.idioma_esperado,
        })
        if (veredicto.ok) {
          motivos.delete(alvo.id)
          aceitas.set(alvo.id, {
            id: alvo.id,
            position: alvo.position,
            block_id: alvo.block_id,
            key: alvo.key,
            texto: String(proposta).trim(),
          })
          continue
        }
        if (veredicto.motivo === "mudou_de_idioma") traducoesRecusadas++
        motivos.set(alvo.id, veredicto.motivo ?? "sem_resposta")
        aindaFora.push(alvo)
      }
      pendentes = aindaFora
    }

    // PLANO B — o código corta o que o modelo não coube (02/09: 6 de 9
    // campos recusados nas duas passadas e o original, com travessão,
    // seguiu para o email). Só para alvo de TAMANHO ou TRAVESSÃO: o de
    // idioma não tem corte mecânico possível. Passa pelo MESMO guard que a
    // proposta do modelo — o corte também tem de caber, respeitar o mínimo
    // e não trocar de língua.
    const pelosCodigo = new Set<string>()
    for (const alvo of pendentes) {
      if (alvo.motivos.includes("idioma")) continue
      const corte = encurtarPorFrase(alvo.texto, alvo.max)
      if (corte == null) continue
      const veredicto = aceitarReescrita(alvo.texto, corte, {
        max: alvo.max,
        min: alvo.min,
        motivos: alvo.motivos,
        idiomaEsperado: alvo.idioma_esperado,
      })
      if (!veredicto.ok) continue
      aceitas.set(alvo.id, {
        id: alvo.id,
        position: alvo.position,
        block_id: alvo.block_id,
        key: alvo.key,
        texto: corte,
      })
      motivos.delete(alvo.id)
      pelosCodigo.add(alvo.id)
    }

    const de_para: DePara[] = input.alvos.map((a) => {
      const ok = aceitas.get(a.id)
      return {
        id: a.id,
        position: a.position,
        key: a.key,
        antes: a.texto,
        antes_len: a.texto.length,
        depois: ok?.texto ?? null,
        depois_len: ok ? ok.texto.length : null,
        max: a.max,
        aceito: Boolean(ok),
        motivos: a.motivos,
        tracos_antes: a.tracos,
        // Aceito sem traço é o esperado; recusado, o texto que fica é o
        // original, e o número tem de refletir o que o cliente vai ler.
        tracos_depois: ok ? contarTracos(ok.texto) : a.tracos,
        ...(a.motivos.includes("idioma")
          ? {
              idioma_antes: a.idioma_detectado ?? detectarIdioma(a.texto),
              idioma_depois: ok ? detectarIdioma(ok.texto) : a.idioma_detectado,
            }
          : {}),
        ...(ok
          ? pelosCodigo.has(a.id)
            ? { motivo: "fallback_codigo" as const }
            : {}
          : { motivo: motivos.get(a.id) ?? "sem_resposta" }),
      }
    })

    await finishGenerationRun(runId, {
      storeId: input.storeId,
      triggeredBy: input.triggeredBy,
      emailId: input.emailId ?? undefined,
      flowId: input.flowId ?? undefined,
      batchId: input.batchId,
      agent: "copy_fit",
      agentConfigId: cfgRow?.id,
      status: "success",
      model: config.model,
      inputVars: vars,
      renderedPrompt,
      promptSegments,
      inputSummary,
      rawOutput: raw.slice(0, 4000),
      parsedOutput: {
        alvos: input.alvos.length,
        corrigidos: aceitas.size,
        mantidos: input.alvos.length - aceitas.size,
        tentativas,
        // Quantos o CÓDIGO cortou depois de o modelo falhar duas vezes. Se
        // este número dominar, o modelo não está fazendo o trabalho dele.
        corrigidos_pelo_codigo: pelosCodigo.size,
        // Travessão: quantos alvos entraram por ele e quantos sobraram no
        // texto que o cliente vai ler. `depois > 0` é o número que diz se o
        // agente está cumprindo — sem ele a regra viraria fé.
        com_travessao: input.alvos.filter((a) => a.motivos.includes("travessao"))
          .length,
        travessoes_antes: de_para.reduce((n, d) => n + d.tracos_antes, 0),
        travessoes_depois: de_para.reduce((n, d) => n + d.tracos_depois, 0),
        // Idioma: quantos campos voltaram do n8n na língua errada e quantos
        // AINDA estão errados no texto que o cliente vai ler. O primeiro
        // número é a medida do que o flow ignora; o segundo, a do que
        // conseguimos corrigir sem ele.
        com_idioma_errado: input.alvos.filter((a) => a.motivos.includes("idioma"))
          .length,
        idioma_esperado: input.alvos.find((a) => a.idioma_esperado)?.idioma_esperado ?? null,
        idioma_errado_depois: de_para.filter(
          (d) => d.idioma_depois && d.idioma_depois !== "indefinido" && !d.aceito,
        ).length,
        // O número do incidente de 01/09: quantas vezes o modelo tentou
        // devolver o campo em outra língua e o CÓDIGO barrou. Se voltar a
        // subir, é o prompt que está escorregando de novo.
        traducoes_recusadas: traducoesRecusadas,
        de_para,
      },
      tokensInput,
      tokensOutput,
      costCents: resolveCostCents({
        model: config.model,
        tokensInput,
        tokensOutput,
        costUsd: custoUsd,
      }),
      durationMs: Date.now() - t0,
    })

    log.info("copy_fit.done", {
      emailId: input.emailId,
      alvos: input.alvos.length,
      corrigidos: aceitas.size,
      pelo_codigo: pelosCodigo.size,
      mantidos: input.alvos.length - aceitas.size,
    })
    return { aceitas: [...aceitas.values()], de_para, rodou: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Fail-open: o que já foi ACEITO nas passadas anteriores vale — descartar
    // correção boa por causa de um erro na retentativa seria pior.
    log.warn("copy_fit.failed", {
      emailId: input.emailId,
      alvos: input.alvos.length,
      corrigidos: aceitas.size,
      error: msg,
    })
    await finishGenerationRun(runId, {
      storeId: input.storeId,
      triggeredBy: input.triggeredBy,
      emailId: input.emailId ?? undefined,
      flowId: input.flowId ?? undefined,
      batchId: input.batchId,
      agent: "copy_fit",
      agentConfigId: cfgRow?.id,
      status: "error",
      model: config.model,
      inputVars: vars,
      renderedPrompt,
      promptSegments,
      inputSummary,
      rawOutput: raw.slice(0, 4000),
      errorMessage: msg,
      parsedOutput: {
        alvos: input.alvos.length,
        corrigidos: aceitas.size,
        mantidos: input.alvos.length - aceitas.size,
        tentativas,
      },
      tokensInput,
      tokensOutput,
      costCents: resolveCostCents({
        model: config.model,
        tokensInput,
        tokensOutput,
        costUsd: custoUsd,
      }),
      durationMs: Date.now() - t0,
    }).catch(() => {})
    return {
      aceitas: [...aceitas.values()],
      de_para: [],
      rodou: aceitas.size > 0,
      erro: msg,
    }
  }
}
