# As quatro gerações de 09/09 — mapa completo dos defeitos

Tudo aqui foi **medido no banco de produção** em 09/09, não inferido dos
prints. Onde não consegui medir, está dito.

---

## 0. O retrato

| # | batch | loja / e-mail | status | HTML | issues QA | custo |
|---|---|---|---|---|---|---|
| 1 | `4ca1fa5a` | Hero Boxers · Welcome 1 | ready | 55,6 KB | 9 | US$ 6,59 |
| 2 | `1b77a2da` | Innova Bay · Welcome 1 | ready | 82,3 KB | **26** | US$ 5,89 |
| 3 | `aa6bf304` | Innova Bay · Welcome 2 | ready | 66,7 KB | 8 | US$ 4,77 |
| 4 | `7ec77a9b` | Hero Boxers · Welcome 2 | **draft** | — | — | US$ 1,85 |

**US$ 19,10 · nenhum entregável.**

Nas últimas 36 h houve **12 batches**, não 4 — os outros 8 morreram antes de
chegar a HTML e não aparecem na tela de e-mails.

### O estado das duas lojas (é o pano de fundo de metade dos defeitos)

| | ficha operacional | catálogo de objeções | incentivo | paleta |
|---|---|---|---|---|
| Hero Boxers | ✅ existe | ✅ existe | `existe: null` | `#000000, #ffffff` · nomes: *"Nova cor, Nova cor"* |
| Innova Bay nova | ❌ **ausente** | ❌ **ausente** | — | — |

Sem catálogo, o `seletor` gravou `skipped` nos **dois** batches do Innova
Bay. Sem alvo de objeção, o Estruturador volta ao modo antigo e o
`condicionarOutline` não tem decisão de incentivo para condicionar nada.

### O que eu NÃO consegui medir

O Storage do Supabase é bloqueado pela política de rede desta sessão
(`CONNECT tunnel failed, 403`). **Não abri nenhuma das imagens geradas** —
a leitura visual delas vem dos seus prints, e está marcada como tal. Tudo o
mais é medição.

---

## A. Imagem — 10 defeitos

### A1 · Os selos saem com a cor da PEÇA DE REFERÊNCIA, não da loja 🔴

**Sintoma (print).** Três círculos salmão / verde escuro / verde claro,
**iguais nas duas lojas**, sem relação com nenhuma das duas marcas.

**Evidência.** O `input_vars` da run `04bc9eee` (agente `image`, campo
`seal_2_image`) mostra as duas informações lado a lado:

```
PHOTO_DIRECTION (declarada FONTE PRINCIPAL — CFY_PRIMARY_BRIEF):
  Cor primária   #2A4439 — Título, copy e fundo do selo 2
  Cor secundária #D88B71 — ...
  Cor terciária  #B0C4AB — ...

IMAGE_SLOTS → especificidade:
  "círculo chapado em #2A4439 (cor primária)"

… e, em outra variável, a paleta REAL da loja:
  PALETA_1 = #000000   PALETA_2 = #ffffff   BG_COLOR = #FFFFFF
```

**Causa.** O brief da variante `body 3` **nomeia hex de outra marca como
"cor primária/secundária/terciária"**. Desde a migration 20261108 o
`PHOTO_DIRECTION` é a fonte principal do prompt de imagem, com precedência
declarada — o modelo obedece a ele, não à variável de paleta.

**Correção.** Duas saídas, ambas válidas:
1. O builder substitui os hex citados no brief pelos da loja antes de
   servir (mapeando primária→primária); ou
2. o cadastro da biblioteca passa a falar por PAPEL ("círculo chapado na
   cor secundária da marca") e nenhum hex viaja no brief.

A (2) é mais correta e exige varrer os briefs das variantes; a (1) resolve
hoje sem tocar na biblioteca.

### A2 · A loja não tem paleta cadastrada 🔴

**Evidência.** Hero Boxers: `color_names = "Nova cor, Nova cor"`,
`primary_colors = "#000000, #ffffff"`.

Mesmo consertando o A1, **não há cor da loja para aplicar** — o pipeline
aplicaria preto e branco. Lacuna de DADO. As duas lojas precisam da paleta
preenchida antes de qualquer geração valer.

### A3 · Os selos saíram vazios — contradição dentro do mesmo prompt 🔴

**Defeito meu, introduzido ontem** com a natureza `copy_no_desenho`.

**Evidência.** O mesmo campo aparece nas DUAS listas do `IMAGE_SLOTS`
servido ao modelo:

```
areas_de_texto (o HTML escreve estes textos POR CIMA da imagem —
                deixe estas regiões limpas, sem desenhar nada nelas):
- seal_2_center: linha de texto, ~11 caracteres        ← NÃO desenhe
- seal_2_arc: linha de texto, ~28 caracteres

texto_no_desenho (DESENHE estas palavras DENTRO da imagem, exatamente
                  como estão entre aspas…):
- seal_2_center: "EASY RETURN"                          ← DESENHE
- seal_2_arc: "NO COST · NO QUESTIONS ASKED"
```

**Causa.** `areasDeTexto` (`src/lib/agents/image/build-image-slots.ts:107`)
filtra por TIPO do campo:

```ts
if (f.type !== "text_short" && f.type !== "text_long" && f.type !== "number") {
  continue
}
```

e **não exclui a natureza `copy_no_desenho`**. O campo entra nas duas
listas. O modelo obedeceu a primeira instrução (deixar limpo) e o círculo
saiu chapado.

**Agravante.** Como `copy_no_desenho` **não tem endereço no HTML** por
definição, o texto também não é escrito por cima. As palavras "EASY RETURN"
e "NO COST · NO QUESTIONS ASKED" **desapareceram das duas pontas** — não
estão no pixel nem no HTML.

**Correção.** Uma linha em `areasDeTexto`: pular campos cuja
`deriveFieldNature(f) === "copy_no_desenho"`.

### A4 · Corte cego de 14 % a 38 % de toda imagem gerada 🔴

É o que você chamou de "imagem esticada". Tecnicamente não é distorção — é
**corte**, e o efeito visual de um corpo cortado nas laterais é o de um
corpo alongado.

**Causa.** O `aspect_ratio` mandado ao modelo sai de uma **lista fechada de
8 valores** (`src/lib/agents/image/aspect-ratio.ts:17`), enquanto o slot
declara dimensões EXATAS. Depois, `image.chain.ts:855` faz:

```ts
sharp(imageBuffer).resize(dims.width, dims.height, { fit: "cover", position: "center" })
```

`cover` preenche a caixa e **descarta o excedente**.

**Medido, slot a slot:**

| slot | proporção real | pedido ao modelo | gerado | perda no corte |
|---|---|---|---|---|
| `COLUMN_A_TOP` 272×212 (**paisagem**) | 1,28 : 1 | **4:5** (retrato) | 1200×1500 | **38 % da altura** |
| `SECTION_IMAGE_ALT` 1196×978 (**paisagem**) | 1,22 : 1 | **4:5** (retrato) | 1200×1500 | **35 % da altura** |
| `PANEL_1_MAIN_PHOTO` 314×733 | 0,43 : 1 | 9:16 | 900×1600 | **24 % da largura** |
| `REVIEW_1_PORTRAIT` 241×349 | 0,69 : 1 | 4:5 | 1200×1500 | 14 % |
| `PRODUCT_KIT_GRID` 292×332 | 0,88 : 1 | 4:5 | 1200×1500 | 9 % |
| `SEAL_*` 166×166 | 1 : 1 | 1:1 | 1200×1200 | 0 % ✅ |

Os dois piores são **paisagem pedida como retrato**: o modelo compõe uma
imagem vertical e nós entregamos a tira do meio.

**O absurdo.** O prompt **já imprime a proporção certa** para o modelo ler:

```
formato: 314x733px · proporção 314:733
```

e manda no parâmetro `aspect_ratio` um valor da lista de 8. O código
conhece a geometria (`input_summary` grava `Geometria: 314×733 (schema)`) e
não a usa para pedir.

**Correção.** `resolveAspectForField` passa a derivar a proporção das
dimensões do slot quando elas existem (`customDims`), em vez de cair na
lista. Alternativa mínima: escolher da lista o valor **mais próximo** da
proporção real, em vez do herdado do bloco/flow — já cortaria o erro de
38 % para ~8 %.

### A5 · ~~A hero foi gerada, paga e jogada fora~~ — **ERRADO** ✅

**Retratado em 10/09.** O item dizia que a hero era gerada e descartada,
citando três `token_nao_encontrado` do `image_format`:

```
1b77a2da  hero_flatlay_kit            → sem_lugar
aa6bf304  hero_campanha_monocromatica → sem_lugar
4ca1fa5a  section_image_alt           → sem_lugar
```

Os três são de campos da HERO, e o `image-merge` **exclui a região da
hero de propósito** (`image-merge.ts:16` — *"a imagem da hero é posse do
agente de hero"*). O consumidor dela é outro: `hero_image_url`, via
`imageMap`, lido pelo agente de hero.

Verificado nos três batches: a URL gravada em `content.images` **está no
HTML final**, e o `hero_report` de cada run diz `imagem: "aplicada"`. A
hero funciona.

Dois erros de método meus produziram o item: li `sem_lugar` como perda
sem checar quem mais consome aquela imagem, e conclui "hero vazia" de um
`input_vars->>'hero_image_url'` vazio — quando o `input_vars` do
`hero_section` guarda apenas 4 chaves e essa não é uma delas.

**O que sobrou de verdadeiro** está no A6, e foi corrigido.

**Cai junto o B3** ("sem hero no Innova Bay Welcome 1"), que era
consequência deste.

### A6 · Três imagens pagas e descartadas por bloco repetido ✅ corrigido

**Evidência.** Hero Boxers: **6 runs de selo** (3 por bloco) e apenas **3
URLs distintas** no HTML — os dois blocos apontavam para as mesmas.

| geradas com sucesso | usadas no HTML | descartadas |
|---|---|---|
| 14 | 11 | **3** (~US$ 0,75) |

**Causa (medida em 10/09).** Os slots eram agrupados por TOKEN apenas.
Com a `body 3` nas posições 2 e 3, os `URL_SELO_1..3` dos dois blocos
caíam no MESMO grupo: o campo do primeiro escrevia em `groupSlots` — ou
seja, nos DOIS blocos — e os três campos do segundo davam
`sem_lugar:token_nao_encontrado`. O bloco repetido exibia as imagens do
vizinho.

**Corrigido**: a chave do grupo é `(blockIndice, token)`. Token repetido
DENTRO do bloco (espelho MSO, versão mobile) segue sendo um lugar só.

### A7 · `PANEL_2_MAIN_PHOTO` falhou 2× e não houve terceira 🟠

Erro: *"Não foi possível extrair imagem da resposta do OpenRouter
(status=200, content-type=application/json, length=843)"*.

O painel 2 do bloco de produtos ficou sem foto principal — é o
`1 <img> sem src no HTML final` que o QA denunciou.

### A8 · `alt=""` em toda imagem gerada 🟠

**Evidência.** `parsed_output->>'alt'` está **vazio em 14 de 14** runs de
imagem. No HTML, só o logo e a hero do Hero Boxers têm `alt` preenchido.

O Gmail bloqueia imagem por padrão na primeira abertura. Com `alt=""` o
e-mail abre **mudo** — retângulos em branco onde deveria haver descrição.

### A9 · O cinza do mockup sobreviveu 🟡

`style="…background:#E3E3E3"` e `#F2F2F2` dentro dos `<img>`. É o fundo do
placeholder da variante; aparece enquanto a imagem carrega e **permanece**
se ela falhar.

### A10 · `background_fit` não ajustou nada 🟡

Nos dois e-mails do Innova Bay o agente devolveu `sem_ajuste` com motivo
`foto_ja_cobre_o_box` para os **dois** boxes, incluindo o
`coupon_background_image` — a pilha de caixas brancas genéricas atrás do
bloco de cupom no seu print. O agente concluiu que a foto serve; ela não
serve.

---

## B. Estrutura — 3 defeitos

### B1 · O mesmo bloco duas vezes, e o Curador AVISOU 🔴

**Evidência.** Blocos do Hero Boxers Welcome 1:

| posição | tipo | variante |
|---|---|---|
| 1 | hero | `hero section 10` |
| 2 | body | `body 3 - bridge features cards` |
| 3 | body | `body 3 - bridge features cards` ← **idêntica** |
| 4 | products | `produtos 7 - dois produtos` |
| 5 | footer | `footer 1` |

E o `parsed_output` do `assembler_chooser` diz, com todas as letras, por quê:

```
posição 1: "Lacuna: título nomeia suspeita, copies origem/falha, 3 selos
            mecanismo; body 2 festivo e body 4 comparativo vetados no toque 1."
posição 2: "Três selos vendem confiança na marca… CTA é lacuna da biblioteca."
```

**O Curador declarou LACUNA nas duas posições** e repetiu a variante por
falta de opção. O sistema registrou e entregou assim mesmo.

A regra de 07/09 (`repeticao.ts`) permite repetir fora de `hero` e
`products` — a intenção era não desfazer composição legítima. Mas repetir
**adjacente**, com a mesma anatomia e os mesmos três selos, não é
composição: é a biblioteca não ter o bloco.

**Correção.** Duas frentes: (a) proibir repetição ADJACENTE da mesma
variante em `podeRepetir`; (b) a lacuna declarada pelo Curador virar item
de worklist na hora — hoje ela só vira proposta de nota depois de **3+
ocorrências em 14 dias** (cron `vault-lacunas-propostas`).

### B2 · A variante escolhida é de VALE-PRESENTE 🔴

**Evidência.** O `copy_merge` mostra o example original sendo substituído:

```
"The Gift That Fits<br>Every Taste"  →  "Never heard of us? Fair."
```

`body 3` é a peça de gift card. Foi usada **duas vezes** numa loja de
cuecas, e o `copy_guidance` dela ("o que o vale entrega… CTA nomeia o
produto") é o que viaja como `purpose` para o n8n escrever a copy.

### B3 · ~~Sem hero no Innova Bay Welcome 1~~ — **ERRADO** ✅

Consequência do A5, retratado junto: a hero tem imagem, e ela está no
HTML final.

---

## C. Copy e link — 7 defeitos

### C1 · **Nenhum CTA é clicável** 🔴🔴 — o mais grave de todos

Foi o achado desta rodada, e não estava no relatório anterior.

**Medido, nos três e-mails:**

| batch | tags `<a>` | com `href` | quais são os href |
|---|---|---|---|
| `4ca1fa5a` | 13 | **2** | fonte do Google + `[unsubscribe_link]` |
| `1b77a2da` | 12 | **2** | idem |
| `aa6bf304` | 12 | **2** | idem |

O botão principal do Hero Boxers, extraído do HTML final:

```html
<a style="display:block;width:401px;height:82px;line-height:82px;
          font-family:Poppins…;font-size:30px;font-weight:700;
          color:#FFFFFF;text-decoration:none;text-align:center">
  FIND YOUR FIT
</a>
```

**Sem `href`.** Dos 12–13 links de cada e-mail, dez a onze não levam a lugar
nenhum. Um e-mail de boas-vindas **sem um único link para a loja**.

**Causa — e está DOCUMENTADA no próprio código**
(`src/lib/agents/html/attr-token-vocabulary.ts:40`):

> *"NÃO cobre os demais tokens de href da biblioteca — CTA
> (`URL_DO_CTA_AQUI` e família, **60+ ocorrências**), site e redes sociais.
> Aqueles dependem de destino de campanha e de dados da loja que não chegam
> neste ponto; **seguem virando `<a>` sem href**, reportados pelo
> render-checks como 'link sem destino'."*

`applyStructuralFills` só preenche 4 tokens (`URL_DO_LOGO_AQUI`,
`NOME_DA_MARCA`, `URL_UNSUBSCRIBE`, `URL_PREFERENCIAS`). O resto vira
`href=""`, e `neutralizeDeadLinks` (`html/post-process.ts:117`) remove o
atributo — corretamente, porque `href=""` navegaria para a URL do próprio
webmail.

**E o aviso que compensaria isso não dispara**: o `computeRenderChecks` que
reportaria "link sem destino" está no ramo `getQaMode() === "off"`, e o modo
padrão é `shadow`. Ou seja: a lacuna é conhecida, o remédio existe, e **no
modo em que o sistema roda ninguém é avisado**.

**Correção.** A URL da loja (`client_stores.store_url`) já está disponível
no contexto da fase 2. Preencher `URL_DO_CTA_AQUI` e família com ela é o
piso — melhor um link para a home que link nenhum. Ideal: campo de destino
por CTA no schema da variante.

### C2 · "Link Here" seis vezes, nas três gerações 🔴

**Causa medida na variante `footer 1`:**

| | valor |
|---|---|
| ocorrências de "Link Here" no HTML | **6** |
| campos no `output_schema` | **3** (`footer_copyright`, `footer_unsub_text`, `footer_unsub_label`) |

Os seis rótulos de navegação **não são campo de ninguém**. Nenhum agente tem
como preenchê-los, então o texto do mockup vai direto ao cliente em toda
geração que usa esse rodapé — e as três usaram.

**Correção.** Cadastro: 6 campos de rótulo + 6 de URL na `footer 1`. É
trabalho de biblioteca, não de código.

### C3 · Cupom prometido sem confirmação 🔴

Nas duas gerações do Innova Bay: *"Here's 10% Off"*, *"Use code
WELCOME10"*, *"Do Not Forget To Use Code"*.

O check `oferta_sem_incentivo` **disparou** e aparece nas issues como
`high`. O e-mail saiu `ready` assim mesmo porque **o QA está em modo
sombra** — `high` só reprova com `EMAIL_QA_ENABLED` ligado.

**Detalhe que atrapalha o diagnóstico**: a mensagem diz *"catálogo com
`existe: null`"*, mas o Innova Bay **não tem catálogo nenhum**. A mensagem
manda o operador procurar um campo que não existe.

### C4 · 22 campos estourando o limite 🟠

`1b77a2da` sozinho tem 18. Os piores:

| campo | escrito | limite | excesso |
|---|---|---|---|
| `section_copy_1` (body #3) | 238 | 126 | **+89 %** |
| `review_1_quote` | 283 | 200 | +42 % |
| `section_copy` (reviews #4) | 253 | 156 | +62 % |
| `review_2_quote` | 266 | 200 | +33 % |
| `section_copy_1` (products #6) | 181 | 120 | +51 % |

**Causa direta:** o `copy_fit` **falhou** nesse batch —

```
resposta vazia de 'anthropic/claude-fable-5.1'; 8000 dos 8000 tokens
foram para o raciocínio; finish_reason=length
```

Ninguém aparou nada. É o mesmo modo de falha do Curador (D2): teto de
tokens dimensionado para modelo sem reasoning, servindo um que raciocina
sempre.

### C5 · Depoimentos fabricados 🔴

"David R." e "Karen M." com citações longas e específicas (medições de
consumo, tempo de uso), sem fonte no briefing. QA: *"appears fabricated"*.

### C6 · Política de troca prometida sem lastro 🔴

Selos com *"EASY RETURN — NO COST · NO QUESTIONS ASKED"*. A ficha
operacional da Hero Boxers existe mas não confirma essa política; a do
Innova Bay não existe.

### C7 · Lorem ipsum cru no e-mail entregue 🔴

`aa6bf304`: **2 ocorrências** — `"[12]"` e
`"dolor sit amet, consectetur adipiscing"`. Visível no seu print.

Os outros dois e-mails estão limpos de lorem (medido: 0 ocorrências), o
que mostra que o merge funciona — quando o campo tem âncora.

---

## D. Infraestrutura e custo — 7 defeitos

### D1 · HTTP 402 in-flight derrubando runs 🔴

Em **4 dos 12 batches** (`04bd6668`, `e33cb1ca`, `aa6bf304` no QA, e mais
um). **Não é falta de crédito** — é a reserva do OpenRouter para chamadas
em voo:

> *"This request would exceed your available credits given your current
> in-flight requests. Retry after in-flight requests settle."*

Marcado como **não-retryable** em `openrouter-invoke.ts:103`. É o item
**A5 do plano anterior, nunca implementado**. A ConvertIA já trata esse
caso corretamente (`credits_in_flight` vs `no_credits`); o pipeline de
e-mail não.

### D2 · O Curador erra na primeira tentativa em 6 de 12 batches 🟠

Três erros distintos, todos custando uma segunda rodada inteira:

| erro | batches |
|---|---|
| `resposta vazia do Fable; **5000 dos 5000 tokens** foram para o raciocínio` | `4ca1fa5a`, `63517e0a` |
| `shadow_json_ilegivel` | `1058e21c`, `644d86c5` |
| `shadow: curador_shortlist_invalida` | `1b77a2da`, `aa6bf304`, `7ec77a9b` |

O teto de **5000** ainda aparece em runs de hoje, apesar do
`resolverTetoDoCurador` que subiu ontem — vale conferir se a config ativa
do agente foi de fato atualizada no banco.

Custo do retrabalho: o `assembler_chooser` do `4ca1fa5a` gastou 77 s no
erro + 175 s no acerto.

### D3 · Tipografia e cores mortas por HTTP 400 🔴

Batch `902b757d`, dois agentes, duas tentativas cada, custo zero:

```
OpenRouter HTTP 400: "Reasoning is mandatory for this endpoint and
                      cannot be disabled."
```

É o nosso `reasoning: {enabled:false}` (aplicado aos steps de JSON desde a
fase A) contra um provedor que exige reasoning. **Os dois steps não
rodaram**: e-mail sem tratamento tipográfico e sem ajuste de cor, em
silêncio.

**Correção.** Detectar essa recusa e repetir sem o campo `reasoning` — é o
mesmo padrão do prefill do Curador ("recusa do prefill repete sem ele").

### D4 · A quarta geração morreu inteira 🔴

Sequência completa do `7ec77a9b`:

```
seletor       error  182 s  US$ 0,76  "n_objecoes: 3 alvo(s) — o contrato
                                       pede entre 4 e 5; varredura pede
                                       naturezas diferentes: obj_2 e obj_5
                                       têm o mesmo risco (financeiro)"
estruturador  ok     159 s  US$ 0,62
curador       error   77 s            "curador_shortlist_invalida"
curador       ok     150 s  US$ 0,47
blueprint     error         "watchdog: run órfão em 'running' há mais de
                             20min — processo morreu sem fechar o run"
subject       error         idem
```

Na tela: *"Timeout: a conexão expirou (500s)"*. US$ 1,85 e zero entregue.

### D5 · O QA falhou em 3 das 4 🟠

`timeout` (`1b77a2da`), `qa_llm_error` + `402` (`aa6bf304`),
`qa_output_invalid` (`63517e0a`). Só o `4ca1fa5a` teve QA completo.

O e-mail sai `ready` mesmo assim — o QA em sombra não reprova.

### D6 · 58 % do custo é imagem, e parte vai para o lixo 🟠

| item | valor |
|---|---|
| total das 4 gerações | US$ 19,10 |
| só agente `image` | ~US$ 9,00 (**47 %** do total; 58 % do que foi gasto nas 3 com HTML) |
| descartado | 3 selos duplicados + 2 heros sem endereço + 2 tentativas falhas |

O `image` do `4ca1fa5a` sozinho: **2.063 s** e US$ 3,98.

### D7 · `subject` com "Unexpected end of JSON input" 🟡

Batch `902b757d`. O e-mail fica sem assunto gerado.

---

## Ordem de correção

Ordenada por (tamanho do estrago) ÷ (custo do conserto):

Status em 10/09 — **6 corrigidos**: A3, A4, A6, C1, D1 e A1.

| # | item | onde | tamanho |
|---|---|---|---|
| 1 | **C1** — preencher o href do CTA com a URL da loja | `attr-token-vocabulary` + `applyStructuralFills` | ~20 linhas |
| 2 | **A3** — `areasDeTexto` exclui `copy_no_desenho` | `build-image-slots.ts:107` | **1 linha** |
| 3 | **A4** — proporção do slot em vez da lista fechada | `aspect-ratio.ts` | ~30 linhas |
| 4 | **D1** — 402 in-flight vira retryable | `openrouter-invoke.ts` | ~15 linhas |
| 5 | **A1** — hex da referência não vira "cor primária" | builder de imagem **ou** biblioteca | média |
| 6 | ~~**A5**~~ — diagnóstico errado; o real era o **A6**, feito | `slot-finder` | ✅ |
| 7 | **D3** — repetir sem `reasoning` quando o provedor exige | `openrouter-invoke.ts` | ~10 linhas |
| 8 | **B1** — proibir repetição adjacente | `repeticao.ts` | ~10 linhas |
| 9 | **A8** — exigir `alt` do agente de imagem | prompt + chain | pequena |
| 10 | **C4/D2** — tetos de token para modelo com reasoning | config no banco | SQL |

**Sem código, e sem isso nada acima adianta:**

| item | o que falta | onde |
|---|---|---|
| **C2** | 6 campos de rótulo + 6 de URL na `footer 1` | biblioteca |
| **A2** | paleta real das duas lojas | cadastro da loja |
| **C6** | ficha operacional (troca, garantia) | Hero Boxers e Innova Bay |
| **C3** | catálogo de objeções do Innova Bay | botão "Catalogar objeções" |
| **B1/B2** | um `body` de 3 itens sem CTA que **não** seja de gift card | biblioteca |

**Por último**, e só depois de 1–10: ligar o QA em `enforce`. Hoje ele já
enxerga a maior parte disto e não reprova nada — ligar antes faria todas as
gerações falharem sem ter como passar.
