/**
 * step-usage — o consumo do modelo sobrevive ao erro de parse.
 *
 * **Telemetria é inegociável**, e aqui ela estava vazando de um jeito que
 * não dá sintoma: quando o modelo responde e o parser rejeita a resposta
 * (`HeroOutputInvalidError`, `OpsParseError`, `HtmlTruncatedError`), o
 * `throw` acontece DEPOIS da chamada paga e ANTES do `return` que carrega
 * tokens e custo. O `executeFormatStep` fecha o run com status `error` e
 * zero em tudo.
 *
 * O caso que revelou: dois runs de `hero_section` com 81s de Kimi K3 cada,
 * gravados como `0/0` tokens e `$0.000`. O custo foi real; o painel de
 * custo de geração simplesmente não o viu. Some também o
 * `rendered_prompt` — logo o run que MAIS precisa ser depurado é o único
 * sem o prompt que o produziu.
 *
 * O mecanismo: o chain gruda o consumo no próprio erro antes de propagá-lo,
 * e o runner lê de volta no `catch`. Erro sem consumo grudado devolve
 * `null`, e o comportamento é o de antes.
 *
 * Puro (zero I/O) — testável.
 */

import type {
  InputSummaryItem,
  PromptSegment,
} from "../shared/prompt-provenance"

export interface StepUsage {
  tokensInput: number
  tokensOutput: number
  costUsd: number
  /** O prompt que gerou a resposta rejeitada — o insumo do debug. */
  renderedPrompt?: string
  /**
   * O mesmo prompt marcado por ORIGEM (migration 20261085). Viaja junto no
   * erro porque é no erro que a proveniência mais importa: é a única forma
   * de ver se o que entrou estava certo e o modelo é que errou.
   */
  promptSegments?: PromptSegment[] | null
  /** A Entrada estruturada do step — vale no erro tanto quanto no sucesso. */
  inputSummary?: InputSummaryItem[] | null
  /**
   * A RESPOSTA que o parser rejeitou.
   *
   * Faltava, e a falta tem sintoma exato: a run de erro grava
   * `raw_output = null`, então a única pergunta que importa depois de um
   * "output sem objeto JSON" — *o que ele respondeu, afinal?* — não tem
   * onde ser respondida. Foi o caso de 10/09 no `color_format`: para saber
   * que a resposta tinha vindo truncada foi preciso achar uma run de
   * SUCESSO do mesmo prompt e comparar tokens com caracteres.
   *
   * É a mesma lição do `promptSegments` e do `inputSummary`, um campo
   * depois: no erro é que o dado vale mais.
   */
  rawOutput?: string
  /** Por que o modelo parou — `length` explica o JSON cortado. */
  finishReason?: string
  reasoningTokens?: number
}

const KEY = "__cfyStepUsage"

/**
 * Gruda o consumo no erro e devolve o MESMO erro, para uso direto no
 * `throw`. Não troca o tipo: `instanceof` a jusante continua valendo.
 */
export function attachUsage<E>(err: E, usage: StepUsage): E {
  if (err && typeof err === "object") {
    Object.defineProperty(err, KEY, {
      value: usage,
      enumerable: false,
      configurable: true,
    })
  }
  return err
}

/** Consumo grudado num erro, ou null se não houver. */
export function usageOf(err: unknown): StepUsage | null {
  if (!err || typeof err !== "object") return null
  const u = (err as Record<string, unknown>)[KEY]
  if (!u || typeof u !== "object") return null
  const rec = u as Record<string, unknown>
  if (
    typeof rec.tokensInput !== "number" ||
    typeof rec.tokensOutput !== "number" ||
    typeof rec.costUsd !== "number"
  ) {
    return null
  }
  return {
    tokensInput: rec.tokensInput,
    tokensOutput: rec.tokensOutput,
    costUsd: rec.costUsd,
    ...(typeof rec.renderedPrompt === "string"
      ? { renderedPrompt: rec.renderedPrompt }
      : {}),
    // Cópia EXPLÍCITA: o que não for copiado aqui atravessa o guard acima e
    // some em silêncio — o modo de falha que esta função já teve de campo.
    ...(Array.isArray(rec.promptSegments)
      ? { promptSegments: rec.promptSegments as PromptSegment[] }
      : {}),
    ...(Array.isArray(rec.inputSummary)
      ? { inputSummary: rec.inputSummary as InputSummaryItem[] }
      : {}),
    ...(typeof rec.rawOutput === "string" ? { rawOutput: rec.rawOutput } : {}),
    ...(typeof rec.finishReason === "string"
      ? { finishReason: rec.finishReason }
      : {}),
    ...(typeof rec.reasoningTokens === "number"
      ? { reasoningTokens: rec.reasoningTokens }
      : {}),
  }
}

/**
 * Roda o parse já garantindo que qualquer erro leve o consumo junto.
 * É o jeito de usar que não dá para esquecer no meio do caminho.
 */
export function withUsage<T>(usage: StepUsage, parse: () => T): T {
  try {
    return parse()
  } catch (err) {
    throw attachUsage(err, usage)
  }
}
