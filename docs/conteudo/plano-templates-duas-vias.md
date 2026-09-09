# Templates em duas vias: editar no sistema × gerar o slide por prompt

Pedido (08/09/2026): "criar o template e editar como quisermos dentro do
nosso sistema, como o Canva — mas também cada slide ter um prompt para gerar
esse slide no ChatGPT Image (ou via API)". O carrossel "8% dos clientes"
foi feito inteiro no ChatGPT; o prompt solto produz algo menos engessado.

## O que já existe, e onde cada via encosta

| Peça | Estado | Serve à via |
|---|---|---|
| Renderer inline-only + exportação PNG/ZIP (`frame.tsx`, base 1080) | pronto | A (editar) |
| 5 tipos de frame (capa/dado/texto/prova/lista·mec/cta), 5 moldes | pronto, mas não reproduz o formato Editorial nem o Alternado | A |
| Brand kit por canal, cores/fontes/gradiente por documento | pronto | A e B (o prompt lê daqui) |
| `gerar_imagem` em `/api/conteudo/ia` → `generateEmailImage` (GPT Image 2 primário, Gemini fallback, variações lado a lado) | pronto, só para SLOT de foto (prompt força "sem texto na imagem") | B |
| Referências (copy transcrita + por que funciona, few-shot) | pronto | as duas |
| Painel Mídia com banco da org (uploads + gerações) | pronto | A |

## Via A — editar no sistema (fase 2 visual)

Continua sendo o caminho de produção: tipografia nossa, copy editável,
exportação idêntica ao preview, nada de erro de digitação de modelo. O que
falta são os FORMATOS que os 5 frames não fazem:

1. **Editorial Convertfy** (`formatos/editorial-convertfy.md`): par
   itálico-serif + negrito, corpo com destaques, card `kpi_grid|print|conta`,
   anotação manuscrita com seta, chips, fechamento, pílula.
2. **Alternado claro/escuro** (BrandsDecoded `design-system.md`): accent
   bar, brand bar, progress bar, capa full-bleed com headline condensada
   uppercase, dark/light/gradient alternados, big stat, tabela, card com
   borda esquerda, CTA com frase-ponte + keyword box. CSS completo já dado
   — é o formato mais barato de portar.

Os dois viram **famílias de frame** com preset de brand kit (a paleta do
Alternado deriva de UMA cor primária pela regra do `principios-de-design`).

## Via B — prompt por slide (ChatGPT Image / API)

Cada frame ganha `promptImagem` (gerado, editável). O builder monta o
prompt com: tamanho 1080×1350, brand kit (cores, fontes por NOME, logo
empilhado), a copy do slide (título/corpo/fechamento/CTA) entre aspas, a
anatomia do formato escolhido (texto do `formatos/*.md`) e o "por que
funciona" das referências mais afins. Dois botões por slide:

- **Copiar prompt** — para colar no ChatGPT direto (é como o usuário faz
  hoje; zero custo de API, e o ChatGPT com histórico da conversa "entende"
  o estilo).
- **Gerar** — mesma rota `gerar_imagem`, SEM o sufixo "sem texto na
  imagem", com variações lado a lado (GPT Image 2 × Gemini, regra que já
  existe em `image/model-policy`).

O resultado vira a imagem full-bleed do frame (um tipo de frame `gerado`,
que é só imagem + prompt) — e continua editável: dá para trocar o prompt,
regerar, ou cair na via A.

**Limite declarado**: modelo de imagem ERRA texto em português (acento,
palavra trocada) e não garante a mesma fonte entre slides. Por isso o modo
**híbrido** é o ponto ótimo e deve ser o default: o prompt gera o VISUAL
(foto, card, conta à mão, print estilizado) sem texto, e o renderer coloca
a copy com a tipografia da casa. Consistência tipográfica, copy editável,
zero erro de digitação — e a "cara de ChatGPT" fica na parte visual, onde
ela ajuda. O modo "slide inteiro pelo modelo" fica como opção explícita.

## O que aproveitar da BrandsDecoded — e o que conflita

**Universal (entra no prompt e vira filtro puro testável)**
- Anti-slop: "não é X, é Y", "e isso muda tudo", "no fim das contas",
  "cada vez mais", "em um mundo onde", paralelismos forçados, headlines
  "descubra/saiba/o guia definitivo", aberturas "hoje vamos falar",
  fechamentos "swipe/continue", CTA cordial.
- Gramática: artigos sempre, conectivos, sem anglicismo numérico
  ("5x" → "cinco vezes") no corpo.
- Dado = número + fonte + ano; "estudos mostram" reprova.
- Promessa do hook cumprida antes do CTA; fechamento é VIRADA, não resumo.
- Frase-ponte obrigatória no CTA.
- Hierarquia de 3 níveis por slide; accent em ≤ 3 palavras; contraste
  4,5:1; nunca 3 slides seguidos do mesmo tom.
- Padrões de hook do banco (Morte de X, Por que [grupo] está…,
  Investigando…, Contraste, Dois-pontos) — como PADRÃO, nunca o conteúdo.

**Voz deles, NÃO adotar como regra da casa**
- "Segunda pessoa proibida" e "tom jornalístico, nunca prescrever": o
  carrossel da Convertfy que o usuário mais gosta é TODO em "você" ("você
  conhece os seus 8%?", "Agora responde: quantos dos seus clientes…").
  Vira configuração por PERFIL (marca × pessoal), não filtro global.
- Headline condensada uppercase: é o formato Alternado; o Editorial usa
  serif itálico + sans e caixa normal.
- 18 blocos fixos / ±5 palavras: régua deles; a nossa é o limite REAL do
  canvas por frame (`ST_LIMITES`).

**Já coberto por outro caminho**: a checagem de fatos "via web search" —
a ConvertIA tem `web_buscar`; o Estúdio hoje não usa tools. Entra como
passo "Verificar dados" na revisão, depois.

## Ordem proposta (depois das próximas referências)

1. **Filtro editorial** (`lib/conteudo/editorial.ts`, puro): detecta os
   padrões proibidos e devolve violações com trecho e sugestão; entra no
   system prompt como regra e num botão "Revisar copy" com a tabela dos 7
   parâmetros (nota por parâmetro, 8 aprova). Voz por perfil decide a
   régua de 2ª pessoa.
2. **Via B**: `promptImagem` por frame, builder, Copiar/Gerar, híbrido
   como default, frame `gerado`.
3. **Via A**: famílias Editorial e Alternado (CSS do Alternado já pronto).
4. Padrões de hook no prompt de `headlines`.

---

# Rodada 2 (08/09, noite): os 9 documentos lidos — recriar × adaptar × complementar

Leitura dos quatro que chegaram depois (2 carrosséis completos, o system
prompt v4 da Máquina de Carrosséis, o Headline Generator e o Content
Machine) cruzada com o que o Estúdio já tem em `lib/conteudo/ia/`
(`prompt.ts` + `service.ts`: gerar_estrutura one-shot, preencher_frame,
headlines com 5 opções ≤ 56 chars, legenda, distribuir, chat,
analisar_inspiracao, transcrever_referencia, gerar_imagem).

## O que eles têm e nós NÃO temos — recriar

| Peça deles | Como é hoje no Estúdio | Recriar como |
|---|---|---|
| **Pipeline em etapas com aprovação** (triagem → 10 headlines → espinha dorsal → copy → revisão → imagens → render) | `gerar_estrutura` faz tudo de uma vez a partir da pauta | Fluxo do caminho "100% com IA" em passos; cada passo é uma ação com schema; o humano escolhe a headline e aprova a espinha ANTES da copy. É o que separa "gerou um carrossel" de "gerou um bom" |
| **Triagem estruturada** (transformação, fricção central, ângulo dominante, evidências A/B/C + eixo + funil) | não existe | ação `triagem`; resultado gravado em `doc.triagem` e servido em TODAS as ações seguintes (é o contexto que a copy hoje não tem) |
| **Motor de headlines**: 10 opções com padrão declarado + 2 gatilhos + veredito interno; modo DIAGNÓSTICO de headline existente; "ajusta a 3", "mistura a 2 com a 7" | 5 strings, sem padrão nem gatilho | ação `headlines` devolve `{texto, subtitulo, padrao, gatilhos[], veredito}` ×10; ação `diagnosticar_headline`; edição parcial por índice |
| **Espinha dorsal** (headline → hook → mecanismo → prova A/B/C → aplicação → direção) | não existe | ação `espinha`; a copy por frame passa a ser preenchida A PARTIR dela (um frame por campo da espinha, conforme o molde) |
| **Revisão editorial com nota** (7 parâmetros, mínimo 8; reprova um → reescreve) + filtro anti-slop | não existe (só o "compliance" da legenda) | `lib/conteudo/editorial/` puro e testável: `filtroAntiSlop(texto)` devolve violações com trecho e regra; ação `revisar` devolve a tabela dos 7 parâmetros por slide; botão "Revisar copy" no editor |
| **Títulos internos ancorados** (número + tensão, nome concreto; nunca slogan) | regra de tipo `texto` diz "título curto" | regra no prompt + teste da substituição no filtro ("troca o sujeito e continua fazendo sentido? → genérico") |
| **Família visual Alternado claro/escuro** | não existe | fase 2 (CSS pronto) |

## O que é deles e precisa ADAPTAR ao nosso contexto

- **Padrões de lift e gatilhos**: os deles medem conteúdo cultural (Brasil +155%, morte/fim +119%, geracional +119%). Para dono de e-commerce a tabela é outra, e o próprio carrossel "8% → 41%" mostra quais funcionam aqui: **dado contraintuitivo** (8% fazem 41%), **vilão externo** (imposto da Meta, CPM +20%), **conta traduzida para a loja do leitor** (R$ 123 mil/mês), **morte de X** ("a morte do cupom"), **nome de marca como âncora** (Smile.io, Shopify, Meta), **contraste** (cliente novo custa mais × vender de novo custa o mesmo). Gatilhos que valem: medo/alerta, identidade (dono de loja), indignação (paga em dobro), curiosidade, aspiração; nostalgia quase nunca. Mantém-se a RÉGUA deles (≥1 padrão, ≥2 gatilhos, checklist de rejeição), troca-se a TABELA — e a tabela nasce editável, porque o item "loop de dado" abaixo vai calibrá-la.
- **Contagem de palavras**: 14–18 no hook e 8–12 no sub-hook são para a capa DELES (condensada 88px, 4–5 linhas). A nossa capa Editorial é "8% dos clientes fazem 41% do faturamento" (8 palavras). O limite vem do CANVAS por formato (`ST_LIMITES`), não de uma regra fixa. O que fica: texto 1 e texto 2 **independentes sintaticamente**, o 2 nunca começa com conectivo.
- **2ª pessoa e tom jornalístico**: regra por PERFIL (marca × pessoal), nunca global — o carrossel que o usuário mais gosta é todo em "você".
- **Arcos narrativos por tipo** (Tendência → Hook·Contexto·Mudança·Impacto·Ação; Tese contraintuitiva → Crença·Dados·Verdade·Novo modelo·Aplicação; Case → Resultado·Quem·Como·Princípio·Replicar; Previsão → Sinais·Padrão·Direção·Quem ganha·Ações): viram metadado `arco` dos moldes. Benchmark ≈ Case; Turbo ≈ Tese contraintuitiva; faltam **Tendência interpretada** e **Previsão** como moldes.
- **Briefing criativo de 7 perguntas**: perfil, nicho, cor, fonte e estilo já vivem no brand kit do canal. Sobram insumo, tipo/molde, CTA, nº de slides e imagens — é o `NovoFlow` de hoje, mais curto do que o deles.
- **Paleta por nicho / fontes por estilo**: viram PRESETS de brand kit (Editorial bege, Alternado), com a derivação "1 cor primária → paleta inteira" do `principios-de-design`.
- **Legenda**: a deles é gancho ≤ 125 chars + contexto + análise + fontes + CTA + 5–12 hashtags; a nossa é 150–180 palavras sem bloco de hashtag. Mantém a nossa; entra a linha "Fontes:".
- **"Máximo 2 blocos por slide; bloco 1 contextualiza, bloco 2 aprofunda; nunca fechar o slide com afirmação fechada"**: adotar literalmente — é título + corpo dos nossos frames, com o fechamento em gancho.
- **Sugestão de imagem por slide** (< 60% de preenchimento): o renderer sabe o preenchimento REAL de cada frame; a sugestão vira automática e alimenta a via B (prompt por slide).
- **Assinatura fixa** ("Produzido com ajuda de IA inspirado no artigo…"): não adotar como regra; vira campo opcional "insumo/fonte" quando o carrossel nasce de um artigo.
- **Travessão**: o Content Machine proíbe, o manual permite, a NOSSA regra de legenda já proíbe. Fica proibido em tudo — consistência com o que já existe.

## O que eles NÃO têm e é o nosso diferencial — complementar

1. **Referências com métrica real** (few-shot já ligado): o banco deles é estático; o nosso lê salvamentos/compartilhamentos do post real e prioriza por afinidade de molde.
2. **Comment gate ligado ao CRM**: para eles o CTA termina em "Comenta MANUAL"; para nós a palavra-chave é a porta do funil — automação de DM → lead → negócio já existe no Instagram (`setup-automation`). O Estúdio deve criar/ligar a automação da palavra-chave ao publicar. É a razão de o carrossel existir na Convertfy.
3. **Evidências vindas do banco da casa**: a triagem pode puxar cases reais (lojas, receita, flows) em vez de deixar "[confirmar]" — a ConvertIA já tem os conectores de leitura; o Estúdio hoje não usa tools.
4. **Busca web na triagem** (o Content Machine faz no modo "insight"): `web_buscar` já existe na ConvertIA. Entra como "Verificar dados" na revisão e como validação de hipótese na triagem.
5. **Loop de dado próprio**: eles mediram lift em 1.168 posts; nós temos 87 posts sincronizados (0 classificados). Classificar por padrão de headline e cruzar com salvamentos/leads calibra a NOSSA tabela de lift — a régua deles vira hipótese inicial, não verdade.
6. **Via B** (prompt por slide, híbrido) e **edição no sistema com exportação idêntica** — eles renderizam HTML e exportam por Playwright a cada rodada; nós editamos e reexportamos sem regerar.

## Ordem revisada

1. **Motor editorial** — FEITO em 09/09 (ver seção no CLAUDE.md) (maior ganho de qualidade por hora): triagem → 10 headlines com padrão/gatilho/veredito + diagnóstico → espinha dorsal → copy a partir da espinha → revisão 7 parâmetros + filtro anti-slop puro (testes) + títulos ancorados + 2 blocos por slide. Tabelas de padrão/gatilho ADAPTADAS ao e-commerce, editáveis. UI: passos com aprovação no caminho "100% com IA"; botões "Headlines" (10, com diagnóstico da atual) e "Revisar copy" no editor.
2. **Via B** — FEITO em 09/09 (ver seção no CLAUDE.md): `promptImagem` + `imagemModo` por frame, construtor puro (`lib/conteudo/prompt-slide.ts`, 15 testes), painel "Prompt do slide" no editor com Copiar/Gerar (2 variações, GPT Image 2 × Gemini), híbrido como padrão, modo "slide inteiro" explícito (rota `gerar_imagem` com `modo`; renderer full-bleed sem texto), sugestão automática pelo preenchimento real (< 60% e sem imagem). O "frame `gerado`" previsto virou `imagemModo: "completo"` no frame existente — não precisou de tipo novo.
3. **Famílias visuais** Editorial + Alternado, presets de brand kit, moldes Tendência e Previsão com `arco`.
4. **Loop**: CTA → automação da palavra-chave; classificação por padrão de headline; evidências e busca web na triagem.
