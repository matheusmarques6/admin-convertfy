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
