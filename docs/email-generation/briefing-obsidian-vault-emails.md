# Briefing: reorganizar o vault de e-mail para os agentes lerem melhor

**Para quem recebe este documento:** você vai editar o vault do Obsidian
que alimenta o pipeline de geração de e-mail da Convertfy. As regras da
seção 1 não são estilo — são o comportamento medido do sincronizador que
lê este vault. Nota que viole qualquer uma delas continua bonita no
Obsidian e some do pipeline, sem erro em lugar nenhum.

Repositório: `matheusmarques6/All-for-Eficiencia`, branch `main`.
Pasta desta base: **`Admin Convertfy/Emails/`** — e só ela.

> ⚠️ **Não mexa em `Admin Convertfy/Conhecimento/`.** É outro sistema (o
> advisor Max da ConvertIA), com outro sincronizador e outro briefing.
> **Não renomeie nota nenhuma** em `Emails/`: os wikilinks resolvem por
> nome do arquivo e quatro tabelas do banco guardam o caminho. Editar
> conteúdo e frontmatter é seguro; renomear quebra a geração em produção.

O diagnóstico completo que originou este briefing está em
`docs/email-generation/diagnostico-vault-vs-advisor-max.md` no repo
`admin-convertfy`. O resumo: o vault está certo; o que está errado é a
**disposição** — o que entra sempre, o que entra sob demanda, o que nunca
entra. Parte disso se conserta aqui, no dado. O resto é código, e está na
seção 4, fora do seu escopo.

---

## 1. As regras que fazem uma nota existir neste vault

Diferentes das do vault do Max. Estas valem para `Emails/`.

**1. `status: aprovada` — exatamente essa palavra, no feminino.**
`aprovado`, `approved`, `publicado` **não** ativam aqui (o sincronizador
compara a string literal). Duas exceções: `_catalogo.md` usa `status:
gerado`; notas de `lacunas/` usam `status: aberta` — **mantenha `aberta`**,
o código está sendo mudado para servi-las assim.

**2. O caminho é o tipo da nota. Fora do padrão, a nota é ignorada.**

| Caminho (relativo a `Emails/`) | O que o pipeline entende |
|---|---|
| `intencoes/<flow_type>/_flow.md` | intenção do flow inteiro |
| `intencoes/<flow_type>/_progressao.md` | forma observada, toque a toque |
| `intencoes/<flow_type>/<flow>-<n>.md` | intenção de UM toque |
| `estruturas/<flow_type>/<slug>.md` | estrutura de referência |
| `aprendizados/<flow_type>/<slug>.md` · `aprendizados/_global/<slug>.md` | aprendizado (do flow / de todos) |
| `componentes/<arquivo>.md` | protocolo, catálogo, casos, parâmetros, inventário (por nome do arquivo) |
| `componentes/secoes/_<secao>.md` | nota de seção |
| `componentes/requisitos/<slug>.md` · `convivencia/` · `lacunas/` | requisito · convivência · lacuna |
| `componentes/variantes/<secao>/<slug>.md` | variante |
| `componentes/eixos/<eixo>/<valor>.md` | valor de eixo |

Regras derivadas: arquivo na **raiz** de `Emails/` é ignorado (é o caso do
`_INDEX.md`, de propósito); **subpasta a mais** em qualquer ramo =
ignorado (`estruturas/welcome/sub/x.md` não existe para o pipeline);
`componentes/_html/` não é sincronizado.

**3. `<flow_type>` é o slug do produto, com underscore.** Os sete que
existem: `welcome`, `abandoned_cart`, `browse_abandonment`,
`shipping_stages`, `upsell`, `win_back`, `site_abandoned`. `carrinho/`,
`abandoned-cart/` ou `winback/` criam pastas que nunca serão lidas.

**4. Frontmatter simples.** Escalar de uma linha, array inline `[a, b]`
(vírgula dentro de aspas é respeitada) e lista em bloco (`chave:` seguida
de `- item`). **Não** aceita `>` dobrado nem objeto aninhado — `peso: {
altura_px: 949, classe: medio, fonte: medido }` chega como string e é lido
por regex, então mantenha exatamente esse formato.

**5. Todo valor de eixo precisa ter nota.** `momento: [welcome-1]` exige
`componentes/eixos/momento/welcome-1.md`. `python .tools/valida.py` reprova
valor sem nota — rode depois de qualquer edição de frontmatter de variante,
e `python .tools/gera_catalogo.py` em seguida (o `_catalogo.md` é gerado;
nunca edite à mão).

**6. Aprendizado `escopo: cross-flow` exige `aplica_a: [...]`** com os
`flow_type` do item 3. Sem isso o sincronizador reprova a nota.

**7. Wikilinks resolvem por nome de arquivo**, como no Obsidian. Mover de
pasta muda o tipo (regra 2) — não mova. Renomear quebra — não renomeie.

**Como conferir:** no admin, aba Conhecimento → sincronizar → o card
"Notas puladas" lista o que falhou e por quê. Hoje: 223 arquivos, 222
sincronizados, 1 ignorado (`_INDEX.md`). Depois das suas mudanças o número
de puladas tem de continuar zero.

---

## 2. As tarefas, na ordem

Cada uma diz o que muda, onde, e como saber que ficou pronto. As três
primeiras desfazem erros medidos em produção; as demais são a
reorganização.

### T1 — `modo:` e o contrato tipado nas 8 intenções do welcome

**Por quê:** nenhuma das 8 notas tem `modo:` no frontmatter. O agente que
escolhe a objeção do toque (Seletor) deduz o modo da prosa e a telemetria
marca `modo_origem: deduzido`. O sincronizador grava o frontmatter
inteiro a cada sync, então o dado só sobrevive se morar na nota.

**Onde:** `intencoes/welcome/welcome-1.md` … `welcome-8.md`.

**O que fazer:** manter as chaves que já existem (`tipo`, `flow_type`,
`email_number`, `status`, `revisado_por`) e **acrescentar** o bloco de
cada e-mail abaixo. Vocabulário fechado — valor fora dele reprova por
código:

- `modo` ∈ `quebra_de_objecao` · `varredura_de_objecoes` ·
  `confirmacao_por_terceiros` · `varredura_de_canal` ·
  `fechamento_de_ciclo` · `manutencao_de_confianca`
- `riscos_*` ∈ `financeiro` `desempenho` `tempo` `psicologico` `social`
  `seguranca` `adequacao`
- `profundidade_minima` ∈ `afirmacao` < `mecanismo` < `prova_de_terceiro`
  < `garantia`
- `aliviadores_*` ∈ `garantia_de_devolucao` `prova_de_terceiro`
  `prova_por_volume` `demonstracao_de_mecanismo`
  `transparencia_de_politica` `amostra_ou_teste` `dado_de_adequacao`
  `comparacao_de_categoria` `seguranca_de_pagamento` `reputacao_da_loja`
  (ou `[todos]`)
- `veiculos_exigidos` ∈ `origem_da_marca` `economia_do_preco`
  `operacao_por_pedido` `mecanismo_unico`
- `trabalhos_fixos` ∈ `entrega_de_incentivo` `lembrete_de_incentivo_vivo`
  `prazo_com_hora` `custo_de_adiar_sem_hora` `prova_secundaria`
  `remocao_de_risco` `espelho_do_cetico`
- `fonte_das_objecoes` ∈ `nao_atacadas` · `ja_atacadas` ·
  `medos_de_categoria`
- `dimensao_alvo` ∈ `competencia` · `integridade` · `benevolencia`

**welcome-1**
```yaml
modo: quebra_de_objecao
n_objecoes: [1, 1]
fonte_das_objecoes: nao_atacadas
exige_dominante_da_categoria: true
riscos_elegiveis: [desempenho, psicologico, financeiro, adequacao, seguranca]
profundidade_minima: afirmacao
aliviadores_admissiveis: [todos]
trabalhos_fixos: [entrega_de_incentivo, prova_secundaria, remocao_de_risco]
permite_reataque: false
dimensao_alvo: competencia
proibicoes:
  - história longa da fundação (profundidade tem toque próprio)
  - pedido de engajamento paralelo (rede social, preferências) — um pedido só
  - urgência artificial
  - esgotar os argumentos — uma objeção só, bem atacada
  - condição nova no incentivo
```

**welcome-2**
```yaml
modo: varredura_de_objecoes
n_objecoes: [4, 5]
fonte_das_objecoes: nao_atacadas
riscos_elegiveis: [desempenho, financeiro, tempo, adequacao, seguranca]
riscos_vetados: []
profundidade_minima: afirmacao
aliviadores_admissiveis: [todos]
aliviadores_vetados: [prova_de_terceiro, prova_por_volume]
trabalhos_fixos: [custo_de_adiar_sem_hora, remocao_de_risco]
permite_reataque: false
proibicoes:
  - repetir a tese do toque 1 no mesmo registro
  - prazo com hora fechada
  - aumentar ou sinalizar melhora do incentivo
  - depender de prova social — o assunto é decisão, não confiança
```

**welcome-3**
```yaml
modo: quebra_de_objecao
n_objecoes: [1, 1]
fonte_das_objecoes: nao_atacadas
riscos_elegiveis: [desempenho, financeiro, psicologico]
profundidade_minima: mecanismo
aliviadores_admissiveis: [demonstracao_de_mecanismo, comparacao_de_categoria, transparencia_de_politica, garantia_de_devolucao]
veiculos_exigidos: [origem_da_marca, economia_do_preco, operacao_por_pedido]
trabalhos_fixos: [lembrete_de_incentivo_vivo, remocao_de_risco]
permite_reataque: true
dimensao_alvo: competencia
proibicoes:
  - urgência nova
  - aumentar o incentivo — não recompensar a espera
  - reapresentar a varredura do toque 2
  - esconder a saída rápida de quem já decidiu
```

**welcome-4**
```yaml
modo: confirmacao_por_terceiros
n_objecoes: [2, 3]
fonte_das_objecoes: ja_atacadas
profundidade_minima: prova_de_terceiro
aliviadores_admissiveis: [prova_de_terceiro, prova_por_volume]
trabalhos_fixos: [lembrete_de_incentivo_vivo, espelho_do_cetico]
permite_reataque: true
dimensao_alvo: competencia
proibicoes:
  - argumentar em voz de marca
  - empurrar catálogo
  - mexer no incentivo
  - pedir mais do que segundos de leitura
```

**welcome-5**
```yaml
modo: varredura_de_canal
n_objecoes: [3, 6]
fonte_das_objecoes: medos_de_categoria
riscos_elegiveis: [seguranca, tempo, psicologico, financeiro]
profundidade_minima: afirmacao
aliviadores_admissiveis: [transparencia_de_politica, reputacao_da_loja, seguranca_de_pagamento, garantia_de_devolucao, prova_por_volume]
trabalhos_fixos: [lembrete_de_incentivo_vivo]
permite_reataque: false
dimensao_alvo: integridade
proibicoes:
  - nomear concorrente específico — comparar contra a categoria
  - repetir o registro dos toques anteriores (tese, varredura, mecanismo, prova)
  - superlativo vazio
  - alegar o que a operação não sustenta — cada medo riscado é uma promessa
```

**welcome-6**
```yaml
modo: fechamento_de_ciclo
n_objecoes: [0, 0]
riscos_elegiveis: []
profundidade_minima: prova_de_terceiro
trabalhos_fixos: [prazo_com_hora, prova_secundaria, remocao_de_risco]
permite_reataque: false
dimensao_alvo: integridade
proibicoes:
  - reargumentar ou reabrir deliberação
  - aumentar o incentivo
  - números de escassez sem lastro real
  - prazo que o toque seguinte não vá honrar
```

**welcome-7**
```yaml
modo: fechamento_de_ciclo
n_objecoes: [0, 0]
riscos_elegiveis: []
trabalhos_fixos: [prazo_com_hora]
permite_reataque: false
dimensao_alvo: integridade
proibicoes:
  - qualquer argumento, prova, catálogo ou história
  - repetir escassez numérica do toque 6
  - existir em outro dia que não o do toque 6
  - mudar o incentivo ou o prazo
```

**welcome-8**
```yaml
modo: fechamento_de_ciclo
n_objecoes: [0, 0]
riscos_elegiveis: []
trabalhos_fixos: [prazo_com_hora]
permite_reataque: false
dimensao_alvo: benevolencia
promessa_a_pagar: a extensão é única e definitiva — depois dela, nunca mais
proibicoes:
  - fingir que o prazo não venceu
  - estender duas vezes
  - aparato visual de campanha — a quebra de formato é o mecanismo
  - pedir desculpas pelo prazo
  - reargumentar
```

**Pronto quando:** as 8 notas têm `modo:`; sync sem nota pulada.

### T2 — body-3 e body-4: a nota e o banco descrevem peças diferentes

**Por quê:** o pipeline decide sobre a prosa da nota e monta o HTML da
linha do banco. Quando as duas falam de peças diferentes, o Curador
escolhe uma coisa e o e-mail sai com outra. Isso aparece como
`catalogo_divergente` em todas as runs.

**Onde:** `componentes/variantes/body/body-3-pitch-de-gift-card.md` e
`componentes/variantes/body/body-4-comparativo-em-duas-colunas.md`.

**O que o banco diz de cada uma** (é o HTML que será montado — a nota tem
de descrever ESTA peça):

- **body-3** (`variant_id 4e9726d1-40fe-40ce-aa81-c2a33b062603`, nome no
  banco "body 3 - bridge features cards"): *"Bloco de venda de
  vale-presente. Título, dois parágrafos curtos e o botão resolvem a
  oferta; abaixo, três selos circulares com os valores da marca fecham a
  peça. Momento de uso: campanha de presente ou fim de ano, quando o
  produto é abstrato — um vale, um crédito — e o que precisa ser vendido é
  a confiança na marca por trás dele."*
- **body-4** (`variant_id 63736c6c-7d1b-4c7c-83ea-bae15599f1d7`, "body 4 -
  bridge fundo cards"): *"Bloco de comparação direta contra a
  concorrência. Duas colunas lado a lado — a marca de um lado, 'os outros'
  do outro — cada uma com foto circular, título e uma lista de atributos
  marcados item a item. Momento de uso: consideração ou e-mail de USP,
  quando o cliente está decidindo entre a marca e alternativas mais
  baratas e a objeção é 'por que pagar mais'."*

**O que fazer:** reler cada nota contra o HTML em `componentes/_html/` e
ajustar a "Descrição curta" e a "Descrição detalhada" para a peça que o
HTML de fato é. Se a nota estiver certa e o `variant_id` apontar para a
peça errada, **não troque o id** — registre em `lacunas/` (o id só pode
ser corrigido com acesso ao banco).

**Pronto quando:** a primeira frase de cada nota descreve o mesmo objeto
que o texto do banco acima.

### T3 — Duas lacunas que a telemetria já provou

**Onde:** `componentes/lacunas/`. Frontmatter no padrão das vizinhas:

```yaml
---
tipo: lacuna
sobre: biblioteca
secao: <secao ou geral>
descoberta_em: 2026-09-09
status: aberta
---
```

1. **`reputacao-da-loja-sem-bloco-ativo.md`** — em 4 de 4 runs recentes
   do welcome-1 o alvo pediu o aliviador `reputacao_da_loja` (risco
   `seguranca`: "nunca ouvi falar dessa marca, o site parece pequeno") e
   nenhuma posição da peça o realiza. O único body de `confianca-no-canal`
   (`body-5-comparacao-nos-vs-eles`) está inativo. Registrar: o que
   faltaria (bloco de garantias/selos/política com `objecao:
   [confianca-no-canal]`, `papel_na_peca: meio`), e que `welcome-5` sofre
   do mesmo (já em `welcome-5-sem-variante-ativa`).
2. **`exige-cupom-sem-perfil-de-ativos.md`** — hero-3, hero-5 e hero-6
   declaram `exige: [cupom-ativo]`; o alvo do Seletor proíbe "inventar
   código, valor ou expiração de incentivo" quando a loja não confirmou
   promoção ativa; nenhum campo da loja responde "tem cupom ativo?". Em 4
   de 4 runs a hero escolhida exige o que o alvo proíbe. Apontar para
   `_parametros-da-loja` Parte 2 e para `o-que-o-curador-ainda-nao-tem`
   itens 1 e 4.

**Pronto quando:** as duas notas existem com `status: aberta` (sim,
inativas — o código passa a servi-las).

### T4 — `componentes/_julgamento.md`: como a casa decide um e-mail

**Por quê:** o Max tem uma persona de 14k que entra em toda resposta e
carrega o julgamento. Os agentes de e-mail recebem procedimento (os 9
passos) e nenhum julgamento; a precedência entre fontes vive em código.
Esta nota é o equivalente — servida sempre, antes do protocolo.

**Forma:** `tipo: julgamento`, `status: aprovada`, **≤ 8.000 caracteres**
(entra em toda chamada; cada linha custa). Abre com uma frase de prosa.
Quatro seções, nesta ordem:

1. **O que nunca fazemos** — cada item com a fonte (wikilink). Puxe de
   `_flow.md` (regras do incentivo 1–6), das intenções (`proibicoes`), dos
   aprendizados globais (`incentivo-precisa-existir-em-texto`,
   `cada-alegacao-e-uma-promessa-operacional`,
   `um-cta-dominante-em-email-curto`) e do que os alvos vêm proibindo:
   inventar incentivo, depoimento, prazo ou selo; urgência antes do toque
   que a pede; segunda objeção no toque de uma só; sequência repetida
   entre irmãos; prova social gasta cedo.
2. **O que perguntamos antes de decidir** — a Parte 2 de
   `_parametros-da-loja` virada em perguntas: a loja tem cupom ativo? tem
   avaliação real com nome? tem foto de estúdio em fundo claro? tem
   política de troca publicada? tem mais de N produtos com link? **Sem a
   resposta, o bloco que exige o ativo não é "pior" — é impossível, e o
   slot fica declarado.**
3. **Quem vence quando as fontes discordam** — na forma do
   `mapa-do-conhecimento` do vault do Max: pesquisa da loja com evidência
   > alvo do Seletor > aprendizado com origem > estrutura de referência >
   doutrina de curso > preferência do modelo. E a regra: **escolha a de
   cima e diga qual perdeu** — nunca resolver em silêncio.
4. **Quando recusar** — posição sem variante que sirva ao alvo não é
   "escolher a menos ruim": é declarar, deixar o slot para o template
   global e nomear a lacuna (o vizinho mais próximo, como o Max faz).

**Pronto quando:** a nota existe com ≤ 8k e `status: aprovada`. Ela vai
aparecer como "kind outro" no sync até o código reconhecer `julgamento` —
é esperado, não é erro.

### T5 — `serve_a:` nos aprendizados

**Por quê:** os 18 aprendizados entram inteiros em toda chamada do
Estruturador (17.6k) e de novo no Curador (14.4k), porque `aplica_a` só
discrimina por flow. As estruturas já dizem `emails: [2]`; os aprendizados
não dizem nada.

**Onde:** as 11 notas de `aprendizados/welcome/` e as 7 de
`aprendizados/_global/`.

**O que fazer:** ler cada nota e acrescentar `serve_a:` com os toques em
que ela muda a decisão — `serve_a: [welcome-1, welcome-2]` — ou
`serve_a: [todos]` quando vale para o flow inteiro. Regra de bolso: se a
nota fala de um dispositivo (prazo, extensão, prova social, vitrine), ela
serve aos toques em que o dispositivo aparece na `_progressao.md`; se
fala de escrita (título carrega o argumento, CTA único), serve a todos.
Mantenha `aplica_a` como está.

**Pronto quando:** 18 de 18 têm `serve_a:`; nenhuma lista vazia.

### T6 — Primeira frase auto-explicativa, em toda nota que o agente pode abrir

**Por quê:** o Max escolhe o que abrir pelo título e pelo resumo (a
primeira frase de prosa, 320 caracteres). O índice servido ao Curador
hoje é "pasta → nº de notas", e vai passar a ser "título + primeira
frase". Nota que abre com `#`, tabela ou lista produz resumo vazio e nunca
será escolhida.

**Onde:** as 44 variantes, as 8 notas de seção, as 6 de convivência, as
15 lacunas, as 8 estruturas, os 18 aprendizados. (Eixos e requisitos
podem ficar como estão.)

**O que fazer:** logo depois do frontmatter, **antes de qualquer `#`**,
uma frase corrida que diga do que a nota trata para quem não sabe onde
ela está. Para variante, a "Descrição curta" já é essa frase — basta
movê-la para cima do primeiro `#` (a seção "Descrição curta" pode
continuar existindo abaixo; o `valida.py` procura os títulos, não a
posição). Exemplo para `hero-10-lineup-de-colecao`:

> Bloco de meio de e-mail que diz "a solução é o conjunto, não um
> produto": título, subtítulo, CTA e depois a foto, para rotina, kit ou
> coleção quando o cliente ainda está conhecendo a amplitude do catálogo.

**Também em `.tools/`:**

- `valida.py`: regra nova — o corpo (depois do `---` de fechamento) tem de
  começar com prosa; reprovar nota cujo primeiro caractere não-branco é
  `#`, `|`, `-`, `>` ou `` ` ``.
- `gera_catalogo.py`: coluna nova `resumo` com essa primeira frase
  (cortada em 320), depois da coluna `secao`. É o que o código vai servir
  ao Curador como índice, no lugar dos 128k de prosa.

**Pronto quando:** `valida.py` passa com a regra nova; `_catalogo.md`
regenerado tem a coluna `resumo` em todas as 44 linhas.

### T7 — `componentes/doutrina/`: notas de ponte para a doutrina do Max

**Por quê:** a fase 2 (hero, assunto, copy) não lê vault nenhum, e a
doutrina de design e copy do Max está em `Conhecimento/Advisors/Max/`,
que os agentes de e-mail não veem. Não se copia nota de lá para cá
(autoria e contrato diferentes). Faz-se ponte: uma nota curta aqui que
traduz a regra para o vocabulário do vault (seções, eixos,
`papel_na_peca`) e aponta a origem no campo `fonte:`.

**Forma:** `componentes/doutrina/<slug>.md`, `tipo: doutrina`, `secao:`
(a seção do e-mail a que serve, ou `geral`), `fonte:` com o caminho da
nota do Max (wikilink entre vaults não resolve — use o caminho em texto),
`status: aprovada`, **≤ 6.000 caracteres**, primeira frase em prosa.

| Nota | Serve a | Origem no Max (`Conhecimento/Advisors/Max/`) |
|---|---|---|
| `hero-quatro-itens-above-the-fold.md` | `hero` | `design/secao-hero.md` (headline, gráfico, value prop, botão; "75% do esforço") — traduzir para: o que uma variante de hero precisa ter para passar; o que `hero-9`/`hero-2` deixam de fora |
| `botao-e-clique.md` | `hero`, `cta`, `offer` | `design/principio-ease-of-click.md` + `numeros-de-design.md` (botão above the fold, tamanho, centralizado, contraste; "nunca perdeu A/B") |
| `varredura-nao-leitura.md` | `body` | `design/principio-skimmability.md` + `doutrina/otimize-para-a-varredura-nao-para-a-leitura.md` — cruzar com o aprendizado `titulos-precisam-carregar-o-argumento` |
| `transicoes-entre-secoes.md` | `geral` | `design/transicoes-entre-secoes-do-email.md` — o que impede a pessoa de parar de rolar; vira critério de `convivencia` |
| `bridge-depois-da-hero.md` | `body` | `design/secao-bridge.md` — apoiar a hero e levar ao produto; mapear para `papel_na_peca: meio` |
| `subject-line-e-preview.md` | `geral` | `copy/subject-lines.md` + `copy/preview-texts.md` — as 4 regras e "não fica bonitinho"; **respeitar o aviso de autoria da nota de origem** (parte é de outro narrador) |
| `o-que-evitar-na-copy.md` | `geral` | `copy/o-que-evitar-na-copy.md` + `copy/principio-clear-e-conciso.md` |
| `fillers-do-welcome.md` | `geral` | `flows/welcome-fillers.md` — os 7 ângulos (our story, FAQ, how it works, what's inside, social proof…) como candidatos a intenção de toque |

**Pronto quando:** 6 a 8 notas existem, cada uma com `fonte:` preenchido e
≤ 6k. Vão aparecer como puladas no sync até o código reconhecer a pasta
— esperado.

### T8 — Intenções para os seis flows que não têm nenhuma

**Por quê:** só o welcome tem `_flow`, `_progressao` e intenções. Os
outros seis flows somam 1.639 e-mails na base e pulam os dois primeiros
agentes (`sem_intencao`, `sem_material`).

**Onde e quantos toques cada flow tem no produto:**

| Pasta (exata) | Toques | Modo sugerido | Origem no Max (`Conhecimento/Advisors/Max/flows/`) |
|---|---|---|---|
| `intencoes/abandoned_cart/` | 8 | `quebra_de_objecao` / `fechamento_de_ciclo` | `cart-checkout-abandon.md` (são dois flows, cart e checkout — a nota explica), `conteudo-dinamico-klaviyo.md` |
| `intencoes/browse_abandonment/` | 5 | `quebra_de_objecao` | `browse-abandon.md` |
| `intencoes/site_abandoned/` | 1 | `quebra_de_objecao` | `site-abandon.md` |
| `intencoes/upsell/` | 4 | `manutencao_de_confianca` → `quebra_de_objecao` | `post-purchase.md`, `replenishment.md` |
| `intencoes/win_back/` | 3 | `quebra_de_objecao` / `fechamento_de_ciclo` | `winback.md`, `sunset.md` |
| `intencoes/shipping_stages/` | 5 | `manutencao_de_confianca` (todos), com `promessa_a_pagar` e `dimensao_alvo: benevolencia` | não há nota do Max — é transacional; escrever da operação |

**O que fazer, por flow:**

1. `_flow.md` — `tipo: intencao`, `escopo: flow`, `flow_type: <pasta>`,
   `flow_tamanho: <n>`, `status: rascunho`. Mesma forma do
   `intencoes/welcome/_flow.md`: a intenção do flow inteiro, o eixo
   (que objeção cada toque ataca), as regras transversais.
2. `<flow>-<n>.md` para cada toque — `tipo: intencao`, `flow_type`,
   `email_number`, `modo`, `status: rascunho`, mais os campos do contrato
   (T1) que fizerem sentido. Corpo na forma do `welcome-1.md`: "o que este
   e-mail deve fazer", "o que NÃO deve fazer", e o que precisa ser verdade
   quando a pessoa termina de ler.
3. `_progressao.md` só se houver referência observada — não inventar.

**Nomes de arquivo:** `abandoned_cart-1.md`, `browse_abandonment-1.md`…
(o slug é livre, mas mantenha `<flow>-<n>` como no welcome).

**Deixe `status: rascunho`** — humano revisa e promove para `aprovada`.
Rascunho não entra no pipeline, e é isso que se quer até a revisão.

**Pronto quando:** as seis pastas existem com `_flow.md` e um arquivo por
toque, todos em rascunho.

### T9 — (opcional) Moldes para o ciclo que aprende

- `componentes/lacunas/_modelo.md` com `status: modelo` (inativa): o
  frontmatter e as três seções que toda lacuna tem ("O que falta", "Por
  que importa", "O que se perde hoje"). O código vai gerar rascunhos de
  lacuna a partir da telemetria nesse molde.
- `componentes/_registro-de-descartes.md` com `status: aprovada`: o que o
  código desfez de uma escolha do Curador e por quê (hero dupla, id
  inválido, cobertura insuficiente). Comece vazio, com a forma; o
  conteúdo vem da telemetria.

---

## 3. O que NÃO fazer

- **Não renomear.** Nem arquivo, nem pasta.
- **Não mover nota entre pastas.** O caminho é o tipo.
- **Não reescrever `_protocolo-de-selecao.md`.** Ele está certo; o que
  falta é o julgamento antes dele (T4) e o roteamento em volta (T5, T6).
- **Não copiar nota do Max para cá.** Ponte com `fonte:`, sim (T7).
- **Não promover rascunho para `aprovada`** nas intenções novas (T8) sem
  revisão humana: aprovada entra no pipeline de produção.
- **Não editar `_catalogo.md` à mão.** Rode `gera_catalogo.py`.
- **Não trocar `variant_id`** de nota nenhuma sem acesso ao banco.
- **Não usar `aprovado`/`approved`.** Aqui é `aprovada`.

---

## 4. O que fica fora do Obsidian — para acompanhar as medidas

Nada abaixo é seu. Está aqui para quem lê saber o que vem depois e por
onde medir.

### 4.1 Código do lado do vault (sincronizador e o que ele serve)

| Peça | O que muda | Desbloqueia |
|---|---|---|
| Lacunas servidas | `status: aberta` ativa `kind='lacuna'`; `retratada`/`observacao` não | T3 chega ao Curador |
| Kinds novos no parser | `componentes/_julgamento.md` → `julgamento`; `componentes/doutrina/*` → `doutrina` | T4, T7 deixam de ser puladas |
| Índice servido | pastas com contagem → título + primeira frase (do `_catalogo` com coluna `resumo`) | T6 vira o índice do Curador |
| Catálogo enxuto | `buildCatalogo()` serve o `_catalogo.md` no lugar dos 128k de prosa | T6 |
| Ferramenta `buscar_doutrina` | busca semântica restrita a `Advisors/Max/{design,copy,flows,doutrina,fundamentos}`, rotulada "doutrina de curso" | T7 |
| Lacunas automáticas | violação recorrente (3ª ocorrência do mesmo tipo+detalhe) vira rascunho no molde de T9 | T9 |
| Casos de teste como assert | Caso A e B de `_casos-de-teste.md` rodando contra a régua de código | — |

### 4.2 Código do lado dos agentes (outra sessão)

| Item | O agente precisa fazer |
|---|---|
| Julgamento | var `{{julgamento}}` no system do Estruturador e do Curador, antes do protocolo |
| Roteamento | Estruturador filtra estruturas por `emails:` e aprendizados por `serve_a:`; Curador não recebe os aprendizados de novo |
| Catálogo enxuto | trocar `{{catalogo}}` (128k) pelo índice; prosa da finalista por `ler_nota`, teto de 6 consultas |
| Doutrina | registrar `buscar_doutrina`; `{{doutrina_hero}}` no hero, `{{doutrina_assunto}}` no assunto; `doutrina` no payload de copy |

### 4.3 As medidas

Onde ler: Estúdio de Agentes (`/admin/agents/studio`, run a run) ou SQL em
`email_generation_runs.parsed_output`.

| Medida | Hoje | Alvo | Depende de |
|---|---|---|---|
| `lacunas_servidas` por run do Curador | 0 | > 0 quando a seção tem lacuna | T3 + 4.1 |
| `protocol_violations` do tipo `proibicao_violada × exige` | 4 de 4 runs | 0 | T4 + `{{julgamento}}` |
| `aliviador_ausente` sem lacuna registrada | sim | lacuna existe | T3 |
| `catalogo_divergente` | body-3, body-4 | `[]` | T2 |
| `modo_origem` no Seletor | `deduzido` | `declarado` | T1 |
| `tokens_input` médio do Curador | 67.161 | ≤ 30.000 | T5, T6 + roteamento e catálogo enxuto |
| `consultou_vault` | 3 de 8 runs | ≥ 6 de 8 | T6 + índice novo |
| Flows com intenção | 1 de 7 | 7 de 7 (6 em rascunho até revisão) | T8 |
| `skipped: sem_intencao` / `sem_material` | todos os flows fora do welcome | 0 nos flows aprovados | T8 + revisão |
| Agentes da fase 2 que leem vault | 0 de 6 | hero, assunto, copy | T7 + vars |
| Notas puladas no sync | 0 (1 ignorada) | 0 | todas |
