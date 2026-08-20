/**
 * Contrato de telemetria dos agentes de geração.
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

/** Agentes cobertos pelo contrato. */
export type TelemetryAgent =
  | "assembler_chooser"
  | "assembler"
  | "hero_section"
  | "copy_merge"

/**
 * Chaves obrigatórias por agente, com o motivo de cada uma. O motivo não é
 * decoração: é o que permite decidir, no futuro, se o campo pode sair.
 */
export const TELEMETRY_CONTRACT: Record<
  TelemetryAgent,
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
    candidates_excluded_unfillable: "variantes ativas impreenchíveis pelo pipeline (sem schema ou sem âncora de example/token no HTML) — pressão de curadoria",
  },
  assembler: {
    escolhas: "a composição final: id e rank por posição",
    desvios: "quantas posições saíram do rank 1 — a métrica que diz se o Curador rankeia bem",
    desvios_por_posicao: "onde e por quê, para julgar os desvios um a um",
    forced_rank1: "posições que caíram no rank 1 por erro do modelo, com a razão",
    degraded: "a composição saiu do fallback e não da decisão do agente",
    blocks_assembled: "quantos blocos entraram no documento",
    blocks_skipped: "posições que ficaram FORA do email — origem do selo de curadoria",
    variants_unshelled: "variantes cadastradas como documento completo, cuja casca a montagem removeu — sem isto o documento ia inteiro dentro de um <td> e o defeito aparecia como erro do agente de hero",
    marker_selfcheck: "self-check dos marcadores emitidos pelo código; diferente de ok é bug nosso",
    image_tags_dropped: "self-check das tags de imagem; diferente de vazio é bug nosso",
    reference_source: "de onde saiu o reference que o consumidor vai usar",
  },
  hero_section: {
    hero_source: "library (região é a variante enxertada) ou montador (fallback legado) — decide quanta liberdade o agente teve",
    graft_status: "se o enxerto por código aconteceu; diferente de grafted significa que a hero NÃO é a variante escolhida",
    variant_id: "qual variante a hero usou, para cruzar com a escolha do Montador",
    variant_mismatch: "blueprint e slot_map discordaram — as tags do snapshot ficam sem endereço no documento",
    hero_report: "o que o agente declara ter descartado (linha de CTA removida, campo sem copy, logo aplicada)",
    hero_report_missing: "o relatório não veio ou veio ilegível; observabilidade perdida sem afetar a entrega",
    rendered_reference: "por que o exemplo de acabamento entrou ou não, com as ressalvas (mockup, stale, document_shell)",
    vision: "se o exemplo foi ANEXADO como imagem e em qual modelo — sem isto o custo do fallback visual sobe sem explicação",
  },
  copy_merge: {
    slots_total: "campos de texto do blueprint processados — o denominador de tudo aqui",
    ops_built: "campos ancorados pelo example E com valor: o que o código tentou escrever",
    merged: "splices aplicados de fato (sobreposição rejeita)",
    campos: "relatório campo a campo (key, desfecho, de → para) — vira a tabela da aba Execuções",
    sem_lugar: "campos cujo example não é encontrável no HTML — cadastro da variante divergiu do documento",
    ambiguos: "campos com ocorrências que não batem com o grupo (nunca chutar) — também cadastro",
    estruturais: "tokens da plataforma preenchidos por código (logo, nome da marca)",
  },
}

/**
 * Chaves ausentes num `parsed_output`. Vazio = contrato cumprido.
 *
 * Só verifica PRESENÇA, não valor: `[]`, `0` e `false` são dados legítimos —
 * o que não pode é a chave sumir.
 */
export function missingTelemetryKeys(
  agent: TelemetryAgent,
  parsedOutput: unknown,
): string[] {
  const required = Object.keys(TELEMETRY_CONTRACT[agent] ?? {})
  if (!parsedOutput || typeof parsedOutput !== "object") return required
  const rec = parsedOutput as Record<string, unknown>
  return required.filter((k) => !(k in rec) || rec[k] === undefined)
}
