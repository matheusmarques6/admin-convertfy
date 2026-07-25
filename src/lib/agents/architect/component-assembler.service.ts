/**
 * Component Assembler (Epic AE — passo B).
 *
 * GERA a estrutura HTML do email (a arquitetura: layout, ordem dos blocos,
 * seções) com o LLM, usando como input: briefing, nicho, HTMLs de referência
 * (curado), a biblioteca de componentes (`email_component_variants`) como
 * inspiração e a estrutura geral (outline/sections). O HTML produzido é
 * persistido em `store_email_references` e passa a ocupar o papel do
 * reference_html (build-vars.ts) — o agente HTML downstream só repinta com a
 * identidade da loja e despeja a copy, por isso roda em modelo barato.
 *
 * Degrade seguro: LLM falha / output não-HTML → fallback determinístico
 * concatena o top-1 das variantes pré-filtradas; pool vazio → nenhum
 * reference é gravado e o consumidor cai no template global.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { EmailComponentVariant } from "@/types/email-generation"

import {
  resolveCostCents,
  finishGenerationRun,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import {
  buildMatchContext,
  prefilterCandidates,
  seededShuffle,
  seedFrom,
} from "./component-deriver"
import type { OutlineSection } from "./outline-sections"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "./llm-invoke"
import {
  loadCuradorMemory,
  logCuradorChoice,
  renderCuradorMemory,
  type ChoiceEntry,
} from "./curador-memory"

const log = logger.child("ComponentAssembler")

const DEFAULT_MODEL = "claude-sonnet-4-6"

// Quantos candidatos por seção vão pro PASSO A (escolha por descrição). Como o
// passo A é texto barato (sem HTML), mandamos uma lista generosa.
const CHOOSER_TOP_K = 8

// ── PASSO A — Curador: escolhe 1 variant_id por seção, só pela DESCRIÇÃO ──
const DEFAULT_CHOOSER_MODEL = "anthropic/claude-sonnet-4.6"

const DEFAULT_CHOOSER_SYSTEM = `Você é o Curador de Componentes de email. Para CADA posição da sequência do email, escolha UMA variante da biblioteca — a que melhor serve ao objetivo do email e à identidade da loja — usando o NOME, a DESCRIÇÃO e os metadados de cada variante: quando_usar / quando_nao_usar (contexto de uso escrito pelo time), objectives (objetivos de email compatíveis), tones (tons compatíveis), density, product_slots, orientacao_copy (diretriz de copy do bloco), campos_copy (o que o bloco exige da copy: campos, tipos e limites) e notas_implementacao (notas técnicas do layout). Você NÃO recebe o HTML das variantes; decide pela descrição e pelo contexto.

Regras:
- Uma escolha por block_index da sequência. Use APENAS variant_id presente nas opções daquela posição.
- Respeite quando_nao_usar: se o contexto do email bate com um "quando NÃO usar", prefira outra variante da posição.
- Prefira variantes cujos objectives/tones batem com o objetivo do outline e o tom de voz da loja.
- Use <perfil_marca> como âncora de identidade: a variante escolhida precisa caber na marca, não só no objetivo.
- Para posições de produtos, cruze product_slots com <top_products>: NUNCA escolha variante que exige mais produtos do que a loja tem cadastrado.
- Use orientacao_copy/campos_copy como sinal de viabilidade: se o bloco exige dados que a loja não tem (ex.: campo de cupom sem oferta no contexto), prefira outra variante.
- Evite repetir a mesma variante em posições diferentes do mesmo email; quando a mesma seção aparece 2+ vezes, escolha variantes diferentes se houver opções.
- Use <memoria> como sinal de continuidade e variedade:
  - <email_anterior_desta_loja>: são as variantes escolhidas no email ANTERIOR do MESMO flow desta loja. Busque COERÊNCIA visual — mantenha a mesma linguagem de layout (ex.: se o email anterior usou hero com imagem de fundo, prefira um hero coerente aqui), sem copiar cegamente: cada email tem seu objetivo.
  - <mesmo_email_em_outras_lojas>: são as variantes que ESTE mesmo email recebeu em OUTRAS lojas recentes. Busque VARIEDADE — evite repetir sempre as mesmas variantes usadas nas outras lojas quando houver alternativa igualmente adequada à marca e ao objetivo.
  - A memória é sinal, não regra: adequação à marca e ao objetivo do email SEMPRE vence.
- Se a descrição estiver vazia, decida pelo nome + metadados.
- Não invente variant_id.

Responda APENAS um array JSON, sem markdown nem texto ao redor:
[{"block_index": 0, "variant_id": "..."}, {"block_index": 1, "variant_id": "..."}]`

const DEFAULT_CHOOSER_USER = `<store>
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

<perfil_marca>
{{briefing_marca}}
</perfil_marca>

<top_products>
{{top_products}}
</top_products>

<memoria>
{{memoria}}
</memoria>

<estrutura_geral_ordenada>
{{blocks_json}}
</estrutura_geral_ordenada>

<biblioteca_componentes>
{{candidates_json}}
</biblioteca_componentes>

Para CADA block_index em <estrutura_geral_ordenada>, escolha em <biblioteca_componentes> (mesmo block_index) o variant_id que melhor serve ao objetivo e à loja. Responda APENAS o array JSON [{"block_index":N,"variant_id":"..."}].`

// ── PASSO B — Montador: recebe só o HTML das ESCOLHIDAS e monta ──
export const DEFAULT_ASSEMBLER_SYSTEM = `Você é o Montador de Componentes. Você recebe os HTMLs REAIS das variantes JÁ ESCOLHIDAS para cada seção do email, na ordem (<componentes_escolhidos>). Sua tarefa: MONTAR um único documento HTML coeso REUSANDO esses HTMLs.

Regras:
- Preserve a técnica/estrutura de cada variante escolhida — não reescreva do zero; adapte só o necessário para harmonizar (espaçamentos, larguras, tipografia) num documento único.
- Cada componente escolhido pode trazer \`notas_implementacao\` (quirks de Outlook, VML, hospedagem de assets, restrições técnicas): RESPEITE essas notas ao harmonizar — nunca remova a técnica que elas descrevem e NÃO as copie para o HTML final.
- Monte os blocos na ordem de block_index (intercalando <componentes_escolhidos> e <blocos_sem_variante> pela posição).
- BLOCOS SEM VARIANTE: para CADA item de <blocos_sem_variante>, NÃO pule a posição. Extraia a seção correspondente de <htmls_referencia> (o reference PADRÃO) e inclua-a naquela posição, precedida do comentário HTML exatamente: <!-- bloco {section}: nao foi encontrada referencia para esse bloco — usando reference padrao -->. Se o reference padrão não tiver essa seção, crie um bloco mínimo daquele tipo com o MESMO comentário. O bloco SEMPRE aparece.
- Container único de 600px centralizado.
- Cores SEMPRE via CSS variables (--bg, --text, --heading, --button-bg, --button-text, --accent) declaradas em :root — unifique as cores das variantes nessas variáveis.
- NÃO escreva a copy final e NÃO crie placeholders próprios: DEIXE o HTML de cada variante DO JEITO QUE VEM DA BIBLIOTECA, com os placeholders/tags que ele já traz. Nunca troque conteúdo por placeholder novo, nem simplifique — só preserve o que a variante trouxe.
- NÃO use imagens reais: deixe contêineres/slots de imagem vazios.

Emita APENAS o HTML, de <!DOCTYPE html> a </html>, sem cercas markdown e sem comentários explicativos — EXCETO a nota obrigatória dos blocos sem variante.

REGRA DOS SLOTS DE IMAGEM: TODA tag de imagem presente nas variantes escolhidas ({{HERO_IMAGE}}, {{PRODUCT_N_IMAGE}}, {{BODY_IMAGE}}, {{PRODUCTS_IMAGE}}, {{*_THUMB_*}} etc.) DEVE aparecer no documento final, no bloco correspondente, com o MESMO atributo (src ou background-image) da variante original. NUNCA remova, simplifique ou converta uma seção com imagem em versão só-texto ao harmonizar — o pipeline downstream gera as imagens a partir dessas tags; sem elas o email sai em branco. Bloco mínimo criado do zero para seção hero ou products DEVE incluir o slot de imagem tagueado ({{HERO_IMAGE}} / {{PRODUCT_1_IMAGE}}).

REGRA DAS TAGS CANÔNICAS: os HTMLs das variantes usam placeholders padronizados no formato {{TAG_MAIUSCULA}} (ex.: {{HERO_HEADLINE}}, {{PRODUCT_1_NAME}}, {{COUPON_CODE}}). PRESERVE cada placeholder EXATAMENTE como está no HTML da variante — NUNCA renomeie, traduza, abrevie ou invente tags novas. Se precisar de um placeholder num trecho que não tem (bloco criado do zero), use SOMENTE tags no padrão SECAO_CAMPO já presente nas outras variantes do documento (ex.: {{BODY_TITLE}}, {{BODY_TEXT}}, {{CTA_LABEL}}) — jamais um nome novo fora desse padrão. A correlação downstream (estrutura, copy e orçamento de caracteres) depende desses nomes exatos.`

const DEFAULT_ASSEMBLER_USER = `<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
- mood: {{mood}}
</store>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<htmls_referencia>
{{reference_template_html}}
</htmls_referencia>

<componentes_escolhidos>
{{chosen_html_json}}
</componentes_escolhidos>

<blocos_sem_variante>
{{missing_blocks_json}}
</blocos_sem_variante>

Monte AGORA o HTML completo na ordem de block_index, REUSANDO os HTMLs de <componentes_escolhidos> e, para cada item de <blocos_sem_variante>, puxando aquela seção de <htmls_referencia> (com a nota obrigatória). Harmonize num documento único com placeholders de copy e CSS variables de cor. Emita só o HTML, de <!DOCTYPE html> a </html>.`

export interface AssemblerChoice {
  block_index: number
  variant_id: string
  reasoning?: string
  brand_evidence?: string
}

// Tags de imagem canônicas ({{HERO_IMAGE}}, {{PRODUCT_1_THUMB_2}}...).
const IMAGE_TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*(?:IMAGE|THUMB)[A-Z0-9_]*)\s*\}\}/g

/**
 * Guard determinístico: tags de imagem presentes nos HTMLs das variantes
 * escolhidas mas AUSENTES no documento montado — o Montador as removeu ao
 * harmonizar (bug provado na Luxe Lift welcome#3: hero/products/body com
 * slot tagueado no input, zero tags de imagem no output → email em branco).
 * Puro, testável.
 */
export function findDroppedImageTags(
  chosenHtml: string,
  outputHtml: string,
): string[] {
  const collect = (s: string) =>
    new Set(Array.from(s.matchAll(IMAGE_TAG_PATTERN), (m) => m[1]))
  const input = collect(chosenHtml)
  const output = collect(outputHtml)
  return Array.from(input)
    .filter((t) => !output.has(t))
    .sort()
}

// ── Parsing + resolução (puro, testável) ───────────────────────────

/** Extrai o array de escolhas do output do LLM. Vazio se inválido. */
export function parseAssemblerOutput(raw: string): AssemblerChoice[] {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown
    if (!Array.isArray(json)) return []
    return json
      .filter(
        (c): c is Record<string, unknown> =>
          !!c &&
          typeof c === "object" &&
          typeof (c as Record<string, unknown>).block_index === "number" &&
          typeof (c as Record<string, unknown>).variant_id === "string",
      )
      .map((c) => ({
        block_index: c.block_index as number,
        variant_id: c.variant_id as string,
        // Campos auxiliares opcionais (telemetria/auditoria) — ignorados na
        // montagem, guardados para inspeção.
        ...(typeof c.reasoning === "string" ? { reasoning: c.reasoning } : {}),
        ...(typeof c.brand_evidence === "string"
          ? { brand_evidence: c.brand_evidence }
          : {}),
      }))
  } catch {
    return []
  }
}

/**
 * Fisher-Yates: retorna uma NOVA array embaralhada (não muta a original).
 * Usado para apresentar os candidatos ao LLM sem viés de posição — o
 * fallback determinístico continua usando a ordem por score.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Aplica as escolhas do LLM sobre os finalistas de cada bloco, com
 * fallback determinístico para o top-1. Blocos sem candidato são pulados.
 */
export function resolveChoices(
  candidatesByBlock: EmailComponentVariant[][],
  llmChoices: AssemblerChoice[],
): EmailComponentVariant[] {
  const choiceMap = new Map(llmChoices.map((c) => [c.block_index, c.variant_id]))
  const out: EmailComponentVariant[] = []
  candidatesByBlock.forEach((finalists, i) => {
    if (finalists.length === 0) return // sem candidato → pula bloco
    const chosenId = choiceMap.get(i)
    const chosen = chosenId
      ? finalists.find((v) => v.id === chosenId)
      : undefined
    out.push(chosen ?? finalists[0]) // fallback top-1
  })
  return out
}

/** Slot ordenado da estrutura do email: ou uma variante escolhida, ou um bloco
 * sem variante na biblioteca (que vira placeholder com nota no fallback). */
export type AssemblySlot =
  | { kind: "variant"; variant: EmailComponentVariant; section: string; label: string }
  | { kind: "missing"; section: string; label: string }

/** Nota obrigatória do bloco sem variante (mesma do prompt do Montador). */
export function missingBlockNote(section: string): string {
  return `<!-- bloco ${section}: nao foi encontrada referencia para esse bloco — usando reference padrao -->`
}

function referenceShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /></head>
<body style="margin:0">
<div style="max-width:600px;margin:0 auto">
${body}
</div>
</body>
</html>`
}

/** Concatena os snippets escolhidos num shell de referência 600px. */
export function assembleReferenceHtml(chosen: EmailComponentVariant[]): string {
  const body = chosen
    .map((v) => `  <!-- ${v.block_type}: ${v.name} -->\n  ${v.html.trim()}`)
    .join("\n")
  return referenceShell(body)
}

/** Extrai o documento HTML do output do LLM (remove fences + prosa ao redor). */
export function extractHtml(raw: string): string {
  let s = raw.replace(/```(?:html)?\s*/gi, "").replace(/```/g, "").trim()
  const doctype = s.search(/<!DOCTYPE html/i)
  if (doctype > 0) {
    s = s.slice(doctype)
  } else {
    const htmlOpen = s.search(/<html[\s>]/i)
    if (htmlOpen > 0) s = s.slice(htmlOpen)
  }
  const end = s.toLowerCase().lastIndexOf("</html>")
  if (end >= 0) s = s.slice(0, end + "</html>".length)
  return s.trim()
}

/** Heurística: o output parece um documento HTML de email utilizável. */
export function looksLikeHtml(s: string): boolean {
  return /<\/html>/i.test(s) && /<(div|table|body)[\s>]/i.test(s)
}

// ── Orquestração (I/O) ─────────────────────────────────────────────

export interface AssembleReferenceInput {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  brandName: string
  nicho: string
  posicionamento: string
  tomVoz: string
  mood: string
  persona: string
  // Briefing da marca (JSON serializado) — ancora as escolhas no briefing.
  briefingJson: string
  // Top 5 produtos da loja (títulos, rank asc) — o Curador cruza com
  // product_slots dos candidatos. Vazio quando a loja não tem produtos.
  topProductNames: string[]
  // Diretriz de alto nível do outline (estrutura geral): objetivo + guidance + tom.
  outlineObjective: string
  outlineGuidance: string
  outlineToneHint: string
  // Template de referência curado global (email_reference_templates) p/ este
  // flow×email — guia de estrutura/estilo para a escolha das variantes (NÃO é
  // copiado). "" quando não há curado. Independe do papel de fallback que a
  // mesma fonte mantém no build-vars (consumidor).
  referenceTemplateHtml: string
  // Estrutura geral do outline (categoria + rótulo original), na ordem. É o
  // que o Montador segue pra gerar 1 bloco por componente.
  structure: OutlineSection[]
  // Modelo default da aba Configurações — usado nos fallbacks quando o
  // agente (Curador/Montador) NÃO tem config ativa em email_agent_configs.
  defaultModel?: string | null
}

export type ReferenceSource = "llm" | "global" | "none"

export interface AssembleReferenceResult {
  html: string | null
  variantIds: string[]
  // Fonte do reference HTML deste run — informa o dispatch (settle) e a página
  // de Logs de geração: "llm" = Montador gerou; "global" = caiu no template
  // curado (email_reference_templates); "none" = sem LLM e sem global curado.
  source: ReferenceSource
  // Slots ordenados da estrutura (variante escolhida ou missing) — insumo do
  // builder determinístico de blueprint NO MESMO RUN. Não confundir com
  // variantIds (que pula os missing e por isso não casa com a estrutura).
  slots: AssemblySlot[]
}

/** Carrega as variantes ativas agrupadas por block_type. */
async function loadActiveVariantsByType(): Promise<
  Map<string, EmailComponentVariant[]>
> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_component_variants")
    .select("*")
    .eq("is_active", true)
  const byType = new Map<string, EmailComponentVariant[]>()
  if (error) {
    log.error("variants.load_failed", { error: error.message })
    return byType
  }
  for (const v of (data as EmailComponentVariant[] | null) ?? []) {
    const arr = byType.get(v.block_type) ?? []
    arr.push(v)
    byType.set(v.block_type, arr)
  }
  return byType
}

/**
 * Monta o reference HTML da loja a partir dos blocos do blueprint.
 * Retorna `html: null` quando não há nenhuma variante (consumidor cai no
 * template global).
 */
export async function assembleStoreReference(
  input: AssembleReferenceInput,
): Promise<AssembleReferenceResult> {
  const matchCtx = buildMatchContext({
    flow_type: input.flowType,
    tom_voz: input.tomVoz,
    tone_hint: input.outlineToneHint,
  })

  const sections = input.structure.map((s) => s.section)
  const poolByType = await loadActiveVariantsByType()
  const candidatesByBlock: EmailComponentVariant[][] = sections.map((section) =>
    prefilterCandidates(poolByType.get(section) ?? [], matchCtx, CHOOSER_TOP_K),
  )

  const blocksJson = JSON.stringify(
    input.structure.map((s, i) => ({
      block_index: i,
      section: s.section,
      componente: s.label,
    })),
  )
  const curatedReference = input.referenceTemplateHtml.trim()
  const t0 = Date.now()

  // Biblioteca não cobre NENHUMA seção → nem chama o LLM. Não persiste: o
  // consumidor (build-vars) cai no template global. Devolve o curado (se houver)
  // só pro Blueprint do mesmo run ter estrutura.
  if (candidatesByBlock.every((b) => b.length === 0)) {
    return {
      html: curatedReference || "",
      variantIds: [],
      source: curatedReference ? "global" : "none",
      slots: sections.map((section, i) => ({
        kind: "missing" as const,
        section,
        label: input.structure[i]?.label ?? section,
      })),
    }
  }

  // Memória do Curador: escolha do email anterior desta loja (coerência) +
  // escolhas do mesmo email em outras lojas do org (variedade). Best-effort —
  // nunca derruba a geração; org_id resolvido aqui é reusado no log.
  const memory = await loadCuradorMemory(
    input.storeId,
    input.flowType,
    input.emailNumber,
  )

  // ── PASSO A — Curador: escolhe 1 variant_id por seção SÓ pela descrição.
  // O HTML das variantes NÃO entra aqui — evita gasto de input token com HTML
  // que não será usado (variantes rejeitadas).
  const chooserRow = await loadActiveAgentConfig("assembler_chooser")
  const chooserConfig: AgentInvokeConfig = chooserRow
    ? {
        model: chooserRow.model,
        temperature: chooserRow.temperature,
        max_tokens: chooserRow.max_tokens,
        system_prompt: chooserRow.system_prompt,
        user_template: chooserRow.user_template,
      }
    : {
        model: input.defaultModel ?? DEFAULT_CHOOSER_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        system_prompt: DEFAULT_CHOOSER_SYSTEM,
        user_template: DEFAULT_CHOOSER_USER,
      }

  const chooserCandidatesJson = JSON.stringify(
    candidatesByBlock.map((finalists, i) => ({
      block_index: i,
      section: sections[i],
      label: input.structure[i]?.label ?? sections[i],
      // Embaralha a APRESENTAÇÃO (não o fallback) pra remover o viés de posição
      // do Curador. Seed por (loja, flow, email, bloco): varia entre lojas e
      // entre emails, mas o mesmo email regenera igual. `candidatesByBlock`
      // segue em ordem de score → `resolveChoices` mantém o top-1 como fallback.
      // SEM html: só descrição + metadados (escolha barata).
      opcoes: seededShuffle(
        finalists,
        seedFrom(input.storeId, input.flowType, input.emailNumber, i),
      ).map((v) => ({
        variant_id: v.id,
        name: v.name,
        description: v.description ?? "",
        quando_usar: v.when_use ?? "",
        quando_nao_usar: v.when_not_use ?? "",
        objectives: v.objectives ?? [],
        tones: v.tones ?? [],
        density: v.density,
        product_slots: v.product_slots ?? 0,
        // Dados de conteúdo da variante — sinal do que o bloco EXIGE da
        // copy/loja pra funcionar (decisão jul/2026: o Curador escolhe
        // melhor sabendo o que o bloco vai pedir).
        orientacao_copy: v.copy_guidance ?? "",
        notas_implementacao: v.long_description ?? "",
        // output_schema COMPACTO (sem example/guidance — controle de
        // tokens; a versão completa vai pro blueprint/n8n, não pra cá).
        campos_copy: (v.output_schema ?? []).map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          max_len: f.max_len,
          required: f.required,
        })),
      })),
    })),
  )

  const chooserVars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    persona: input.persona,
    tom_voz: input.tomVoz,
    outline_objective: input.outlineObjective,
    outline_guidance: input.outlineGuidance,
    outline_tone_hint: input.outlineToneHint,
    // Perfil da marca (store_briefings.marca) — mesmo JSON que o Montador
    // já recebia; agora ancora TAMBÉM a escolha das variantes.
    briefing_marca: input.briefingJson,
    // Top 5 produtos da loja — cruza com product_slots dos candidatos
    // (não escolher bloco de 4 produtos em loja com 2).
    top_products:
      input.topProductNames.length > 0
        ? input.topProductNames.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "(sem produtos cadastrados)",
    blocks_json: blocksJson,
    candidates_json: chooserCandidatesJson,
    memoria: renderCuradorMemory(memory),
  }

  // Run 'running' visível na live view enquanto o LLM roda.
  const chooserRunId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler_chooser",
    agentConfigId: chooserRow?.id,
    model: chooserConfig.model,
    inputVars: { sections: input.structure.length },
  })

  let chooserRaw = ""
  let chooserTokensIn = 0
  let chooserTokensOut = 0
  let chooserCostUsd = 0
  let choices: AssemblerChoice[] = []
  let chooserError: string | null = null
  try {
    const res = await invokeAgent(chooserConfig, chooserVars)
    chooserRaw = res.raw
    chooserTokensIn = res.tokensInput
    chooserTokensOut = res.tokensOutput
    chooserCostUsd = res.costUsd
    choices = parseAssemblerOutput(res.raw)
  } catch (err) {
    chooserError = err instanceof Error ? err.message : String(err)
    log.error("assembler.chooser_failed", {
      storeId: input.storeId,
      model: chooserConfig.model,
      error: chooserError,
    })
  }

  // Slots ordenados: uma posição POR BLOCO da estrutura, na ordem. Posição com
  // candidato → variante escolhida (top-1 fallback se o LLM não escolheu/errou
  // o id); posição SEM candidato → bloco "missing" (NÃO some — o passo B puxa do
  // reference padrão; o fallback determinístico insere placeholder com nota).
  const choiceMap = new Map(choices.map((c) => [c.block_index, c.variant_id]))
  const slots: AssemblySlot[] = candidatesByBlock.map((finalists, i) => {
    const section = sections[i]
    const label = input.structure[i]?.label ?? section
    if (finalists.length === 0) return { kind: "missing", section, label }
    const id = choiceMap.get(i)
    const variant =
      (id ? finalists.find((v) => v.id === id) : undefined) ?? finalists[0]
    return { kind: "variant", variant, section, label }
  })
  const chosen = slots.flatMap((s) => (s.kind === "variant" ? [s.variant] : []))
  const missingCount = slots.filter((s) => s.kind === "missing").length

  // Registra as escolhas desta geração no histórico append-only (memória do
  // Curador). Fire-and-forget: não bloqueia o run nem falha a geração.
  const choiceEntries: ChoiceEntry[] = slots.flatMap((s) =>
    s.kind === "variant"
      ? [{ section: s.section, variant_id: s.variant.id, variant_name: s.variant.name }]
      : [],
  )
  void logCuradorChoice({
    storeId: input.storeId,
    orgId: memory.orgId,
    flowType: input.flowType,
    emailNumber: input.emailNumber,
    batchId: input.batchId,
    choices: choiceEntries,
  })

  await finishGenerationRun(chooserRunId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler_chooser",
    agentConfigId: chooserRow?.id,
    status: chosen.length > 0 ? "success" : "skipped",
    model: chooserConfig.model,
    errorMessage:
      chooserError ?? (chosen.length === 0 ? "no_candidates" : undefined),
    inputVars: { sections: input.structure.length },
    rawOutput: chooserRaw.slice(0, 8000),
    parsedOutput: { choices: choices.length, chosen: chosen.length },
    tokensInput: chooserTokensIn,
    tokensOutput: chooserTokensOut,
    costCents: resolveCostCents({
      model: chooserConfig.model,
      tokensInput: chooserTokensIn,
      tokensOutput: chooserTokensOut,
      costUsd: chooserCostUsd,
    }),
    durationMs: Date.now() - t0,
  })

  // Biblioteca não cobre NENHUMA seção → não há o que montar. Não persiste: o
  // consumidor (build-vars) cai no template global. Devolve o curado (se
  // houver) só pro Blueprint do mesmo run ter estrutura.
  if (chosen.length === 0) {
    return {
      html: curatedReference || "",
      variantIds: [],
      source: curatedReference ? "global" : "none",
      slots,
    }
  }

  // ── PASSO B — Montador: recebe SÓ o HTML COMPLETO das escolhidas e monta.
  const harmRow = await loadActiveAgentConfig("assembler")
  const harmConfig: AgentInvokeConfig = harmRow
    ? {
        model: harmRow.model,
        temperature: harmRow.temperature,
        max_tokens: harmRow.max_tokens,
        system_prompt: harmRow.system_prompt,
        user_template: harmRow.user_template,
      }
    : {
        model: input.defaultModel ?? DEFAULT_MODEL,
        temperature: 0.3,
        max_tokens: 16384,
        system_prompt: DEFAULT_ASSEMBLER_SYSTEM,
        user_template: DEFAULT_ASSEMBLER_USER,
      }

  // chosen + missing carregam block_index (posição na sequência) pra o Montador
  // intercalar os dois na ordem certa.
  const chosenHtmlJson = JSON.stringify(
    slots.flatMap((s, i) =>
      s.kind === "variant"
        ? [{
            block_index: i,
            section: s.section,
            label: s.label,
            name: s.variant.name,
            html: s.variant.html,
            // Notas de implementação da variante (quirks de Outlook, VML,
            // hospedagem de asset...) — o Montador RESPEITA ao harmonizar,
            // sem copiá-las pro HTML. Vazio quando não curadas.
            notas_implementacao: s.variant.long_description ?? "",
          }]
        : [],
    ),
  )
  const missingBlocksJson = JSON.stringify(
    slots.flatMap((s, i) =>
      s.kind === "missing"
        ? [{ block_index: i, section: s.section, label: s.label }]
        : [],
    ),
  )

  const harmVars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    persona: input.persona,
    tom_voz: input.tomVoz,
    mood: input.mood,
    outline_objective: input.outlineObjective,
    outline_guidance: input.outlineGuidance,
    outline_tone_hint: input.outlineToneHint,
    reference_template_html: input.referenceTemplateHtml,
    chosen_html_json: chosenHtmlJson,
    missing_blocks_json: missingBlocksJson,
  }

  const t1 = Date.now()
  const harmRunId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: harmRow?.id,
    model: harmConfig.model,
    inputVars: {
      sections: input.structure.length,
      chosen: chosen.length,
      missing: missingCount,
    },
  })
  let harmRaw = ""
  let harmTokensIn = 0
  let harmTokensOut = 0
  let harmCostUsd = 0
  let html = ""
  let usedLlm = false
  let harmError: string | null = null
  try {
    const res = await invokeAgent(harmConfig, harmVars)
    harmRaw = res.raw
    harmTokensIn = res.tokensInput
    harmTokensOut = res.tokensOutput
    harmCostUsd = res.costUsd
    const extracted = extractHtml(res.raw)
    if (looksLikeHtml(extracted)) {
      html = extracted
      usedLlm = true
    } else {
      harmError = "llm_output_not_html"
    }
  } catch (err) {
    harmError = err instanceof Error ? err.message : String(err)
    log.error("assembler.harmonizer_failed", {
      storeId: input.storeId,
      model: harmConfig.model,
      error: harmError,
    })
  }

  const variantIds = chosen.map((v) => v.id)

  // Guard: o Montador removeu tags de imagem das variantes ao harmonizar?
  // Warning + telemetria (image_tags_dropped nos Logs de geração) — sem
  // derrubar o run, mas visível para auditoria imediata.
  let droppedImageTags: string[] = []
  if (usedLlm) {
    droppedImageTags = findDroppedImageTags(chosenHtmlJson, html)
    if (droppedImageTags.length > 0) {
      log.warn("assembler.image_tags_dropped", {
        storeId: input.storeId,
        flowType: input.flowType,
        emailNumber: input.emailNumber,
        model: harmConfig.model,
        droppedImageTags,
      })
    }
  }

  // Fonte do reference deste run. "llm" = Montador gerou HTML válido. Caso
  // contrário (timeout/erro/output não-HTML), NÃO geramos HTML degradado nem
  // persistimos: caímos no HTML reference global curado
  // (email_reference_templates) do mesmo flow×email, que o consumidor
  // (build-vars) já resolve via cascata store→global. Não sobrescrever
  // store_email_references preserva um reference bom de geração anterior e
  // deixa o global vencer (era a intenção já documentada no dispatch).
  const source: ReferenceSource = usedLlm
    ? "llm"
    : curatedReference
      ? "global"
      : "none"

  if (usedLlm) {
    await upsertStoreReference(input, html, variantIds, harmConfig.model)
  } else {
    // html devolvido = o global curado (ou "" se não houver) — usado só pelo
    // Blueprint do mesmo run pra extrair a estrutura; NÃO é persistido.
    html = curatedReference
    const logCtx = {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      error: harmError,
    }
    if (source === "global") {
      log.info("assembler.fallback_global_reference", logCtx)
    } else {
      log.warn("assembler.fallback_no_global_reference", logCtx)
    }
  }

  await finishGenerationRun(harmRunId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: harmRow?.id,
    status: usedLlm ? "success" : "skipped",
    model: usedLlm ? harmConfig.model : "fallback",
    errorMessage: usedLlm ? undefined : (harmError ?? undefined),
    inputVars: {
      sections: input.structure.length,
      chosen: chosen.length,
      missing: missingCount,
    },
    rawOutput: harmRaw.slice(0, 40000),
    parsedOutput: {
      used_llm: usedLlm,
      // Fonte registrada na página de Logs de geração (detalhe do run).
      reference_source: source,
      global_available: curatedReference.length > 0,
      html_chars: html.length,
      variant_ids: variantIds.length,
      missing_blocks: missingCount,
      // Guard dos slots de imagem: tags presentes nas variantes escolhidas
      // que sumiram do documento montado (deveria ser sempre []).
      image_tags_dropped: droppedImageTags,
    },
    tokensInput: harmTokensIn,
    tokensOutput: harmTokensOut,
    costCents: usedLlm
      ? resolveCostCents({
          model: harmConfig.model,
          tokensInput: harmTokensIn,
          tokensOutput: harmTokensOut,
          costUsd: harmCostUsd,
        })
      : 0,
    durationMs: Date.now() - t1,
  })

  return { html, variantIds, source, slots }
}

async function upsertStoreReference(
  input: AssembleReferenceInput,
  html: string,
  variantIds: string[],
  model: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("store_email_references").upsert(
    {
      store_id: input.storeId,
      flow_type: input.flowType,
      email_number: input.emailNumber,
      html,
      variant_ids: variantIds,
      source: "ai",
      model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,flow_type,email_number" },
  )
  if (error) {
    log.error("reference.upsert_failed", {
      storeId: input.storeId,
      error: error.message,
    })
  }
}
