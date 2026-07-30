/**
 * Contrato de telemetria dos agentes da arquitetura.
 *
 * **Telemetria é inegociável.** O episódio que originou este módulo: o CM-2
 * gravava as stats da montagem num run; o CM-4 substituiu aquele run por
 * outro e as stats ficaram só num `log.warn` — stdout, não banco. Três
 * semanas depois ninguém saberia quantas seções o pipeline pulou, e o dado
 * some sem nenhum sintoma: o email é entregue, o run fica verde.
 *
 * Perder telemetria não quebra teste, não quebra typecheck e não gera
 * alerta. Por isso o contrato é explícito e verificado: cada agente declara
 * as chaves que seu `parsed_output` PRECISA carregar, e o teste falha quando
 * uma sai.
 *
 * Como usar ao mexer num agente:
 *   - campo novo que alguém vai querer consultar → adicione aqui;
 *   - campo que sai → remova daqui, deliberadamente, no mesmo commit.
 *
 * Puro (zero I/O) — testável.
 */

/** Agentes da fase 1 cobertos pelo contrato. */
export type ArchitectTelemetryAgent = "assembler_chooser" | "assembler"

/**
 * Chaves obrigatórias por agente, com o motivo de cada uma. O motivo não é
 * decoração: é o que permite decidir, no futuro, se o campo pode sair.
 */
export const TELEMETRY_CONTRACT: Record<
  ArchitectTelemetryAgent,
  Record<string, string>
> = {
  assembler_chooser: {
    catalog_variants: "tamanho do pool que o Curador viu — sem isso não dá para saber se a biblioteca cresceu ou encolheu entre gerações",
    attempts: "quantas tentativas o Curador precisou; mede a estabilidade do JSON sem structured output",
    ranking: "o ranking completo por posição — insumo do Montador e única forma de auditar a curadoria depois",
    motivos: "a tese do Curador para a 1ª indicação de cada posição",
    invalid_ids: "ids que não existem no catálogo (o modelo inventou)",
    wrong_type_ids: "ids de outra seção — risco criado por mandar o catálogo inteiro",
    empty_blocks: "posições sem finalista válido: saem do email e viram selo",
    candidates_excluded_untagged: "variantes ativas impreenchíveis pelo pipeline — pressão de curadoria",
  },
  assembler: {
    escolhas: "a composição final: id e rank por posição",
    desvios: "quantas posições saíram do rank 1 — a métrica que diz se o Curador rankeia bem",
    desvios_por_posicao: "onde e por quê, para julgar os desvios um a um",
    forced_rank1: "posições que caíram no rank 1 por erro do modelo, com a razão",
    degraded: "a composição saiu do fallback e não da decisão do agente",
    blocks_assembled: "quantos blocos entraram no documento",
    blocks_skipped: "posições que ficaram FORA do email — origem do selo de curadoria",
    marker_selfcheck: "self-check dos marcadores emitidos pelo código; diferente de ok é bug nosso",
    image_tags_dropped: "self-check das tags de imagem; diferente de vazio é bug nosso",
    reference_source: "de onde saiu o reference que o consumidor vai usar",
  },
}

/**
 * Chaves ausentes num `parsed_output`. Vazio = contrato cumprido.
 *
 * Só verifica PRESENÇA, não valor: `[]`, `0` e `false` são dados legítimos —
 * o que não pode é a chave sumir.
 */
export function missingTelemetryKeys(
  agent: ArchitectTelemetryAgent,
  parsedOutput: unknown,
): string[] {
  const required = Object.keys(TELEMETRY_CONTRACT[agent] ?? {})
  if (!parsedOutput || typeof parsedOutput !== "object") return required
  const rec = parsedOutput as Record<string, unknown>
  return required.filter((k) => !(k in rec) || rec[k] === undefined)
}
