/**
 * Gera `docs/email-generation/consumo-e-contratos-fase-2.html` LENDO o repo.
 *
 * Responde três perguntas por agente da fase 2 — quanto entra, quanto sai, e
 * o que exatamente atravessa a fronteira:
 *   1. CONSUMO — system prompt em chars (medido na hora), teto de saída,
 *      temperatura, preço por milhão e o custo de TETO (pior caso).
 *   2. PROVENIÊNCIA — cada var do user template cruzada com o mapa
 *      `*_VAR_ORIGINS` que o builder declara ao lado de si mesmo.
 *   3. CONTRATO — o Zod de entrada (`html/contract.ts`) e o formato estrito
 *      de saída que o parser de cada chain aceita.
 *
 * Nada é redigitado: chars vêm de `.length`, preços de `PRICING_PER_MTOK`,
 * tetos de `FMT_DEFAULTS`, origens dos mapas, e as vars saem do próprio
 * template por regex — var sem origem declarada aparece marcada, do mesmo
 * jeito que apareceria na UI do Estúdio.
 *
 * O que NÃO está aqui: o custo REAL, que mora em `email_generation_runs`.
 * O documento diz isso e deixa a query pronta.
 *
 * Uso: `node scripts/gerar-doc-consumo-fase2.mjs`
 */
import { readFileSync, writeFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

const R = fileURLToPath(new URL("../", import.meta.url))
const ler = (p) => readFileSync(R + p, "utf8")

// ── extratores ────────────────────────────────────────────────────────────
function templateLiteral(arquivo, nome) {
  const s = ler(arquivo)
  const m = new RegExp(`(?:export )?const ${nome}\\s*=\\s*\``).exec(s)
  if (!m) throw new Error(`${nome} não achado em ${arquivo}`)
  let i = m.index + m[0].length
  let j = i
  while (j < s.length) {
    if (s[j] === "\\") { j += 2; continue }
    if (s[j] === "`") break
    j++
  }
  return s.slice(i, j)
}

/**
 * Bloco `{ … }` balanceado a partir do primeiro `{` depois do marcador.
 * `depoisDoIgual` pula a anotação de tipo (`Record<string, { … }>`), que de
 * outro modo seria o primeiro `{` encontrado — foi o que fez a primeira
 * versão devolver o tipo em vez do valor.
 */
function bloco(src, marcador, depoisDoIgual = false) {
  const at = src.indexOf(marcador)
  if (at === -1) throw new Error(`marcador não achado: ${marcador}`)
  let i = depoisDoIgual ? src.indexOf("{", src.indexOf("=", at)) : src.indexOf("{", at)
  let d = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") d++
    else if (src[j] === "}") { d--; if (d === 0) return src.slice(i + 1, j) }
  }
  throw new Error(`bloco não fecha: ${marcador}`)
}

const num = (s) => Number(String(s).replace(/_/g, ""))

// ── topologia (o guard) ───────────────────────────────────────────────────
const graph = ler("src/lib/agents/studio-graph.ts")
const phase2 = /const PHASE2_KEYS = new Set\(\[([\s\S]*?)\]\)/.exec(graph)[1]
  .split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean)
const mainOrder = [...graph.matchAll(/export const MAIN_ORDER = \[([\s\S]*?)\]/g)][0][1]
  .split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter((x) => x && !x.startsWith("//"))

const visualSrc = ler("src/lib/agents/agent-visual.ts")
function visual(key) {
  const m = new RegExp(`\\n  ${key}: \\{([\\s\\S]*?)\\n  \\},`).exec(visualSrc)
  if (!m) return { name: key, color: "#374151", bg: "#F3F4F6", border: "#E5E7EB" }
  const campo = (c) => (new RegExp(`${c}: "([^"]*)"`).exec(m[1]) || [, ""])[1]
  return { name: campo("name"), color: campo("color") || "#374151", bg: campo("bg") || "#F3F4F6", border: campo("border") || "#E5E7EB" }
}

// ── config dos agentes de formatação ──────────────────────────────────────
const fmtCfg = ler("src/lib/agents/chains/format-config.ts")
const FMT_DEFAULTS = {}
for (const m of bloco(fmtCfg, "export const FMT_DEFAULTS", true)
  .matchAll(/(\w+):\s*\{\s*temperature:\s*([\d.]+),\s*maxTokens:\s*([\d_]+)\s*\}/g)) {
  FMT_DEFAULTS[m[1]] = { temperature: Number(m[2]), maxTokens: num(m[3]) }
}
const FMT_DEFAULT_MODEL = /FMT_DEFAULT_MODEL = "([^"]+)"/.exec(fmtCfg)[1]

const runner = ler("src/lib/agents/phase2-runner.service.ts")
const FMT_STEP_TIMEOUT = {}
for (const m of bloco(runner, "export const FMT_STEP_TIMEOUT", true)
  .matchAll(/(\w+):\s*\{\s*envVar:\s*"([^"]+)",\s*def:\s*([\d_]+)\s*\}/g)) {
  FMT_STEP_TIMEOUT[m[1]] = { env: m[2], def: num(m[3]) }
}
const HEADROOM = num(/BUDGET_HEADROOM_MS = ([\d_]+)/.exec(runner)[1])

// ── preço público por milhão ──────────────────────────────────────────────
const tele = ler("src/lib/agents/callbacks/telemetry.callback.ts")
const PRICING = {}
for (const m of bloco(tele, "const PRICING_PER_MTOK", true)
  .matchAll(/"([^"]+)":\s*\{\s*input:\s*([\d.]+),\s*output:\s*([\d.]+)\s*\}/g)) {
  PRICING[m[1]] = { input: Number(m[2]), output: Number(m[3]) }
}
const DEFAULT_PRICING = (() => {
  const m = /const DEFAULT_PRICING = \{ input: ([\d.]+), output: ([\d.]+) \}/.exec(tele)
  return { input: Number(m[1]), output: Number(m[2]) }
})()
const normalizeModelKey = (model) =>
  model.trim().toLowerCase().replace(/^[a-z0-9_-]+\//, "").replace(/-\d{8}$/, "").replace(/\./g, "-")
const preco = (model) => PRICING[normalizeModelKey(model)] ?? DEFAULT_PRICING
const naTabela = (model) => normalizeModelKey(model) in PRICING

// ── QA e QA vision (config in-code) ───────────────────────────────────────
const qaSrc = ler("src/lib/agents/chains/qa.chain.ts")
const QA = {
  model: /const DEFAULT_MODEL = "([^"]+)"/.exec(qaSrc)[1],
  maxTokens: num(/const DEFAULT_MAX_TOKENS = ([\d_]+)/.exec(qaSrc)[1]),
  temperature: Number(/const DEFAULT_TEMPERATURE = ([\d.]+)/.exec(qaSrc)[1]),
}
const policySrc = ler("src/lib/agents/image/model-policy.ts")
const IMG_MODELOS = [
  ["primário", /IMAGE_MODEL_PRIMARIO = "([^"]+)"/.exec(policySrc)[1]],
  ["fallback", /IMAGE_MODEL_SECUNDARIO = "([^"]+)"/.exec(policySrc)[1]],
]

const visionSrc = ler("src/lib/agents/chains/qa-vision.chain.ts")
// O prompt do qavision NÃO é constante nomeada: é template literal inline,
// com interpolação. Medimos o esqueleto (antes de as vars entrarem) e
// dizemos que é isso — chamar de "system prompt" como os outros esconderia
// que ele não tem linha em `email_agent_configs` e não é editável na tela.
const VISION_PROMPT_CHARS = (() => {
  const at = visionSrc.indexOf("const systemPrompt = `")
  if (at === -1) return 0
  let i = visionSrc.indexOf("`", at) + 1
  let j = i
  while (j < visionSrc.length) {
    if (visionSrc[j] === "\\") { j += 2; continue }
    if (visionSrc[j] === "`") break
    j++
  }
  return j - i
})()
const VISION = {
  model: /const VISION_MODEL = "([^"]+)"/.exec(visionSrc)[1],
  maxTokens: num(/const VISION_MAX_TOKENS = ([\d_]+)/.exec(visionSrc)[1]),
  temperature: Number(/const VISION_TEMPERATURE = ([\d.]+)/.exec(visionSrc)[1]),
  custoFixo: Number(/const VISION_COST_CENTS_ESTIMATE = ([\d.]+)/.exec(visionSrc)[1]),
}

// ── prompts: medidos, não transcritos ─────────────────────────────────────
const PROMPTS = {
  image: { user: ["src/lib/agents/chains/image.chain.ts", "DEFAULT_IMAGE_PROMPT_TEMPLATE"] },
  hero_section: {
    system: ["src/lib/agents/chains/hero.chain.ts", "DEFAULT_HERO_SYSTEM_PROMPT"],
    user: ["src/lib/agents/chains/hero.chain.ts", "DEFAULT_HERO_USER_TEMPLATE"],
  },
  text_format: {
    system: ["src/lib/agents/chains/text-format.chain.ts", "DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT"],
    user: ["src/lib/agents/chains/text-format.chain.ts", "DEFAULT_TEXT_FORMAT_USER_TEMPLATE"],
  },
  typography: {
    system: ["src/lib/agents/chains/typography.chain.ts", "DEFAULT_TYPOGRAPHY_SYSTEM_PROMPT"],
    user: ["src/lib/agents/chains/typography.chain.ts", "DEFAULT_TYPOGRAPHY_USER_TEMPLATE"],
  },
  color_format: {
    system: ["src/lib/agents/chains/color-format.chain.ts", "DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT"],
    user: ["src/lib/agents/chains/color-format.chain.ts", "DEFAULT_COLOR_FORMAT_USER_TEMPLATE"],
  },
  qa: {
    system: ["src/lib/agents/chains/qa.chain.ts", "DEFAULT_QA_SYSTEM_PROMPT"],
    user: ["src/lib/agents/chains/qa.chain.ts", "DEFAULT_QA_USER_TEMPLATE"],
  },
}
const medida = {}
for (const [k, v] of Object.entries(PROMPTS)) {
  medida[k] = {
    system: v.system ? templateLiteral(...v.system).length : 0,
    user: v.user ? templateLiteral(...v.user).length : 0,
    systemConst: v.system?.[1] ?? null,
    userConst: v.user?.[1] ?? null,
  }
}

// ── vars do template (o dialeto de cada um) ───────────────────────────────
const DIALETO = { image: "single", hero_section: "double", text_format: "double", typography: "double", color_format: "double", qa: "double" }
function varsDoTemplate(agente) {
  const p = PROMPTS[agente]?.user
  if (!p) return []
  const t = templateLiteral(...p)
  const re = DIALETO[agente] === "single" ? /\{(\w+)\}/g : /\{\{\s*([^#/\s}][^}]*?)\s*\}\}/g
  return [...new Set([...t.matchAll(re)].map((m) => m[1].trim()))]
}

// ── mapas de proveniência, resolvidos como o código resolve ───────────────
function parseOrigins(src, nome) {
  const b = bloco(src, `${nome}: Record<string, SegmentOrigin> = `)
  const out = {}
  const spreads = [...b.matchAll(/\.\.\.(\w+),/g)].map((m) => m[1])
  const consts = {}
  for (const m of src.matchAll(/const (\w+): SegmentOrigin = \{\s*cls:\s*"(\w+)",\s*rotulo:\s*"([^"]*)"\s*\}/g)) {
    consts[m[1]] = { cls: m[2], rotulo: m[3] }
  }
  let resto = b
  for (const m of b.matchAll(/(\w+):\s*\{\s*cls:\s*"(\w+)",\s*rotulo:\s*"([^"]*)"\s*\}/g)) {
    out[m[1]] = { cls: m[2], rotulo: m[3] }
    resto = resto.replace(m[0], "")
  }
  for (const m of resto.matchAll(/(\w+):\s*([A-Z][A-Z0-9_]*)\s*,/g)) {
    if (consts[m[2]]) out[m[1]] = consts[m[2]]
  }
  return { origens: out, spreads }
}

const ctxSrc = ler("src/lib/agents/html/format-context.ts")
const imgVarsSrc = ler("src/lib/agents/image/prompt-vars-builder.ts")
const identity = parseOrigins(ctxSrc, "const IDENTITY_ORIGINS")
function origensDe(src, nome) {
  const { origens, spreads } = parseOrigins(src, nome)
  const base = spreads.includes("IDENTITY_ORIGINS") ? { ...identity.origens } : {}
  return { ...base, ...origens }
}
const ORIGENS = {
  hero_section: origensDe(ctxSrc, "export const HERO_VAR_ORIGINS"),
  text_format: origensDe(ctxSrc, "export const TEXT_FORMAT_VAR_ORIGINS"),
  color_format: origensDe(ctxSrc, "export const COLOR_FORMAT_VAR_ORIGINS"),
  typography: origensDe(ctxSrc, "export const TYPOGRAPHY_VAR_ORIGINS"),
  image: origensDe(imgVarsSrc, "export const IMAGE_VAR_ORIGINS"),
  qa: origensDe(qaSrc, "const QA_VAR_ORIGINS"),
}

// ── schemas Zod de entrada ────────────────────────────────────────────────
const contratoSrc = ler("src/lib/agents/html/contract.ts")
const baseIdentityKeys = [...bloco(contratoSrc, "const baseIdentity = ").matchAll(/^\s*(\w+):\s*z\./gm)].map((m) => m[1])
function schemaKeys(nome) {
  const b = bloco(contratoSrc, `export const ${nome} = z.object(`)
  const keys = []
  for (const l of b.split("\n")) {
    if (/^\s*\.\.\.baseIdentity/.test(l)) keys.push(...baseIdentityKeys)
    const m = /^\s*(\w+):\s*z\./.exec(l)
    if (m) keys.push(m[1])
  }
  return [...new Set(keys)]
}
const SCHEMAS = {
  hero_section: "HeroPromptVarsSchema",
  text_format: "TextFormatPromptVarsSchema",
  color_format: "ColorFormatPromptVarsSchema",
  typography: "TypographyPromptVarsSchema",
}
const SCHEMA_KEYS = Object.fromEntries(Object.entries(SCHEMAS).map(([k, n]) => [k, schemaKeys(n)]))

const PROV_META = {}
for (const m of bloco(ler("src/lib/agents/shared/prompt-provenance.ts"), "export const PROV_CLASS_META", true)
  .matchAll(/(\w+):\s*\{\s*label:\s*"([^"]*)",\s*color:\s*"([^"]*)",\s*bg:\s*"([^"]*)",\s*border:\s*"([^"]*)"\s*\}/g)) {
  PROV_META[m[1]] = { label: m[2], color: m[3], bg: m[4], border: m[5] }
}

// ── anotação curada: a carga de cada var (o que é grande, e por quê) ──────
// Só o que NÃO é curto. O resto sai como "curto" por default — e a régua é
// simples: entra na conta de tokens de forma perceptível?
const CARGA = {
  hero_region_html: ["grande", "o insumo principal do agente"],
  hero_variant_html: ["grande", "vai VAZIA quando a hero foi enxertada"],
  hero_variant_rendered_html: ["grande", "zerada quando o modo visão está em uso"],
  hero_variant_schema_json: ["médio", "JSON indentado"],
  hero_content_json: ["médio", "uma entrada por campo da hero"],
  hero_design_system_block: ["médio", "seção <design_system> pronta"],
  logo_light: ["médio", "markup do logo inteiro"],
  logo_dark: ["médio", "markup do logo inteiro"],
  montador_html: ["vazio", "var LEGADA — o builder não a preenche; vai sempre vazia ao modelo"],
  hero_image_alt: ["vazio", "literal \"\" no builder, embora o system mande preenchê-la"],
  html: ["grande", "o DOCUMENTO INTEIRO — só este agente ainda o recebe"],
  blocks_with_content_json: ["grande", "só os blocos ainda abertos"],
  fields_json: ["médio", "só dos blocos ainda abertos"],
  top_products_json: ["médio", "até cinco, com preço e link"],
  inventario: ["grande", "numerado, e entra NO LUGAR do documento"],
  font_whitelist: ["médio", "lista fechada — o que estiver fora é descartado"],
  color_inventory_json: ["grande", "anotado com os pares texto↔fundo; entra NO LUGAR do documento"],
  pesquisa_full_text: ["grande", "texto corrido, sem corte"],
  brand_colors: ["médio", "cada cor com o papel que exerce"],
  block_views_json: ["grande", "o maior insumo do QA"],
  blocks_json: ["grande", "para o QA comparar com o que saiu"],
  block_contracts_json: ["médio", "campos e limites por bloco"],
  briefing_json: ["médio", "as seções aprovadas"],
  brand_json: ["médio", "paleta, fontes e logos"],
  advisor_max_notes: ["grande", "trechos recuperados por busca"],
  IMAGE_SLOTS: ["grande", "uma seção por campo de imagem"],
  PHOTO_DIRECTION: ["grande", "a fonte principal da cena"],
  IMAGE_BRIEF: ["médio", "o que a imagem precisa mostrar"],
  INTENCAO_VISUAL: ["médio", "entra ACIMA da direção da variante"],
}
const PESO_CLASSE = { grande: "g", médio: "m", vazio: "v" }

// ── ficha de consumo e contrato, por nó ───────────────────────────────────
// O que é medido sai das constantes acima; aqui fica só o que é leitura de
// código: de onde vem o token gravado e qual é o formato aceito na saída.
const FICHA = {
  image: {
    llm: true,
    modelo: () =>
      `<code>OPENROUTER_IMAGE_MODEL</code> ou a política de <code>image/model-policy.ts</code> — ` +
      IMG_MODELOS.map(([papel, m]) => {
        const p = preco(m)
        return `${papel} <code>${m}</code> (${usd(p.input)}/${usd(p.output)} por MTok${naTabela(m) ? "" : ", <b>fora da tabela</b>"})`
      }).join(" · "),
    teto: () => "não usa <code>FMT_DEFAULTS</code> — o teto é de tempo (90 s/chamada, corpo 300 s)",
    temp: () => "—",
    token: {
      tipo: "real", curto: "real (regex)",
      nota: "<code>extractUsage</code> (image.chain.ts:269) lê <code>prompt_tokens</code>/<code>completion_tokens</code>/<code>cost</code> por <b>regex</b> num recorte de 600 chars a partir de <code>\"usage\"</code> — nunca <code>JSON.parse</code>, porque o corpo carrega ~5 MB de base64. O custo vai direto para centavos na linha 832, <b>sem passar por <code>resolveCostCents</code></b>: é o USD real do OpenRouter, então a tabela de preço não entra. Quando o provedor não reporta <code>cost</code>, grava <b>zero</b> em vez de estimar.",
      alerta: "<code>onMeta</code> é <b>opt-in</b>: sem o callback, o usage nem é extraído. E até 08/09 o runner de e-mail gravava <code>ctx.imageConfig?.model</code> — o modelo <em>pedido</em> —, então imagem feita pelo fallback aparecia como se o primário tivesse funcionado.",
    },
    saida: "<b>URL</b> assinada do Storage (<code>Promise&lt;string&gt;</code>). Nunca base64 para o caller. A extração tenta, nesta ordem: campo <code>url</code> → <code>data:image/…;base64</code> → <code>b64_json</code>. Corpo vazio ou só whitespace vira <code>OpenRouterMidStreamError</code> retryable.",
    contrato: null,
  },
  copy_merge: { llm: false, custoZero: "É código. A run existe (<code>model: \"deterministic\"</code>) e grava <b>0 tokens</b>, <b>0 centavos</b> — zero legítimo, indistinguível de zero por falha de captura.", saida: "documento completo, com a copy escrita por splice na âncora <code>example</code> de cada campo. Métricas próprias no run: <code>slots_total</code>, <code>ops_built</code>, <code>merged</code>, <code>left_for_llm</code>, <code>unanchored_keys</code>." },
  hero_section: {
    llm: true, fmt: "hero_section",
    token: { tipo: "real", curto: "real do provedor", nota: "Vem de <code>parseOpenRouterBody</code> (<code>openrouter-invoke.ts</code>) pelo <code>format-invoke</code>, com o <code>cost</code> real quando o provedor reporta. É o caminho confiável." },
    saida: "<b>FRAGMENTO</b> entre <code>&lt;CFY_HERO_OUTPUT&gt;</code>…<code>&lt;/CFY_HERO_OUTPUT&gt;</code>. <code>parseHeroFragment</code> exige o wrapper, tira o relatório vazado (com ou sem tags), <b>rejeita documento completo</b> (<code>&lt;!DOCTYPE|&lt;html|&lt;body</code>) e cobra que o fragmento comece em <code>&lt;tr&gt;</code> <b>ou</b> <code>&lt;table&gt;</code> — e que a forma <b>espelhe</b> a da região recebida (<code>heroShapeOf</code>). O splice é por código. O relatório (<code>&lt;CFY_HERO_REPORT&gt;</code>) é <b>opcional por design</b>: ausente não derruba nada.",
    contrato: "hero_section",
  },
  text_format: {
    llm: true, fmt: "text_format",
    token: { tipo: "real", curto: "real — quando roda", nota: "Mesmo caminho do hero. Só que <b>quase nunca roda</b>: com <code>textFieldsTotal &gt; 0</code> o step grava <code>skipped / merge_por_exemplo</code> com <b>0 tokens</b> e <code>model: \"deterministic\"</code>. O teto de 65.536 tokens de saída — o maior da fase 2, e o mais caro se um dia voltar — é herança do tempo em que ele reescrevia o documento inteiro." },
    saida: "o <b>documento completo</b>, de <code>&lt;!DOCTYPE&gt;</code> a <code>&lt;/html&gt;</code>. <code>textFormatGuard</code> reprova em quatro casos: contagem de tabelas mudou (<code>table_count</code>), documento encolheu abaixo de 90% (<code>shrunk</code>), alguma tag de imagem sumiu (<code>image_tags_dropped</code>) ou as sentinelas da hero se perderam (<code>hero_sentinels_lost</code>). O guard <b>não corrige</b> — quem decide é o runner.",
    contrato: "text_format",
  },
  image_format: { llm: false, custoZero: "Tem nome de agente e é código desde a 20261044. Grava <b>0 tokens</b>. A entrada em <code>FMT_DEFAULTS</code> (8.192 · temp 0.2) e a de <code>FMT_STEP_TIMEOUT</code> (180 s) sobrevivem sem serem lidas; <code>ImageFormatPromptVarsSchema</code> continua em <code>contract.ts</code> <b>sem nenhum builder</b>.", saida: "documento com as URLs nos tokens, alts limpos, linhas órfãs removidas e overlay corrigido por luminância." },
  typography: {
    llm: true, fmt: "typography",
    token: { tipo: "real", curto: "real do provedor", nota: "Mesmo caminho do hero. É o nó mais barato da fase 2 por construção: recebe o inventário numerado em vez do documento, e devolve ops." },
    saida: "JSON tipado — <code>{segunda_fonte, justificativa, ops[]}</code>. Cada op endereça um <b>número de item</b> do inventário: <code>{item, fonte?: \"secundaria\", peso?, caixa?, tracking?, motivo}</code>. O parser é <b>tolerante</b>: op sem <code>item</code> inteiro é descartada em silêncio, <code>segunda_fonte</code> com <code>classe</code> fora do set vira <code>null</code>. Depois vêm os guards da régua (piso de 16px, teto de 3 rupturas de família, distância 200 entre pesos) e só então o código escreve.",
    contrato: "typography",
    extra: "<code>TypographyOpHumana</code> (o painel da tela) acrescenta <code>familia</code> e <code>tamanho_px</code>. O agente é <b>fisicamente incapaz</b> de pedi-los: o parser não tem onde colocá-los.",
  },
  color_format: {
    llm: true, fmt: "color_format",
    token: { tipo: "real", curto: "real do provedor", nota: "Mesmo caminho do hero." },
    saida: "JSON <code>{\"ops\":[…]}</code>. O vocabulário tipado tem duas ações — <code>recolor {from,to,where?}</code> e <code>replace {find,replace}</code> —, mas o chain <b>filtra só as <code>recolor</code></b>: o agente não vê o documento, então um <code>find</code> dele seria chute. <code>from</code>/<code>to</code> passam por <code>isColorLiteral</code> e <code>where</code> por <code>isColorContext</code>; ação desconhecida derruba o parse (<code>OpsParseError</code>). Aplicação por <code>applyOps</code>, que devolve os <code>skipped</code> com motivo (<code>find_not_found</code>, <code>find_ambiguous</code>, <code>hero_protected</code>, <code>overlapping_edit</code>, <code>contrast_risk</code>).",
    contrato: "color_format",
  },
  background_fit: { llm: false, custoZero: "Fail-open total, sem toggle e fora de <code>FormatAgent</code>. Quando o documento não tem box de fundo, <b>não existe run nenhuma</b> — nem <code>skipped</code>.", saida: "documento com as imagens compostas (faixa chapada + foto no tamanho que o <code>td</code> declara)." },
  qa: {
    llm: true,
    modelo: () => `<code>${QA.model}</code> (in-code) · temp ${QA.temperature} · max ${QA.maxTokens.toLocaleString("pt-BR")}`,
    teto: () => `${QA.maxTokens.toLocaleString("pt-BR")} <span class="sm">(in-code, não <code>FMT_DEFAULTS</code>)</span>`,
    temp: () => String(QA.temperature),
    token: {
      tipo: "estimado", curto: "ESTIMADO — chars ÷ 4",
      nota: "<code>tokensInput = Math.ceil((systemPrompt.length + userPrompt.length) / 4)</code> e <code>tokensOutput = Math.ceil(combinedOutput.length / 4)</code> (qa.chain.ts:998-1000). O comentário no código chama isso de <em>fallback quando o LangChain não expõe usage</em> — mas não é fallback: é o <b>único</b> caminho.",
      alerta: "O usage <b>real existe e é jogado fora</b>. <code>invokeWithTimeout</code> (:512) declara <code>Promise&lt;string&gt;</code>: no ramo OpenRouter faz <code>return or.text</code> e descarta <code>or.usage</code>; no ramo Anthropic o <code>StringOutputParser</code> descarta o mesmo. O número que chega ao banco tem a mesma coluna, o mesmo tipo e a mesma cara de medição dos outros — e não é medição.",
    },
    saida: "<code>{passed: boolean, issues: QaIssue[]}</code>, validado por Zod. <code>type</code> é enum fechado (14 valores aceitos do modelo), <code>severity</code> ∈ low|medium|high, e há campos opcionais de rastreio (<code>block_id</code>, <code>basis</code>, <code>confidence</code>). O parse é tolerante em três degraus: objeto direto → primeiro <code>{…}</code> top-level → <code>recuperarJsonTruncado</code>, que fecha o array no último item íntegro. <code>passed</code> não é do modelo: sai de <code>computePassed</code>, que reprova por severidade — e ignora <code>qa_indisponivel</code> de propósito.",
    extra: "<code>QaIssueType</code> (em <code>types/email-generation.ts</code>) é <b>mais largo</b> que o enum aceito do LLM: <code>qa_indisponivel</code>, <code>contraste_baixo</code>, <code>hero_copy_perdida</code> e <code>hero_copy_inventada</code> só podem ser emitidos por código.",
  },
  qavision: {
    llm: true,
    modelo: () => `<code>${VISION.model}</code> · temp ${VISION.temperature} · max ${VISION.maxTokens}`,
    promptNota: () =>
      `<b>${brl(VISION_PROMPT_CHARS)} chars</b> de esqueleto — e não é constante nomeada: é template literal <b>inline</b> dentro da função, com as vars interpoladas em JavaScript. Não tem linha em <code>email_agent_configs</code>, então não é editável pela tela de prompts nem pode ser trocado por migration.`,
    teto: () => `${VISION.maxTokens} <span class="sm">(in-code)</span>`,
    temp: () => String(VISION.temperature),
    token: {
      tipo: "fixo", curto: `FIXO — ${String(VISION.custoFixo).replace(".", ",")} centavo`,
      nota: `<code>VISION_COST_CENTS_ESTIMATE = ${VISION.custoFixo}</code> é uma <b>constante</b>: toda checagem de visão custa o mesmo no relatório, tenha analisado uma imagem ou três. O próprio comentário do arquivo pede para refinar “quando a chain expuser <code>response.usage</code>”.`,
      alerta: "E não há linha própria: <code>qavision</code> <b>nunca é gravado como <code>agent</code></b> — o bucket é derivado em SQL do <code>parsed_output</code> da run <code>qa</code>. Quem somar <code>cost_cents</code> por agente <b>não vê</b> este custo separado.",
    },
    saida: "issues visuais somadas às do QA (três tipos: paleta, reserva de overlay, cena inadequada).",
  },
}

// ── guard: cobre exatamente PHASE2_KEYS ───────────────────────────────────
const doDoc = Object.keys(FICHA)
const faltando = phase2.filter((k) => !doDoc.includes(k))
const sobrando = doDoc.filter((k) => !phase2.includes(k))
if (faltando.length || sobrando.length) {
  throw new Error(`divergência com PHASE2_KEYS — falta: [${faltando}] sobra: [${sobrando}]`)
}
const ordem = mainOrder.filter((k) => phase2.includes(k))
const ordemFinal = [...ordem, ...phase2.filter((k) => !ordem.includes(k))]

// ── derivados de consumo ──────────────────────────────────────────────────
const brl = (n) => n.toLocaleString("pt-BR")
const usd = (n) => "$" + n.toFixed(n < 0.01 ? 4 : n < 1 ? 3 : 2)
const TOKENS_POR_CHAR = 4 // a MESMA aproximação que o qa.chain usa; aqui é declarada

function consumo(k) {
  const f = FICHA[k]
  if (!f.llm) return null
  const m = medida[k]
  const chars = (m?.system ?? 0) + (m?.user ?? 0)
  const modelo = k === "qa" ? QA.model : k === "qavision" ? VISION.model : k === "image" ? "" : FMT_DEFAULT_MODEL
  const p = modelo ? preco(modelo) : null
  const teto = f.fmt ? FMT_DEFAULTS[f.fmt].maxTokens : k === "qa" ? QA.maxTokens : k === "qavision" ? VISION.maxTokens : 0
  const tokensPrompt = chars ? Math.ceil(chars / TOKENS_POR_CHAR) : 0
  return {
    chars, modelo, p, teto, tokensPrompt,
    pisoEntrada: p && tokensPrompt ? (tokensPrompt / 1e6) * p.input : null,
    tetoSaida: p && teto ? (teto / 1e6) * p.output : null,
    temperatura: f.fmt ? FMT_DEFAULTS[f.fmt].temperature : k === "qa" ? QA.temperature : k === "qavision" ? VISION.temperature : null,
  }
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const SELO_TOKEN = {
  real: ["real", "#065F46", "#ECFDF5", "#A7F3D0"],
  estimado: ["estimado", "#92400E", "#FFFBEB", "#FDE68A"],
  fixo: ["fixo", "#9A3412", "#FFF7ED", "#FED7AA"],
  zero: ["zero", "#4B5563", "#F9FAFB", "#E5E7EB"],
}

// ── tabela-mestra ─────────────────────────────────────────────────────────
let linhas = ""
for (const k of ordemFinal) {
  const f = FICHA[k], v = visual(k), c = consumo(k)
  const tok = f.llm ? f.token : { tipo: "zero", curto: "0 — é código" }
  const [, cor, bg, bd] = SELO_TOKEN[tok.tipo]
  linhas += `<tr>
    <td><span class="dot" style="background:${v.color}"></span><b>${v.name}</b><br><code class="k">${k}</code></td>
    <td class="sm">${c
      ? c.chars ? `${brl(c.chars)} chars`
        : k === "qavision" ? `${brl(VISION_PROMPT_CHARS)} chars <span class="sm">(inline)</span>` : "—"
      : '<span class="nao">código</span>'}</td>
    <td class="sm num">${c && c.teto ? brl(c.teto) : "—"}</td>
    <td class="sm num">${c && c.temperatura != null ? String(c.temperatura).replace(".", ",") : "—"}</td>
    <td class="sm">${c && c.p ? `${usd(c.p.input)} / ${usd(c.p.output)}` : "—"}</td>
    <td class="sm num">${c && c.tetoSaida != null ? usd(c.tetoSaida) : "—"}</td>
    <td><span class="selo-mini" style="color:${cor};background:${bg};border-color:${bd}">${tok.curto}</span></td>
  </tr>`
}

// ── bloco por nó ──────────────────────────────────────────────────────────
function tabelaVars(k) {
  const vars = varsDoTemplate(k)
  if (!vars.length) return ""
  const or = ORIGENS[k] || {}
  const sk = SCHEMA_KEYS[k] || null
  // Vars adjacentes com a MESMA origem e sem carga própria viram UMA linha:
  // doze repetições de "Papéis de cor — deriveColorRoles" empurram para fora
  // da tela justamente as vars que carregam peso.
  const grupos = []
  for (const nome of vars) {
    const o = or[nome]
    const carga = CARGA[nome]
    const chave = carga ? `@${nome}` : `${o?.cls ?? "??"}|${o?.rotulo ?? ""}`
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.chave === chave && !carga) ultimo.nomes.push(nome)
    else grupos.push({ chave, nomes: [nome], o, carga })
  }
  let tr = ""
  for (const g of grupos) {
    const meta = g.o ? PROV_META[g.o.cls] : null
    const nomes = g.nomes.map((n) => `<code>${esc(n)}</code>`).join(" ")
    tr += `<tr>
      <td>${nomes}${g.carga ? ` <span class="carga ${PESO_CLASSE[g.carga[0]]}">${g.carga[0]}</span>` : ""}${g.nomes.length > 1 ? ` <span class="sm">(${g.nomes.length})</span>` : ""}</td>
      <td>${meta
        ? `<span class="cls" style="color:${meta.color};background:${meta.bg};border-color:${meta.border}">${g.o.cls}</span> <span class="sm">${esc(g.o.rotulo)}</span>`
        : '<span class="cls" style="color:#B45309;background:#FFFBEB;border-color:#C27803">origem não declarada</span>'}</td>
      <td class="sm">${g.carga ? esc(g.carga[1]) : ""}</td>
      ${sk ? `<td class="sm ctr">${g.nomes.every((n) => sk.includes(n)) ? "✓" : '<b title="no template e fora do contrato">fora</b>'}</td>` : ""}
    </tr>`
  }
  const extras = sk ? sk.filter((x) => !vars.includes(x)) : []
  return `<div class="rolagem"><table class="mini">
  <thead><tr><th>var</th><th>origem declarada</th><th>carga</th>${sk ? "<th>Zod</th>" : ""}</tr></thead>
  <tbody>${tr}</tbody></table></div>
  ${extras.length ? `<p class="nota mini-nota">No contrato Zod e <b>não</b> no template: ${extras.map((x) => `<code>${x}</code>`).join(" ")} — ${k === "hero_section" ? "<code>output_contract</code> é injetada pelo chain no <code>renderVars</code>, depois do builder; <code>hero_variant_design_system</code> é consumida na montagem do bloco de design." : "campos exigidos pelo contrato que o template default não referencia."}</p>` : ""}`
}

let blocos = ""
let i = 0
for (const k of ordemFinal) {
  const f = FICHA[k], v = visual(k), c = consumo(k)
  i++
  let corpo = ""
  if (!f.llm) {
    corpo = `<p class="obs">${f.custoZero}</p><dl><dt>Devolve</dt><dd>${f.saida}</dd></dl>`
  } else {
    const m = medida[k]
    const [rot, cor, bg, bd] = SELO_TOKEN[f.token.tipo]
    corpo += `<dl>
      <dt>Modelo</dt><dd>${f.modelo ? f.modelo() : `config do banco ou <code>${FMT_DEFAULT_MODEL}</code>`}</dd>
      <dt>Prompt in-code</dt><dd>${f.promptNota ? f.promptNota() : m && (m.system || m.user)
        ? `${m.system ? `system <b>${brl(m.system)}</b> chars (<code>${m.systemConst}</code>)` : "sem system próprio"}${m.user ? ` · user template <b>${brl(m.user)}</b> chars (<code>${m.userConst}</code>)` : ""} — ~${brl(c.tokensPrompt)} tokens só de prompt, antes de qualquer var`
        : "—"}</dd>
      <dt>Teto de saída</dt><dd>${f.teto ? f.teto() : `${brl(c.teto)} tokens · temperatura ${String(c.temperatura).replace(".", ",")} <span class="sm">(<code>FMT_DEFAULTS.${f.fmt}</code>, sobrescrito por <code>max_tokens</code> da config)</span>`}</dd>
      ${c.p ? `<dt>Preço/MTok</dt><dd>${usd(c.p.input)} entrada · ${usd(c.p.output)} saída${naTabela(c.modelo) ? "" : " <b>(default — o modelo não está na tabela)</b>"}${c.tetoSaida != null ? ` — o teto de saída sozinho vale <b>${usd(c.tetoSaida)}</b>` : ""}</dd>` : ""}
      <dt>Devolve</dt><dd>${f.saida}</dd>
    </dl>
    <div class="selo" style="color:${cor};background:${bg};border-color:${bd}"><b>Token gravado: ${rot}.</b> ${f.token.nota}</div>
    ${f.token.alerta ? `<p class="obs">${f.token.alerta}</p>` : ""}
    ${f.extra ? `<p class="obs">${f.extra}</p>` : ""}`
    const tv = tabelaVars(k)
    if (tv) {
      corpo += `<h4>O que entra, e de onde vem</h4>${tv}`
    }
  }
  blocos += `<section class="no" id="${k}">
    <h3><span class="num" style="background:${v.bg};color:${v.color};border-color:${v.border}">${i}</span>
      ${v.name} <code class="k">${k}</code>
      ${f.llm ? '<span class="sim">LLM</span>' : '<span class="nao">código</span>'}</h3>
    ${corpo}
  </section>`
}

// ── documento ─────────────────────────────────────────────────────────────
const comLlm = ordemFinal.filter((k) => FICHA[k].llm)
const somaPrompt = comLlm.reduce((a, k) => a + (medida[k]?.system ?? 0) + (medida[k]?.user ?? 0), 0)
const tetoCaro = comLlm
  .map((k) => [k, consumo(k)])
  .filter(([, c]) => c.tetoSaida != null)
  .sort((a, b) => b[1].tetoSaida - a[1].tetoSaida)[0]

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Consumo e contratos da fase 2</title>
<style>
:root{--bg:#FBFBFA;--card:#FFF;--ink:#1F2328;--mut:#6B7280;--line:#E5E7EB;--code:#F6F7F9}
@media (prefers-color-scheme:dark){:root{--bg:#0F1115;--card:#171A20;--ink:#E7E9EC;--mut:#9AA1AC;--line:#272B33;--code:#12151A}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding-block:40px;padding-left:20px;padding-right:20px}
.wrap{max-width:940px;margin:0 auto}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
.lead{color:var(--mut);margin:0 0 24px;max-width:70ch}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:40px 0 12px;font-weight:600}
h4{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:18px 0 8px;font-weight:600}
code{font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
code.k{background:transparent;padding:0;color:var(--mut)}
table{width:100%;min-width:760px;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}
table.mini{min-width:600px;font-size:12.5px}
table.mini td:first-child code{white-space:nowrap}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);padding:9px 10px;border-bottom:1px solid var(--line);font-weight:600}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.sm{color:var(--mut);font-size:12.5px}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.ctr{text-align:center}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px}
.sim,.nao{font-size:11px;padding:1px 7px;border-radius:20px;font-weight:600;white-space:nowrap}
.sim{background:#EEF2FF;color:#3730A3}.nao{background:#F3F4F6;color:#4B5563}
@media (prefers-color-scheme:dark){.sim{background:#1E1B4B;color:#C7D2FE}.nao{background:#1F2937;color:#D1D5DB}}
.selo-mini,.cls{font-size:11px;padding:1px 7px;border-radius:4px;border:1px solid;white-space:nowrap;font-weight:600}
.carga{font-size:10px;font-weight:700;padding:0 5px;border-radius:3px;vertical-align:1px}
.carga.g{background:#FEE2E2;color:#991B1B}.carga.m{background:#FEF3C7;color:#92400E}.carga.v{background:#F3F4F6;color:#4B5563}
@media (prefers-color-scheme:dark){.carga.g{background:#450A0A;color:#FCA5A5}.carga.m{background:#451A03;color:#FCD34D}.carga.v{background:#1F2937;color:#D1D5DB}}
.rolagem{overflow-x:auto;-webkit-overflow-scrolling:touch}
.rolaviso{display:none;font-size:12.5px;margin:0 0 8px}
@media (max-width:820px){.rolaviso{display:block}}
.no{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:20px;margin:14px 0}
.no h3{margin:0 0 12px;font-size:17px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.num-badge,.num{}
.no h3 .num{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:1px solid;font-size:12px;font-weight:700;flex:none}
dl{display:grid;grid-template-columns:140px 1fr;gap:6px 14px;margin:0 0 6px;font-size:13.5px}
@media (max-width:560px){dl{grid-template-columns:1fr;gap:2px 0}dt{margin-top:8px}}
dt{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px}
dd{margin:0}
.obs{font-size:13.5px;border-left:2px solid var(--line);padding-left:12px;margin:12px 0;color:var(--ink)}
.selo{font-size:13px;padding:9px 12px;border:1px solid;border-radius:6px;margin:14px 0 4px}
.aviso{background:#FFFBEB;border:1px solid #FDE68A;color:#78350F;border-radius:8px;padding:16px 18px;margin:0 0 24px;font-size:13.5px}
@media (prefers-color-scheme:dark){.aviso{background:#2A1F07;border-color:#78350F;color:#FDE68A}}
.aviso b{color:inherit}
pre{background:var(--code);border:1px solid var(--line);border-radius:6px;padding:13px;overflow-x:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:10px 0 0;white-space:pre-wrap;word-break:break-word}
.nota{font-size:13.5px;color:var(--mut);max-width:74ch}
.mini-nota{margin:8px 0 0}
ul{padding-left:20px;font-size:14px}li{margin:7px 0}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);color:var(--mut);font-size:12.5px}
</style></head><body><div class="wrap">

<h1>Quanto entra, quanto sai</h1>
<p class="lead">Por agente da fase 2: o tamanho do prompt, o teto de saída e o preço; a <b>procedência de cada var</b> que o prompt carrega; e o formato exato que o parser aceita de volta. São ${ordemFinal.length} nós — <b>${comLlm.length}</b> chamam modelo, e os prompts in-code deles somam <b>${brl(somaPrompt)} chars</b> antes de uma única variável ser preenchida.</p>

<div class="aviso">
<b>O custo REAL não foi medido aqui.</b> Ele mora em <code>email_generation_runs</code>, e esta geração não teve acesso ao banco — o conector do Supabase está desconectado nesta sessão. Tudo o que está abaixo sai do <b>código</b>: chars medidos por <code>.length</code>, tetos de <code>FMT_DEFAULTS</code>, preços de <code>PRICING_PER_MTOK</code>. Onde a coluna diz “teto de saída”, é o <b>pior caso</b>, não a média.<br><br>
Para os números de produção, a query está pronta no fim do documento — e vale ler antes a seção “quatro números que não são medição”, porque somar <code>tokens_input</code> por agente <b>mistura</b> medida real com estimativa.
</div>

<h2>A tabela, nó a nó</h2>
<p class="nota rolaviso">Tabela larga — role para o lado para ver todas as colunas.</p>
<div class="rolagem"><table>
<thead><tr><th>Nó</th><th>Prompt in-code</th><th>Teto de saída</th><th>Temp.</th><th>Preço/MTok (in/out)</th><th>Teto de saída em $</th><th>Token gravado</th></tr></thead>
<tbody>${linhas}</tbody></table></div>
<p class="nota">O “prompt in-code” é o piso: é o que o agente carrega <b>antes</b> de qualquer var. Num e-mail real quem domina a entrada é a var grande de cada um — a região da hero, o inventário, as views por bloco —, e ela varia por peça. O maior teto de saída da fase 2 é o do <code>${tetoCaro[0]}</code>: <b>${brl(tetoCaro[1].teto)} tokens</b>, ${usd(tetoCaro[1].tetoSaida)} se fosse gasto inteiro.</p>

<h2>Nó a nó</h2>
${blocos}

<h2>Quatro números que não são medição</h2>
<p class="nota">As colunas <code>tokens_input</code>, <code>tokens_output</code> e <code>cost_cents</code> de <code>email_generation_runs</code> têm o mesmo tipo e a mesma cara para todos os agentes. Não têm o mesmo significado:</p>
<ul>
<li><b><code>qa</code> estima <code>chars ÷ 4</code></b> e <b>descarta o usage real</b> que veio na resposta — <code>invokeWithTimeout</code> devolve <code>Promise&lt;string&gt;</code> e joga fora o <code>usage</code> do OpenRouter e o do LangChain. É o único agente cujo número de entrada é inventado.</li>
<li><b><code>qavision</code> grava ${String(VISION.custoFixo).replace(".", ",")} centavo fixo</b>, e nem tem linha própria: o bucket é derivado em SQL da run do <code>qa</code>. Somar custo por agente não o enxerga.</li>
<li><b><code>image</code></b> lê o usage por <b>regex</b> (o corpo tem megabytes de base64) e usa o <b>custo real</b> do OpenRouter direto, sem <code>resolveCostCents</code> — bom, com uma ressalva: provedor que não reporta <code>cost</code> grava <b>zero</b>, e a captura inteira depende do callback <code>onMeta</code> ser passado.</li>
<li><b><code>copy_merge</code>, <code>image_format</code>, <code>background_fit</code> e o <code>text_format</code> pulado</b> gravam zero com <code>model: "deterministic"</code>. Zero legítimo — indistinguível, na coluna, de zero por falha de captura.</li>
</ul>
<p class="nota">E um que atinge todos: <code>finishGenerationRun</code> usa <code>?? 0</code> em <code>tokens_input</code>, <code>tokens_output</code>, <code>cost_cents</code> e <code>duration_ms</code>, enquanto os campos vizinhos usam <code>?? undefined</code> com o comentário explicando por quê (omitir preserva o que o start gravou). Um finish sem usage <b>zera</b> em vez de preservar.</p>

<h2>Onde ler o consumo hoje</h2>
<ul>
<li><code>GET /api/admin/email-generation-logs</code> — devolve <code>by_agent</code> com <code>avg_tokens_in</code>/<code>avg_tokens_out</code>: <b>médias</b>, não somas. Responde “quanto costuma custar uma run”, não “quanto este agente gastou”.</li>
<li><code>GET /api/admin/ai-usage</code> — soma de verdade, mas por <b>feature</b>, não por agente.</li>
<li>Nenhuma das duas responde “quanto o <code>color_format</code> gastou no mês”. Para isso, a query direta:</li>
</ul>
<pre>select agent,
       count(*)                       as runs,
       sum(tokens_input)              as tok_in,
       sum(tokens_output)             as tok_out,
       round(sum(cost_cents)::numeric, 2) as cents,
       count(*) filter (where status = 'error')   as erros,
       count(*) filter (where status = 'skipped') as pulados
from email_generation_runs
where created_at &gt;= now() - interval '30 days'
  and agent in (${ordemFinal.map((k) => `'${k}'`).join(", ")})
group by agent
order by cents desc;</pre>
<p class="nota">Lendo o resultado: <code>qa</code> tem número de entrada estimado, <code>qavision</code> não aparece (está dentro do <code>qa</code>), e as linhas com <code>cents = 0</code> podem ser código determinístico <b>ou</b> captura perdida — a coluna não distingue.</p>

<h2>Como a proveniência é garantida</h2>
<p class="nota">A tabela de vars de cada nó acima não foi transcrita: ela cruza as vars que o <b>template referencia</b> com o mapa <code>*_VAR_ORIGINS</code> que fica declarado <b>ao lado do builder</b> — quem sabe de onde o valor veio é quem o monta, e re-derivar depois é o modo de falha que isso elimina. Var sem origem declarada aparece marcada, exatamente como apareceria no Estúdio.</p>
<p class="nota">O guard, em produção, é a <b>recomposição</b>: <code>buildSegmentedPrompt</code> devolve <code>{prompt, segments}</code> e cada chain compara o <code>prompt</code> recomposto, byte a byte, com o que realmente vai ao modelo. Divergiu — config antiga com <code>{{#if}}</code>, renderer diferente — grava sem marcação em vez de gravar marcação errada. Três dialetos convivem: <code>{{var}}</code> com helpers (hero, texto, tipografia, cores), <code>{var}</code> (o prompt de imagem in-code) e o renderer estrito do <code>qa</code>.</p>

<h2>O contrato de entrada não derruba nada em produção</h2>
<p class="nota">Os quatro schemas de <code>html/contract.ts</code> são <b>todos obrigatórios</b> — nenhum <code>.optional()</code> — e <code>validateVars</code> se comporta de dois jeitos: em dev e teste <code>schema.parse</code> <b>lança</b>; em produção é <code>safeParse</code>, e a falha vira <code>log.warn("contract.drift")</code> mais uma entrada num mapa. <b>As vars seguem intactas para o prompt.</b></p>
<p class="nota">Esse mapa é drenado por <code>takeContractDrift(agent)</code> — chamado para <b>dois</b> dos quatro agentes (<code>typography</code> e <code>color_format</code>). Drift em <code>hero_section</code> ou <code>text_format</code> fica só no log e é apagado do mapa na chamada seguinte, sem nunca chegar à telemetria da run.</p>
<p class="nota">Duas assimetrias no próprio contrato: <code>ColorFormatPromptVarsSchema</code> valida os <code>color_*</code> como <code>z.string()</code> <b>sem</b> o <code>HEX_RE</code> que o <code>baseIdentity</code> exige dos outros — recebendo os mesmos valores, do mesmo <code>identityVars</code>. E <code>ImageFormatPromptVarsSchema</code> continua no arquivo <b>sem nenhum builder</b>: o agente virou código e o contrato ficou.</p>

<h2>Duas vars que viajam vazias</h2>
<ul>
<li><code>montador_html</code> está no <code>DEFAULT_HERO_USER_TEMPLATE</code> e em <code>HERO_VAR_ORIGINS</code>, mas <b>não</b> em <code>buildHeroVars</code> nem no schema Zod. O modelo recebe a tag vazia em <b>todo</b> prompt de hero. Está documentada como legada desde o CM-5 — o que sobrou é o custo de a enviar.</li>
<li><code>hero_image_alt</code> é literal <code>""</code> no builder, enquanto o system prompt manda o agente preencher o alt a partir dela.</li>
</ul>

<footer>Gerado a partir do repositório em ${new Date().toLocaleDateString("pt-BR")}. Chars medidos por <code>.length</code> nas constantes <code>DEFAULT_*</code>; tetos e temperatura de <code>chains/format-config.ts</code>; preços de <code>PRICING_PER_MTOK</code> (<code>callbacks/telemetry.callback.ts</code>); vars extraídas dos próprios templates e cruzadas com os mapas <code>*_VAR_ORIGINS</code>; contratos de <code>html/contract.ts</code>. A cobertura é conferida contra <code>PHASE2_KEYS</code> — nó novo ou removido reprova a geração.<br>Onde a config do banco (<code>email_agent_configs</code>) traz <code>model</code>, <code>temperature</code> ou <code>max_tokens</code> próprios, <b>ela vence</b> estes defaults: os números acima são o que roda quando não há config ativa.</footer>
</div></body></html>`

const destino = R + "docs/email-generation/consumo-e-contratos-fase-2.html"
writeFileSync(destino, html)
console.log("nós:", ordemFinal.join(" → "))
console.log("com LLM:", comLlm.length, "· prompts in-code somam", brl(somaPrompt), "chars")
for (const k of comLlm) {
  const c = consumo(k)
  console.log(`  ${k}: prompt ${brl(c.chars)} chars (~${brl(c.tokensPrompt)} tok) · teto ${brl(c.teto)} · teto em $ ${c.tetoSaida != null ? usd(c.tetoSaida) : "—"}`)
}
console.log("bytes:", statSync(destino).size)
