/**
 * Orquestrador do Component Assembler (Epic AE).
 *
 * Para um (loja × email): carrega o contexto, gera o blueprint detalhado
 * (passo A) e monta o reference HTML escolhendo componentes (passo B).
 * Auto-suficiente — pode ser chamado do onboarding, de um endpoint de
 * regeneração ou de um cron.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { EmailOutlineTemplate } from "@/types/email-generation"

import { pesquisaToFullText, type PesquisaFields } from "@/lib/briefing/briefing-text"
import {
  missingStoreFields,
  resolveBrandProfile,
  resolveObjecoes,
  resolvePersonaText,
  resolveVocabulario,
  type IcpDemographics,
  type IcpPersona,
} from "./store-context"
import { mapTopProductRow, type TopProductRow } from "../top-products"
import { mapTomVozToMood } from "../image/mood-mapping"
import { isTextOnlyEmail } from "./blueprint-loader"
import { loadGlobalReferenceTemplate } from "../reference-template"
import { reconcileEmailStructure } from "@/lib/services/reconcile-blocks.service"
import { resolveStructure, clampStructure } from "./outline-sections"
import { generateStoreBlueprint } from "./blueprint-generator.service"
import { runEstruturador } from "../estruturador/estruturador.service"
import { logGenerationRun } from "../callbacks/telemetry.callback"
import {
  estruturaParaPosicoes,
  resumoParaCurador,
  type PosicaoEstruturada,
} from "../estruturador/estruturador-consume"
import type { EstruturadorOutput } from "../estruturador/estruturador-prompt"
import {
  assembleStoreReference,
  type ReferenceSource,
} from "./component-assembler.service"
import type { EstruturadorStatus } from "./blueprint-generator.service"
import { loadRevisoesAplicaveis } from "../shared/load-revisoes"

const log = logger.child("ArchitectGenerate")

interface BriefingMarca {
  nicho?: string
  posicionamento?: string
  persona?: string
  tom_voz?: string
}

export interface GenerateArchitectInput {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  /**
   * Reescreve a estrutura de blocos mesmo em emails ready/approved/live.
   * Propaga ao `reconcileEmailStructure`. Default false (preserva finalizados,
   * comportamento histórico). Quando true, a copy existente continua sendo
   * preservada por tipo (carry-over); blocos novos vêm vazios e precisam de
   * regeração de copy depois.
   */
  force?: boolean
}

/**
 * true se a feature está configurada (há ao menos um outline ou uma
 * variante de componente). Evita pagar latência de LLM em lojas/ambientes
 * onde a biblioteca ainda não foi populada (comportamento idêntico ao atual).
 */
export async function isArchitectConfigured(): Promise<boolean> {
  const admin = createAdminClient()
  const [outlines, variants] = await Promise.all([
    admin
      .from("email_outline_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    admin
      .from("email_component_variants")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ])
  return (outlines.count ?? 0) > 0 || (variants.count ?? 0) > 0
}

export async function generateBlueprintAndReference(
  input: GenerateArchitectInput,
): Promise<{ referenceSource: ReferenceSource }> {
  const admin = createAdminClient()

  // Email "somente texto" (email_blueprints.text_only): NUNCA gera arquitetura
  // por loja — sem LLM, sem upsert em store_email_*. Retornar "global" settla
  // como 'done' na fila e conta como ok no generateForEmails; o consumidor
  // (dispatch/build-vars) usa a estrutura global. Cobre também jobs já
  // enfileirados antes da flag e os caminhos manuais (Testar/Regenerar).
  if (await isTextOnlyEmail(admin, input.flowType, input.emailNumber)) {
    log.info("architect.skip_text_only", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
    })
    return { referenceSource: "global" }
  }

  // Parâmetros globais do pipeline (aba Configurações). Lidos ANTES do guard
  // de reuso porque o modo do Estruturador muda a decisão de reusar: em 'on'
  // a estrutura é regerada a cada geração (decisão 6 do ADR
  // adr-estruturador-adaptativo) — arquitetura persistida não pode
  // curto-circuitar a run.
  const { data: orgRow } = await admin
    .from("client_stores")
    .select("org_id")
    .eq("id", input.storeId)
    .maybeSingle()
  const orgId = (orgRow?.org_id as string | undefined) ?? null
  let maxBlocksPerEmail: number | null = null
  let defaultModel: string | null = null
  let blueprintMode: "auto" | "llm" | "deterministic" = "auto"
  let estruturadorMode: "off" | "shadow" | "on" = "off"
  if (orgId) {
    const { data: settingsRow } = await admin
      .from("email_generation_settings")
      .select("max_blocks_per_email, default_model, blueprint_mode, estruturador_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    maxBlocksPerEmail =
      (settingsRow?.max_blocks_per_email as number | undefined) ?? null
    defaultModel = (settingsRow?.default_model as string | undefined) ?? null
    const rawMode = settingsRow?.blueprint_mode as string | undefined
    if (rawMode === "llm" || rawMode === "deterministic") blueprintMode = rawMode
    const rawEstruturador = settingsRow?.estruturador_mode as string | undefined
    if (rawEstruturador === "shadow" || rawEstruturador === "on")
      estruturadorMode = rawEstruturador
  }

  // REUSO: sem `force`, arquitetura já persistida para este loja×flow×email
  // não é regerada. Curador+Montador+Blueprint são o maior custo do pipeline
  // e o consumidor (dispatch/build-vars) lê direto de store_email_references/
  // store_email_blueprints — regerar aqui só repagava LLM pra sobrescrever o
  // mesmo resultado. Regeração explícita continua via force=true (teste
  // completo / botão Regenerar). Só reusa quando AMBOS existem: reference sem
  // blueprint (ou vice-versa) indica geração anterior incompleta → regera.
  // Com Estruturador 'on', o reuso NÃO se aplica: a estrutura é decidida a
  // cada geração e a arquitetura acompanha (custo aceito no ADR).
  if (input.force !== true && estruturadorMode === "on") {
    log.info("architect.reuse_bypassed_estruturador", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
    })
  }
  if (input.force !== true && estruturadorMode !== "on") {
    const [refRes, bpRes] = await Promise.all([
      admin
        .from("store_email_references")
        .select("id")
        .eq("store_id", input.storeId)
        .eq("flow_type", input.flowType)
        .eq("email_number", input.emailNumber)
        .maybeSingle(),
      admin
        .from("store_email_blueprints")
        .select("id")
        .eq("store_id", input.storeId)
        .eq("flow_type", input.flowType)
        .eq("email_number", input.emailNumber)
        .maybeSingle(),
    ])
    if (refRes.data && bpRes.data) {
      log.info("architect.reuse_existing", {
        storeId: input.storeId,
        flowType: input.flowType,
        emailNumber: input.emailNumber,
      })
      return { referenceSource: "store" }
    }
  }

  // Resolve o EMAIL desta geração. A fase 1 opera por (loja × flow × número),
  // mas as runs precisam do email_id/flow_id — sem eles a telemetria fica
  // invisível na UI (a aba Execuções resolve runs POR EMAIL, e os 4 agentes
  // daqui gravavam 100% com email_id NULL → nós "pulado" à toa e tela vazia
  // durante a janela do n8n). Best-effort: loja sem o email seedado segue
  // com null, comportamento antigo — telemetria nunca bloqueia geração.
  const { data: emailRows } = await admin
    .from("email_flow_emails")
    .select("id, flow_id, flow:email_flows!inner(store_id, flow_type)")
    .eq("flow.store_id", input.storeId)
    .eq("flow.flow_type", input.flowType)
    .eq("number", input.emailNumber)
    .limit(1)
  const emailRow = (emailRows?.[0] ?? null) as
    | { id: string; flow_id: string }
    | null
  const emailId = emailRow?.id ?? null
  const flowId = emailRow?.flow_id ?? null

  const [storeRes, briefingRes, productsRes, outlineRes, refTemplateHtml, brandRes, intentsRes] = await Promise.all([
    admin
      .from("client_stores")
      .select("*")
      .eq("id", input.storeId)
      .maybeSingle(),
    admin
      .from("store_briefings")
      .select("marca")
      .eq("store_id", input.storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Colunas completas (era só `title`): o Curador precisa do LINK do
    // produto, e ele se monta com `handle` + `store_url`. O dado sempre
    // esteve na tabela — a consulta é que o descartava.
    admin
      .from("store_top_products")
      .select("rank, title, price, currency, handle, external_id, image_url")
      .eq("store_id", input.storeId)
      .order("rank", { ascending: true })
      .limit(5),
    admin
      .from("email_outline_templates")
      .select("*")
      .eq("flow_type", input.flowType)
      .eq("email_number", input.emailNumber)
      .eq("is_active", true)
      .maybeSingle(),
    // Referência curada global (mesmo flow×email): input/inspiração do
    // Montador. A MESMA fonte segue como fallback no build-vars (consumidor).
    loadGlobalReferenceTemplate(admin, input.flowType, input.emailNumber),
    // Fontes aprovadas (última versão da identidade): a montagem por código
    // normaliza a tipografia do documento — componentes vêm de origens
    // diferentes e sem isso o email sai com 3 fontes. O phase2 normaliza de
    // novo a cada geração, então trocar de fonte não invalida a arquitetura.
    admin
      .from("store_brand_identity")
      .select("font_heading, font_body")
      .eq("store_id", input.storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Intenções do vault (flow + este email): contrato editorial servido ao
    // CURADOR como critério de escolha — independe do modo do Estruturador
    // (vault vazio → nulls, prompt declara ausência). Fonte: email_intents
    // sincronizada do Obsidian.
    admin
      .from("email_intents")
      .select("slug, email_number, body_md")
      .eq("flow_type", input.flowType)
      .eq("is_active", true),
  ])

  const store = (storeRes.data ?? {}) as Record<string, unknown>
  const marca =
    ((briefingRes.data as { marca?: BriefingMarca } | null)?.marca ??
      {}) as BriefingMarca
  const productRows = (productsRes.data as TopProductRow[] | null) ?? []
  const outline = (outlineRes.data as EmailOutlineTemplate | null) ?? null
  const brand = brandRes.data as {
    font_heading?: string | null
    font_body?: string | null
  } | null
  const intents = (intentsRes.data ?? []) as Array<{
    slug: string
    email_number: number | null
    body_md: string
  }>
  const intencaoFlow =
    intents.find((i) => i.slug === "_flow")?.body_md ?? null
  const intencaoEmail =
    intents.find((i) => i.email_number === input.emailNumber)?.body_md ?? null

  const brandName = (store.store_name as string) || "Loja"
  const nicho = marca.nicho || (store.niche as string) || ""
  const posicionamento =
    marca.posicionamento || (store.posicionamento_preco as string) || ""
  // `icp_persona` é JSONB. O `as string` de antes era só TypeScript: em
  // runtime o OBJETO seguia para o prompt e virava "[object Object]".
  const persona = resolvePersonaText({
    marcaPersona: marca.persona,
    icpPersona: store.icp_persona as IcpPersona | null,
    icpDemographics: store.icp_demographics as IcpDemographics | null,
    personaColumn: store.persona,
  })
  const tomVoz =
    marca.tom_voz ||
    (store.tone_description as string) ||
    (store.tom_de_voz as string) ||
    ""
  // Mesmo mapeamento de `loadTopProducts` (fonte única do shape canônico).
  const topProducts = productRows.map((p) =>
    mapTopProductRow(p, (store.store_url as string | null) ?? null),
  )
  const topProductNames = topProducts.map((p) => p.name).filter(Boolean)
  const mood = mapTomVozToMood(tomVoz)
  // Pesquisa & Diagnóstico (5 pilares) serializada — fonte rica p/ os agentes.
  const pesquisa = pesquisaToFullText(store as PesquisaFields)
  // O Curador recebe a MESMA pesquisa sem a seção 05 (Review dos Anúncios):
  // auditoria de mídia paga era 5.538 dos 13.823 chars de <perfil_marca> e
  // não diz nada sobre qual variante serve ao email. O Estruturador segue
  // com o dossiê inteiro — ele decide arco, não componente.
  const pesquisaSemAds = pesquisaToFullText(store as PesquisaFields, {
    incluirAds: false,
  })

  // Perfil da marca do Curador: briefing curado quando existe, senão a
  // PESQUISA. Sem esse fallback, loja sem `store_briefings` mandava o
  // literal "{}" em <perfil_marca> — com a pesquisa carregada ao lado, sem
  // uso. Era metade da razão de a Innova Bay ter recebido a composição da
  // Luxe Lift inteira (ago/2026).
  const brandProfile = resolveBrandProfile({
    marca: marca as Record<string, unknown>,
    pesquisa: pesquisaSemAds,
  })
  const missingFields = missingStoreFields({
    nicho,
    posicionamento,
    persona,
    tomVoz,
  })
  if (missingFields.length > 0 || brandProfile.source !== "briefing") {
    log.warn("architect.store_context_partial", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      missingFields,
      brandProfileSource: brandProfile.source,
    })
  }

  // Revisões humanas de estrutura deste email (migration 20261088):
  // carregadas UMA vez e servidas aos três agentes, cada um recebendo só o
  // que o operador marcou para ele. Fail-open no loader — correção
  // editorial nunca derruba a geração.
  const revisoes = await loadRevisoesAplicaveis(
    input.storeId,
    input.flowType,
    input.emailNumber,
  )
  if (revisoes.length > 0) {
    log.info("architect.revisao_humana_servida", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      revisoes: revisoes.length,
    })
  }

  // ── Estruturador (ADR adr-estruturador-adaptativo) ──
  // Roda quando o modo não é 'off': decide a estrutura adaptada e grava a
  // run com o embasamento completo. Em 'shadow' o resultado NÃO altera o
  // pipeline (mede-se a decisão); em 'on' (fase 3) o output validado
  // SUBSTITUI o outline abaixo. Falha/sem_material NUNCA derruba a geração —
  // fallback documentado é o outline, com log.
  let estruturadorOutput: EstruturadorOutput | null = null
  // Por que a estrutura é (ou não é) a do Estruturador — desce até o
  // blueprint e daí até a tela. Modo 'shadow' NÃO consome de propósito: a
  // estrutura é a do outline e a marca precisa dizer isso.
  let estruturadorStatus: EstruturadorStatus =
    estruturadorMode === "on" ? "falhou" : "desligado"
  if (estruturadorMode === "off") {
    // Run 'skipped' em vez de silêncio. O Estruturador é passo do pipeline
    // nas telas (mapa e aba Teste): sem run nenhuma, a linha dele fica
    // "pendente" para sempre e parece travada — quando a verdade é que o
    // agente está desligado. O backend diz o que aconteceu; a UI só exibe.
    await logGenerationRun({
      storeId: input.storeId,
      flowId: flowId ?? undefined,
      emailId: emailId ?? undefined,
      triggeredBy: input.triggeredBy,
      batchId: input.batchId,
      agent: "estruturador",
      status: "skipped",
      model: "desligado",
      inputSummary: [
        {
          rotulo: "Modo",
          cls: "sistema",
          valor:
            "desligado em Configurações → Estruturador (a estrutura vem da Estrutura geral)",
        },
      ],
      parsedOutput: { skip_reason: "estruturador_mode_off" },
      costCents: 0,
      durationMs: 0,
    }).catch(() => {})
  } else {
    try {
      const r = await runEstruturador({
        storeId: input.storeId,
        flowId,
        emailId,
        flowType: input.flowType,
        emailNumber: input.emailNumber,
        batchId: input.batchId,
        triggeredBy: input.triggeredBy,
        mode: estruturadorMode,
        brandName,
        nicho,
        posicionamento,
        tomVoz,
        persona,
        pesquisa,
        topProductNames,
        revisoes,
      })
      if (estruturadorMode === "on") {
        if (r.status === "ok" && r.output && r.output.text_only) {
          // text_only decidido pelo agente ainda não tem caminho de consumo
          // (o pipeline text_only é flag GLOBAL de email_blueprints) — v1
          // registra e segue no outline, sem perder o embasamento da run.
          log.warn("estruturador.text_only_nao_consumido", {
            storeId: input.storeId,
            flowType: input.flowType,
            emailNumber: input.emailNumber,
          })
          estruturadorStatus = "text_only"
        } else if (r.status === "ok" && r.output) {
          estruturadorOutput = r.output
          estruturadorStatus = "consumido"
        } else {
          estruturadorStatus =
            r.status === "sem_material" ? "sem_material" : "falhou"
          log.warn("estruturador.on_fallback_outline", {
            storeId: input.storeId,
            flowType: input.flowType,
            emailNumber: input.emailNumber,
            status: r.status,
          })
        }
      }
    } catch (err) {
      log.error("estruturador.run_failed", {
        storeId: input.storeId,
        flowType: input.flowType,
        emailNumber: input.emailNumber,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Passo 1 — Montador: gera o HTML seguindo a estrutura decidida pelo
  // Estruturador (modo 'on' com run válida) ou, senão, a estrutura geral do
  // outline (categoria + rótulo original de cada bloco, na ordem).
  let posicoes: PosicaoEstruturada[] | null = estruturadorOutput
    ? estruturaParaPosicoes(estruturadorOutput)
    : null
  if (posicoes) {
    log.info("estruturador.consumido", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      sequencia: posicoes.map((p) => p.section),
    })
  }
  let structure: Array<{ section: string; label: string }> =
    posicoes ?? resolveStructure(outline)
  if (maxBlocksPerEmail != null && structure.length > maxBlocksPerEmail) {
    log.info("architect.structure_clamped", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      from: structure.length,
      to: maxBlocksPerEmail,
    })
    // Apara o MIOLO preservando abertura + footer (não corta a cauda direto).
    structure = clampStructure(structure, maxBlocksPerEmail)
    // O clamp é genérico: quando a estrutura veio do Estruturador, os papéis
    // viajam DENTRO dos itens — structure e papéis saem da mesma lista
    // clampada, sem desalinhamento de índice com o blueprint.
    if (posicoes) posicoes = structure as PosicaoEstruturada[]
  }
  const {
    html,
    source,
    slots,
    papeisPorPosicao: papeisDoCurador,
    fioNarrativo: fioDoCurador,
  } = await assembleStoreReference({
    storeId: input.storeId,
    flowType: input.flowType,
    emailNumber: input.emailNumber,
    batchId: input.batchId,
    triggeredBy: input.triggeredBy,
    emailId,
    flowId,
    brandName,
    nicho,
    posicionamento,
    tomVoz,
    mood,
    persona,
    perfilMarca: brandProfile.text,
    // Objeções e vocabulário em blocos próprios (27/08): já viajavam dentro
    // do perfil, sem rótulo, e o Curador não tinha como saber que aquelas
    // linhas eram critério de veto.
    objecoes: resolveObjecoes(store as PesquisaFields),
    vocabulario: resolveVocabulario(store as PesquisaFields),
    revisoes,
    topProducts,
    outlineObjective: outline?.objective ?? "",
    // Com Estruturador consumido, o fio narrativo dele guia o Montador no
    // lugar da diretriz genérica do outline (os papéis já vão por bloco via
    // structure.label).
    outlineGuidance:
      // O fio do Curador não entra aqui: ele nasce DENTRO do assemble, no
      // mesmo call, e o Montador já o recebeu pelo papel de cada posição.
      estruturadorOutput?.fio_narrativo ?? outline?.guidance ?? "",
    outlineToneHint: outline?.tone_hint ?? "",
    // "O e-mail não deve": estava no dado e na tela da Arquitetura, e parava
    // ali. Quem escreve a direção editorial de cada bloco precisa saber o
    // que o email não pode fazer.
    outlineRestricoes: outline?.restrictions ?? "",
    referenceTemplateHtml: refTemplateHtml ?? "",
    structure,
    defaultModel,
    fontHeading: brand?.font_heading ?? null,
    fontBody: brand?.font_body ?? null,
    // Contrato editorial do vault + decisão do Estruturador — critérios de
    // escolha do Curador. A decisão só desce quando foi CONSUMIDA (modo on):
    // em shadow o pipeline não pode ser influenciado por ela.
    intencaoFlow,
    intencaoEmail,
    estruturadorDecisao:
      estruturadorOutput && posicoes
        ? resumoParaCurador(estruturadorOutput, posicoes)
        : null,
  })

  // Passo 2 — Blueprint: extrai a estrutura do HTML montado.
  const { source: blueprintSource } = await generateStoreBlueprint({
    storeId: input.storeId,
    flowType: input.flowType,
    emailNumber: input.emailNumber,
    batchId: input.batchId,
    triggeredBy: input.triggeredBy,
    emailId,
    flowId,
    brandName,
    nicho,
    posicionamento,
    persona,
    tomVoz,
    topProductNames,
    outline,
    pesquisa,
    referenceHtml: html ?? "",
    defaultModel,
    slots,
    blueprintMode,
    // Fase 3: papel narrativo por posição sobrescreve o purpose dos blocos
    // (é como a decisão chega à copy do n8n) e o fio persiste no blueprint.
    // Origem do papel/fio, nesta ordem: Estruturador (hoje desligado) →
    // Curador do vault no modo `on`. O CONSUMIDOR é o mesmo dos dois lados
    // (`aplicarEstruturadorNoBlueprint` prepende o papel e preserva o
    // copy_guidance da variante embaixo como "Forma (variante)"): muda a
    // origem, não o encanamento.
    papeisPorPosicao: posicoes
      ? posicoes.map((p) => p.papel)
      : (papeisDoCurador?.some((x) => x.trim()) ? papeisDoCurador : null),
    fioNarrativo: estruturadorOutput?.fio_narrativo ?? fioDoCurador ?? null,
    estruturadorStatus,
  })

  // Passo 3 — Propaga a estrutura recém-gerada para os `email_blocks`.
  // Só quando o Blueprint foi REALMENTE gerado pelo LLM (source='ai' →
  // `store_email_blueprints` atualizado): aí os blocks precisam acompanhar a
  // nova estrutura (na ordem do reference do Montador), senão o email fica
  // preso na composição antiga e o reference é ignorado pelo HTML agent. No
  // fallback (source='manual') o store_bp não muda — nada a propagar.
  // Reconciliação aditiva (carry-over de copy) e não-destrutiva p/ finalizados;
  // falha aqui não derruba o Architect (o dispatch reconcilia de novo depois).
  if (blueprintSource === "ai") {
    try {
      const r = await reconcileEmailStructure(
        input.storeId,
        input.flowType,
        input.emailNumber,
        { force: input.force === true },
      )
      if (r.reconciled) {
        log.info("architect.blocks_reconciled", {
          storeId: input.storeId,
          flowType: input.flowType,
          emailNumber: input.emailNumber,
          added: r.added,
          total: r.total,
          forced_through_finalized: r.forced_through_finalized === true,
        })
      }
    } catch (err) {
      log.warn("architect.reconcile_blocks_failed", {
        storeId: input.storeId,
        flowType: input.flowType,
        emailNumber: input.emailNumber,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { referenceSource: source }
}

/**
 * Roda o agente para vários emails (loja inteira) em paralelo. Falha de um
 * email não derruba os demais.
 */
export async function generateForEmails(
  storeId: string,
  batchId: string,
  emails: Array<{ flowType: string; emailNumber: number }>,
  triggeredBy?: string,
  options: { force?: boolean } = {},
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  await Promise.all(
    emails.map(async (e) => {
      try {
        await generateBlueprintAndReference({
          storeId,
          flowType: e.flowType,
          emailNumber: e.emailNumber,
          batchId,
          triggeredBy,
          force: options.force === true,
        })
        ok++
      } catch (err) {
        failed++
        log.error("architect.email_failed", {
          storeId,
          flowType: e.flowType,
          emailNumber: e.emailNumber,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )
  log.info("architect.batch_done", { storeId, ok, failed })
  return { ok, failed }
}
