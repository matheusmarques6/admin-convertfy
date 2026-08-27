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
  | "blueprint"
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
    ranking_detalhado: "o mesmo ranking COM o nome da variante, a seção e o papel de cada posição: `ranking` só guarda UUID, e ninguém audita curadoria lendo uma lista de ids",
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
  blueprint: {
    blocks: "quantos blocos o blueprint tem — a contagem que o dispatch vai pedir ao n8n",
    blocos: "o recorte legível de cada bloco (papel, forma, variante, nº de campos): sem isto, entender a decisão exigia abrir store_email_blueprints, que já pode ter sido regerado",
    blueprint_path: "determinístico ou LLM fallback — a rota decide o custo e a confiabilidade do resultado",
    estruturador_consumido: "se os papéis do Estruturador entraram no purpose dos blocos",
    schema_anchor_issue_count: "campos cujo example/token não é encontrável no HTML da variante — erro de CADASTRO da biblioteca, não do run",
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

// ── Contrato de PROVENIÊNCIA (migration 20261085) ─────────────────────
//
// Mesma lógica do contrato acima, aplicada às COLUNAS novas: `prompt_segments`
// (o prompt marcado por origem) e `input_summary` (a Entrada estruturada).
// A run pode ficar verde sem elas — foi exatamente assim que o prompt do
// Curador não existiu até 26/08. Aqui a ausência vira falha de teste.
//
// `prompt: false` = o agente legitimamente não tem prompt naquela rota (o
// blueprint determinístico é código puro); a Entrada, essa, todo mundo tem.

export interface ProvenanceRequirement {
  prompt: boolean
  input: boolean
  motivo: string
}

export const PROVENANCE_CONTRACT: Record<string, ProvenanceRequirement> = {
  estruturador: {
    prompt: true,
    input: true,
    motivo: "a decisão editorial mora aqui: sem o material do vault marcado como vault não há como auditar de onde veio a estrutura",
  },
  assembler_chooser: {
    prompt: true,
    input: true,
    motivo: "o catálogo entra por ref+sha8 e o resto do prompt precisa dizer o que é loja, outline e decisão do Estruturador",
  },
  assembler: {
    prompt: true,
    input: true,
    motivo: "a escolha final se justifica pelos finalistas (upstream) cruzados com marca e papel — o prompt opaco não mostrava isso",
  },
  subject: {
    prompt: true,
    input: true,
    motivo: "run que até 26/08 não gravava prompt nenhum; é a única contribuição criativa da rota determinística",
  },
  blueprint: {
    prompt: false,
    input: true,
    motivo: "a rota determinística não tem prompt (é código); a Entrada é o que explica de onde vieram slots, papéis e fio",
  },
  copy_dispatch: {
    prompt: false,
    input: true,
    motivo: "é envio HTTP, não LLM: o que precisa ser auditável é o que foi ENVIADO — blocos, campos pedidos e o blueprint por trás deles",
  },
  copy: {
    prompt: false,
    input: true,
    motivo: "a copy vem de um agente externo (n8n); a Entrada é o que voltou e o quanto disso coube no contrato da variante",
  },
  // ── Fase 2 ──
  hero_section: {
    prompt: true,
    input: true,
    motivo: "é o agente mais delicado do pipeline: sem separar a variante da biblioteca, a copy do n8n e a imagem gerada, um fragmento errado não tem como ser explicado",
  },
  text_format: {
    prompt: true,
    input: true,
    motivo: "recebe o documento do step anterior e o contrato de campos — distinguir os dois é o que diz se a culpa é do agente ou do cadastro",
  },
  color_format: {
    prompt: true,
    input: true,
    motivo: "decide sobre um inventário de cores derivado por código a partir da paleta da loja; sem a marcação não se sabe qual dos dois errou",
  },
  image: {
    prompt: true,
    input: true,
    motivo: "o prompt é template + geometria + fidelidade concatenados, e a direção fotográfica vem da variante — tudo isso era uma string única",
  },
  qa: {
    prompt: true,
    input: true,
    motivo: "run que NUNCA gravou prompt nenhum, mesmo com o userPrompt montado a uma linha do startGenerationRun",
  },
  copy_merge: {
    prompt: false,
    input: true,
    motivo: "merge por código: o que importa é de onde vieram a copy (n8n) e as âncoras (cadastro da variante)",
  },
  image_format: {
    prompt: false,
    input: true,
    motivo: "casamento mecânico campo↔token: a Entrada diz quais imagens e quais tokens entraram na conta",
  },
  // ── Fora do pipeline de email ──
  campaign_image: {
    prompt: true,
    input: true,
    motivo: "o prompt vive no banco e é gated por `{{#if INCLUDE_*}}`: sem marcação não se sabe quais campos de contexto o operador ligou naquela geração",
  },
  component_test: {
    prompt: true,
    input: true,
    motivo: "teste ad-hoc de variante que nunca gravou prompt: o resultado só é julgável ao lado do que a variante prometeu (schema, quando_usar, orientação)",
  },
}

/**
 * O que falta de proveniência numa run. Vazio = contrato cumprido.
 * Agente fora do contrato devolve vazio (ainda não migrado — PR 3).
 */
export function missingProvenance(
  agent: string,
  run: { prompt_segments?: unknown; input_summary?: unknown },
): string[] {
  const req = PROVENANCE_CONTRACT[agent]
  if (!req) return []
  const out: string[] = []
  if (req.prompt && !(Array.isArray(run.prompt_segments) && run.prompt_segments.length > 0)) {
    out.push("prompt_segments")
  }
  if (req.input && !(Array.isArray(run.input_summary) && run.input_summary.length > 0)) {
    out.push("input_summary")
  }
  return out
}
