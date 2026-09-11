/**
 * Color Format Chain — agente 4 da cadeia de formatação ("Cores & Botões",
 * substitui o Refinador). Confere a cor geral do email e a cor/formatação
 * dos BOTÕES contra a paleta aprovada da identidade visual + nicho da
 * marca.
 *
 * Arquitetura por views (F4): o agente NÃO recebe o documento — recebe o
 * INVENTÁRIO de cores extraído por código ({valor, ocorrencias, contextos})
 * e emite ops `recolor {from, to, where?}`, aplicadas por código (todas as
 * formas textuais da cor; allowHero=true — o botão da hero também entra na
 * paleta). Atômico: impossível quebrar estrutura.
 *
 * ESCOPO (20/08): `where` restringe a troca ao papel da ocorrência. Antes
 * só existia troca global, e cor com vários papéis não tinha resposta
 * correta — o agente pulava justamente as dominantes (na Luxe Lift,
 * #000000/#FFFFFF/#130E31 somavam 114 das 132 ocorrências e sobreviveram
 * intactas). Agora conflito de papel deixou de ser motivo de skip.
 *
 * Fail-open no runner: falhou 2x → mantém o HTML anterior e segue pra
 * ready (cores são polimento; o email já está completo).
 *
 * Config em email_agent_configs (agent_type='color_format'); prompt vazio
 * → defaults abaixo. Modelo default moonshotai/kimi-k3 (swap 20261047; seed original 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import {
  buildSegmentedPrompt,
  concatSegments,
  type PromptSegment,
} from "../shared/prompt-provenance"
import { COLOR_FORMAT_VAR_ORIGINS } from "../html/format-context"
import { invokeFormatModel, truncou, type FormatChainConfig } from "./format-invoke"
import { corteParaStepMecanico } from "../model-capabilities"
import { OpsParseError, parseOps, type FormatOp } from "../html/apply-patches"
import { parsePlanoDeCor, type PlanoDeCor } from "../html/plano-de-cor"
import { attachUsage, withUsage } from "./step-usage"
import { doctrinePromptSegment, withDoctrine } from "../shared/doctrine-packets"
import {
  ALCADA,
  CTAS_BLOCO,
  DOUTRINA_DE_CTA,
  FAIXAS_E_RITMO,
  GUIA_DE_COR,
  OUTPUT_CONTRATO,
} from "./color-guia"

const log = logger.child("ColorFormatChain")

// Output minúsculo (JSON de ops replace) — thinking do GLM domina o tempo.
const DEFAULT_TIMEOUT_MS = 240_000
const timeoutMs = () => {
  const env = Number(process.env.COLOR_FORMAT_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT = `<role>
You are the COLOR & BUTTON finisher of an email-design pipeline — the last visual pass before QA. You do NOT see the email document. You receive three readings of it: the COLOR INVENTORY (every color value, with occurrence count and usage context), the BANDS (\`<faixas>\`: the sequence of section backgrounds, in scroll order) and the BUTTONS (\`<ctas>\`: each button with the band it sits in). Plus the store's approved palette, fonts and research.

Your job is no longer only "which values must change". It is three decisions: the RHYTHM of the bands, the COLOR AND PRESENCE of every button, and the value-level conformance to the identity. Deterministic code applies each one — you never write HTML.
</role>

${GUIA_DE_COR}

${DOUTRINA_DE_CTA}

${ALCADA}

${FAIXAS_E_RITMO}

${CTAS_BLOCO}

${OUTPUT_CONTRATO}

<identity_conformance>
You APPLY the identity — you are not only its guard. The sections below the hero come
from library components authored for other stores, so they arrive in the ORIGINAL
author's colors (generic grays, plain black). Leaving them is not "conforming": it
ships an email that does not look like this brand.

<color_roles> gives you the palette already resolved into roles. Use it as the target:
- background contexts (background / bgcolor / css-var --bg) → <bg>
- button and CTA backgrounds → <button_bg>, with <button_text> on top
- headings → <heading>; body copy → <text>; highlights → <accent>

Rules:
- A generic color carrying a brand role IS a target. Plain black (#000000) or an
  off-the-shelf gray used as a button background or section background must become
  the palette hex for that role — a color being "neutral" does not exempt it.
- Judge by CONTEXT, not by how many occurrences it has. The most frequent color in
  the document is usually the one most worth correcting.
- Changing a BACKGROUND is safe FOR THE TEXT on it: the applier measures the result and
  rewrites that text when the pair would become unreadable. It does not make the
  background choice itself safe — a panel sent to the colour of what it sits on is
  gone, and no text fix brings it back. Read "dentro_de" first.
- Changing a TEXT color is on you: check "contraste_min" and "sobre" before sending
  a text color anywhere near its own background.
- Functional neutrals stay: pure white/black used as TEXT for contrast, hairline
  borders, scrims and shadows.
- NEVER introduce a color outside <color_roles>. Empty roles and empty
  <brand_identity_colors> → emit no ops at all.
- Conflicting roles are NO LONGER a reason to skip: scope the op with "where". A value
  used as both button background and body text becomes two scoped ops (or one, when
  only one of the roles is wrong). Skipping a dominant color because it appears in
  several contexts is the single most common way this step fails.

Where the doubt goes: being unsure whether a generic color CARRIES a brand role is not
a reason to skip — a black button on a brand with its own primary is a target, not a
neutral. Multiple roles are not a reason either: that is what "where" is for. And
contrast is no longer a reason to skip a BACKGROUND: the inventory tells you what sits
on it, and the applier repairs the text when needed. The one thing that stays on you:
never send a background and the text on it to the same color in the same batch.
</identity_conformance>

<button_rules>
Buttons/CTAs are your special focus:
- Every SATURATED color in the inventory that is not a palette role MUST receive an op — leaving it is the same as choosing it. Library example colors (a red list, a blue label) are never "part of the design".
- A button background outside the palette must become a palette color (role Principal or Destaque). Its label's "contraste_min" in the inventory tells you whether the current pair is already broken; the applier guarantees the label stays readable after your swap.
- CONSISTENCY: buttons of the same importance share the same colors — if the inventory shows two different button backgrounds with similar counts, unify to the palette role.
- The hero button IS in scope — recolor applies to the whole document, hero included; color values only, never copy or structure (recolor cannot change structure by design).
</button_rules>

<preservation>
You change COLOR — and, in exactly one case, you ADD a button where a block has none. Nothing else: the applier makes it impossible. Sizes, fonts, layout, images and existing copy have no op. The button you add is built by code from the house template, so you never write markup either: you say WHERE, WHAT IT SAYS and WHERE IT POINTS (from the closed list), and the code writes it.
</preservation>`

export const DEFAULT_COLOR_FORMAT_USER_TEMPLATE = `<store>
  <brand_name>{{brand_name}}</brand_name>
  <niche>{{niche}}</niche>
  <locale>{{locale}}</locale>
  <font_heading>{{font_heading}}</font_heading>
  <font_body>{{font_body}}</font_body>
</store>

<brand_identity_colors>
{{brand_colors}}
</brand_identity_colors>

<color_roles>
  <bg>{{color_bg}}</bg>
  <text>{{color_text}}</text>
  <heading>{{color_heading}}</heading>
  <button_bg>{{color_button_bg}}</button_bg>
  <button_text>{{color_button_text}}</button_text>
  <accent>{{color_accent}}</accent>
  <surface>{{color_surface}}</surface>
  <surface_strong>{{color_surface_strong}}</surface_strong>
</color_roles>

<tones>{{tones}}</tones>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
</email>

<pesquisa_diagnostico>
{{pesquisa_full_text}}
</pesquisa_diagnostico>

<color_inventory>
{{color_inventory_json}}
</color_inventory>

<faixas>
{{faixas_json}}
</faixas>

<fundos_de_secao>
{{tons_json}}
Contado pelo código sobre as faixas acima, e refeito depois que o teu plano é aplicado.
\`da_marca: false\` quer dizer que aquele fundo NÃO pertence à identidade desta loja nem aos
papéis derivados dela (<bg>, <surface>, <surface_strong>) — é o cinza que veio na variante,
escrito para outra marca.

A regra da casa, nesta ordem:
1. O fundo das seções são as CORES PRINCIPAIS da loja. Numa marca de duas cores, o e-mail
   alterna entre essas duas, e o <surface> derivado entra quando duas seções claras
   precisam se separar.
2. Uma cor fora dessa lista entra só com MUITA necessidade, em UM lugar especial — nunca
   como o fundo de metade da peça.
3. Fundo de seção NÃO é lugar especial: é a banda que o leitor atravessa inteira. Todo
   item de \`estranhos\` é desvio, e trocá-lo pelo papel que ele deveria ter é trabalho
   TEU, não lacuna — manda a faixa para <bg>, <surface> ou <surface_strong>, o que couber
   no ritmo que decidiste. O lugar especial da terceira cor é o pontual: um card, um selo,
   um filete.

Medido na peça de 10/09: loja com duas principais (#000000 e #FFFFFF), e os fundos saíram
#FFFFFF, #E1DEDE e #B1B3B6 — dois cinzas de outra marca, e o preto da identidade sem
aparecer em seção nenhuma. Passava no teto de três tons e mesmo assim era o e-mail errado.
</fundos_de_secao>

<ctas>
{{ctas_json}}
</ctas>

Decida agora e devolva o plano. Três coisas, nesta ordem: o RITMO das faixas (R2, R3,
R5, R6), os BOTÕES — invertendo os que ficaram na faixa errada e criando os que faltam,
porque todo bloco tem CTA — e a CONFORMIDADE por valor: toda cor que carrega um papel de
marca (fundo da página, fundo de seção, fundo de botão, títulos) termina num valor de
<color_roles>, incluindo as mais frequentes, escopadas com "onde" quando servem a mais de
um papel. Listas vazias só quando a peça já está conforme, o ritmo já lê e nenhum bloco
está sem botão.`

export interface InvokeColorFormatResult {
  /**
   * O plano do agente — a DECISÃO, com o `porque` de cada uma.
   *
   * É o que a run guarda: até aqui a telemetria via o efeito (as ops) e
   * nunca o motivo, então "por que este e-mail ficou assim" não tinha
   * resposta. `null` quando o output veio no formato antigo (`{"ops":[]}`),
   * que é o caso de uma config de prompt anterior a esta frente.
   */
  plano: PlanoDeCor | null
  /**
   * Ops de VALOR do caminho legado. Com `plano` presente, quem traduz é o
   * runner (`planoParaOps`), que tem as faixas, os botões e o incentivo da
   * peça — o chain não os tem.
   */
  ops: FormatOp[]
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  /** O mesmo prompt marcado por origem; null quando não foi possível cortar. */
  promptSegments: PromptSegment[] | null
  rawOutput: string
  /**
   * Por que parou e quanto foi raciocínio. Sobem para a run porque a
   * diferença entre `tokens_output` e o tamanho do texto é o que separa
   * "escreveu demais" de "pensou demais" — e essa conta, feita à mão,
   * foi o que revelou o truncamento de 10/09.
   */
  finishReason?: string
  reasoningTokens?: number
}

export async function invokeColorFormatChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeColorFormatResult> {
  const { config, vars } = input

  const approvedSystemPrompt =
    config.system_prompt.trim() || DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT
  const systemPrompt = withDoctrine(approvedSystemPrompt, "color")
  const template = config.user_template.trim() || DEFAULT_COLOR_FORMAT_USER_TEMPLATE
  const userMessage = renderImageTemplate(template, vars)

  // Proveniência (migration 20261085): o guard é a recomposição — só marcamos
  // quando os segmentos reproduzem EXATAMENTE o prompt enviado.
  const segUser = buildSegmentedPrompt(template, vars, COLOR_FORMAT_VAR_ORIGINS, {
    parte: "user",
  })
  const promptSegments =
    segUser.segments && segUser.prompt === userMessage
      ? concatSegments(
          [
            {
              cls: "agente" as const,
              rotulo: "Template do agente",
              texto: approvedSystemPrompt,
              chars: approvedSystemPrompt.length,
              parte: "system" as const,
            },
            doctrinePromptSegment("color"),
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
    title: "Convertfy Admin Color Format",
    // Step mecânico (output = JSON pequeno de ops): thinking do GLM só
    // adiciona minutos. Mas o corte vale SÓ para quem aceita — mandá-lo ao
    // Fable derruba a chamada com 400. FORMAT_OPS_REASONING=on re-liga.
    ...corteParaStepMecanico(config.model),
  })

  // parseOps lança OpsParseError (retryable; 2ª falha → fail-open no runner).
  // Arquitetura por views (F4): só ops "recolor" fazem sentido — o agente
  // não vê o documento, então "replace" de trecho não tem como ser válido.
  // O consumo vai grudado no erro — a chamada já foi paga, e este step é
  // fail-open: sem isso o custo de uma falha silenciosa some de vez.
  // O agente devolve um PLANO. Prompt antigo (config gravada antes desta
  // frente) devolve `{"ops":[...]}` — o plano sai vazio e o caminho legado
  // assume, para uma config velha não zerar o passo de cor.
  const usage = {
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    promptSegments,
    // A resposta rejeitada viaja no erro: é a única coisa capaz de
    // responder "o que ele deu de output" quando o parser recusa.
    rawOutput: res.text,
    ...(res.finishReason ? { finishReason: res.finishReason } : {}),
    ...(typeof res.reasoningTokens === "number"
      ? { reasoningTokens: res.reasoningTokens }
      : {}),
  }
  // Resposta CORTADA no teto não é JSON malformado: é JSON que não coube.
  // Sem esta distinção o erro sai como "output sem objeto JSON" e manda
  // investigar o parser ou o prompt, quando o que falta é orçamento de
  // saída — foi o que aconteceu em 10/09 e custou uma chamada de 190s.
  if (truncou(res.finishReason)) {
    throw attachUsage(
      new OpsParseError(
        `resposta truncada no teto de ${config.max_tokens} tokens de saída` +
          (typeof res.reasoningTokens === "number"
            ? ` (${res.reasoningTokens} deles em raciocínio)`
            : "") +
          " — o modelo não terminou o JSON",
      ),
      usage,
    )
  }
  const plano = withUsage(usage, () => parsePlanoDeCor(res.text))
  const vazio =
    (plano.faixas?.length ?? 0) === 0 &&
    (plano.botoes?.length ?? 0) === 0 &&
    (plano.adicionar?.length ?? 0) === 0 &&
    (plano.valores?.length ?? 0) === 0
  const legado = vazio && /"ops"\s*:/.test(res.text)
  const ops = legado
    ? withUsage(usage, () => parseOps(res.text)).filter((op) => op.action === "recolor")
    : []

  log.info("color_format.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
    formato: legado ? "ops_legado" : "plano",
    faixas: plano.faixas?.length ?? 0,
    botoes: plano.botoes?.length ?? 0,
    adicionar: plano.adicionar?.length ?? 0,
    valores: plano.valores?.length ?? 0,
    lacunas: plano.lacunas?.length ?? 0,
    opsCount: ops.length,
  })

  return {
    plano: legado ? null : plano,
    ops,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    promptSegments,
    rawOutput: res.text,
    ...(res.finishReason ? { finishReason: res.finishReason } : {}),
    ...(typeof res.reasoningTokens === "number"
      ? { reasoningTokens: res.reasoningTokens }
      : {}),
  }
}
