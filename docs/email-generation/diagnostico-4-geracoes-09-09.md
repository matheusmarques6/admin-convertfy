# As quatro gerações de 09/09 — mapa completo dos defeitos

Medido no banco em 09/09, não inferido de print. Quatro gerações pedidas
pelo usuário, **US$ 19,10**, e nenhuma entregável.

| # | batch | loja / e-mail | status | HTML | issues | custo |
|---|---|---|---|---|---|---|
| 1 | `4ca1fa5a` | Hero Boxers · Welcome 1 | ready | 55,6 KB | 9 | US$ 6,59 |
| 2 | `1b77a2da` | Innova Bay · Welcome 1 | ready | 82,3 KB | **26** | US$ 5,89 |
| 3 | `aa6bf304` | Innova Bay · Welcome 2 | ready | 66,7 KB | 8 | US$ 4,77 |
| 4 | `7ec77a9b` | Hero Boxers · Welcome 2 | **draft** | — | — | US$ 1,85 |

A quarta não produziu nada: timeout de 500 s na rota, `blueprint` e `subject`
mortos pelo watchdog ("run órfão em 'running' há mais de 20 min").

Nas últimas 36 h houve **12 batches**, não 4 — as tentativas anteriores
morreram antes de chegar a HTML.

---

## A. Imagem — 10 defeitos

### A1. Os selos saem com a cor da PEÇA DE REFERÊNCIA, não da loja · 🔴

Causa medida no `input_vars` da run `image` (`04bc9eee`). O
`PHOTO_DIRECTION` da variante `body 3` traz as cores da peça original
**escritas como se fossem as da loja**:

```
Cor primária   #2A4439 — Título, copy e fundo do selo 2
Cor secundária #D88B71 — ...
Cor terciária  #B0C4AB — ...
```

E o `especificidade` de cada slot repete: *"círculo chapado em #D88B71 (cor
secundária)"*. Enquanto isso a paleta REAL da loja chega em outras
variáveis: `PALETA_1 = #000000`, `PALETA_2 = #ffffff`, `BG_COLOR = #FFFFFF`.

A `PHOTO_DIRECTION` é declarada **fonte principal** (`CFY_PRIMARY_BRIEF`,
migration 20261108), então vence. Por isso as três bolinhas salmão / verde
escuro / verde claro aparecem **iguais nas duas lojas** — são a identidade
de outra marca.

**Correção**: o brief da variante não pode nomear hex como "cor primária".
Ou o builder substitui os hex do brief pelos da loja antes de servir, ou o
brief passa a falar por PAPEL ("círculo chapado na cor secundária da
marca") e o cadastro da biblioteca é limpo.

### A2. A loja não tem paleta cadastrada · 🔴

Hero Boxers: `color_names = "Nova cor, Nova cor"`,
`primary_colors = "#000000, #ffffff"`. Mesmo sem o A1 **não haveria cor da
loja para aplicar**. É lacuna de DADO, não de código.

### A3. Os selos saíram vazios — contradição dentro do mesmo prompt · 🔴

Defeito meu, introduzido ontem com a natureza `copy_no_desenho`. O mesmo
campo aparece nas DUAS listas do `IMAGE_SLOTS`:

```
areas_de_texto (o HTML escreve estes textos POR CIMA — deixe estas regiões
limpas, sem desenhar nada nelas):
- seal_2_center: linha de texto, ~11 caracteres      ← manda NÃO desenhar
- seal_2_arc: linha de texto, ~28 caracteres

texto_no_desenho (DESENHE estas palavras DENTRO da imagem...):
- seal_2_center: "EASY RETURN"                       ← manda DESENHAR
- seal_2_arc: "NO COST · NO QUESTIONS ASKED"
```

`areasDeTexto` (`image/build-image-slots.ts:107`) filtra por TIPO
(`text_short`/`text_long`/`number`) e **não exclui a natureza
`copy_no_desenho`**. O modelo obedeceu a primeira instrução: círculo
chapado, vazio. E como `copy_no_desenho` não tem endereço no HTML, o texto
também não é escrito por cima — **sumiu das duas pontas**.

**Correção**: uma linha — `areasDeTexto` pula os campos cuja natureza é
`copy_no_desenho`.

### A4. Corte cego de 24 % a 38 % da imagem gerada · 🔴

O que o usuário chamou de "imagem esticada". O `aspect_ratio` mandado ao
modelo sai de uma **lista fechada de 8 valores** (`aspect-ratio.ts:17`),
enquanto o slot declara dimensões EXATAS. O `sharp` faz
`resize(fit:"cover")` para o slot, cortando o que sobra:

| slot | proporção real | pedido ao modelo | perda |
|---|---|---|---|
| `COLUMN_A_TOP` 272×212 (paisagem) | 1,28 : 1 | **4:5** (retrato) | **38 % da altura** |
| `SECTION_IMAGE_ALT` 1196×978 (paisagem) | 1,22 : 1 | **4:5** (retrato) | **35 % da altura** |
| `PANEL_1_MAIN_PHOTO` 314×733 | 0,43 : 1 | **9:16** | **24 % da largura** |
| `REVIEW_1_PORTRAIT` 241×349 | 0,69 : 1 | 4:5 | 14 % |

O absurdo: o próprio prompt **imprime a proporção certa** para o modelo ler
(`formato: 314x733px · proporção 314:733`) e manda no `aspect_ratio` um
valor da lista. O modelo compõe para 9:16 e recebemos o miolo de 314:733 —
produto cortado nas laterais, pessoa cortada no topo.

**Correção**: `resolveAspectForField` passa a aceitar as dimensões do slot
e derivar a proporção real, ou o `aspect_ratio` servido ao modelo é
calculado de `customDims` em vez da lista.

### A5. A imagem da HERO foi gerada, paga e jogada fora · 🔴

Em 2 das 3 gerações com HTML, o `image_format` reporta:

```
hero_flatlay_kit           → token_nao_encontrado → sem_lugar
hero_campanha_monocromatica → token_nao_encontrado → sem_lugar
```

No Innova Bay Welcome 1 a hero levou **240 s** e o e-mail abre **sem
imagem de topo** — começa direto no comparativo. É a pendência conhecida
("pular slot de imagem sem endereço no HTML"), agora atingindo a peça mais
cara do e-mail.

### A6. Três imagens pagas e descartadas por bloco repetido · 🟠

Hero Boxers: **6 runs de selo** (3 por bloco, ~US$ 0,25 cada) e apenas **3
URLs distintas no HTML** — os dois blocos usam as mesmas. ~US$ 0,75 jogados
fora por geração.

### A7. `PANEL_2_MAIN_PHOTO` falhou 2× e não houve terceira · 🟠

Erro: *"Não foi possível extrair imagem da resposta do OpenRouter
(status=200, application/json, length=843)"*. O painel 2 ficou sem foto —
é o `1 <img> sem src no HTML final` que o QA denunciou.

### A8. `alt=""` em TODA imagem gerada · 🟠

`parsed_output.alt` volta vazio em **14 de 14** runs. Só o logo e a hero do
Hero Boxers têm alt. O Gmail bloqueia imagem por padrão: o e-mail abre
**mudo**, sem uma palavra onde deveria haver descrição.

### A9. O cinza do placeholder sobreviveu · 🟡

`style="...background:#E3E3E3"` e `#F2F2F2` dentro dos `<img>` — é o fundo
do mockup da variante. Aparece enquanto a imagem carrega e permanece se ela
falhar.

### A10. `background_fit` não ajustou nada · 🟡

Nos dois e-mails do Innova Bay: `sem_ajuste` com motivo
`foto_ja_cobre_o_box` para os **dois** boxes, incluindo o
`coupon_background_image` — a pilha de caixas brancas genéricas atrás do
cupom no print. O agente decidiu que a foto já serve; ela não serve.

---

## B. Estrutura — 3 defeitos

### B1. O MESMO bloco duas vezes seguidas · 🔴

Hero Boxers Welcome 1:

| posição | tipo | variante |
|---|---|---|
| 2 | body | `body 3 - bridge features cards` |
| 3 | body | `body 3 - bridge features cards` ← idêntica |

A regra de 07/09 (`repeticao.ts`) permite repetir fora de `hero` e
`products` — a intenção era não desfazer composição legítima. O resultado
aqui é a **mesma anatomia, os mesmos três selos e o mesmo ritmo visual**
coladas uma na outra. A permissão precisa de um limite: repetir *adjacente*
não é composição, é falta de opção na biblioteca.

### B2. A variante escolhida é de VALE-PRESENTE · 🔴

O `copy_merge` mostra o example sendo substituído:

```
"The Gift That Fits<br>Every Taste"  →  "Never heard of us? Fair."
```

`body 3` é a peça de gift card. Foi usada **duas vezes** numa loja de
cuecas. O `copy_guidance` dela ("o que o vale entrega…") é o que viaja
como `purpose` para o n8n.

### B3. Sem hero no Innova Bay Welcome 1 · 🔴

Consequência de A5 — o e-mail não tem abertura visual.

---

## C. Copy — 7 defeitos

### C1. Lorem ipsum CRU no e-mail entregue · 🔴

`aa6bf304`, marcado pelo QA: `"[12]"`, `"dolor sit amet, consectetur
adipiscing"`. Visível no print.

### C2. "Link Here" seis vezes no rodapé · 🔴

Nas **três** gerações. `footer 1` não tem campos de navegação cadastrados.
QA marca `high` e o e-mail sai `ready` assim mesmo.

### C3. Cupom prometido sem confirmação · 🔴

Duas gerações: *"Here's 10% Off"*, *"Use code WELCOME10"*, com
`incentivo.existe: null`. O check `oferta_sem_incentivo` **dispara**
corretamente (aparece nas issues como `high`) — mas o QA está em **modo
sombra**, então o e-mail sai `ready`.

### C4. 22 campos estourando o limite · 🟠

`1b77a2da` sozinho tem 18. O pior: `section_copy_1` com **238 caracteres
num campo de 126** (+89 %). Causa direta: o `copy_fit` **falhou** nesse
batch — *"resposta vazia de `anthropic/claude-fable-5.1`; 8000 dos 8000
tokens foram para o raciocínio"*. Ninguém aparou nada.

### C5. Depoimentos fabricados · 🔴

"David R." e "Karen M." com citações longas e específicas, sem fonte no
briefing. QA: *"appears fabricated"*.

### C6. Política de troca prometida sem lastro · 🔴

Selos com *"EASY RETURN — NO COST · NO QUESTIONS ASKED"*. A ficha
operacional da loja está vazia — ninguém confirmou que existe essa política.

### C7. Nenhum link clicável no e-mail inteiro · 🔴

Todos os `href` são placeholder: `URL_DO_CTA_AQUI`, `URL_CTA_1`,
`URL_CTA_2`, `URL_CTA_COLECAO`, `URL_FACEBOOK`…

---

## D. Infraestrutura — 7 defeitos

### D1. HTTP 402 in-flight derrubando runs · 🔴

Em 4 dos 12 batches. **Não é falta de crédito** — é a reserva do OpenRouter
para chamadas em voo. Está marcado como não-retryable
(`openrouter-invoke.ts:103`). É o item **A5 do plano anterior, nunca
implementado**.

### D2. O Curador erra na primeira tentativa em 6 de 12 batches · 🟠

`shadow_json_ilegivel`, `curador_shortlist_invalida`, e *"resposta vazia do
Fable; 5000 dos 5000 tokens foram para o raciocínio"*. Sempre refeito —
**dobra custo e tempo** da fase 1. O teto de 5000 ainda aparece em runs de
hoje, apesar do `resolverTetoDoCurador`.

### D3. Tipografia e cores mortas por HTTP 400 · 🔴

Batch `902b757d`: *"Reasoning is mandatory for this endpoint and cannot be
disabled"* — nosso `reasoning:{enabled:false}` dos steps de JSON contra um
provedor que o exige. Duas tentativas, custo zero, **os dois steps não
rodaram**: e-mail sem tratamento tipográfico e sem ajuste de cor.

### D4. A quarta geração morreu inteira · 🔴

`seletor` com erro de contrato (*"n_objecoes: 3 alvo(s) — o contrato pede
entre 4 e 5"*), depois `blueprint` e `subject` órfãos no watchdog, timeout
de 500 s. US$ 1,85 e zero entregue.

### D5. O QA falhou em 3 das 4 · 🟠

`timeout`, `qa_llm_error`, `402`, `qa_output_invalid`. O e-mail sai `ready`
sem revisão.

### D6. 58 % do custo é imagem, e parte vai para o lixo · 🟠

~US$ 9,00 dos US$ 19,10. Dentro disso: 3 selos descartados por bloco
repetido, 2 heros geradas e não usadas, 2 tentativas falhas de painel.

### D7. `subject` com "Unexpected end of JSON input" · 🟡

---

## Ordem de correção sugerida

Por custo de conserto × tamanho do estrago:

1. **A3** — uma linha (`areasDeTexto` exclui `copy_no_desenho`). Devolve o
   texto aos selos.
2. **A4** — proporção do slot em vez da lista fechada. Para de cortar 38 %
   de toda imagem.
3. **A1** — hex da referência não pode se chamar "cor primária" no brief.
4. **D1** — 402 in-flight vira retryable (já estava no plano).
5. **A5** — slot de imagem sem endereço não gera (economiza a hero).
6. **B1** — proibir repetição ADJACENTE da mesma variante.
7. **C2/C7** — `footer 1` e as URLs de CTA: cadastro da biblioteca.
8. **A2/C6** — paleta e ficha operacional das duas lojas: dado, não código.
9. **D3** — detectar o provedor que exige reasoning e não desligá-lo.
10. **C3** — ligar o QA em `enforce` só DEPOIS de 1–8, senão tudo reprova.

Os itens 7 e 8 são de curadoria/dado — nenhuma mudança de código os
resolve, e sem eles os e-mails continuam saindo com "Link Here" e
promessas sem lastro.
