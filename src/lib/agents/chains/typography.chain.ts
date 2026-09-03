/**
 * Typography Chain — o TIPÓGRAFO da cadeia de formatação.
 *
 * Entra depois que a copy já está no HTML e decide onde o email rompe a
 * tipografia: se a loja ganha uma segunda fonte, em quais ocorrências ela
 * aparece, e onde a ruptura é só de peso, caixa alta ou espaçamento.
 *
 * Arquitetura por views, como o `color_format`: o agente NÃO recebe o
 * documento — recebe o INVENTÁRIO das declarações de fonte
 * (`typography/inventory.ts`) e devolve ops por número de item, aplicadas por
 * código (`typography/apply.ts`) e filtradas pelos guards
 * (`typography/rules.ts`). É a lição do `text_format`, que recebia 86 KB de
 * HTML e devolvia 86 KB: o documento inteiro reescrito por um modelo é o
 * caminho mais curto para tabela quebrada e botão comido.
 *
 * Base de conhecimento em `docs/email-generation/agente-tipografia.md`
 * (fechada com o especialista em 03/09/2026). Fail-open no runner: duas
 * falhas mantêm o HTML anterior e seguem — tipografia é acabamento.
 *
 * Config em email_agent_configs (agent_type='typography'); prompt vazio →
 * defaults abaixo.
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import {
  buildSegmentedPrompt,
  concatSegments,
  type PromptSegment,
} from "../shared/prompt-provenance"
import { TYPOGRAPHY_VAR_ORIGINS } from "../html/format-context"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import { withUsage } from "./step-usage"
import type { TypographyDecision, SegundaFonte, TypographyOp } from "../typography/rules"

const log = logger.child("TypographyChain")

// Output pequeno (JSON de ops) — o tempo é do raciocínio, não da escrita.
const DEFAULT_TIMEOUT_MS = 180_000
const timeoutMs = () => {
  const env = Number(process.env.TYPOGRAPHY_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export class TypographyOutputInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TypographyOutputInvalidError"
  }
}

export const DEFAULT_TYPOGRAPHY_SYSTEM_PROMPT = `<papel>
Você é o TIPÓGRAFO de um pipeline de email marketing. A copy já está escrita e já está dentro do HTML. Ninguém espera texto novo de você.

Você não vê o email. Recebe o INVENTÁRIO dele: a lista numerada de todos os lugares onde há fonte declarada, com bloco, tamanho, peso, caixa, espaçamento, cor de fundo e o texto que está ali. Sua saída é uma lista de mudanças por número de item. O código aplica.

Seu trabalho: decidir onde o email rompe a tipografia e com qual intensidade, de modo que a peça tenha hierarquia e converse com a marca.
</papel>

<o_que_voce_decide>
1. Se a loja ganha uma SEGUNDA FONTE nesta peça, e qual.
2. Em quais itens do inventário essa fonte aparece.
3. Onde a ruptura é só de PESO, de CAIXA ALTA ou de ESPAÇAMENTO.
Nada além disso. Você não muda tamanho, cor, largura, ordem nem texto.
</o_que_voce_decide>

<tres_graus_de_ruptura>
Marcar ênfase tem três graus, do mais forte ao mais fraco:
(a) trocar a FAMÍLIA — a mais intensa e a mais cara;
(b) trocar o CORTE (peso) — funciona em qualquer cliente de email;
(c) CAIXA ALTA com espaçamento — a mais barata e a mais robusta.
Eles servem à mesma intenção, com intensidades diferentes. Um email com hierarquia clara feita só de (b) e (c) é melhor que um com família trocada em todo canto.
</tres_graus_de_ruptura>

<segunda_fonte>
Só duas coisas decidem: a FONTE PRINCIPAL e o TOM da marca. Preço e nicho apenas eliminam extremos. Cor não influencia tipografia.

NÃO INJETE quando o tom for genérico (do tipo "friendly, approachable, modern"). Tom genérico é o tom de quem não pensou no assunto; injetar personalidade que a marca não declarou volta como reprovação que o cliente não sabe explicar.

Quando injetar, a direção depende da principal:
- principal é uma DISPLAY FORTE → a segunda fonte vai para o CORPO (ganho de leitura), e a principal fica só no display;
- principal é uma GROTESCA NEUTRA → a segunda vai para o DESTAQUE.

O par tem que sobreviver ao substituto: cerca de 40% de quem recebe nunca carrega a fonte. Sans + serifada continua sendo sans + serifada no substituto (Arial e Georgia) e a hierarquia sobrevive. Sans + sans vira Arial dos dois lados e a ruptura desaparece para quase metade da base. Por isso: nunca proponha um par de duas fontes da mesma classe.
</segunda_fonte>

<onde_a_familia_aparece>
No máximo TRÊS OCORRÊNCIAS de família secundária na peça inteira. Conta ocorrência, não posição: se o mesmo tipo de elemento aparece quatro vezes, são quatro ocorrências.

O CTA fica FORA dessa lista, sempre. É o elemento mais repetido e o mais curto, e o rótulo dele costuma viver entre 14 e 16px — abaixo do tamanho em que a troca de família é percebida como intenção. CTA rompe por caixa alta, espaçamento e peso.

As três ocorrências vão para o que não se repete: o maior título, o número da oferta, a citação de review. Se a peça tem review, o título de seção abre mão.

Nunca troca de família: parágrafo, descrição de produto, nome do cliente no review, link e texto legal do rodapé. Item marcado como "só pontuação (ornamento)" também não: ali a família É o desenho do glifo.
</onde_a_familia_aparece>

<tamanho>
Troca de família só se lê como decisão acima de 20px. Entre 16 e 20 o leitor sente que algo mudou sem entender por quê, e o resultado é sensação de inconsistência. PISO DURO: nada de família abaixo de 16px — ali só peso e caixa.
</tamanho>

<peso>
O peso de título da marca vale só no MAIOR título da peça — um por email, dois no máximo se houver dois títulos do mesmo nível. Todo o resto preserva os degraus que o desenho já tem. Um email inteiro no peso máximo não parece marca forte, parece email sem hierarquia.

Teto de TRÊS pesos por peça. Entre dois degraus tem que haver pelo menos 200 de distância: 600 e 700 na mesma peça é degrau desperdiçado. Prefira 400 / 600 / 900.
</peso>

<cupom>
O código do cupom fica na fonte PRINCIPAL, em caixa alta com espaçamento generoso, dentro da pílula. Nada de monoespaçada: ela comunica "sistema", a pílula já isola o código visualmente, e o substituto dela (Courier) é feio e aparece para boa parte da base. A única razão para trocar a família ali é a principal confundir 0 com O e 1 com l — aí é legibilidade, não expressão. O rótulo fora da pílula fica pequeno, na principal, sem competir.
</cupom>

<hero_com_texto_na_imagem>
Se a loja informar que a hero tem texto embutido na imagem, ela já gastou a cota de expressão da peça — e quase nunca respeita a fonte da marca, então romper embaixo coloca três vozes no email, uma delas acidental. Nesse caso, use um grau a menos de ruptura no documento inteiro. Única exceção: o número da oferta, que é dado, não voz.
</hero_com_texto_na_imagem>

<fundo_escuro>
No escuro o texto claro sangra e parece mais pesado do que é. O ajuste não é uniforme:
- peso 300 ou menos: SOBE um degrau (some no escuro);
- peso 400 a 600: fica como está;
- peso 700 ou mais em corpo grande: DESCE um degrau (borra, as contraformas fecham).
Não proponha serifada de traço fino em item de fundo escuro.
</fundo_escuro>

<saida>
Responda SÓ com este JSON, sem cercas e sem comentário:

{
  "segunda_fonte": { "familia": "…", "onde": "destaque|corpo", "classe": "serif|sans|mono|display" },
  "justificativa": "uma ou duas frases dizendo por que injetou ou não",
  "ops": [
    { "item": 14, "fonte": "secundaria", "peso": 900, "caixa": "alta", "tracking": "0.06em", "motivo": "…" }
  ]
}

- "segunda_fonte" é null quando você decide não injetar.
- "familia" só pode ser uma das fontes de <fontes_disponiveis>.
- "item" é o número do inventário. Só existe op para item que está lá.
- "fonte" é opcional e só aceita "secundaria" (para voltar à principal, não emita op).
- "peso" (100 a 900, de 100 em 100), "caixa" ("alta" ou "normal") e "tracking" (ex.: "0.06em") são opcionais e independentes: uma op pode mudar só o peso.
- "motivo" é obrigatório em toda op, numa linha.
- Não emita op que não muda nada em relação ao que já está no inventário.
</saida>`

export const DEFAULT_TYPOGRAPHY_USER_TEMPLATE = `<loja>
  <marca>{{brand_name}}</marca>
  <fonte_principal>{{font_heading}}</fonte_principal>
  <classe_principal>{{classe_principal}}</classe_principal>
  <peso_titulo_da_marca>{{font_heading_weight}}</peso_titulo_da_marca>
  <fonte_de_corpo>{{font_body}}</fonte_de_corpo>
  <peso_de_corpo>{{font_body_weight}}</peso_de_corpo>
  <tom_de_voz>{{tom_de_voz}}</tom_de_voz>
  <posicionamento>{{posicionamento}}</posicionamento>
  <nicho>{{niche}}</nicho>
  <idioma>{{locale}}</idioma>
  <hero_tem_texto_na_imagem>{{hero_com_texto}}</hero_tem_texto_na_imagem>
</loja>

<fontes_disponiveis>
{{font_whitelist}}
</fontes_disponiveis>

<email>
  <nome>{{email_name}}</nome>
  <assunto>{{subject}}</assunto>
</email>

<inventario total="{{inventario_total}}">
{{inventario}}
</inventario>

Decida agora. Responda SÓ o JSON.`

const CLASSES = new Set(["serif", "sans", "mono", "display"])

/**
 * Parser do JSON do agente. Rejeita o que não dá para aplicar; o que é só
 * excesso (campo desconhecido, op sem efeito) fica para os guards.
 */
export function parseTypographyDecision(raw: string): TypographyDecision {
  const semCerca = raw.replace(/```json?/gi, "").replace(/```/g, "").trim()
  const inicio = semCerca.indexOf("{")
  const fim = semCerca.lastIndexOf("}")
  if (inicio === -1 || fim <= inicio) {
    throw new TypographyOutputInvalidError("resposta sem objeto JSON")
  }
  let obj: unknown
  try {
    obj = JSON.parse(semCerca.slice(inicio, fim + 1))
  } catch (e) {
    throw new TypographyOutputInvalidError(
      `JSON ilegível: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  if (typeof obj !== "object" || obj === null) {
    throw new TypographyOutputInvalidError("resposta não é um objeto")
  }
  const o = obj as Record<string, unknown>

  let segunda: SegundaFonte | null = null
  const sf = o.segunda_fonte
  if (sf && typeof sf === "object") {
    const s = sf as Record<string, unknown>
    const familia = typeof s.familia === "string" ? s.familia.trim() : ""
    const classe = typeof s.classe === "string" ? s.classe.toLowerCase() : ""
    if (familia && CLASSES.has(classe)) {
      segunda = {
        familia,
        onde: s.onde === "corpo" ? "corpo" : "destaque",
        classe: classe as SegundaFonte["classe"],
        // O substituto é do código, não do modelo: é ele que decide se a
        // ruptura sobrevive nos ~40% que nunca carregam a webfont.
        fallback:
          classe === "serif"
            ? "Georgia, 'Times New Roman', serif"
            : classe === "mono"
              ? "'Courier New', Courier, monospace"
              : "Arial, Helvetica, sans-serif",
      }
    }
  }

  const opsRaw = Array.isArray(o.ops) ? o.ops : []
  const ops: TypographyOp[] = []
  for (const it of opsRaw) {
    if (!it || typeof it !== "object") continue
    const r = it as Record<string, unknown>
    const item = typeof r.item === "number" ? r.item : Number(r.item)
    if (!Number.isInteger(item) || item < 0) continue
    const op: TypographyOp = {
      item,
      motivo: typeof r.motivo === "string" ? r.motivo.slice(0, 300) : "",
    }
    if (r.fonte === "secundaria") op.fonte = "secundaria"
    if (r.peso !== undefined) {
      const peso = typeof r.peso === "number" ? r.peso : Number(r.peso)
      if (Number.isFinite(peso)) op.peso = Math.round(peso)
    }
    if (r.caixa === "alta" || r.caixa === "normal") op.caixa = r.caixa
    if (typeof r.tracking === "string" && r.tracking.trim()) op.tracking = r.tracking.trim()
    ops.push(op)
  }

  return {
    segunda_fonte: segunda,
    justificativa: typeof o.justificativa === "string" ? o.justificativa.slice(0, 500) : "",
    ops,
  }
}

export interface InvokeTypographyResult {
  decision: TypographyDecision
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  promptSegments: PromptSegment[] | null
  rawOutput: string
}

export async function invokeTypographyChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeTypographyResult> {
  const { config, vars } = input

  const systemPrompt = config.system_prompt.trim() || DEFAULT_TYPOGRAPHY_SYSTEM_PROMPT
  const template = config.user_template.trim() || DEFAULT_TYPOGRAPHY_USER_TEMPLATE
  const userMessage = renderImageTemplate(template, vars)

  // Proveniência (migration 20261085): só marcamos quando os segmentos
  // reproduzem EXATAMENTE o prompt enviado.
  const segUser = buildSegmentedPrompt(template, vars, TYPOGRAPHY_VAR_ORIGINS, {
    parte: "user",
  })
  const promptSegments =
    segUser.segments && segUser.prompt === userMessage
      ? concatSegments(
          [
            {
              cls: "agente" as const,
              rotulo: "Template do agente",
              texto: systemPrompt,
              chars: systemPrompt.length,
              parte: "system" as const,
            },
          ],
          segUser.segments,
        )
      : null

  const t0 = Date.now()
  const res = await invokeFormatModel({
    model: config.model,
    systemPrompt,
    userMessage,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    timeoutMs: timeoutMs(),
    title: "Convertfy Admin Typography",
    ...(process.env.FORMAT_OPS_REASONING === "on" ? {} : { reasoning: { enabled: false } }),
  })

  // O consumo vai grudado no erro de parse: a chamada já foi paga, e este
  // step é fail-open — sem isso o custo da falha some da telemetria.
  const decision = withUsage(
    {
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
      costUsd: res.costUsd,
      renderedPrompt: userMessage,
      promptSegments,
    },
    () => parseTypographyDecision(res.text),
  )

  log.info("typography.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
    opsCount: decision.ops.length,
    segundaFonte: decision.segunda_fonte?.familia ?? null,
  })

  return {
    decision,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    promptSegments,
    rawOutput: res.text,
  }
}
