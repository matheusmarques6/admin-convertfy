/**
 * Estruturador — orquestração.
 *
 * Roda dentro da fase 1 do pipeline (chamado pelo generate.service quando
 * `estruturador_mode != 'off'`): carrega o material do vault sincronizado,
 * monta o prompt (SYSTEM cacheável por flow, embrulhado por slug), invoca o
 * LLM (retry 1× só quando o JSON vem ilegível/truncado), normaliza a FORMA
 * e grava a run completa — que É a persistência do embasamento (não há
 * tabela própria).
 *
 * 02/09 (migration 20261106): religado, com a sequência de seções sendo
 * DELE. O validador de conteúdo saiu por decisão do owner — nada de
 * reprovar slug, seção ou sequência repetida: o que ele devolver vale. As
 * entradas mudaram junto: perfil da marca inteiro (dossiê + top 5 com
 * preço e link), só os NOMES das seções disponíveis, e sem intenções por
 * bloco da Arquitetura.
 *
 * Em shadow o resultado NÃO altera o pipeline: a função devolve o output
 * validado (ou null) e o caller decide o que fazer — em 'shadow', nada; em
 * 'on' (fase 3) o generate.service o consome como estrutura (ver
 * estruturador-consume.ts). Falha aqui NUNCA derruba a geração (try/catch
 * no caller + fallback documentado no outline).
 *
 * Telemetria (ocasiões B/C do mapa de dados): input_vars auditável
 * (slugs servidos, vault_commit_sha, capacidade, irmãs, modo),
 * rendered_prompt = user COMPLETO + system_sha8 (o system de ~15-20k
 * tokens é reconstruível pelo commit do vault), parsed_output = embasamento
 * + relatório do validador.
 */

import { comoDadoExternoSeHouver } from "@/lib/ai/web/dado-externo"
import { filtrarPorToque, toqueSlug, vaultPorToqueLigado } from "@/lib/vault/toque"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { RESERVA_POS_ESTRUTURADOR_MS, restanteDoOrcamento } from "../fase1-orcamento"
import { decidirPelaJanela } from "./reuso-da-decisao"
import { logger } from "@/lib/logger"
import { classificarFalha, planejarRetentativa, avisoDeContaPerdida } from "../retry-teto"
import { tetoDeRelogioDoAgente } from "../fase1-orcamento"
import {
  finishGenerationRun,
  resolveCostCents,
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
  buildInterpolatedSegments,
  buildSegmentedPrompt,
  concatSegments,
  type InputSummaryItem,
  type PromptSegment,
  type SegmentOrigin,
} from "../shared/prompt-provenance"
import { renderTopProducts } from "../architect/store-context"
import { ALVO_AUSENTE_ESTRUTURADOR, renderAlvo, renderObjecoesJaAtacadas } from "../objecoes/alvo-render"
import type { AlvoDoEmail } from "../objecoes/vocabulario"
import { capacidadePorSecao, renderCapacidade, type CapacidadeDaSecao } from "../shared/field-roles"
import {
  AUDITORIA_VAZIA,
  buildSystemVars,
  DEFAULT_ESTRUTURADOR_SYSTEM,
  DEFAULT_ESTRUTURADOR_USER,
  MATERIAL_DO_TOQUE_VAZIO,
  intencaoParaOPrompt,
  normalizarOutput,
  normalizarOutputDetalhado,
  type EstruturadorOutput,
  type MaterialDoFlow,
} from "./estruturador-prompt"
import {
  auditarRequisitos,
  renderAuditoria,
  resumoDasDuras,
  type AuditoriaDosRequisitos,
} from "./auditoria-requisitos"
import type { DecisaoDeIncentivo } from "../objecoes/incentivo"
import { bloqueia, loadContratoModes, roda, type ContratoMode } from "../shared/contrato-mode"
import {
  aplicaveis,
  montarBlocoOrientacoes,
} from "./orientacoes"
// Loader compartilhado com o Curador (migration 20261111): a mesma tabela
// guarda as orientações dos dois, separadas pela coluna `agente`.
import { loadOrientacoes } from "../shared/orientacoes-loader"
import {
  montarBlocoRevisao,
  type RevisaoHumana,
} from "../shared/revisao-humana"

const log = logger.child("Estruturador")

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
// 2ª tentativa para JSON ilegível/truncado (o erro de parse volta ao
// modelo) e, desde 14/09, para a AUDITORIA dos requisitos reprovada em modo
// `on` (a lista de incoerências volta em <auditoria_anterior>). Conteúdo
// editorial continua sem validador — o que ele decidir de estrutura vale.
const MAX_ATTEMPTS = 2

/**
 * A auditoria reprovou em modo `on`: a saída existe (a forma é válida) mas o
 * filtro receberia requisitos incoerentes. Vira retentativa como causa
 * `validacao`; esgotada, `estruturador_incoerente`.
 */
class AuditoriaReprovadaError extends Error {
  constructor(readonly auditoria: AuditoriaDosRequisitos, readonly saida: EstruturadorOutput) {
    super(`auditoria dos requisitos reprovou: ${resumoDasDuras(auditoria)}`)
    this.name = "AuditoriaReprovadaError"
  }
}
/** Teto que o relógio deste agente comporta (360s a ~90 tok/s). */
const TETO_MAXIMO_ESTRUTURADOR = 32000

/** Seções com variante ativa (contagem por código) + nº de produtos da loja. */
interface CapacidadeBiblioteca {
  porCategoria: Record<string, number>
  produtosDaLoja: number
  /** Contratos agregados por seção (09/09) — vai ao prompt em <secoes_disponiveis>. */
  resumo: Record<string, CapacidadeDaSecao>
}

/** Sequência vigente de um irmão do flow (anti-repetição, informação). */
interface EstruturaIrma {
  rotulo: string
  seq: string[]
}

export type EstruturadorMode = "off" | "shadow" | "on"

// ── Proveniência (plano telemetria 26/08): origem de cada var do prompt ──

const SYSTEM_ORIGINS: Record<string, SegmentOrigin> = {
  intencao_flow: { cls: "vault", rotulo: "Intenção do flow — email_intents (_flow)" },
  progressao: { cls: "vault", rotulo: "Progressão observada — email_intents (progressao)" },
  referencias: { cls: "vault", rotulo: "Referências de estrutura — email_structure_refs" },
  aprendizados: { cls: "vault", rotulo: "Aprendizados — email_learnings" },
}

export const USER_ORIGINS: Record<string, SegmentOrigin> = {
  material_do_toque: { cls: "vault", rotulo: "Referências e aprendizados declarados para ESTE toque — email_structure_refs.emails / email_learnings.frontmatter.serve_a" },
  brand_name: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  // Perfil da marca = o dossiê da Pesquisa & Diagnóstico inteiro (01 Perfil
  // da Marca · 02 Sobre a loja · 03 Cliente Ideal · 04 Tom de Comunicação ·
  // 05 Review dos Anúncios). Os campos soltos (nicho/posicionamento/
  // persona/tom) saíram em 02/09: eram derivados deste mesmo texto.
  pesquisa: { cls: "loja", rotulo: "Perfil da marca — Pesquisa & Diagnóstico completa (client_stores)" },
  top_products: { cls: "loja", rotulo: "Top 5 produtos — store_top_products (nome, preço e link)" },
  flow_type: { cls: "sistema", rotulo: "Identidade do email — pipeline" },
  email_number: { cls: "sistema", rotulo: "Identidade do email — pipeline" },
  // Com alvo, esta var não leva a nota e sim a declaração de ausência
  // (INTENCAO_NAO_SERVIDA) — a origem segue sendo o vault porque é a nota que
  // ela substitui, e é lá que se lê o que o Seletor traduziu.
  intencao_email: { cls: "vault", rotulo: "Intenção DESTE email — email_intents (só no fallback sem alvo)" },
  // Alvo do toque (set/2026): SAÍDA do Seletor — a objeção-alvo deixa de
  // ser decisão deste agente e vira tradução.
  decisao_de_objecao: { cls: "upstream", rotulo: "Alvo do toque — SAÍDA do Seletor (store_email_objection_targets)" },
  objecoes_ja_atacadas: { cls: "upstream", rotulo: "Objeções já atacadas pelos irmãos — alvos vigentes do flow (Seletor)" },
  secoes_disponiveis: { cls: "sistema", rotulo: "Seções disponíveis — categorias com variante ativa + capacidade por contrato (código)" },
  estruturas_dos_outros_emails: {
    cls: "sistema",
    rotulo: "Anti-repetição — estruturas vigentes dos outros emails do flow",
  },
  // Diretriz viva do COO (migration 20261086) — NÃO é vault: o vault é o
  // corpus curado, isto é instrução direta e de efeito imediato. Sem esta
  // linha o guard de recomposição derruba os segmentos da run inteira.
  orientacao_coo: { cls: "curadoria", rotulo: "Orientação do COO — estruturador_orientacoes" },
  // Correção humana DESTE email (reordenou/removeu na tela e explicou).
  // Curadoria, não dado da loja: quem escreveu foi uma pessoa revisando.
  revisao_humana: {
    cls: "curadoria",
    rotulo: "Revisão humana da estrutura — email_structure_reviews",
  },
  // Retentativa por auditoria (14/09): o que o CÓDIGO achou de incoerente
  // na resposta anterior deste mesmo email. Vazio na 1ª tentativa.
  auditoria_anterior: {
    cls: "sistema",
    rotulo: "Auditoria dos requisitos da tentativa anterior — auditoria-requisitos.ts (código)",
  },
}

function resumo(v: string | null | undefined, max = 240): string {
  const t = (v ?? "").trim()
  if (!t) return "(vazio)"
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export interface RunEstruturadorInput {
  storeId: string
  flowId?: string | null
  emailId?: string | null
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  mode: EstruturadorMode
  // Contexto da loja — o generate.service já tem tudo resolvido.
  brandName: string
  /** Dossiê completo da Pesquisa & Diagnóstico (`pesquisaToFullText`, COM Ads). */
  pesquisa: string
  /** Top 5 produtos com preço e link (mesmo shape de `renderTopProducts`). */
  topProducts: ReadonlyArray<{ name: string; price?: number | string | null; url?: string | null }>
  /**
   * Revisões humanas de estrutura aplicáveis (migration 20261088), já
   * carregadas pelo caller — o Curador e o Montador recebem as MESMAS,
   * então a query roda uma vez por geração.
   */
  revisoes?: RevisaoHumana[]
  /**
   * Alvo do Seletor (set/2026) — só chega quando `seletor_mode='on'`. Null =
   * o agente diagnostica sozinho (fallback declarado no prompt).
   */
  alvo?: AlvoDoEmail | null
  /**
   * Decisão de incentivo do toque (14/09, `incentivoDoOutline`) — o que a
   * auditoria confere contra `requisitos.cupom`. Null = não conferir.
   */
  incentivo?: DecisaoDeIncentivo | null
  /**
   * Pinado numa execução manual: reusa a decisão vigente em vez de chamar o
   * modelo. Desce inteiro para `decidirPelaJanela`, que já sabe reusar — o
   * caminho de gravação da run (`skipped`, `model: "reuso"`) é o MESMO da
   * janela apertada, de propósito: duas formas de registrar o mesmo reuso
   * divergiriam na primeira mudança.
   */
  pinado?: boolean
}

export interface RunEstruturadorResult {
  output: EstruturadorOutput | null
  runId: string | null
  /** 'ok' | 'sem_material' | 'falhou' — o caller loga; nunca lança. */
  status: "ok" | "sem_material" | "falhou"
  /**
   * Só em `falhou`: `incoerente` = a auditoria dos requisitos reprovou em
   * modo `on` nas duas tentativas. O caller derruba a geração com esse
   * nome — seguir com o outline aqui seria montar a peça sobre a decisão
   * que o próprio código acabou de recusar.
   */
  motivo?: "incoerente"
  /** Resumo legível das duras (só com `motivo`). */
  detalhe?: string
}

// ── Cargas ──────────────────────────────────────────────────────────────

async function loadMaterial(flowType: string, emailNumber: number): Promise<{
  material: MaterialDoFlow
  refsServidas: string[]
  /**
   * Bloco `<material_do_toque>` (passo 6): referências e aprendizados que o
   * vault declarou para ESTE toque, já embrulhados. Ausente = nada
   * declarado (o template mostra o aviso padrão).
   */
  materialDoToque?: string
  aprendizadosServidos: string[]
  vaultCommitSha: string | null
  /** Passo 6: o que o filtro por toque descartou e avisou (telemetria). */
  porToque: {
    ligado: boolean
    failOpen: boolean
    refsDoToque: string[]
    refsDescartadas: string[]
    aprendizadosDoToque: string[]
    aprendizadosDescartados: string[]
    avisos: string[]
  }
} | null> {
  const admin = createAdminClient()
  const [intentsRes, refsRes, learningsRes, stateRes] = await Promise.all([
    admin.from("email_intents")
      .select("slug, kind, email_number, body_md")
      .eq("flow_type", flowType).eq("is_active", true),
    // `emails` diz os toques que a estrutura cobre (obrigatório no parser).
    admin.from("email_structure_refs")
      .select("slug, body_md, emails")
      .eq("flow_type", flowType).eq("is_active", true),
    // Do flow + _global aplicável (aplica_a contém o flow). `frontmatter`
    // traz o `serve_a` — o sync grava o frontmatter inteiro.
    admin.from("email_learnings")
      .select("slug, flow_type, aplica_a, body_md, frontmatter")
      .eq("is_active", true)
      .or(`flow_type.eq.${flowType},flow_type.is.null`),
    admin.from("vault_sync_state").select("last_commit_sha").eq("id", "default").maybeSingle(),
  ])

  const intents = intentsRes.data ?? []
  const refs = refsRes.data ?? []
  const learnings = (learningsRes.data ?? []).filter(
    (l) => l.flow_type === flowType || (l.aplica_a ?? []).includes(flowType),
  )

  if (refs.length === 0) return null // sem candidatas = sem material p/ decidir

  // Passo 6: o que é GLOBAL fica no system (cacheado entre os 4 irmãos); o
  // que é DESTE toque vai para o user (`<material_do_toque>`); o que é de
  // OUTRO toque sai. Fail-open quando nada sobra: serve tudo e marca.
  const ligado = vaultPorToqueLigado()
  const filtro = filtrarPorToque({
    referencias: refs.map((r) => ({ slug: r.slug as string, body: r.body_md as string, emails: r.emails })),
    aprendizados: learnings.map((l) => ({
      slug: l.slug as string,
      body: l.body_md as string,
      serve_a: (l.frontmatter as Record<string, unknown> | null)?.serve_a,
    })),
    flowType,
    emailNumber,
    ligado,
  })
  const doc = (d: { slug: string; body: string }) => ({ slug: d.slug, body: d.body })
  const doToque = [
    ...filtro.referencias.doToque.map((r) => `<referencia slug="${r.slug}">\n${r.body.trim()}\n</referencia>`),
    ...filtro.aprendizados.doToque.map((a) => `<aprendizado slug="${a.slug}">\n${a.body.trim()}\n</aprendizado>`),
  ]
  const servidasRefs = [...filtro.referencias.globais, ...filtro.referencias.doToque]
  const servidosAprs = [...filtro.aprendizados.globais, ...filtro.aprendizados.doToque]

  return {
    material: {
      intencaoFlow: pick(intents, (i) => i.slug === "_flow"),
      progressao: pick(intents, (i) => i.kind === "progressao"),
      referencias: filtro.referencias.globais.map(doc),
      aprendizados: filtro.aprendizados.globais.map(doc),
    },
    ...(doToque.length > 0 ? { materialDoToque: doToque.join("\n\n") } : {}),
    refsServidas: servidasRefs.map((r) => r.slug),
    aprendizadosServidos: servidosAprs.map((l) => l.slug),
    vaultCommitSha: (stateRes.data?.last_commit_sha as string | null) ?? null,
    porToque: {
      ligado,
      failOpen: filtro.failOpen,
      refsDoToque: filtro.referencias.doToque.map((r) => r.slug),
      refsDescartadas: filtro.referencias.fora.map((r) => r.slug),
      aprendizadosDoToque: filtro.aprendizados.doToque.map((a) => a.slug),
      aprendizadosDescartados: filtro.aprendizados.fora.map((a) => a.slug),
      avisos: [...filtro.referencias.avisos, ...filtro.aprendizados.avisos],
    },
  }

  function pick(
    rows: Array<{ slug?: unknown; kind?: unknown; body_md?: unknown }>,
    pred: (r: { slug?: unknown; kind?: unknown }) => boolean,
  ) {
    const r = rows.find(pred)
    return r ? { slug: String(r.slug), body: String(r.body_md) } : null
  }
}

/**
 * Orientações do COO (migration 20261086).
 *
 * Query própria, e não dentro do `loadMaterial`: aquele devolve `null` em
 * bloco quando não há REFERÊNCIA nenhuma, e a orientação não tem nada a
 * ver com o vault estar completo — ela é justamente o caminho que NÃO
 * passa pelo Obsidian. (O agente só chega aqui com material, porque sem
 * candidata não há estrutura a decidir; a separação é de responsabilidade,
 * não de ordem.)
 *
 * Fail-open: erro aqui devolve lista vazia. O bloco sai com o texto de
 * vazio e a geração segue — perder uma diretriz é ruim, derrubar a
 * estrutura por causa dela é pior.
 */
async function loadIntencaoDoEmail(flowType: string, emailNumber: number): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("email_intents")
    .select("body_md")
    .eq("flow_type", flowType).eq("email_number", emailNumber).eq("is_active", true)
    .maybeSingle()
  return (data?.body_md as string | null) ?? null
}

async function loadCapacidade(produtosDaLoja: number): Promise<CapacidadeBiblioteca> {
  const admin = createAdminClient()
  const { data } = await admin.from("email_component_variants")
    .select("block_type, output_schema, dispositivo").eq("is_active", true)
  const porCategoria: Record<string, number> = {}
  for (const v of data ?? []) {
    const t = v.block_type as string
    porCategoria[t] = (porCategoria[t] ?? 0) + 1
  }
  // 09/09: o que cada seção TEM (grade, preço, avaliação, cupom, CTA) —
  // sem isso o Estruturador exigia o que a biblioteca não tinha.
  const resumo = capacidadePorSecao(
    (data ?? []).map((v) => ({ block_type: v.block_type as string, output_schema: v.output_schema, dispositivo: (v as { dispositivo?: string | null }).dispositivo ?? null })),
  )
  return { porCategoria, produtosDaLoja, resumo }
}

/** Sequência (`estrutura[].section`) gravada no parsed_output de uma run. */
export function sequenciaDaRun(parsedOutput: unknown): string[] {
  const estrutura = (parsedOutput as { estrutura?: Array<{ section?: string }> } | null)
    ?.estrutura
  if (!Array.isArray(estrutura)) return []
  return estrutura.map((p) => String(p.section ?? "")).filter(Boolean)
}

/**
 * Última estrutura bem-sucedida DESTE email — informação, nunca regra.
 *
 * Repetir a si mesmo deixou de reprovar (27/08), mas "o agente está estável
 * ou oscilando a cada geração?" é a pergunta que sobra, e respondê-la exigia
 * comparar runs à mão. Vira flag no `_validador`.
 */
/**
 * A DECISÃO vigente deste e-mail, inteira — não só a sequência.
 *
 * `loadEstruturaVigenteDesteEmail` existe para outra coisa (proibir que o
 * agente repita a si mesmo) e devolve só os nomes das seções. O reuso da
 * janela precisa do `parsed_output` completo: papel e requisitos por
 * posição, fio narrativo, diagnóstico, `text_only`. Tudo isso já está
 * gravado — a run bem-sucedida é o artefato.
 */
async function loadDecisaoVigenteDesteEmail(
  emailId: string | null,
): Promise<{ output: EstruturadorOutput; runId: string; quando: string } | null> {
  if (!emailId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_generation_runs")
    .select("id, parsed_output, created_at")
    .eq("agent", "estruturador")
    .eq("email_id", emailId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; parsed_output: unknown; created_at: string }
  const out = normalizarOutput(row.parsed_output)
  // `normalizarOutput` é tolerante: garante a FORMA, não que haja conteúdo.
  // Decisão sem posição nenhuma não serve para reusar.
  if (!out.estrutura || out.estrutura.length === 0) return null
  return { output: out, runId: row.id, quando: row.created_at }
}

async function loadEstruturaVigenteDesteEmail(
  emailId: string | null,
): Promise<string[] | null> {
  if (!emailId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_generation_runs")
    .select("parsed_output")
    .eq("agent", "estruturador")
    .eq("email_id", emailId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const seq = sequenciaDaRun((data as { parsed_output: unknown }).parsed_output)
  return seq.length > 0 ? seq : null
}

/**
 * Estruturas VIGENTES dos OUTROS emails deste flow nesta loja.
 *
 * Era o histórico do PRÓPRIO email (as N últimas runs), e isso punia
 * convergência: a lista de proibidas era feita das melhores respostas do
 * agente, então a 3ª regeneração precisava inventar uma estrutura que ele
 * mesmo considerava pior. Caso real (Innova, welcome #1, 27/08): reprovado
 * duas vezes por propor a mesma sequência da run anterior — bateu o pé, o
 * código descartou, e o fallback foi o outline GENÉRICO, que é a estrutura
 * mais repetida que existe.
 *
 * O problema editorial real é outro e ninguém checava: os emails de um mesmo
 * flow saírem com a mesma composição. É esse que a regra passa a proteger.
 *
 * Só a estrutura ATUAL de cada irmão entra (a run bem-sucedida mais recente
 * de cada um). Acumular o histórico faria a lista crescer até proibir tudo
 * de novo — que é exatamente a armadilha de onde estamos saindo.
 */
async function loadEstruturasDosOutrosEmails(
  flowId: string | null,
  emailId: string | null,
  /**
   * Número deste e-mail (16/09). Com ele, só os ANTERIORES viajam, e no
   * máximo os 3 últimos.
   *
   * Sem limite a lista crescia com o flow inteiro, e os posteriores entram
   * como sequência "decidida" quando na verdade ainda não foram — na fila
   * os quatro rodam em paralelo e o irmão de número maior costuma estar
   * `running`, o que hoje disfarça o problema em vez de resolvê-lo.
   * Ausente = comportamento antigo (todos), para o caller que não o passa.
   */
  emailNumber?: number,
  janela = 3,
): Promise<EstruturaIrma[]> {
  if (!flowId) return []
  const admin = createAdminClient()

  const { data: irmaos } = await admin
    .from("email_flow_emails")
    .select("id, number, flow:email_flows!inner(flow_type)")
    .eq("flow_id", flowId)
  const outros = ((irmaos ?? []) as unknown as Array<{
    id: string
    number: number
    flow?: { flow_type?: string } | null
  }>).filter((e) => e.id !== emailId && (emailNumber == null || e.number < emailNumber))
  if (outros.length === 0) return []

  const { data } = await admin
    .from("email_generation_runs")
    .select("email_id, parsed_output, created_at")
    .eq("agent", "estruturador")
    .eq("status", "success")
    .in("email_id", outros.map((e) => e.id))
    .order("created_at", { ascending: false })

  // A query vem ordenada por data desc: a PRIMEIRA linha de cada email é a
  // vigente. As demais são histórico e ficam de fora.
  const vigentePorEmail = new Map<string, string[]>()
  for (const r of (data ?? []) as Array<{ email_id: string; parsed_output: unknown }>) {
    if (vigentePorEmail.has(r.email_id)) continue
    const seq = sequenciaDaRun(r.parsed_output)
    if (seq.length > 0) vigentePorEmail.set(r.email_id, seq)
  }

  const comEstrutura = outros.filter((e) => vigentePorEmail.has(e.id)).sort((a, b) => a.number - b.number)
  // Os `janela` mais PRÓXIMOS deste e-mail, na ordem do flow: o toque 1 diz
  // pouco sobre o 8, e servir os sete anteriores é prompt que não cabe.
  return (emailNumber == null ? comEstrutura : comEstrutura.slice(-janela))
    .map((e) => ({
      rotulo: `${e.flow?.flow_type ?? "email"} #${e.number}`,
      seq: vigentePorEmail.get(e.id)!,
    }))
}

// ── Run ─────────────────────────────────────────────────────────────────

export async function runEstruturador(
  input: RunEstruturadorInput,
): Promise<RunEstruturadorResult> {
  const t0 = Date.now()

  const carga = await loadMaterial(input.flowType, input.emailNumber)
  if (!carga) {
    log.info("estruturador.sem_material", { flowType: input.flowType, storeId: input.storeId })
    return { output: null, runId: null, status: "sem_material" }
  }
  const [intencaoEmail, orientacoes] = await Promise.all([
    loadIntencaoDoEmail(input.flowType, input.emailNumber),
    loadOrientacoes("estruturador"),
  ])
  if (!intencaoEmail) {
    log.info("estruturador.sem_intencao_do_email", {
      flowType: input.flowType, emailNumber: input.emailNumber,
    })
    return { output: null, runId: null, status: "sem_material" }
  }

  const [capacidade, irmas, minhaAnterior, vigente, modos] = await Promise.all([
    loadCapacidade(input.topProducts.length),
    loadEstruturasDosOutrosEmails(input.flowId ?? null, input.emailId ?? null, input.emailNumber),
    loadEstruturaVigenteDesteEmail(input.emailId ?? null),
    loadDecisaoVigenteDesteEmail(input.emailId ?? null),
    loadContratoModes(input.storeId),
  ])
  // Gate da auditoria dos requisitos (migration 20261145). `off` não audita;
  // `shadow` audita e grava; `on` bloqueia (retentativa → incoerente).
  const auditoriaModo: ContratoMode = modos.auditoria

  const cfgRow = await loadActiveAgentConfig("estruturador")
  const config: AgentInvokeConfig = {
    model: cfgRow?.model || DEFAULT_MODEL,
    temperature: cfgRow?.temperature ?? 0.4,
    // 4096 truncava: o contrato pede papel + referência + adaptação +
    // porquê por posição, mais diagnóstico, fio, fontes e descartes — tudo
    // prosa. A 1ª tentativa da Innova bateu o teto exato (4.096) e veio
    // cortada no meio do JSON.
    max_tokens: cfgRow?.max_tokens ?? 32000,
    // O relógio anda junto do teto: o global de 240s cortaria em ~21k
    // tokens e a gente trocaria truncamento por timeout, que é a mesma
    // perda com outro nome.
    ...(tetoDeRelogioDoAgente("estruturador") ? { timeoutMs: tetoDeRelogioDoAgente("estruturador")! } : {}),
    system_prompt: cfgRow?.system_prompt?.trim() || DEFAULT_ESTRUTURADOR_SYSTEM,
    user_template: cfgRow?.user_template?.trim() || DEFAULT_ESTRUTURADOR_USER,
    // O bloco da loja (perfil + seções disponíveis) vem antes da marca e é
    // lido do cache pelos outros 3 e-mails do lote; o do e-mail vai solto.
    cache_user_prefix: true,
  }

  const systemVars = buildSystemVars(carga.material)
  const systemResolvido = Object.entries(systemVars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, () => v),
    config.system_prompt,
  )
  const systemSha8 = crypto.createHash("sha256").update(systemResolvido).digest("hex").slice(0, 8)

  // Proveniência do SYSTEM: regras = agente, material do vault = vault. O
  // guard byte-igual protege o caso patológico (valor de var contendo outro
  // placeholder, onde o replaceAll sequencial divergiria) — divergiu, os
  // segments saem null e a run degrada pro comportamento atual.
  const sysSeg = buildInterpolatedSegments(
    config.system_prompt,
    systemVars,
    SYSTEM_ORIGINS,
    { parte: "system" },
  )
  const systemSegments: PromptSegment[] | null =
    sysSeg.prompt === systemResolvido ? sysSeg.segments : null

  // Nomes + CAPACIDADE por seção (09/09): ele não escolhe variante, mas
  // precisa saber que `products` tem grades de 1 a 9 e só uma mostra
  // preço — senão os `requisitos` exigem o que não existe.
  const secoesDisponiveis = Object.entries(capacidade.porCategoria)
    .filter(([, n]) => n > 0)
    .map(([k]) => k)
    .sort()
  const secoesTexto = renderCapacidade(capacidade.resumo)
  // Com o rótulo do email: saber QUAL irmão ocupa a sequência é o que
  // permite ao agente se afastar com intenção, em vez de embaralhar.
  const irmasTexto = irmas.length
    ? irmas.map((e) => `- ${e.rotulo}: [${e.seq.join(", ")}]`).join("\n")
    : "(nenhum outro email deste flow tem estrutura decidida ainda)"

  // A nota de intenção só viaja quando NÃO há alvo (ver INTENCAO_NAO_SERVIDA):
  // com alvo ela chega traduzida, e a nota crua competiria com a versão tipada.
  const intencaoServida = !input.alvo

  const userVars: Record<string, string> = {

    material_do_toque: carga.materialDoToque ?? MATERIAL_DO_TOQUE_VAZIO,
    brand_name: input.brandName,
    top_products: renderTopProducts(input.topProducts),
    // (19/09) dossiê raspado entra como dado, nunca como instrução
    // (`lib/ai/web/dado-externo.ts`).
    pesquisa: comoDadoExternoSeHouver("pesquisa (n8n: site da loja, concorrentes, anúncios)", input.pesquisa || "(sem pesquisa)"),
    flow_type: input.flowType,
    email_number: String(input.emailNumber),
    intencao_email: intencaoParaOPrompt(intencaoEmail, input.alvo ?? null),
    decisao_de_objecao: renderAlvo(input.alvo ?? null, ALVO_AUSENTE_ESTRUTURADOR),
    objecoes_ja_atacadas: renderObjecoesJaAtacadas(input.alvo ?? null),
    secoes_disponiveis: secoesTexto,
    estruturas_dos_outros_emails: irmasTexto,
    orientacao_coo: montarBlocoOrientacoes(
      aplicaveis(orientacoes, input.flowType, input.emailNumber),
    ),
    revisao_humana: montarBlocoRevisao(input.revisoes ?? [], "estruturador"),
    auditoria_anterior: AUDITORIA_VAZIA,
  }

  // Entrada estruturada (aba Entrada do Estúdio) — o que o agente recebeu,
  // com origem. Complementa (não substitui) o input_vars auditável.
  const inputSummary: InputSummaryItem[] = [
    { rotulo: "Loja", cls: "loja", valor: input.brandName },
    { rotulo: "Email", cls: "sistema", valor: `${input.flowType} #${input.emailNumber} · modo ${input.mode}` },
    { rotulo: "Perfil da marca", cls: "loja", valor: `${input.pesquisa.length.toLocaleString("pt-BR")} chars do dossiê (com Ads) · ${input.topProducts.length} produto(s)` },
    // A intenção é insumo do SELETOR. Com alvo, ela não entra aqui — e o que
    // não entra não é listado como entrada: a linha "não servida" ocupava a
    // tela descrevendo uma ausência. Em qual regime a run rodou continua
    // legível em `input_vars.intencao_servida`.
    ...(intencaoServida
      ? [
          {
            rotulo: "Intenção deste email (vault)",
            cls: "vault" as const,
            valor: resumo(intencaoEmail),
          },
        ]
      : []),
    {
      rotulo: "Alvo do toque (Seletor)",
      cls: "upstream",
      valor: input.alvo
        ? `${input.alvo.modo} · ${input.alvo.alvos.map((a) => `${a.id}/${a.aliviador_pedido}/${a.profundidade_de_prova}`).join(", ") || "sem objeção"}${input.alvo.lacuna ? ` · LACUNA ${input.alvo.lacuna.motivo}` : ""}`
        : "(ausente — diagnóstico próprio)",
    },
    { rotulo: "Referências servidas (vault)", cls: "vault", valor: carga.refsServidas.join(", ") },
    { rotulo: "Aprendizados servidos (vault)", cls: "vault", valor: carga.aprendizadosServidos.join(", ") || "(nenhum)" },
    // Passo 6: o que o toque NÃO recebeu, e por quê — sem esta linha o
    // filtro seria invisível na tela (é o modo de falha que o vault já teve
    // com as lacunas: servia "(nenhuma)" e ninguém via).
    {
      rotulo: `Vault por toque (${toqueSlug(input.flowType, input.emailNumber)})`,
      cls: "vault",
      valor: !carga.porToque.ligado
        ? "desligado (VAULT_POR_TOQUE=off) — tudo servido como global"
        : carga.porToque.failOpen
          ? "FAIL-OPEN: nenhuma referência global nem deste toque — todas servidas"
          : `deste toque: ${carga.porToque.refsDoToque.join(", ") || "—"} · descartadas (outro toque): ${[...carga.porToque.refsDescartadas, ...carga.porToque.aprendizadosDescartados].join(", ") || "nenhuma"}${carga.porToque.avisos.length ? ` · avisos: ${carga.porToque.avisos.join("; ")}` : ""}`,
    },
    { rotulo: "Commit do vault", cls: "vault", valor: carga.vaultCommitSha ?? "(desconhecido)" },
    { rotulo: "Seções disponíveis", cls: "sistema", valor: secoesTexto },
    { rotulo: "Estruturas dos outros emails do flow", cls: "sistema", valor: irmasTexto },
    {
      rotulo: "Revisão humana da estrutura",
      cls: "curadoria",
      valor:
        (input.revisoes ?? []).length > 0
          ? `${(input.revisoes ?? []).length} revisão(ões) aplicável(is)`
          : "(nenhuma)",
    },
  ]

  // Segmentos base (1ª tentativa) — no retry as vars mudam e os segments são
  // reconstruídos no loop; aqui é o que a live view mostra enquanto roda.
  const segUserBase = buildSegmentedPrompt(config.user_template, userVars, USER_ORIGINS, { parte: "user" })
  const basePromptSegments = concatSegments(systemSegments, segUserBase.segments)

  // ── A janela não comporta os três ────────────────────────────────────
  // Medido em 11/09 (batch 1ea00ba9, tudo em sonnet-5 com raciocínio):
  // Seletor 65s + Estruturador 260s + Curador 442s = 767s numa janela de
  // 770, com a escolha do Curador CORTADA no fim. Quem cede é este agente,
  // porque o Curador não tem substituto e a decisão daqui já está gravada.
  // Ver `reuso-da-decisao.ts`.
  const janela = decidirPelaJanela({
    maxTokens: config.max_tokens,
    restanteMs: restanteDoOrcamento(),
    reservaMs: RESERVA_POS_ESTRUTURADOR_MS,
    temVigente: vigente != null,
    pinado: input.pinado === true,
  })
  if (janela.acao === "reusar" && vigente) {
    const motivo = `decisão de ${new Date(vigente.quando).toISOString()} reusada: ${janela.motivo}`
    log.info("estruturador.reuso_por_janela", {
      emailId: input.emailId, storeId: input.storeId, runReusada: vigente.runId,
    })
    const runIdSkip = await startGenerationRun({
      storeId: input.storeId,
      flowId: input.flowId ?? undefined,
      emailId: input.emailId ?? undefined,
      triggeredBy: input.triggeredBy,
      batchId: input.batchId,
      agent: "estruturador",
      agentConfigId: cfgRow?.id,
      model: "reuso",
      inputVars: { modo: input.mode, motivo, run_reusada: vigente.runId },
    })
    await finishGenerationRun(runIdSkip, {
      storeId: input.storeId,
      flowId: input.flowId ?? undefined,
      emailId: input.emailId ?? undefined,
      triggeredBy: input.triggeredBy,
      batchId: input.batchId,
      agent: "estruturador",
      agentConfigId: cfgRow?.id,
      status: "skipped",
      model: "reuso",
      inputVars: { modo: input.mode, motivo, run_reusada: vigente.runId },
      parsedOutput: { ...vigente.output, _reuso: { motivo, run_reusada: vigente.runId } },
      durationMs: Date.now() - t0,
    }).catch(() => {})
    return { output: vigente.output, runId: runIdSkip, status: "ok" }
  }

  const runId = await startGenerationRun({
    storeId: input.storeId,
    flowId: input.flowId ?? undefined,
    emailId: input.emailId ?? undefined,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "estruturador",
    agentConfigId: cfgRow?.id,
    model: config.model,
    inputVars: {
      modo: input.mode,
      // Mede a mudança de 08/09: com alvo a nota não viaja. Se a sequência
      // piorar, é aqui que se vê em qual regime a run rodou.
      intencao_servida: intencaoServida,
      refs_servidas: carga.refsServidas,
      aprendizados_servidos: carga.aprendizadosServidos,
      vault_commit_sha: carga.vaultCommitSha,
      capacidade: capacidade.porCategoria,
      produtos_da_loja: capacidade.produtosDaLoja,
      outros_emails_count: irmas.length,
      auditoria_modo: auditoriaModo,
      incentivo: input.incentivo ?? null,
    },
    renderedPrompt: segUserBase.segments
      ? segUserBase.prompt
      : renderImageTemplate(config.user_template, userVars),
    promptSegments: basePromptSegments,
    inputSummary,
  })

  let raw = ""
  let tokensIn = 0
  // Cache de prompt (14/09): lido e escrito, somados nas tentativas.
  let tokensCache = 0
  let tokensCacheEscrita = 0
  let tokensOut = 0
  let costUsd = 0
  let ultimoErro: string | null = null
  let userPromptFinal = ""
  let promptSegmentsFinal: PromptSegment[] | null = basePromptSegments

  // Teto por tentativa (truncado sobe, o resto repete igual) e a evidência
  // do provedor guardada fora do try — no catch ela já teria morrido.
  let tetoDaVez = config.max_tokens
  let ultimoFinish: string | null = null
  let ultimoOut: number | null = null
  let motivoDaDesistencia: string | null = null
  const tetosTentados: number[] = []
  // Auditoria da última tentativa (a que reprovou, ou a que passou) e a
  // saída que ela avaliou — no esgotamento, a run grava as duas.
  let ultimaAuditoria: AuditoriaDosRequisitos | null = null
  let ultimaSaida: EstruturadorOutput | null = null
  let ultimaFoiAuditoria = false

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // No retry, o motivo volta para o modelo — mesmo padrão dos demais
      // agentes (falha explicada converge melhor). Parse ilegível vai em
      // <estruturas_dos_outros_emails> (como sempre); auditoria reprovada
      // vai no bloco próprio <auditoria_anterior>, e se o template do banco
      // não tiver a var, cai no mesmo lugar do parse (nunca some).
      const auditoriaTexto = ultimaFoiAuditoria && ultimaAuditoria ? renderAuditoria(ultimaAuditoria) : null
      const templateTemAuditoria = config.user_template.includes("{{auditoria_anterior}}")
      const vars = auditoriaTexto
        ? templateTemAuditoria
          ? { ...userVars, auditoria_anterior: auditoriaTexto }
          : { ...userVars, estruturas_dos_outros_emails: `${userVars.estruturas_dos_outros_emails}\n\n<auditoria_anterior>\n${auditoriaTexto}\n</auditoria_anterior>` }
        : ultimoErro
          ? { ...userVars, estruturas_dos_outros_emails: `${userVars.estruturas_dos_outros_emails}\n\nSEU OUTPUT ANTERIOR NÃO PÔDE SER LIDO: ${ultimoErro}` }
          : userVars
      tetosTentados.push(tetoDaVez)
      const res = await invokeAgent({ ...config, max_tokens: tetoDaVez }, vars, systemVars)
      ultimoFinish = res.finishReason ?? null
      ultimoOut = res.tokensOutput
      raw = res.raw
      tokensIn += res.tokensInput
      tokensOut += res.tokensOutput
      costUsd += res.costUsd
      if (typeof res.cachedTokens === "number") tokensCache += res.cachedTokens
      if (typeof res.cacheWriteTokens === "number") tokensCacheEscrita += res.cacheWriteTokens
      // O prompt REAL desta tentativa (era JSON.stringify(vars) — 26/08),
      // segmentado por origem. Template custom com {{#if}} → fail-open.
      const segUser = buildSegmentedPrompt(config.user_template, vars, USER_ORIGINS, { parte: "user" })
      userPromptFinal = segUser.segments
        ? segUser.prompt
        : renderImageTemplate(config.user_template, vars)
      promptSegmentsFinal = concatSegments(systemSegments, segUser.segments)

      // `extractJson` devolve STRING — o objeto só existe depois do parse.
      // Sem ele, o validador recebia texto, reprovava no primeiro teste
      // (`typeof !== "object"`) e o agente falhava em 100% das runs, com a
      // mensagem "output não é um objeto JSON" acusando o modelo por um erro
      // nosso. `ValidacaoInput.output` é `unknown`, então o compilador não
      // pegou. Todos os outros agentes fazem `JSON.parse(extractJson(raw))`.
      let parsed: unknown
      try {
        parsed = JSON.parse(extractJson(res.raw))
      } catch {
        // Teto de saída batido = resposta cortada no meio do JSON. Dizer
        // isso em vez de "JSON inválido" é a diferença entre ajustar o
        // `max_tokens` e caçar um bug que não existe.
        throw new Error(
          res.tokensOutput >= tetoDaVez
            ? `resposta truncada no teto de ${tetoDaVez} tokens de saída — o JSON veio incompleto`
            : "resposta não é JSON válido",
        )
      }
      // Só a FORMA (estrutura[] com section+papel). Sem validador de
      // conteúdo editorial: a sequência que ele devolver é o que vale (02/09).
      const { saida, descartados } = normalizarOutputDetalhado(parsed)
      ultimaSaida = saida

      // A auditoria dos REQUISITOS (14/09) não julga a estrutura: confere se
      // o que o filtro do Curador vai ler é coerente com o que o agente
      // recebeu (incentivo, capacidade, seções) e com o que ele mesmo
      // escreveu em prosa. Em `on`, dura = retentativa; esgotada, incoerente.
      const auditoria = roda(auditoriaModo)
        ? auditarRequisitos({
            saida,
            alvo: input.alvo ?? null,
            incentivo: input.incentivo ?? null,
            capacidade: capacidade.resumo,
            secoesDisponiveis,
            descartados,
          })
        : null
      ultimaAuditoria = auditoria
      if (auditoria && !auditoria.ok) {
        log.warn("estruturador.auditoria_reprovou", {
          storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber,
          attempt, modo: auditoriaModo, duras: auditoria.duras.map((d) => d.regra), avisos: auditoria.avisos.length,
        })
        if (bloqueia(auditoriaModo)) throw new AuditoriaReprovadaError(auditoria, saida)
      }
      const auditoriaTelemetria = auditoria
        ? { modo: auditoriaModo, ...auditoria, tentativa: attempt }
        : { modo: auditoriaModo, ok: null, duras: [], avisos: [], descartados, posicoes: saida.estrutura.length, com_requisito: saida.estrutura.filter((p) => p.requisitos).length, tentativa: attempt }

      await finishGenerationRun(runId, {
        storeId: input.storeId,
        flowId: input.flowId ?? undefined,
        emailId: input.emailId ?? undefined,
        triggeredBy: input.triggeredBy,
        batchId: input.batchId,
        agent: "estruturador",
        agentConfigId: cfgRow?.id,
        status: "success",
        model: config.model,
        inputVars: {
          modo: input.mode,
          refs_servidas: carga.refsServidas,
          aprendizados_servidos: carga.aprendizadosServidos,
          vault_commit_sha: carga.vaultCommitSha,
          capacidade: capacidade.porCategoria,
          secoes_disponiveis: secoesDisponiveis,
          produtos_da_loja: capacidade.produtosDaLoja,
          outros_emails_count: irmas.length,
          system_sha8: systemSha8,
          tetos_tentados: tetosTentados,
          motivo_da_desistencia: motivoDaDesistencia,
          auditoria_modo: auditoriaModo,
          incentivo: input.incentivo ?? null,
          tokens_cache: tokensCache,
          tokens_cache_escrita: tokensCacheEscrita,
          vault_por_toque: carga.porToque.failOpen ? "fail_open_sem_referencia" : carga.porToque.ligado ? "on" : "off",
          refs_do_toque: carga.porToque.refsDoToque,
          refs_descartadas_por_toque: carga.porToque.refsDescartadas,
          aprendizados_do_toque: carga.porToque.aprendizadosDoToque,
          aprendizados_descartados_por_toque: carga.porToque.aprendizadosDescartados,
          vault_por_toque_avisos: carga.porToque.avisos,
        },
        renderedPrompt: userPromptFinal,
        promptSegments: promptSegmentsFinal,
        inputSummary,
        rawOutput: raw.slice(0, 16000),
        parsedOutput: {
          ...saida,
          // Sempre presente (mesmo em `off`, com ok:null): é o que diz se o
          // filtro do Curador recebeu requisitos conferidos ou não.
          auditoria_requisitos: auditoriaTelemetria,
          // Informativo (sem validador de conteúdo desde 02/09): o que a
          // tela usa para dizer se foi consumido, se houve retry de parse,
          // se a revisão humana foi seguida e se convergiu com a anterior.
          _validador: {
            retry_count: attempt - 1,
            shadow: input.mode !== "on",
            // A revisão humana é sinal FORTE, não trava: o agente pode
            // divergir. O que não pode é a divergência passar batida —
            // sem isto, "ele ignorou o que escrevi" só se descobre
            // comparando a sequência à mão, geração a geração.
            revisao_humana: (() => {
              const rev = (input.revisoes ?? []).filter(
                (r) => r.para_estruturador !== false,
              )
              if (rev.length === 0) return { havia: false, seguida: null }
              // A mais específica manda: é a que fala deste email.
              const alvo =
                rev.find((r) => r.alcance === "este_email") ?? rev[0]
              const seq = saida.estrutura.map((p) => p.section)
              return {
                havia: true,
                alcance: alvo.alcance,
                ordem_pedida: alvo.ordem_nova,
                ordem_entregue: seq,
                seguida:
                  alvo.ordem_nova.length === seq.length &&
                  alvo.ordem_nova.every((sec, i) => sec === seq[i]),
              }
            })(),
            // Convergência, não erro: mesma estrutura da geração anterior
            // DESTE email.
            repetiu_geracao_anterior:
              minhaAnterior != null &&
              minhaAnterior.length === saida.estrutura.length &&
              minhaAnterior.every((sec, i) => sec === saida.estrutura[i]?.section),
          },
        },
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        costCents: resolveCostCents({
          model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd,
        }),
        durationMs: Date.now() - t0,
        retryCount: attempt - 1,
      })
      log.info("estruturador.ok", {
        storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber,
        modo: input.mode, posicoes: saida.estrutura.length, attempt,
      })
      return { output: saida, runId, status: "ok" }
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message : String(err)
      ultimaFoiAuditoria = err instanceof AuditoriaReprovadaError
    }
    const causa = classificarFalha({
      finishReason: ultimoFinish,
      tokensOutput: ultimoOut,
      maxTokens: tetoDaVez,
      erro: ultimoErro,
      ehValidacao: ultimaFoiAuditoria,
    })
    const plano = planejarRetentativa({
      causa, tentativa: attempt, maxAttempts: MAX_ATTEMPTS,
      tetoAtual: tetoDaVez, tetoMaximo: TETO_MAXIMO_ESTRUTURADOR,
    })
    log.warn("estruturador.attempt_failed", {
      storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber,
      attempt, error: ultimoErro, causa, repetir: plano.repetir, teto_proximo: plano.maxTokens,
    })
    if (causa === "timeout") {
      // Chamada paga cujo corpo nunca foi lido: a run gravaria 0 tokens.
      ultimoErro = `${ultimoErro ?? "timeout"} · ${avisoDeContaPerdida(tetoDeRelogioDoAgente("estruturador") ?? 240_000)}`
    }
    if (!plano.repetir) { motivoDaDesistencia = plano.motivo; break }
    tetoDaVez = plano.maxTokens
  }

  // 2 falhas de parse → run error; o caller segue sem Estruturador (fallback
  // documentado). 2 auditorias reprovadas em `on` → `estruturador_incoerente`,
  // e o caller DERRUBA a geração: a run grava a última saída com a auditoria,
  // para a tela mostrar o que foi recusado e por quê.
  const incoerente = ultimaFoiAuditoria && ultimaAuditoria != null && !ultimaAuditoria.ok
  const detalheIncoerente = incoerente && ultimaAuditoria ? resumoDasDuras(ultimaAuditoria) : null
  await finishGenerationRun(runId, {
    storeId: input.storeId,
    flowId: input.flowId ?? undefined,
    emailId: input.emailId ?? undefined,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "estruturador",
    agentConfigId: cfgRow?.id,
    status: "error",
    model: config.model,
    errorMessage: incoerente
      ? `estruturador_incoerente: ${detalheIncoerente} · ${ultimaAuditoria?.duras.map((d) => d.detalhe).join(" | ") ?? ""}`.slice(0, 2000)
      : (motivoDaDesistencia ? `${motivoDaDesistencia} · ${ultimoErro ?? ""}` : ultimoErro) ?? "estruturador_failed",
    inputVars: {
      modo: input.mode,
      refs_servidas: carga.refsServidas,
      vault_commit_sha: carga.vaultCommitSha,
      system_sha8: systemSha8,
      auditoria_modo: auditoriaModo,
      incentivo: input.incentivo ?? null,
      tetos_tentados: tetosTentados,
      motivo_da_desistencia: motivoDaDesistencia,
    },
    ...(ultimaSaida
      ? {
          parsedOutput: {
            ...ultimaSaida,
            auditoria_requisitos: ultimaAuditoria
              ? { modo: auditoriaModo, ...ultimaAuditoria, tentativa: tetosTentados.length }
              : null,
            _validador: { retry_count: MAX_ATTEMPTS - 1, shadow: input.mode !== "on", recusada: incoerente },
          },
        }
      : {}),
    renderedPrompt: userPromptFinal || undefined,
    promptSegments: promptSegmentsFinal,
    inputSummary,
    rawOutput: raw.slice(0, 16000) || undefined,
    tokensInput: tokensIn,
    tokensOutput: tokensOut,
    costCents: resolveCostCents({
      model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd,
    }),
    durationMs: Date.now() - t0,
    retryCount: MAX_ATTEMPTS - 1,
  })
  if (incoerente) {
    log.error("estruturador.incoerente", {
      storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber,
      duras: ultimaAuditoria?.duras.map((d) => d.regra),
    })
    return { output: null, runId, status: "falhou", motivo: "incoerente", detalhe: detalheIncoerente ?? undefined }
  }
  return { output: null, runId, status: "falhou" }
}
