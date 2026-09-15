# Copy do e-mail no n8n — variáveis e prompts (payload v3.2)

Substitui os prompts dos nós `FAZEDOR DE COPY1` e `GERADOR DE ASSUNTO E
PRÉ-CABEÇALHO` do workflow `SISTEMA ONBOARDING`. Tudo que o agente precisa
JÁ está no payload que `dispatchEmailCopyWebhook` envia (contrato em
`docs/email-copy-payload-v2.md`, §v3/v3.1/v3.2) — o problema era o prompt
não ler nada disso.

Grafo mínimo que funciona com estes prompts:

```
Webhook → BRIEFING → EMAILS → SEPARADOR DE FLOWS → Loop Over Items
  → CONTEXTO DA COPY (Code)  → FAZEDOR DE COPY (Agent + OpenRouter + Parser)
  → GERADOR DE ASSUNTO (Agent + OpenRouter + Parser) → MONTADOR (Code)
  → HTTP Request (callback) → Loop Over Items
```

Sai: `Switch` por flow_type (7 saídas para o mesmo nó), `Estrutura Espelho`
(ninguém lia a resposta), `Switch1` por `trigger_source` (sem fallback —
descartava produção), `Blocks` e o caminho legado `FAZEDOR DE COPY` /
`GERADOR…1` / `MONTADOR`.

---

## 1. Variáveis — de onde cada uma vem

Nível da LOJA (uma vez por disparo), lidas do `Webhook`:

| Variável | Expressão n8n | O que é |
|---|---|---|
| `language_directive` | `$('Webhook').item.json.body.language_directive` | A ORDEM de idioma + moeda, pronta. Vai no topo, literal. |
| `store.language` / `language_label` | `$('Webhook').item.json.body.store.language` | Código (`en`, `pt-BR`…) e rótulo. |
| `store.store_name` | `$('Webhook').item.json.body.store.store_name` | Nome da marca. |
| `store.store_url` | `$('Webhook').item.json.body.store.store_url` | Home da loja. |
| `store.brand` | `$('Webhook').item.json.body.store.brand` | Quem é a marca (about, pilares, promessa). |
| `store.positioning` | `$('Webhook').item.json.body.store.positioning` | Posicionamento. |
| `store.story` | `$('Webhook').item.json.body.store.story` | Origem da marca (só quando o toque pedir). |
| `store.icp` | `$('Webhook').item.json.body.store.icp` | Persona, dores e **objeções** — hoje nunca lido. |
| `store.tone` | `$('Webhook').item.json.body.store.tone` | `do` / `dont` / `use_words` / `avoid_words`. |
| `store.operations` | `$('Webhook').item.json.body.store.operations` | Troca, envio, garantia (só o que estiver escrito). |
| `top_products` | `$('Webhook').item.json.body.top_products` | Nome, preço, **moeda**, URL. |
| `store.ads_review` | (não vai ao prompt) | Contexto interno; o agente não deve citar. |

Nível do E-MAIL (por item do loop). O `SEPARADOR DE FLOWS` de hoje copia só
`blueprint` e `blocks`; ele precisa repassar o e-mail inteiro (patch na §2).
Depois disso, tudo é `$('Loop Over Items').item.json.*`:

| Variável | Campo do payload | O que o agente faz com ela |
|---|---|---|
| `email_id`, `email_number`, `flow_type`, `flow_name` | idem | Identificação; o número diz a posição no flow. |
| `dispatch_batch_id` | `emails[].dispatch_batch_id` | Só ECOAR no callback (o admin descarta copy de disparo antigo). |
| `objective` | `emails[].objective` | O objetivo do toque. |
| `blueprint.messaging` | `emails[].blueprint.messaging` | A direção editorial (o "como") deste e-mail. |
| `blueprint.fio_narrativo` | `emails[].blueprint.fio_narrativo` | O fio que liga as posições — o argumento em uma linha. |
| `blueprint.subject_hint` | `emails[].blueprint.subject_hint` | Candidato a assunto (pode vir no idioma errado). Só o GERADOR usa. |
| `tones` | `emails[].tones` | Tons canônicos (`Descontraído`, `Premium`…). |
| `decisao.incentivo` | `emails[].decisao.incentivo` | `{existe, codigo, valor}`. `existe:false` = ZERO oferta em qualquer campo. |
| `decisao.proibido` | `emails[].decisao.proibido` | Lista FECHADA do que a copy não pode afirmar. |
| `decisao.insumos_permitidos` | `emails[].decisao.insumos_permitidos` | Os ÚNICOS fatos verificáveis que podem entrar. |
| `alvo` | `emails[].alvo` | Objeção atacada, tratamento, profundidade de prova, `ja_atacadas`, `suspeita_a_antecipar`, `angulo_do_tratamento`. `null` = sem alvo. |
| `coupon_code` | `emails[].coupon_code` | Código literal já no idioma (redundante com `decisao.incentivo.codigo`). |
| `estrutura_geral` | `emails[].estrutura_geral` | `null` quando há decisão — NÃO cair em fallback. Só e-mail text_only tem. |
| `doutrina` | `emails[].doutrina` | Notas de doutrina por seção (`{slug, secao, fonte, resumo, corpo}`); hoje `null` até o admin enviar. |
| `blocks[]` | `emails[].blocks[]` | Um por bloco: `block_id`, `position`, `type`, `label`, `campos_omitidos`, `schema` (abaixo). |

Por BLOCO (`blocks[].schema`):

| Campo | O que o agente faz |
|---|---|
| `schema.papel` | O papel narrativo da posição (decidido pelo Estruturador). Vence a forma da variante. |
| `schema.diretriz` | `papel` + "Forma (variante, subordinada ao papel)". Diz como o bloco é. |
| `schema.requisitos` | `{cupom, cta, n_itens, preco, avaliacao, exige[], dispositivo}` — o que a posição exige ou nega. |
| `schema.campos` | **O contrato de resposta.** Objeto `key → {label, tipo, obrigatorio, max_caracteres, exemplo, orientacao, directive?}`. As chaves são as chaves que voltam. |
| `campos[k].max_caracteres` | Tamanho da CAIXA. Passar dele vaza no layout. |
| `campos[k].exemplo` | Referência de forma e tamanho, na língua do exemplo. NÃO é conteúdo para copiar. |
| `campos[k].directive` | Quando presente, VENCE `exemplo` (ele vem `null`): o exemplo prometia o que a decisão nega. |
| `campos[k].orientacao` | Como escrever aquele campo. |
| `campos_omitidos` | Chaves que o agente NÃO escreve (foram removidas por colidirem com a decisão). |

O agente NÃO recebe: `ads_review`, `pesquisa_diagnostico` (15 KB em
português — é o que contaminava o idioma; `brand`/`icp`/`tone` já
carregam o que interessa), `brand_identity`, `competitors`, `callback`.

---

## 2. Patch no `SEPARADOR DE FLOWS` (Code, Run Once for All Items)

Só o `out.push` muda: repassar o e-mail inteiro em vez de escolher campos.

```js
const PREFIX = {
  welcome: 'WELCOME-MAIL', site_abandoned: 'SITEABANDONE-MAIL',
  browse_abandonment: 'BROWSEABANDONE-MAIL', abandoned_cart: 'CARRINHOABANDONADOE-MAIL',
  upsell: 'UPSELL-EMAIL', win_back: 'WINBACK-EMAIL', shipping_stages: 'ENVIO-MAIL',
};
const pad = (n) => String(n).padStart(2, '0');
const body = $('Webhook').first().json.body;
const flows = Array.isArray(body.flows) ? body.flows : [];
const out = [];
for (const flow of flows) {
  const prefix = PREFIX[flow.flow_type] || (flow.flow_type || 'FLOW').toUpperCase().replace(/_/g, '') + '-MAIL';
  for (const email of (flow.emails || [])) {
    const blocks = (email.blocks || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (blocks.length === 0) continue; // sem bloco não há o que escrever
    out.push({ json: {
      ...email,                       // alvo, decisao, objective, tones, coupon_code, dispatch_batch_id, doutrina…
      key: `${prefix}${pad(email.email_number)}`,
      flow_id: flow.flow_id, flow_type: flow.flow_type, flow_name: flow.flow_name,
      email_name: email.name,
      blocks, blocks_count: blocks.length,
    }});
  }
}
return out;
```

---

## 3. Nó `CONTEXTO DA COPY` (Code, Run Once for Each Item)

Monta os blocos de texto que o prompt lê. Fica em Code, e não em
expressões `{{ }}`, para o prompt do agente ser legível e o JSON dos
blocos sair só com o que importa.

```js
const body = $('Webhook').first().json.body;
const store = body.store || {};
const email = $('Loop Over Items').item.json;

const j = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 1));
const lista = (arr) => (Array.isArray(arr) && arr.length ? arr.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '(nenhum)');

// ---- decisão ----
const dec = email.decisao || {};
const inc = dec.incentivo || { existe: null };
const incentivoTxt = inc.existe === true
  ? `EXISTE: ${inc.valor ?? ''} com o código ${inc.codigo ?? ''}. Use SÓ este valor e este código. Sem prazo, sem condição nova.`
  : inc.existe === false
    ? 'NÃO EXISTE incentivo neste e-mail. Proibido: desconto, cupom, código, percentual, "use o código", "oferta", em QUALQUER campo.'
    : 'NÃO SE SABE se há incentivo. Não prometa oferta nem cupom.';

// ---- alvo ----
const alvo = email.alvo;
let alvoTxt = '(sem alvo declarado — siga o papel de cada bloco e o fio narrativo)';
if (alvo && !alvo.lacuna) {
  const alvos = (alvo.alvos || []).map((a) =>
    `- [${a.primaria ? 'PRIMÁRIA' : 'secundária'}] Objeção (na voz do cliente): "${a.objecao}"\n  Tratamento: ${a.tratamento}\n  Profundidade de prova permitida: ${a.profundidade_de_prova}`).join('\n');
  const angulo = (alvo.angulo_do_tratamento || []).map((v) => `- ${v.ordem}. ${v.veiculo}: ${v.papel}${v.insumo_disponivel === true ? '' : ' (insumo parcial — não invente o que falta)'}`).join('\n');
  alvoTxt = [
    `Modo do toque: ${alvo.modo}`,
    `Trabalhos fixos: ${(alvo.trabalhos_fixos || []).join(', ') || '(nenhum)'}`,
    alvos ? `Objeção atacada:\n${alvos}` : '',
    angulo ? `Ângulo do tratamento (nesta ordem):\n${angulo}` : '',
    alvo.suspeita_a_antecipar ? `Suspeita a antecipar: ${alvo.suspeita_a_antecipar}` : '',
    alvo.razao ? `Razão: ${alvo.razao}` : '',
    (alvo.ja_atacadas || []).length ? `Já atacadas em e-mails anteriores (NÃO repetir o argumento): ${alvo.ja_atacadas.map((x) => `${x.id} (e-mail ${x.email_number})`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
} else if (alvo && alvo.lacuna) {
  alvoTxt = `Sem objeção declarada (${alvo.lacuna.motivo}). Siga o papel de cada bloco. Não invente objeção.`;
}

// ---- doutrina (quando o admin enviar) ----
const dout = Array.isArray(email.doutrina) && email.doutrina.length
  ? email.doutrina.map((d) => `### ${d.slug} (seção: ${d.secao}; fonte: ${d.fonte})\n${d.resumo || ''}\n${d.corpo || ''}`).join('\n\n')
  : '';

// ---- loja ----
const tone = store.tone || {};
const lojaTxt = [
  `Marca: ${store.store_name || ''} — ${store.store_url || ''}`,
  `Nicho: ${store.niche || ''}`,
  `Quem é a marca:\n${j(store.brand)}`,
  `Posicionamento:\n${j(store.positioning)}`,
  `Origem da marca (usar SÓ se o alvo pedir origem_da_marca):\n${j(store.story)}`,
  `Público, dores e objeções (ICP):\n${j(store.icp)}`,
  `Operação (troca, envio, garantia — só afirme o que estiver escrito aqui E em insumos permitidos):\n${j(store.operations)}`,
].join('\n\n');
const tomTxt = [
  `FAZER: ${j(tone.do)}`,
  `NÃO FAZER: ${j(tone.dont)}`,
  `Palavras a usar (são REFERÊNCIA DE VOZ, na língua em que estão — traduza para o idioma do e-mail, nunca copie): ${j(tone.use_words)}`,
  `Palavras PROIBIDAS: ${j(tone.avoid_words)}`,
  `Tons canônicos: ${(email.tones || []).join(', ')}`,
  `Descrição do tom: ${j(tone.description || tone.summary || '')}`,
].join('\n');
const produtosTxt = (body.top_products || []).map((p, i) =>
  `${i + 1}. ${p.name || p.title} — ${p.price ?? ''} ${p.currency ?? ''} — ${p.url || ''}${p.description ? `\n   ${String(p.description).slice(0, 240)}` : ''}`).join('\n') || '(sem produtos)';

// ---- blocos: só o que o copywriter precisa, na ordem ----
const blocos = (email.blocks || []).map((b) => {
  const s = b.schema || {};
  const campos = {};
  for (const [k, c] of Object.entries(s.campos || {})) {
    campos[k] = {
      label: c.label, tipo: c.tipo, max_caracteres: c.max_caracteres,
      obrigatorio: !!c.obrigatorio, orientacao: c.orientacao || '',
      ...(c.directive ? { directive: c.directive } : { exemplo: c.exemplo ?? '' }),
    };
  }
  return {
    block_id: b.block_id, position: b.position, type: b.type,
    papel: s.papel || b.purpose || '', forma: s.diretriz || '',
    requisitos: s.requisitos || {}, campos_omitidos: b.campos_omitidos || [],
    campos,
  };
});

return { json: {
  ...email,
  language_directive: body.language_directive || `Write every field in ${store.language_label || store.language}.`,
  idioma: store.language_label || store.language || '',
  incentivo_txt: incentivoTxt,
  proibido_txt: lista(dec.proibido),
  insumos_txt: lista(dec.insumos_permitidos),
  alvo_txt: alvoTxt,
  doutrina_txt: dout,
  loja_txt: lojaTxt,
  tom_txt: tomTxt,
  produtos_txt: produtosTxt,
  blocos_json: JSON.stringify(blocos, null, 1),
  fio: email.blueprint?.fio_narrativo || '',
  messaging: email.blueprint?.messaging || '',
  objetivo: email.objective || email.blueprint?.objective || '',
  total_campos: blocos.reduce((n, b) => n + Object.keys(b.campos).length, 0),
}};
```

---

## 4. `FAZEDOR DE COPY` — System Message

Modelo: `anthropic/claude-sonnet-4.6` (OpenRouter). Options: temperature
0.7, maxTokens 8000. `hasOutputParser: true`.

```
Você escreve a copy de UM e-mail de e-commerce, campo a campo, para um layout que já está pronto. Cada campo tem uma caixa de tamanho fixo e um papel. Você não desenha, não escolhe blocos, não muda a estrutura: preenche o contrato.

# O QUE VOCÊ RECEBE
- Uma ORDEM DE IDIOMA E MOEDA no topo. Ela vence tudo, inclusive o material da loja (que pode estar em outra língua).
- A DECISÃO do e-mail: se existe incentivo (e qual), o que é PROIBIDO afirmar, e os INSUMOS PERMITIDOS (os únicos fatos verificáveis).
- O ALVO do toque: a objeção que este e-mail ataca, o tratamento e a profundidade de prova permitida.
- A DIREÇÃO: objetivo, messaging e fio narrativo — o argumento em uma linha, que atravessa todos os blocos na ordem.
- A LOJA: marca, posicionamento, público, tom de voz, produtos com preço e moeda.
- Os BLOCOS, na ordem do e-mail. Cada bloco tem `papel` (o que ele faz na peça), `forma` (como a variante é), `requisitos` e `campos`. Cada campo tem `label`, `tipo`, `max_caracteres`, `orientacao` e `exemplo` OU `directive`.

# REGRAS DURAS (o código confere cada uma; violação derruba o e-mail)
1. IDIOMA: todos os valores no idioma da ordem. Nenhuma palavra em outra língua, nem citação do material da loja sem traduzir. Moeda e formato de preço da ordem.
2. CONTRATO: escreva EXATAMENTE as chaves de `campos` de cada bloco — nenhuma a mais, nenhuma a menos. Chaves em `campos_omitidos` NÃO existem para você; não as escreva nem infira o conteúdo delas em outro campo.
3. CAIXA: `max_caracteres` é o tamanho físico do campo. Conte os caracteres ANTES de fechar cada valor e fique ABAIXO do limite (mire 85-95% dele). Um campo que estoura vaza por cima do layout. Se a ideia não cabe, encurte a ideia, não a caixa.
4. `directive` VENCE `exemplo`. Quando um campo traz `directive`, o exemplo foi removido porque prometia o que a decisão nega: escreva pela directive.
5. `exemplo` é referência de FORMA e TAMANHO — nunca de conteúdo. Não copie, não traduza, não adapte a frase do exemplo. "Lorem ipsum", "dolor sit amet", "LOGO HERE", "TEXTO_DE_…" são placeholders: ignore o texto e use só o tamanho.
6. INCENTIVO: se a decisão diz que NÃO existe, nenhum campo pode conter desconto, cupom, código, percentual, "oferta", "use o código", "grátis". Se existe, use SÓ o valor e o código informados, sem prazo, sem condição nova, sem "termina em".
7. PROIBIDO é lista fechada: o que está lá não entra, nem parafraseado, nem suavizado.
8. FATOS: só afirme sobre a loja o que estiver em INSUMOS PERMITIDOS, na LOJA ou nos PRODUTOS. Sem número inventado (quantidade de clientes, nota, percentual, "milhares"), sem prazo de entrega, sem garantia, sem política de troca, sem selo, sem estoque, sem "mais vendido" que o material não diga. Review/depoimento: só com o texto e a assinatura que a orientação do campo autorizar; sem nome, idade, cidade ou credencial inventados — se o campo pede "nome do cliente" e não há nome nos insumos, use só iniciais ou o rótulo neutro que a orientação indicar.
9. SEM PLACEHOLDER: nunca escreva [Nome], [Produto], {first_name}, {{ }}, "XXXX" nem colchetes de nenhum tipo. Cada valor é texto final.
10. TIPOGRAFIA: não use travessão (— ou –) em nenhum campo: use ponto, vírgula ou dois-pontos. Não use aspas duplas (") dentro de nenhum valor — use aspas simples ou «». Sem emoji, salvo se o tom da loja for explicitamente descontraído E o campo for título. Sem ponto final em título, botão e eyebrow. Sem CAIXA ALTA fora de botão e eyebrow, salvo orientação do campo.
11. BOTÃO (campos `*cta*`, `*label*` de botão): verbo + objeto, 2-4 palavras, no idioma da ordem, caixa alta se a orientação pedir. Diz o que acontece ao clicar. Nunca "Clique aqui", "Saiba mais", "Link Here".
12. `copy_no_desenho` / selo / arco (`*seal*`, `*arc*`, `*ribbon*`): 1-4 palavras, caixa alta, sem pontuação.

# COMO ESCREVER (a régua da casa)
- UMA ideia por e-mail: o fio narrativo é o argumento, cada bloco é uma etapa dele. Quem lê só os títulos tem de entender o argumento inteiro sem ler o corpo.
- Otimize para a VARREDURA, não para a leitura: títulos carregam o argumento; o corpo só prova. Frases curtas. Nada de "fluff": nada de "estamos felizes em", "bem-vindo à nossa comunidade", "não perca", "oferta imperdível", "conteúdo exclusivo".
- A hero (primeiro bloco) responde em 2 segundos "o que eu ganho e onde clico": título com o benefício ou a promessa entregue, valor claro, botão.
- O bloco logo abaixo da hero apoia o título da hero e leva ao produto; não abre assunto novo.
- Ataque a objeção do alvo pelo TRATAMENTO indicado, na profundidade permitida: `afirmacao` = afirme; `mecanismo` = explique como funciona; `prova_de_terceiro` = deixe quem já comprou dizer; `garantia` = só com a política nos insumos.
- Não repita entre blocos a mesma frase, o mesmo argumento ou o mesmo benefício. Não repita entre e-mails o que está em "já atacadas".
- Segunda pessoa, direta, sem "nós somos"; a marca fala com uma pessoa.
- Nada de urgência artificial ("só hoje", "últimas unidades", "termina em"), nada de escassez inventada, nada de "milhares já compraram".
- Respeite FAZER / NÃO FAZER / palavras proibidas do tom de voz.

# SAÍDA
Devolva APENAS este JSON, sem markdown, sem comentário:
{"blocks":[{"block_id":"<id do bloco>","campos":[{"key":"<chave>","valor":"<texto final>"}]}]}
Um item em `blocks` por bloco recebido, na mesma ordem; em `campos`, uma entrada por chave de `campos` daquele bloco, na ordem em que vieram. Valores sempre string.
```

---

## 5. `FAZEDOR DE COPY` — Prompt (User Message, `promptType: define`)

```
{{ $json.language_directive }}

# ESTE E-MAIL
Flow: {{ $json.flow_name }} ({{ $json.flow_type }}) · E-mail #{{ $json.email_number }} de {{ $('Webhook').item.json.body.flows.find(f => f.flow_type === $json.flow_type)?.emails?.length ?? '?' }}
Objetivo: {{ $json.objetivo }}
Direção (messaging): {{ $json.messaging }}
Fio narrativo: {{ $json.fio }}

# DECISÃO (vence o material da loja e o exemplo dos campos)
Incentivo: {{ $json.incentivo_txt }}
Proibido afirmar:
{{ $json.proibido_txt }}
Insumos permitidos (os únicos fatos verificáveis):
{{ $json.insumos_txt }}

# ALVO DO TOQUE
{{ $json.alvo_txt }}

{{ $json.doutrina_txt ? '# DOUTRINA DA CASA (como escrever cada seção; perde para a decisão e para o alvo)\n' + $json.doutrina_txt + '\n' : '' }}
# LOJA
{{ $json.loja_txt }}

# TOM DE VOZ
{{ $json.tom_txt }}

# PRODUTOS (só estes; preço e moeda como estão)
{{ $json.produtos_txt }}

# BLOCOS — o contrato ({{ $json.total_campos }} campos no total)
Escreva exatamente as chaves de `campos` de cada bloco, abaixo de `max_caracteres`. `directive` vence `exemplo`. `campos_omitidos` não se escreve.
{{ $json.blocos_json }}

Antes de responder, confira campo a campo: idioma da ordem; contagem abaixo de max_caracteres; nenhuma oferta se o incentivo não existe; nada da lista de proibições; nenhum número, nome ou política fora dos insumos; sem travessão, sem aspas duplas, sem placeholder. Depois devolva o JSON.
```

### Structured Output Parser do FAZEDOR (schema manual — não use "exemplo")

```json
{
  "type": "object",
  "properties": {
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "block_id": { "type": "string" },
          "campos": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": { "key": { "type": "string" }, "valor": { "type": "string" } },
              "required": ["key", "valor"]
            }
          }
        },
        "required": ["block_id", "campos"]
      }
    }
  },
  "required": ["blocks"]
}
```

---

## 6. `GERADOR DE ASSUNTO` — System Message

Modelo: `anthropic/claude-sonnet-4.6`. temperature 0.8. Parser
`{subject, preheader}` (o schema manual que já existe no nó).

```
Você escreve o assunto e o preheader de UM e-mail de e-commerce a partir da copy já escrita e da decisão do e-mail. O par não existe para "ganhar abertura": existe para ENQUADRAR a venda — dizer o que a pessoa ganha ao abrir, no registro da marca.

REGRAS
1. Idioma: o da ordem de idioma. Nunca português numa loja em inglês, nunca o contrário. O `subject_hint` é só um candidato e pode estar na língua errada: reescreva no idioma certo.
2. Assunto: 2 a 6 palavras, até 50 caracteres, com a ideia central nos primeiros 33. Title Case se o idioma usar (inglês); caixa normal em português/espanhol/francês/alemão/italiano. Sem ponto final. Sem ALL CAPS. Sem "Re:", sem "Fwd:".
3. Preheader: UMA frase, 40 a 90 caracteres, caixa normal, que COMPLEMENTA o assunto (nunca repete, nunca reformula). Pode terminar em reticências.
4. Incentivo: se a decisão diz que NÃO existe, nenhuma oferta, cupom, código, percentual ou "grátis" no assunto nem no preheader. Se existe, pode nomear o valor ou o código, sem prazo e sem condição nova.
5. Proibido é lista fechada: nada de lá entra, nem parafraseado. Sem urgência artificial ("só hoje", "últimas horas", "termina em"), sem escassez inventada, sem número que não esteja nos insumos.
6. Sem clickbait, sem pergunta retórica vazia, sem "Bem-vindo!" solto, sem "Não perca", sem "Grandes novidades", sem "Confira".
7. Sem travessão (— ou –): use ponto, vírgula ou dois-pontos. Sem aspas duplas. Sem emoji — exceto se o tom for explicitamente descontraído E o e-mail não for de boas-vindas; então no máximo um, no fim do assunto.
8. O assunto fala do MESMO argumento que a hero da copy (primeiro bloco): a pessoa abre e encontra o que o assunto prometeu.

SAÍDA: apenas {"subject":"…","preheader":"…"}.
```

## 7. `GERADOR DE ASSUNTO` — Prompt (User Message)

```
{{ $('CONTEXTO DA COPY').item.json.language_directive }}

Flow: {{ $('CONTEXTO DA COPY').item.json.flow_name }} · E-mail #{{ $('CONTEXTO DA COPY').item.json.email_number }}
Objetivo: {{ $('CONTEXTO DA COPY').item.json.objetivo }}
Fio narrativo: {{ $('CONTEXTO DA COPY').item.json.fio }}
Candidato a assunto (pode estar na língua errada; reescreva no idioma da ordem): {{ $('CONTEXTO DA COPY').item.json.blueprint?.subject_hint || '(nenhum)' }}

DECISÃO
Incentivo: {{ $('CONTEXTO DA COPY').item.json.incentivo_txt }}
Proibido:
{{ $('CONTEXTO DA COPY').item.json.proibido_txt }}

ALVO DO TOQUE
{{ $('CONTEXTO DA COPY').item.json.alvo_txt }}

TOM DE VOZ
{{ $('CONTEXTO DA COPY').item.json.tom_txt }}

COPY DO E-MAIL (o assunto tem de casar com o primeiro bloco)
{{ JSON.stringify($('FAZEDOR DE COPY').item.json.output) }}

Devolva o JSON.
```

---

## 8. `MONTADOR` (Code, Run Once for Each Item)

Dobra `campos[]` em `content`, recusa chave fora do contrato e chave
omitida, mede estouros (registro, não corte — o admin decide), ecoa
`dispatch_batch_id` e `copy_prompt_version`.

```js
const COPY_PROMPT_VERSION = 'n8n-v3.2-2026-09-15';
const ctx = $('CONTEXTO DA COPY').item.json;
const copyOut = $('FAZEDOR DE COPY').item.json.output ?? $('FAZEDOR DE COPY').item.json;
const subjOut = $('GERADOR DE ASSUNTO').item.json.output ?? $('GERADOR DE ASSUNTO').item.json;

const tryJson = (v) => {
  if (v && typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  const s = v.replace(/`{3}json|`{3}/gi, '').trim(); // sem crases literais: quebrariam o bloco deste doc
  const i = s.search(/[\[{]/);
  if (i < 0) return null;
  try { return JSON.parse(s.slice(i)); } catch { return null; }
};
const copy = tryJson(copyOut) || {};
const subj = tryJson(subjOut) || {};

const porId = new Map();
for (const b of (copy.blocks || [])) {
  const campos = Array.isArray(b?.campos) ? b.campos : Object.entries(b?.content || {}).map(([key, valor]) => ({ key, valor }));
  porId.set(String(b?.block_id), campos);
}

const meta = { ignoradas_fora_do_contrato: [], omitidas_devolvidas: [], estouros: [], blocos_sem_resposta: [] };
const blocks = (ctx.blocks || []).map((b) => {
  const schema = b.schema?.campos || {};
  const omitidos = new Set(b.campos_omitidos || []);
  const campos = porId.get(String(b.block_id));
  if (!campos) { meta.blocos_sem_resposta.push(b.block_id); return { block_id: b.block_id, content: {} }; }
  const content = {};
  for (const c of campos) {
    const k = c?.key; const v = typeof c?.valor === 'string' ? c.valor.trim() : '';
    if (!k) continue;
    if (omitidos.has(k)) { meta.omitidas_devolvidas.push(`${b.position}.${k}`); continue; }
    if (!(k in schema)) { meta.ignoradas_fora_do_contrato.push(`${b.position}.${k}`); continue; }
    const max = schema[k]?.max_caracteres;
    if (typeof max === 'number' && max > 0 && v.length > max) meta.estouros.push({ key: k, position: b.position, len: v.length, max });
    content[k] = v;
  }
  return { block_id: b.block_id, content };
});

const chars = blocks.reduce((n, b) => n + Object.values(b.content).join('').length, 0);
if (chars === 0) throw new Error(`copy vazia para o e-mail ${ctx.email_id} — nada enviado ao callback`);

const strip = (s) => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/"/g, "'").trim();
let subject = strip(subj.subject || subj.assunto || '');
let preheader = strip(subj.preheader || subj.pre_header || subj.preview || '');
if (!subject) subject = strip(blocks.map((b) => b.content.headline_l1 || b.content.hero_headline || b.content.section_title || '').find(Boolean) || ctx.blueprint?.subject_hint || ctx.email_name);

return { json: {
  store_id: String($('Webhook').item.json.body.store.id),
  email_id: ctx.email_id,
  dispatch_batch_id: ctx.dispatch_batch_id ?? null,
  copy_prompt_version: COPY_PROMPT_VERSION,
  subject, preheader,
  blocks,
  meta: { model: 'anthropic/claude-sonnet-4.6', ...meta },
}};
```

O `HTTP Request` do callback continua igual (`POST
https://app.convertfy.me/api/webhooks/n8n/email-copy`, header
`x-webhook-secret` do Webhook, body `JSON.stringify($json)`), e volta ao
`Loop Over Items`. Nos dois nós de agente, `Settings → On Error →
Continue (using regular output)`: um e-mail que falha não pode parar os
outros três.

---

## 9. Como saber que pegou

Na run `copy` do admin (Estúdio → Execuções, ou
`email_generation_runs.parsed_output`): `copy_prompt_version =
"n8n-v3.2-2026-09-15"`, `desvios_pre_fit` perto de zero (hoje 7,3 por
e-mail), `_contrato.violacoes` sem `oferta_sem_incentivo` /
`claim_nao_coberto`, e o `copy_fit` deixando de rodar.
