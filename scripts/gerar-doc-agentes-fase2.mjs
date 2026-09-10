/**
 * Gera `docs/email-generation/agentes-fase-2.html` LENDO o repositório.
 *
 * Existe para o documento não envelhecer em silêncio: os prompts NÃO são
 * transcritos — saem das constantes `DEFAULT_*` dos chains —, a topologia e
 * a ordem saem de `studio-graph.ts` (`PHASE2_KEYS`, `MAIN_ORDER`), e um
 * guard reprova a geração se o conjunto de nós descrito aqui divergir do
 * grafo. Nó novo na fase 2 quebra o script em vez de sumir da doc.
 *
 * O que NÃO é lido daqui: o prompt ATIVO, que mora em `email_agent_configs`
 * e vence o default in-code. `PROCEDENCIA` diz, por agente, qual migration
 * gravou por último — é o que separa "este é o prompt que roda" de "isto é
 * o fallback do repo".
 *
 * Uso: `node scripts/gerar-doc-agentes-fase2.mjs`
 */
import { readFileSync, writeFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

const R = fileURLToPath(new URL("../", import.meta.url))
const ler = (p) => readFileSync(R + p, "utf8")

// ── extrator de template literal por nome de constante ────────────────────
function templateLiteral(arquivo, nome) {
  const s = ler(arquivo)
  const m = new RegExp(`(?:export )?const ${nome}\\s*=\\s*\``).exec(s)
  if (!m) throw new Error(`${nome} não achado em ${arquivo}`)
  let i = m.end !== undefined ? m.end : m.index + m[0].length
  let j = i
  while (j < s.length) {
    if (s[j] === "\\") { j += 2; continue }
    if (s[j] === "`") break
    j++
  }
  return s.slice(i, j)
}

// ── a topologia vem do studio-graph.ts, não da minha memória ──────────────
const graph = ler("src/lib/agents/studio-graph.ts")
const phase2 = [...graph.matchAll(/const PHASE2_KEYS = new Set\(\[([\s\S]*?)\]\)/g)][0][1]
  .split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean)
const mainOrder = [...graph.matchAll(/export const MAIN_ORDER = \[([\s\S]*?)\]/g)][0][1]
  .split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter((x) => x && !x.startsWith("//"))

// ── nome e cor de cada agente saem do AGENT_VISUAL (o mesmo do Estúdio) ───
const visualSrc = ler("src/lib/agents/agent-visual.ts")
function visual(key) {
  const m = new RegExp(`\\n  ${key}: \\{([\\s\\S]*?)\\n  \\},`).exec(visualSrc)
  if (!m) return { name: key, desc: "", color: "#374151", bg: "#F3F4F6", border: "#E5E7EB" }
  const campo = (c) => (new RegExp(`${c}: "([^"]*)"`).exec(m[1]) || [, ""])[1]
  return { name: campo("name"), desc: campo("desc"), color: campo("color") || "#374151", bg: campo("bg") || "#F3F4F6", border: campo("border") || "#E5E7EB" }
}

// ── procedência do prompt: quem grava por último em email_agent_configs ───
// Varrido nas migrations; "zera" = system_prompt = '' (corte seco para o
// default in-code), "grava" = o banco tem texto próprio e VENCE o repo.
const PROCEDENCIA = {
  hero_section: { estado: "vigente", nota: "<code>20261074_reset_hero_prompt_merge_por_example.sql</code> ZEROU o prompt do banco. O texto abaixo é o que roda em produção." },
  text_format: { estado: "fallback", nota: "<code>20261039_html_split_four_agents.sql</code> gravou prompt no banco e nunca foi zerado — o banco VENCE. O texto abaixo é o fallback do repo." },
  image_format: { estado: "sem_prompt", nota: "<code>20261044_image_format_views.sql</code> zerou o prompt, e depois o step virou código puro. Não existe prompt." },
  typography: { estado: "fallback", nota: "<code>20261109_typography_agent.sql</code> criou a config COM prompt — o banco VENCE. O texto abaixo é o fallback do repo." },
  color_format: { estado: "vigente", nota: "<code>20261045_color_format_inventory.sql</code> ZEROU o prompt do banco. O texto abaixo é o que roda em produção." },
  qa: { estado: "vigente", nota: "<code>20261046_qa_views.sql</code> ZEROU o prompt do banco. O texto abaixo é o que roda em produção." },
  image: { estado: "fallback", nota: "<code>20261108_image_agent_primary_brief.sql</code> e <code>20261135_image_intencao_visual.sql</code> gravaram o template no banco — ele VENCE, e o texto abaixo está atrás dele." },
}

const PROMPTS = {
  image: [["Template de prompt", "src/lib/agents/chains/image.chain.ts", "DEFAULT_IMAGE_PROMPT_TEMPLATE"]],
  hero_section: [
    ["System", "src/lib/agents/chains/hero.chain.ts", "DEFAULT_HERO_SYSTEM_PROMPT"],
    ["User template", "src/lib/agents/chains/hero.chain.ts", "DEFAULT_HERO_USER_TEMPLATE"],
  ],
  text_format: [
    ["System", "src/lib/agents/chains/text-format.chain.ts", "DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT"],
    ["User template", "src/lib/agents/chains/text-format.chain.ts", "DEFAULT_TEXT_FORMAT_USER_TEMPLATE"],
  ],
  typography: [
    ["System", "src/lib/agents/chains/typography.chain.ts", "DEFAULT_TYPOGRAPHY_SYSTEM_PROMPT"],
    ["User template", "src/lib/agents/chains/typography.chain.ts", "DEFAULT_TYPOGRAPHY_USER_TEMPLATE"],
  ],
  color_format: [
    ["System", "src/lib/agents/chains/color-format.chain.ts", "DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT"],
    ["User template", "src/lib/agents/chains/color-format.chain.ts", "DEFAULT_COLOR_FORMAT_USER_TEMPLATE"],
  ],
  qa: [
    ["System", "src/lib/agents/chains/qa.chain.ts", "DEFAULT_QA_SYSTEM_PROMPT"],
    ["User template", "src/lib/agents/chains/qa.chain.ts", "DEFAULT_QA_USER_TEMPLATE"],
  ],
}

// ── a ficha de cada nó (medida no código, não suposta) ────────────────────
const NOS = {
  image: {
    llm: true, modelo: "config do banco · <code>OPENROUTER_IMAGE_MODEL</code> (GPT Image 2 com fallback Gemini)",
    arquivo: "phase2-runner.service.ts:872 (<code>runPhase2Image</code>) · chains/image.chain.ts",
    teto: "90 s por chamada · corpo 300 s · fase inteira 600 s · 6 em paralelo",
    falha: "fail-open", reason: "só <code>context_load_failed</code> derruba",
    pulado: "<code>text_only</code> (vai direto a ready) · brand não confirmada · <code>generate_images</code> OFF → <code>skipped/generate_images_off</code> reusando imagens de gerações anteriores",
    entra: "worklist de slots (<code>image/slot-groups.ts</code>) + vars de <code>buildImagePromptVars</code>: direção fotográfica da variante, briefing do campo, papel do bloco, marca. Anexos rotulados <code>CFY_REF_PRODUCT</code> e <code>CFY_REF_ANCHOR</code>.",
    sai: "URL da imagem em <code>email_blocks.content.images[campo]</code> + alt + luminância do overlay",
    obs: "Uma run POR SLOT, não por e-mail — é o único nó da fase 2 assim. Falha de um slot não derruba a peça: incrementa <code>imageFailures</code> e o e-mail segue para <code>image_done</code>.",
  },
  copy_merge: {
    llm: false, modelo: "—",
    arquivo: "phase2-runner.service.ts:2710 · <code>html/copy-merge.ts</code>",
    teto: "não tem — não passa por <code>executeFormatStep</code>",
    falha: "fail-closed num caso", reason: "<code>merge_sem_contrato</code>",
    pulado: "implicitamente, quando o resume já passou daqui (<code>stage != null</code>)",
    entra: "documento montado + <code>fields</code> de cada <code>email_blocks</code> (o contrato) + a região da hero",
    sai: "documento completo, com a copy escrita por splice na âncora <code>example</code> de cada campo",
    obs: "É CÓDIGO, custo zero (<code>model: \"deterministic\"</code>). Bloco com copy e SEM contrato derruba o e-mail — não existe mais derivação por tag-registry. Âncora colapsada e texto órfão suspeito são fail-open com log alto.",
  },
  hero_section: {
    llm: true, modelo: "config do banco ou <code>moonshotai/kimi-k3</code> · pode virar modelo de visão",
    arquivo: "phase2-runner.service.ts:2870 · chains/hero.chain.ts",
    teto: "180 s no runner (<code>HERO_CHAIN_TIMEOUT_MS</code>) — o chain declara 240 s para o próprio abort",
    falha: "fail-closed na 2ª tentativa", reason: "<code>hero_failed</code>",
    pulado: "toggle da aba Agentes ou override da execução manual",
    entra: "região da hero + variante canônica + copy e imagem da hero + logos claro/escuro + fontes e cores (<code>buildHeroVars</code>)",
    sai: "FRAGMENTO da região da hero — o código faz o splice",
    obs: "Dois guards derrubam a tentativa: <code>heroCopyPreserved</code> (copy que sumiu) e <code>heroTextoInventado</code> (oferta ou cupom que o agente escreveu sem existir). Na ÚLTIMA tentativa é fail-open parcial: a região do merge fica no lugar (<code>hero_fallback: regiao_do_merge</code>) e as issues aparecem no QA.",
  },
  text_format: {
    llm: true, modelo: "config do banco ou <code>moonshotai/kimi-k3</code>",
    arquivo: "phase2-runner.service.ts:3164 · chains/text-format.chain.ts",
    teto: "120 s no runner — o chain declara 540 s (herança do modo full-doc)",
    falha: "fail-closed na 2ª tentativa", reason: "<code>text_format_failed</code>",
    pulado: "<strong>quase sempre</strong> — ver observação",
    entra: "documento inteiro + blocos ainda abertos + fields do blueprint",
    sai: "documento completo reescrito (guards restauram a hero se ela for tocada)",
    obs: "<strong>Na prática não roda.</strong> Com o blueprint trazendo campos de texto (<code>textFieldsTotal &gt; 0</code>) o step grava <code>skipped / merge_por_exemplo</code> e o LLM não é chamado — o merge determinístico já fez o trabalho. Só documento legado sem schema cai no caminho antigo.",
  },
  image_format: {
    llm: false, modelo: "—",
    arquivo: "phase2-runner.service.ts:3278 · <code>html/image-merge.ts</code> + <code>html/fix-hero-overlay.ts</code>",
    teto: "não tem — a entrada de 180 s em <code>FMT_STEP_TIMEOUT</code> é código morto",
    falha: "fail-closed, sem retry", reason: "<code>image_format_failed</code>",
    pulado: "toggle ou override",
    entra: "documento do passo anterior + <code>imageMap</code> (as URLs do agente de imagem)",
    sai: "documento completo com as URLs nos tokens, alts limpos, linhas órfãs removidas e texto de overlay corrigido por luminância",
    obs: "<strong>Tem nome de agente e não é agente.</strong> O LLM morreu; a chave sobreviveu para não quebrar o grafo nem a máquina de estágios. Aqui também roda a limpeza final do documento (sentinelas, placeholders não resolvidos, atributo lang) e nascem as views que o QA vai receber.",
  },
  typography: {
    llm: true, modelo: "config do banco ou <code>moonshotai/kimi-k3</code>",
    arquivo: "phase2-runner.service.ts:3482 · chains/typography.chain.ts · <code>typography/{inventory,rules,apply}.ts</code>",
    teto: "120 s no runner — o chain declara 180 s",
    falha: "<strong>fail-open</strong>", reason: "nenhum — <code>typography_failed</code> existe e nunca é usado",
    pulado: "toggle/override · <strong>inventário vazio</strong> (<code>sem_declaracoes_de_fonte</code>) · <code>out_of_budget</code>",
    entra: "<strong>não recebe o HTML</strong> — recebe o INVENTÁRIO numerado das declarações de fonte, a lista de famílias permitida, o par heading/body da loja e o tom de voz",
    sai: "JSON de ops por NÚMERO de item (+ justificativa e segunda fonte) — o código aplica",
    obs: "É a lição do <code>text_format</code>: modelo que recebe 86 KB devolve 86 KB e quebra tabela. Guards filtram ops fora da régua (teto de rupturas de família, piso de 16px, whitelist de fontes) antes de escrever.",
  },
  color_format: {
    llm: true, modelo: "config do banco ou <code>moonshotai/kimi-k3</code>",
    arquivo: "phase2-runner.service.ts:3651 · chains/color-format.chain.ts · <code>html/color-inventory.ts</code>",
    teto: "120 s no runner — o chain declara 240 s",
    falha: "<strong>fail-open</strong>", reason: "nenhum — <code>color_format_failed</code> existe e nunca é usado",
    pulado: "toggle/override · <code>out_of_budget</code>",
    entra: "<strong>não recebe o documento</strong> — recebe o inventário de cores anotado com os pares texto↔fundo, a paleta da marca com papéis, nicho, tons e a pesquisa",
    sai: "JSON de ops <code>recolor</code>/<code>replace</code> — troca global por VALOR de cor, aplicada por código",
    obs: "Três guards depois de aplicar: paleta (cor fora da marca), contraste (texto ilegível sobre o novo fundo) e estrutural (nº de tabelas mudou pelas ops).",
  },
  background_fit: {
    llm: false, modelo: "—",
    arquivo: "phase2-runner.service.ts:3856 · <code>image/background-fit.service.ts</code>",
    teto: "não tem",
    falha: "<strong>fail-open total</strong>", reason: "nenhum — throw vira <code>log.warn</code>",
    pulado: "<strong>sem run nenhuma</strong> quando o documento não tem box de fundo",
    entra: "documento do passo de cores + blocos + a cor de superfície forte da marca",
    sai: "documento com as imagens COMPOSTAS (faixa chapada + foto no tamanho que o <code>td</code> declara)",
    obs: "Não tem toggle na aba Agentes e não está em <code>FormatAgent</code> — mas está no grafo, no <code>MAIN_ORDER</code> e no CHECK do banco.",
  },
  qa: {
    llm: true, modelo: "<code>claude-sonnet-4-6</code> · temp 0.2 · max 1500",
    arquivo: "phase2-runner.service.ts:4129 · chains/qa.chain.ts",
    teto: "180 s",
    falha: "depende do modo", reason: "<code>qa_failed</code> só em <code>enforce</code>",
    pulado: "<code>EMAIL_QA_MODE=off</code> → <code>skipped/qa_disabled_flag</code>",
    entra: "HTML final (já sem marcadores) + blocos + as views por bloco + contratos + briefing + marca",
    sai: "<code>{passed, issues[]}</code> → <code>email_flow_emails.qa_issues</code>",
    obs: "Três modos: <code>off</code> (bypass, vai a ready), <code>shadow</code> (só loga o que reprovaria), <code>enforce</code> (reprova de verdade). ANTES do LLM rodam sempre os checks determinísticos — <code>content-checks</code>, <code>render-checks</code> e <code>runSchemaChecks</code> —, e os de severidade alta reprovam junto no modo enforce. Throw catastrófico cai num fallback que passa.",
  },
  qavision: {
    llm: true, modelo: "cascata dentro do QA · até 3 imagens em paralelo",
    arquivo: "chains/qa-vision.chain.ts (<code>runQaVisionCheck</code>), chamado de dentro do <code>qa</code>",
    teto: "o do QA",
    falha: "fail-open", reason: "throw ou timeout viram 0 issues",
    pulado: "<code>EMAIL_QA_VISION_ENABLED</code> desligado",
    entra: "as imagens geradas + o contexto da peça",
    sai: "issues visuais somadas às do QA",
    obs: "<strong>Nunca é gravado como <code>agent</code></strong> — nem consta do CHECK. O bucket é DERIVADO em SQL a partir do <code>parsed_output</code> da run <code>qa</code> (<code>20261073_agent_studio_latest_runs_fn.sql</code>). No grafo aparece como nó porque o operador precisa vê-lo.",
  },
}

// ── guarda: o documento cobre exatamente PHASE2_KEYS ──────────────────────
const doDoc = Object.keys(NOS)
const faltando = phase2.filter((k) => !doDoc.includes(k))
const sobrando = doDoc.filter((k) => !phase2.includes(k))
if (faltando.length || sobrando.length) {
  throw new Error(`divergência com PHASE2_KEYS — falta: [${faltando}] sobra: [${sobrando}]`)
}
const ordem = mainOrder.filter((k) => phase2.includes(k))
const foraDaOrdem = phase2.filter((k) => !ordem.includes(k))
const ordemFinal = [...ordem, ...foraDaOrdem]

// ── HTML ──────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const SELO = {
  vigente: ["É o prompt que roda", "#065F46", "#ECFDF5", "#A7F3D0"],
  fallback: ["Fallback — o banco vence", "#92400E", "#FFFBEB", "#FDE68A"],
  sem_prompt: ["Não tem prompt", "#4B5563", "#F9FAFB", "#E5E7EB"],
}

let linhas = ""
for (const k of ordemFinal) {
  const n = NOS[k], v = visual(k)
  linhas += `<tr>
    <td><span class="dot" style="background:${v.color}"></span><b>${v.name}</b><br><code class="k">${k}</code></td>
    <td>${n.llm ? '<span class="sim">LLM</span>' : '<span class="nao">código</span>'}</td>
    <td class="sm">${n.teto}</td>
    <td class="sm">${n.falha}</td>
    <td class="sm">${n.reason}</td>
    <td class="sm">${n.pulado}</td>
  </tr>`
}

let blocos = ""
let i = 0
for (const k of ordemFinal) {
  const n = NOS[k], v = visual(k)
  i++
  const proc = PROCEDENCIA[k]
  const ps = PROMPTS[k] || []
  let promptHtml = ""
  if (ps.length) {
    const [rot, cor, bg, bd] = SELO[proc?.estado || "fallback"]
    promptHtml += `<div class="selo" style="color:${cor};background:${bg};border-color:${bd}">${rot} — ${proc?.nota || ""}</div>`
    for (const [rotulo, arq, konst] of ps) {
      const txt = templateLiteral(arq, konst)
      promptHtml += `<div class="pt"><span>${rotulo}</span><code>${konst}</code><em>${arq.replace("src/lib/agents/", "")} · ${txt.length.toLocaleString("pt-BR")} chars</em></div><pre>${esc(txt)}</pre>`
    }
  } else if (proc?.estado === "sem_prompt") {
    promptHtml += `<div class="selo" style="color:#4B5563;background:#F9FAFB;border-color:#E5E7EB">Não tem prompt — ${proc.nota}</div>`
  } else {
    promptHtml += `<div class="selo" style="color:#4B5563;background:#F9FAFB;border-color:#E5E7EB">Não tem prompt — é código determinístico, custo zero.</div>`
  }
  blocos += `<section class="no" id="${k}">
    <h3><span class="num" style="background:${v.bg};color:${v.color};border-color:${v.border}">${i}</span>
      ${v.name} <code class="k">${k}</code>
      ${n.llm ? '<span class="sim">LLM</span>' : '<span class="nao">código</span>'}</h3>
    <p class="desc">${v.desc}</p>
    <dl>
      <dt>Arquivo</dt><dd>${n.arquivo}</dd>
      <dt>Modelo</dt><dd>${n.modelo}</dd>
      <dt>Recebe</dt><dd>${n.entra}</dd>
      <dt>Devolve</dt><dd>${n.sai}</dd>
      <dt>Teto de tempo</dt><dd>${n.teto}</dd>
      <dt>Quando falha</dt><dd>${n.falha} · ${n.reason}</dd>
      <dt>Quando é pulado</dt><dd>${n.pulado}</dd>
    </dl>
    <p class="obs">${n.obs}</p>
    ${promptHtml}
  </section>`
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agentes da fase 2 — geração de e-mails</title>
<style>
:root{--bg:#FBFBFA;--card:#FFF;--ink:#1F2328;--mut:#6B7280;--line:#E5E7EB;--code:#F6F7F9}
@media (prefers-color-scheme:dark){:root{--bg:#0F1115;--card:#171A20;--ink:#E7E9EC;--mut:#9AA1AC;--line:#272B33;--code:#12151A}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding-block:40px;padding-left:20px;padding-right:20px}
.wrap{max-width:940px;margin:0 auto}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
.lead{color:var(--mut);margin:0 0 28px;max-width:70ch}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:40px 0 12px;font-weight:600}
code{font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
code.k{background:transparent;padding:0;color:var(--mut)}
table{width:100%;min-width:780px;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);padding:9px 10px;border-bottom:1px solid var(--line);font-weight:600}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.sm{color:var(--mut);font-size:12.5px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px}
.sim,.nao{font-size:11px;padding:1px 7px;border-radius:20px;font-weight:600;white-space:nowrap}
.sim{background:#EEF2FF;color:#3730A3}.nao{background:#F3F4F6;color:#4B5563}
@media (prefers-color-scheme:dark){.sim{background:#1E1B4B;color:#C7D2FE}.nao{background:#1F2937;color:#D1D5DB}}
.rolagem{overflow-x:auto;-webkit-overflow-scrolling:touch}
.rolaviso{display:none;font-size:12.5px;margin:0 0 8px}
@media (max-width:820px){.rolaviso{display:block}}
.no{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:20px;margin:14px 0}
.no h3{margin:0 0 2px;font-size:17px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.num{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:1px solid;font-size:12px;font-weight:700;flex:none}
.desc{color:var(--mut);margin:0 0 14px;font-size:13.5px}
dl{display:grid;grid-template-columns:132px 1fr;gap:6px 14px;margin:0 0 14px;font-size:13.5px}
@media (max-width:560px){dl{grid-template-columns:1fr;gap:2px 0}dt{margin-top:8px}}
dt{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px}
dd{margin:0}
.obs{font-size:13.5px;border-left:2px solid var(--line);padding-left:12px;margin:0 0 14px;color:var(--ink)}
.selo{font-size:12.5px;padding:8px 11px;border:1px solid;border-radius:6px;margin:14px 0 10px}
.pt{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;margin:14px 0 5px;font-size:12px}
.pt span{font-weight:700}.pt em{color:var(--mut);font-style:normal}
pre{background:var(--code);border:1px solid var(--line);border-radius:6px;padding:13px;overflow-x:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;white-space:pre-wrap;word-break:break-word;max-height:460px;overflow-y:auto}
.nota{font-size:13.5px;color:var(--mut);max-width:70ch}
ul{padding-left:20px;font-size:14px}li{margin:6px 0}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);color:var(--mut);font-size:12.5px}
</style></head><body><div class="wrap">

<h1>Os agentes da fase 2</h1>
<p class="lead">A fase 2 é o que roda <b>por e-mail</b>, depois que a copy do n8n volta, para transformar o documento montado no HTML final. São <b>${ordemFinal.length} nós</b> — e só <b>${ordemFinal.filter((k) => NOS[k].llm).length}</b> chamam modelo. Três dos que têm nome de agente são código determinístico de custo zero.</p>

<h2>Onde ela começa e termina</h2>
<p class="nota">O callback do n8n (<code>api/webhooks/n8n/email-copy/route.ts</code>) persiste a copy, roda o <b>copy_fit</b> ali mesmo — por isso ele <b>não é</b> um nó da fase 2 — e dispara duas rotas de <code>maxDuration = 800</code>: <code>run-phase2-image</code> (<code>copy_ready</code> → <code>image_done</code>) e <code>run-phase2-html-qa</code> (→ <code>qa_running</code> → <code>ready</code>). Do <code>copy_merge</code> em diante tudo acontece dentro de <code>runFormattingChain</code>, no status <code>rendering</code>, com orçamento de <code>PHASE2_CHAIN_BUDGET_MS</code> (760 s) e retomada por <code>html_pipeline_stage</code>.</p>

<h2>Os ${ordemFinal.length} nós, na ordem real</h2>
<p class="nota rolaviso">Tabela larga — role para o lado para ver todas as colunas.</p>\n<div class="rolagem"><table>
<thead><tr><th>Nó</th><th>Tipo</th><th>Teto</th><th>Falha</th><th>failure_reason</th><th>Quando é pulado</th></tr></thead>
<tbody>${linhas}</tbody></table></div>

<h2>Nó a nó</h2>
${blocos}

<h2>O que NÃO é fase 2</h2>
<ul>
<li><b>copy_fit</b> — roda no callback do n8n, entre a copy voltar e a fase 2 começar. Condicional: só existe run quando algum campo passou do limite da caixa.</li>
<li><b>merge_verifier</b> — <b>morto</b>. Zero ocorrências em produção; sobrevive no CHECK do banco e no <code>AGENT_VISUAL</code> só para renderizar runs históricas.</li>
<li><b>html</b> e <b>refiner</b> — legados, desativados no split de quatro agentes (<code>20261039</code>).</li>
</ul>

<h2>Divergências declaradas</h2>
<p class="nota">Código que engana quem lê, e por isso está aqui:</p>
<ul>
<li><code>FMT_FAILURE_REASON.color_format</code> e <code>.typography</code> existem e <b>nunca são usados</b> — os dois steps são fail-open e não chamam <code>failStep</code>.</li>
<li><code>FMT_STEP_TIMEOUT.image_format</code> (180 s) não vale nada: o step virou código e não passa por <code>executeFormatStep</code>.</li>
<li>Os <code>DEFAULT_TIMEOUT_MS</code> dentro dos chains (hero 240 s, text 540 s, color 240 s) são <b>maiores</b> que o teto que o runner impõe (180 s / 120 s). O <code>AbortController</code> do chain usa o valor dele; o guard de orçamento usa o do runner — quem corta primeiro é o runner.</li>
<li><code>background_fit</code> está no grafo, no <code>MAIN_ORDER</code> e no CHECK do banco, mas <b>não</b> em <code>FormatAgent</code>: não tem toggle na aba Agentes nem timeout próprio.</li>
<li><code>qavision</code> aparece no grafo e no <code>PipelineAgentKey</code>, mas nunca é gravado como <code>agent</code> — é bucket derivado em SQL.</li>
</ul>

<footer>Gerado a partir do repositório em ${new Date().toLocaleDateString("pt-BR")} — os prompts foram EXTRAÍDOS das constantes <code>DEFAULT_*</code> dos chains, não transcritos. A topologia e a ordem saem de <code>studio-graph.ts</code> (<code>PHASE2_KEYS</code>, <code>MAIN_ORDER</code>); os tetos e motivos de falha, de <code>phase2-runner.service.ts</code> e <code>chains/format-config.ts</code>.<br>Onde o selo diz “o banco vence”, o texto mostrado é o fallback do repo: o prompt ativo mora em <code>email_agent_configs</code> e não foi lido nesta geração.</footer>
</div></body></html>`

const destino = R + "docs/email-generation/agentes-fase-2.html"
writeFileSync(destino, html)
console.log("nós cobertos:", ordemFinal.join(" → "))
console.log("com LLM:", ordemFinal.filter((k) => NOS[k].llm).length, "· código:", ordemFinal.filter((k) => !NOS[k].llm).length)
console.log("bytes:", statSync(destino).size)
