#!/usr/bin/env node
/**
 * export-execucao — exporta UMA geração de e-mail como página HTML estilo n8n:
 * a lista de nós à esquerda, INPUT e OUTPUT do nó selecionado à direita.
 *
 * O Estúdio (/admin/agents/studio?tab=execs) já mostra isso na tela; este
 * script existe para o caso em que a execução precisa sair do admin —
 * anexar num chamado, comparar duas gerações lado a lado, ler sem VPN.
 *
 * Uso:
 *   node scripts/export-execucao.mjs                      # última geração
 *   node scripts/export-execucao.mjs --email <uuid>       # último batch do e-mail
 *   node scripts/export-execucao.mjs --batch <uuid>       # batch específico
 *   node scripts/export-execucao.mjs --out relatorio.html
 *   node scripts/export-execucao.mjs --from-json runs.json   # sem tocar no banco
 *
 * Precisa de SUPABASE_SERVICE_ROLE_KEY: `email_generation_runs` está fechada
 * por RLS (is_org_member) e a anon key não passa.
 */

import { readFileSync, writeFileSync } from "node:fs"

const URL_BASE = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ""
).replace(/\/$/, "")
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

const args = process.argv.slice(2)
const arg = (nome) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : undefined
}

// `--from-json` monta a página a partir de um dump já salvo (linhas de
// email_generation_runs num array, mais o contexto opcional em `_ctx`).
// Serve para gerar o relatório de uma máquina sem acesso ao banco.
const FONTE_LOCAL = arg("--from-json")

if (!FONTE_LOCAL && (!URL_BASE || !KEY)) {
  console.error(
    "Faltam credenciais.\n" +
      "  export NEXT_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co\n" +
      "  export SUPABASE_SERVICE_ROLE_KEY=<service role key>\n" +
      "Ou use --from-json <arquivo> para montar de um dump local.",
  )
  process.exit(1)
}

async function rest(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`${res.status} ${path}\n${await res.text()}`)
  return res.json()
}

/** Resolve o batch a exportar, na ordem: --batch, --email, a geração mais recente. */
async function resolverBatch() {
  const batch = arg("--batch")
  if (batch) return batch
  const emailId = arg("--email")
  const filtro = emailId ? `&email_id=eq.${emailId}` : ""
  const rows = await rest(
    `email_generation_runs?select=batch_id,created_at&batch_id=not.is.null${filtro}` +
      `&order=created_at.desc&limit=1`,
  )
  if (!rows.length) throw new Error("nenhuma run encontrada")
  return rows[0].batch_id
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

/** JSON inline seguro dentro de <script>: só `</` precisa fugir. */
const jsonInline = (v) => JSON.stringify(v).replace(/<\//g, "<\\/")

const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n ?? 0}ms`)
const usd = (cents) => `$${((cents ?? 0) / 100).toFixed(4)}`

function paginas(row) {
  const p = []
  const add = (nome, texto, tipo) => {
    if (texto == null) return
    const s = typeof texto === "string" ? texto : JSON.stringify(texto, null, 2)
    if (!s || s === "null" || s === "{}" || s === "[]") return
    p.push({ nome, tipo: tipo ?? "texto", texto: s })
  }
  return { add, p }
}

function montarNo(row) {
  const entrada = paginas(row)
  entrada.add("Input vars", row.input_vars, "json")
  entrada.add("Entrada (resumo)", row.input_summary, "json")
  entrada.add("Prompt renderizado", row.rendered_prompt)
  entrada.add("Prompt por origem", row.prompt_segments, "json")

  const saida = paginas(row)
  saida.add("Output bruto", row.raw_output)
  // output_html é o documento inteiro naquele estágio: vale como aba própria,
  // separada do resto da telemetria, senão o JSON fica ilegível.
  const parsed = row.parsed_output ?? null
  if (parsed && typeof parsed === "object" && typeof parsed.output_html === "string") {
    const { output_html, ...resto } = parsed
    saida.add("HTML do estágio", output_html, "html")
    saida.add("Output parseado", resto, "json")
  } else {
    saida.add("Output parseado", parsed, "json")
  }
  if (row.error_message) saida.add("Erro", row.error_message)
  if (row.error_stack) saida.add("Stack", row.error_stack)

  return {
    id: row.id,
    agent: row.agent,
    status: row.status,
    model: row.model,
    quando: row.created_at,
    ms: row.duration_ms ?? 0,
    ti: row.tokens_input ?? 0,
    to: row.tokens_output ?? 0,
    cents: Number(row.cost_cents ?? 0),
    erro: row.error_message ?? null,
    retries: row.retry_count ?? 0,
    entrada: entrada.p,
    saida: saida.p,
  }
}

const CSS = `
*{box-sizing:border-box}
:root{
 --bg:#f4f4f6; --pane:#fff; --line:#e3e3e8; --ink:#1f1f24; --dim:#6b6b76;
 --ok:#1a7f4b; --okbg:#e8f5ee; --err:#c02626; --errbg:#fdecec;
 --skip:#7a7a85; --skipbg:#eeeef1; --sel:#1f1f24;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --bg:#17171a; --pane:#1f1f24; --line:#2e2e35; --ink:#ececf0; --dim:#9a9aa5;
 --okbg:#12301f; --ok:#5fd18d; --errbg:#3a1414; --err:#ff8a8a;
 --skipbg:#26262c; --skip:#9a9aa5; --sel:#ececf0;
}}
body{margin:0;background:var(--bg);color:var(--ink);
 font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:18px 22px;border-bottom:1px solid var(--line);background:var(--pane)}
h1{margin:0 0 4px;font-size:17px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:12.5px}
.kpis{display:flex;flex-wrap:wrap;gap:18px;margin-top:12px}
.kpi b{display:block;font-size:17px;font-variant-numeric:tabular-nums}
.kpi span{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
main{display:grid;grid-template-columns:290px minmax(0,1fr);gap:14px;padding:14px;
 align-items:start}
@media(max-width:900px){main{grid-template-columns:1fr}}
.nodes{background:var(--pane);border:1px solid var(--line);border-radius:6px;
 overflow:hidden;position:sticky;top:14px;max-height:calc(100vh - 28px);overflow-y:auto}
@media(max-width:900px){.nodes{position:static;max-height:none}}
.node{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;
 padding:8px 10px;border-bottom:1px solid var(--line);cursor:pointer;
 font-size:13px;background:none;border-left:3px solid transparent;width:100%;
 text-align:left;color:inherit;font-family:inherit}
.node:hover{background:var(--bg)}
.node[aria-current="true"]{border-left-color:var(--sel);background:var(--bg)}
.node .n{color:var(--dim);font-variant-numeric:tabular-nums;font-size:11px}
.node .nome{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node .meta{color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums}
.dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px}
.s-success .dot{background:var(--ok)} .s-error .dot{background:var(--err)}
.s-skipped .dot{background:var(--skip)}
.painel{background:var(--pane);border:1px solid var(--line);border-radius:6px;
 min-width:0;overflow:hidden}
.cab{padding:12px 14px;border-bottom:1px solid var(--line);
 display:flex;flex-wrap:wrap;gap:10px;align-items:baseline}
.cab h2{margin:0;font-size:15px}
.tag{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:500}
.t-success{background:var(--okbg);color:var(--ok)}
.t-error{background:var(--errbg);color:var(--err)}
.t-skipped{background:var(--skipbg);color:var(--skip)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.erro{margin:12px 14px 0;padding:10px 12px;background:var(--errbg);color:var(--err);
 border-radius:5px;font-size:12.5px;white-space:pre-wrap;word-break:break-word}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0}
@media(max-width:1100px){.cols{grid-template-columns:1fr}}
.col{min-width:0;border-right:1px solid var(--line)}
.col:last-child{border-right:none}
.col>h3{margin:0;padding:9px 14px;font-size:11px;letter-spacing:.07em;
 text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--line)}
.abas{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:1px solid var(--line)}
.aba{font-size:11.5px;padding:4px 9px;border:1px solid var(--line);border-radius:4px;
 background:none;cursor:pointer;color:var(--dim);font-family:inherit}
.aba[aria-selected="true"]{background:var(--sel);color:var(--pane);border-color:var(--sel)}
pre{margin:0;padding:12px 14px;overflow:auto;max-height:62vh;white-space:pre-wrap;
 word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
 font-size:11.5px;line-height:1.55;tab-size:2}
.vazio{padding:14px;color:var(--dim);font-size:12.5px}
iframe{width:100%;height:62vh;border:0;border-top:1px solid var(--line);background:#fff}
mark{background:#ffe58a;color:#1f1f24}
.busca{padding:8px 10px;border-bottom:1px solid var(--line)}
.busca input{width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:4px;
 background:var(--bg);color:var(--ink);font:inherit;font-size:12.5px}
.rodape{padding:10px 22px;color:var(--dim);font-size:11.5px}
`

const JS = `
const $ = (s,r)=> (r||document).querySelector(s)
let atual = 0
function bytes(n){ return n>=1024 ? (n/1024).toFixed(1)+' KB' : n+' B' }
function dur(n){ return n>=1000 ? (n/1000).toFixed(1)+'s' : (n||0)+'ms' }
function render(){
  const no = DADOS.nos[atual]
  document.querySelectorAll('.node').forEach((b,i)=> b.setAttribute('aria-current', String(i===atual)))
  $('#nome').textContent = no.agent
  $('#tag').textContent = no.status
  $('#tag').className = 'tag t'+'-'+no.status
  $('#meta').textContent = [no.model, no.quando.slice(11,19),
    dur(no.ms), no.ti.toLocaleString('pt-BR')+' in / '+no.to.toLocaleString('pt-BR')+' out', '$'+(no.cents/100).toFixed(4),
    no.retries?('retries '+no.retries):null].filter(Boolean).join(' · ')
  const box = $('#erro'); box.hidden = !no.erro; box.textContent = no.erro || ''
  coluna('entrada', no.entrada); coluna('saida', no.saida)
}
// Aba escolhida por coluna. Digitar na busca re-renderiza; sem isto o
// leitor voltaria para a primeira aba a cada tecla. Zera ao trocar de nó.
const sel = { entrada:0, saida:0 }
function coluna(lado, pgs){
  const abas = $('#abas-'+lado), corpo = $('#corpo-'+lado)
  abas.innerHTML=''; corpo.innerHTML=''
  if(!pgs.length){ corpo.innerHTML = '<p class="vazio">Este nó não registrou nada aqui.</p>'; return }
  if(sel[lado] >= pgs.length) sel[lado] = 0
  const pinta = ()=>{
    abas.querySelectorAll('.aba').forEach((b,i)=> b.setAttribute('aria-selected', String(i===sel[lado])))
    const pg = pgs[sel[lado]]
    if(pg.tipo === 'html'){
      const f = document.createElement('iframe')
      f.setAttribute('sandbox',''); f.srcdoc = pg.texto
      corpo.innerHTML=''; corpo.appendChild(f)
    } else {
      const pre = document.createElement('pre')
      pre.textContent = pg.texto
      corpo.innerHTML=''; corpo.appendChild(pre)
      destacar(pre)
    }
  }
  pgs.forEach((pg,i)=>{
    const b = document.createElement('button')
    b.className='aba'; b.type='button'
    b.textContent = pg.nome + ' · ' + bytes(pg.texto.length)
    b.onclick = ()=>{ sel[lado]=i; pinta() }
    abas.appendChild(b)
  })
  pinta()
}
function destacar(pre){
  const q = $('#q').value.trim()
  if(q.length < 2) return
  const txt = pre.textContent, low = txt.toLowerCase(), alvo = q.toLowerCase()
  let i = low.indexOf(alvo), from = 0
  if(i < 0) return
  const frag = document.createDocumentFragment()
  while(i >= 0){
    frag.appendChild(document.createTextNode(txt.slice(from, i)))
    const m = document.createElement('mark'); m.textContent = txt.slice(i, i+q.length)
    frag.appendChild(m)
    from = i + q.length; i = low.indexOf(alvo, from)
  }
  frag.appendChild(document.createTextNode(txt.slice(from)))
  pre.innerHTML=''; pre.appendChild(frag)
}
function irPara(i){ atual=i; sel.entrada=0; sel.saida=0; render() }
document.querySelectorAll('.node').forEach((b,i)=> b.onclick = ()=> irPara(i))
$('#q').oninput = render
addEventListener('keydown', e=>{
  if(e.target.tagName === 'INPUT') return
  if(e.key === 'j' || e.key === 'ArrowDown') irPara(Math.min(atual+1, DADOS.nos.length-1))
  if(e.key === 'k' || e.key === 'ArrowUp') irPara(Math.max(atual-1, 0))
})
render()
`

function paginaHtml(ctx, nos) {
  const totalCents = nos.reduce((s, n) => s + n.cents, 0)
  const totalMs = nos.length
    ? new Date(nos[nos.length - 1].quando).getTime() -
      new Date(nos[0].quando).getTime() +
      nos[nos.length - 1].ms
    : 0
  const erros = nos.filter((n) => n.status === "error").length

  const lista = nos
    .map(
      (n, i) => `<button class="node s-${esc(n.status)}" type="button" aria-current="${i === 0}">
  <span class="n">${String(i + 1).padStart(2, "0")}</span>
  <span class="nome"><i class="dot"></i>${esc(n.agent)}</span>
  <span class="meta">${esc(ms(n.ms))}</span>
</button>`,
    )
    .join("\n")

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Execução · ${esc(ctx.loja)} · ${esc(ctx.email)}</title>
<style>${CSS}</style></head><body>
<header>
  <h1>${esc(ctx.loja)} — ${esc(ctx.email)}</h1>
  <div class="sub mono">batch ${esc(ctx.batch)} · ${esc(ctx.quando)}</div>
  <div class="kpis">
    <div class="kpi"><b>${nos.length}</b><span>nós</span></div>
    <div class="kpi"><b>${erros}</b><span>erros</span></div>
    <div class="kpi"><b>${(totalMs / 1000 / 60).toFixed(1)} min</b><span>duração</span></div>
    <div class="kpi"><b>${usd(totalCents)}</b><span>custo</span></div>
    <div class="kpi"><b>${nos.reduce((s, n) => s + n.ti, 0).toLocaleString("pt-BR")}</b><span>tokens in</span></div>
    <div class="kpi"><b>${nos.reduce((s, n) => s + n.to, 0).toLocaleString("pt-BR")}</b><span>tokens out</span></div>
  </div>
</header>
<main>
  <nav class="nodes" aria-label="Nós da execução">
    <div class="busca"><input id="q" type="search" placeholder="Buscar no conteúdo aberto…"></div>
    ${lista}
  </nav>
  <section class="painel">
    <div class="cab">
      <h2 id="nome"></h2><span id="tag" class="tag"></span>
      <span id="meta" class="mono" style="color:var(--dim)"></span>
    </div>
    <div id="erro" class="erro" hidden></div>
    <div class="cols">
      <div class="col"><h3>Input</h3><div class="abas" id="abas-entrada"></div><div id="corpo-entrada"></div></div>
      <div class="col"><h3>Output</h3><div class="abas" id="abas-saida"></div><div id="corpo-saida"></div></div>
    </div>
  </section>
</main>
<p class="rodape">j/k ou ↑/↓ trocam de nó. Gerado por <code>scripts/export-execucao.mjs</code>.</p>
<script>const DADOS = ${jsonInline({ nos })};</script>
<script>${JS}</script>
</body></html>`
}

let batchId
let runs
let ctxEmail = { loja: "—", email: "—" }

if (FONTE_LOCAL) {
  const dump = JSON.parse(readFileSync(FONTE_LOCAL, "utf8"))
  runs = Array.isArray(dump) ? dump : dump.runs
  const ctx = Array.isArray(dump) ? null : dump._ctx
  if (!runs?.length) throw new Error(`${FONTE_LOCAL} não tem runs`)
  runs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  batchId = ctx?.batch ?? runs[0].batch_id ?? "(local)"
  if (ctx) ctxEmail = { loja: ctx.loja ?? "—", email: ctx.email ?? "—" }
} else {
  batchId = await resolverBatch()
  runs = await rest(
    `email_generation_runs?select=*&batch_id=eq.${batchId}&order=created_at.asc`,
  )
  if (!runs.length) throw new Error(`batch ${batchId} sem runs`)
}

const emailId = FONTE_LOCAL ? null : runs.find((r) => r.email_id)?.email_id
if (emailId) {
  const [email] = await rest(
    `email_flow_emails?select=number,subject,flow_id&id=eq.${emailId}`,
  )
  if (email) {
    const [flow] = await rest(
      `email_flows?select=flow_type,store_id&id=eq.${email.flow_id}`,
    )
    const [loja] = flow
      ? await rest(`client_stores?select=store_name&id=eq.${flow.store_id}`)
      : []
    ctxEmail = {
      loja: loja?.store_name ?? "—",
      email: `${flow?.flow_type ?? "?"} #${email.number}${email.subject ? ` — ${email.subject}` : ""}`,
    }
  }
}

const nos = runs.map(montarNo)
const html = paginaHtml(
  { ...ctxEmail, batch: batchId, quando: runs[0].created_at },
  nos,
)

const saida = arg("--out") ?? `execucao-${batchId.slice(0, 8)}.html`
writeFileSync(saida, html)
console.log(
  `${saida} — ${nos.length} nós, ${(html.length / 1024).toFixed(0)} KB` +
    ` (${nos.filter((n) => n.status === "error").length} com erro)`,
)
