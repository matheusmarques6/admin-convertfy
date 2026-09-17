# Guia de cadastro de variante

Como cadastrar um bloco novo na biblioteca (`email_component_variants`) de um
jeito que o pipeline inteiro saiba usá-lo. Escrito em 15/09/2026 a partir do
código vigente e revisado em 17/09, quando o vocabulário de `dispositivo`
foi redefinido (seção 6) — cada regra aqui aponta o arquivo que a executa.

Se você só quer a ordem das coisas, pule para o [checklist](#9-checklist-de-pronto).

---

## 1. A régua de endereçamento (leia antes de tudo)

Um campo do `output_schema` precisa achar o seu lugar no HTML. **Como ele acha
depende do tipo**, e essa é a regra que três documentos desta casa contam
diferente. A que vale é a do código:

| tipo de campo | o endereço é | quem executa |
|---|---|---|
| texto (`text_short`, `text_long`, `number`) | **a frase do `example`**, literal, como está escrita no HTML | `html/copy-merge.ts`, `html/anchor-match.ts` |
| `url` e `image` | **`{{CHAVE_EM_MAIUSCULAS}}`** dentro do atributo (`href`, `src`) | `gerador-anatomia/validar-anatomia.ts:161` |

> A biblioteca **nunca adotou `{{TAG}}` para copy**. O `example` do schema é a
> própria frase autorada no HTML da variante.
> — `src/lib/agents/html/copy-merge.ts:1-5`

**Documentos superados, e o que fazer com eles:**

- A seção "O schema é a base" do `CLAUDE.md` (jul/2026) diz que todo campo mora
  em `{{MAIÚSCULA_DA_KEY}}`. Valia antes de 20/08. Hoje vale só para `url` e
  `image`.
- `docs/email-reference-tags.md` declara um vocabulário fechado de tags
  (`EYEBROW`, `SUBHEAD`, `USP`…). Era do Montador antigo. Não use para cadastrar.

Escrever `{{HERO_HEADLINE}}` no HTML de um campo de texto **não dá erro**: o
campo simplesmente nunca ancora, a copy do n8n não entra no e-mail, e a frase de
exemplo vai para o cliente. O merge é fail-open por decisão, e o radar é a
telemetria — nunca um alerta na sua cara.

---

## 2. O mínimo para a variante existir

Sem estes cinco, a variante **não é escolhida por ninguém**:

| campo | regra |
|---|---|
| `block_type` | uma das seis seções: hero, body, products, reviews, offer, footer |
| `name` | nome humano; é por ele que o Curador pode se referir à variante |
| `html` | documento completo, table-based, container de 600px |
| `is_active` | `true` — false deixa a variante invisível para o pipeline inteiro |
| `output_schema` | pelo menos **uma âncora real** (um texto que ancora ou uma imagem que casa) |

A última é um corte duro e silencioso: `variantIsFillable`
(`src/lib/email-workspace/schema-example-coherence.ts:123`) tira do pool do
Curador qualquer variante com schema vazio ou sem nenhuma âncora. Ela continua
na tela, ativa, e nunca aparece num e-mail.

**A largura é corrigida sozinha.** `enforceEmailWidth` roda no cliente, no POST
e no PATCH. Você não precisa acertar 600px na mão — mas confira o aviso do
editor antes de salvar, porque a correção mexe no seu HTML.

---

## 3. O que degrada em silêncio

Nenhum destes impede o save. Todos mudam o resultado, sem avisar:

| campo vazio | o que acontece |
|---|---|
| `description` | o Curador vê `(sem descrição)` na linha do índice e rankeia às cegas |
| `copy_guidance` | vira o `purpose` do bloco e depois a `diretriz` do payload; é **a única diretriz que o flow do n8n lê hoje**. Vazia, cai em `description`; as duas vazias, o bloco vai para o n8n sem instrução nenhuma |
| `example` de um campo | o campo nunca ancora; a copy existe e não entra no HTML |
| `dispositivo` | a variante nunca é eliminada por requisito **e nunca é pedida por nome** pelo Estruturador. Fica invisível para a decisão |
| `photo_direction` | o agente de imagem compõe só pelo slot, sem direção de arte |
| `max_len: 0` | sem orçamento de caracteres no n8n e sem checagem de estouro no QA |
| `when_not_use` | o Curador não tem como descartar a variante pelo motivo certo. Hoje **28 das 37 ativas** estão assim |

E um caso que parece vazio e não é: **direção fotográfica em rascunho**. Texto
que começa com "Pendente", "aguardando", "TBD" ou "WIP" é tratado como ausente
(`src/lib/agents/image/direcao-fotografica.ts`) — o prompt cai no modo "sem
direção escrita". O editor avisa. Deixar o rascunho lá é pior que deixar vazio,
porque parece preenchido na listagem.

---

## 4. Como escrever um `example`

É o campo mais importante e o menos óbvio, porque ele tem duas funções ao mesmo
tempo: mostrar ao n8n o tom da frase **e** ser o endereço do campo no HTML.

**A regra única:** o `example` tem de ser, caractere por caractere, a frase que
está escrita no HTML da variante.

A normalização perdoa caixa, tabulação, quebra de linha e entidades (`&rsquo;`,
`&ldquo;`). Não perdoa palavra diferente, pontuação diferente nem frase que não
existe no HTML.

### As quatro armadilhas medidas na biblioteca

**1. Esquecer o número do enumerador.** Campos irmãos (`review_1_name`,
`review_2_name`) com o mesmo `example` "Name." são resolvidos por ordem de
declaração — mas só quando o número de ocorrências livres bate exatamente com o
número de campos. Sobrou ocorrência, todos viram ambíguos e nenhum ancora. Se o
HTML escreve "1 Name." e "2 Name.", o example tem de trazer o número.

**2. Colar do Figma.** Vem com tabulação, espaço duplo e às vezes um caractere
invisível. A normalização cobre tabulação e quebra, mas não cobre palavra
partida por elemento que não seja `<br>` ou wrapper inline.

**3. Frase curta demais.** Menos de 4 caracteres normalizados é recusado de
saída (`MIN_EXAMPLE_LEN`, `anchor-match.ts:41`), com o motivo `frase_curta`.
"OFF" casaria em seis lugares do mesmo documento. Se o texto real é curto,
inclua o vizinho: em vez de "OFF", use "10% OFF" ou a linha inteira.

**4. Example que é um array JSON.** Alguns campos de lista foram cadastrados com
`["passo 1","passo 2"]` no example. O casador recusa (`example_e_json`): partir o
array é trabalho de cadastro, não do merge. Declare um campo por item.

### Duas coisas que parecem erro e não são

- **A mesma frase em dois lugares do HTML, um campo só.** O merge escreve nas
  duas ocorrências, de propósito. É a fita repetida, o CTA que aparece no topo e
  no rodapé. Escolher uma deixaria a outra em inglês.
- **Um example contido em outro.** "Use code CODECODE for XXXX% off" e "Use
  code" convivem: os examples são reivindicados do mais longo para o mais curto.

### O que nunca pôr no example

Texto que o lint reconhece como exemplo de mockup reprova o e-mail inteiro
(`texto_de_example` é regra bloqueante). A lista está em `EXEMPLO_RE`
(`html/anchor-match.ts`) e inclui: lorem ipsum, "Link Here", "Product Name",
"Name. 1", "Verified Buyer 1", "ICON 1", "SELO 1", `XXXX`, qualquer coisa
terminada em `_AQUI`.

Se a arte tem esse texto, o caminho não é cadastrar o texto como example — é
**criar um campo de verdade** para aquele trecho, com uma frase plausível no
lugar.

---

## 5. As quatro naturezas de campo

A natureza diz **quem produz o valor final**. Ausente, é derivada: `image` vira
`imagem_gerada`, o resto vira `copy`.

| natureza | quem escreve | vai ao n8n | ancora no HTML | vira slot de imagem |
|---|---|---|---|---|
| `copy` | o n8n | sim | sim, pelo example | não |
| `imagem_gerada` | o agente de imagem | não | pelo token no atributo | sim |
| `asset_fixo` | ninguém — a arte fica intacta | não | não | não |
| `copy_no_desenho` | o n8n escreve, o agente de imagem **desenha dentro da arte** | sim | **não tem endereço no HTML** | não, mas vai ao prompt da imagem |

`asset_fixo` existe para arte que não pode ser recriada: briefá-la faria o modelo
tentar redesenhá-la.

`copy_no_desenho` nasceu dos selos em círculo, onde a palavra é parte do
desenho. Marcar `copy` no lugar dela faria o merge cobrar um endereço que não
existe, e a geração acusaria `sem_lugar` para sempre.

---

## 6. Escolher o dispositivo

O `dispositivo` é o vocabulário fechado de **34 valores**
(`src/lib/agents/shared/dispositivos.ts`) que o Estruturador e o Curador falam
entre si. O Estruturador pede um pelo nome; o código elimina por ele **antes** de
qualquer outro requisito. Sem dispositivo, a variante nunca é pedida.

**Ele nomeia o MECANISMO — o que o bloco faz com o leitor —, nunca a seção nem
o tema.** O vocabulário anterior tinha prefixo de seção (`hero_…`, `body_…`) e
dizia três coisas ao mesmo tempo; por isso não separava nada. Medido nas 72
variantes em 17/09: `hero_oferta_cupom` cobria 10 das 18 heroes e
`products_grade_sem_preco` 10 das 16 peças de produto. Pior, o prefixo repetia
`block_type` e escondia o mesmo mecanismo cruzando seções — quatro cruzam de
fato hoje (`codigo_entregue` em hero e offer, `lineup_de_colecao` em products e
hero, `mecanismo_apontado` em body e products, `prova_por_relato` em reviews e
products). A seção de cada um está em `SECOES_DO_DISPOSITIVO`, explícita.

### Oferta e preço

| dispositivo | seção | o que é | o que a anatomia OBRIGA |
|---|---|---|---|
| `oferta_em_manchete` | hero | o percentual ou o valor é o maior elemento da peça | CTA |
| `campanha_nomeada` | hero | o nome próprio da data emoldura a oferta | CTA |
| `oferta_condicionada` | offer | a mecânica é o conteúdo (combo, brinde, frete) | CTA; **sem cupom** (com código vira `codigo_entregue`) |
| `oferta_adiada` | offer | o código só aparece depois do argumento | CTA + cupom |
| `codigo_entregue` | hero · offer | entrega um código NOVO, em texto real | CTA + cupom |
| `codigo_relembrado` | offer | repete um código já concedido | CTA + cupom |
| `prazo_declarado` | hero | o relógio é a peça: prazo com hora | CTA |

### Argumento

| dispositivo | seção | o que é | o que a anatomia OBRIGA |
|---|---|---|---|
| `tese_declarada` | body | uma afirmação carrega o bloco | CTA; no máximo 1 item |
| `lista_enumerada` | body | 3 a 5 itens com título próprio | 3–5 itens |
| `mecanismo_apontado` | body · products | marcadores apontam pontos da própria foto | 2–4 itens + ao menos 1 imagem |
| `antes_e_depois` | body | duas fotos do mesmo ângulo, etiquetadas | exatamente 2 itens + 2 imagens |
| `comparacao_pareada` | body | nós × a categoria, critério a critério | 3–6 itens |
| `duvida_antecipada` | body | nomeia a dúvida em pergunta e resposta | 3–5 itens |
| `pergunta_ao_leitor` | hero | abre com uma pergunta dirigida | CTA; sem cupom |
| `cena_de_uso` | body | o argumento é a cena, não o atributo | CTA + ao menos 1 imagem |
| `remocao_de_risco` | body | garantias como conteúdo principal | 2–4 itens; sem cupom |
| `oferta_de_ajuda` | hero | dois caminhos de suporte, sem venda | CTA; sem cupom |
| `moldura_de_genero` | hero | a peça se disfarça de outro formato | **nada** — a forma É o estranhamento |
| `abertura_editorial` | hero | foto e frase, sem oferta | CTA; sem cupom; ao menos 1 imagem |

### Catálogo e produto

| dispositivo | seção | o que é | o que a anatomia OBRIGA |
|---|---|---|---|
| `vitrine_paralela` | products | N produtos equivalentes, um destino cada | 2–9 itens + 2 imagens |
| `vitrine_narrada` | products | poucos produtos, cada um com frase própria | 2–4 itens + 2 imagens |
| `produto_unico_aprofundado` | products | um produto explicado antes de precificado | CTA + 1 item + 1 imagem |
| `galeria_de_angulos` | products | o mesmo produto de vários ângulos | no máximo 2 itens + **3 imagens** |
| `lineup_de_colecao` | products · hero | o conjunto é o argumento (kit, rotina, linha) | CTA + 3 itens ou mais |
| `catalogo_por_ocasiao` | body | navegação por ocasião, não por produto | 2–6 itens + 2 imagens |
| `escassez_por_estoque` | products | a disponibilidade é o argumento | 3 itens ou mais |
| `carrinho_dinamico` | offer | devolve o item abandonado, por destinatário | CTA |

### Prova social e fechamento

| dispositivo | seção | o que é | o que a anatomia OBRIGA |
|---|---|---|---|
| `prova_por_autoridade` | reviews | o cargo ou a credencial de quem fala é o argumento | no máximo 3 itens **com credencial** |
| `prova_por_relato` | reviews · products | um relato longo e específico | no máximo 2 itens, **sem** credencial |
| `prova_por_volume` | reviews | vários depoimentos curtos, ou a nota agregada | 3 itens ou mais, sem credencial |
| `prova_com_vitrine` | reviews | prova social que também mostra produto | 2 itens ou mais + 2 imagens |
| `menu_de_saida` | footer | destinos de navegação no fim da peça | 4 a 9 links |
| `assinatura_minima` | footer | assina em vez de oferecer menu | no máximo 3 links |

### O valor de controle

`nao_classificado` existe para a variante que **nunca foi julgada**. Ele não é
um lugar na peça: sai com lista de seções VAZIA, então nenhuma posição consegue
pedi-lo — e, como toda posição que pede algo elimina quem realiza outro
mecanismo, marcá-lo bloqueia a escolha às cegas. É o oposto de deixar a coluna
em branco: **em branco é fail-open** (a variante concorre em toda posição da
seção e paga 75 no desempate do resgate).

A régua está em `contratoDoDispositivo`
(`src/lib/agents/gerador-anatomia/validar-anatomia.ts:54`) e é a mesma que o
Curador aplica. Cadastrar `prova_por_autoridade` sem um campo de credencial
faz a variante ser eliminada toda vez que essa forma for pedida — e cadastrar
`prova_por_relato` COM credencial acusa o inverso: quem tem cargo é
autoridade, e foi assim que a review 10 acabou ocupando o lugar da prova
técnica.

### Chaves canônicas por dispositivo

Estas são as chaves que o gerador automático emite. Use as mesmas no cadastro à
mão — divergir não quebra nada, mas faz a biblioteca falar dois idiomas.

| dispositivo | chaves |
|---|---|
| `oferta_em_manchete` · `campanha_nomeada` | `discount_headline`, `cta_label`, `cta_url` |
| `codigo_entregue` · `codigo_relembrado` · `oferta_adiada` | `coupon_code`, `coupon_value`, `coupon_instruction`, `cta_label` |
| `oferta_condicionada` | `offer_headline`, `offer_terms`, `cta_label` |
| `prazo_declarado` | `deadline`, `badge_deadline`, `cta_label` |
| `pergunta_ao_leitor` | `headline_question`, `cta_label`, `cta_url` |
| `tese_declarada` | `paragraph_1`, `paragraph_2`, `cta_label` |
| `lista_enumerada` | `feature_N_title`, `feature_N_text` |
| `mecanismo_apontado` | `marker_N_title`, `marker_N_text` |
| `antes_e_depois` | `before_image`, `before_label`, `after_image`, `after_label`, `comparison_caption` |
| `remocao_de_risco` | `seal_N_label`, `seal_N_text`, `seal_N_icon` |
| `comparacao_pareada` | `us_title`, `them_title`, `us_item_N`, `them_item_N` |
| `duvida_antecipada` | `question_item_N`, `answer_item_N` |
| `oferta_de_ajuda` | `support_N_label`, `support_N_url` |
| `abertura_editorial` · `cena_de_uso` | `headline`, `subhead`, `hero_image`, `cta_label` |
| `vitrine_paralela` · `vitrine_narrada` · `produto_unico_aprofundado` · `escassez_por_estoque` | `product_N_image`, `product_N_name`, `product_N_price`, `product_N_url` |
| `galeria_de_angulos` · `catalogo_por_ocasiao` | `panel_N_image`, `panel_N_label` |
| `lineup_de_colecao` | `lineup_N_image`, `lineup_N_label` |
| `carrinho_dinamico` | `cart_item_image`, `cart_item_name`, `cart_coupon_condition`, `cta_label` |
| `prova_por_autoridade` · `prova_por_relato` · `prova_por_volume` · `prova_com_vitrine` | `review_N_quote`, `review_N_name`, `review_N_rating`, `review_N_role` |
| `menu_de_saida` · `assinatura_minima` | `nav_N_label`, `nav_N_url`, `legal_text` |

O nome da chave **carrega significado**: `papelDoCampo`
(`src/lib/agents/shared/field-roles.ts:76`) lê cupom, CTA, preço, avaliação e
credencial por padrão no nome. Um campo de cupom chamado `codigo_promo` não é
reconhecido como cupom, e o contrato da variante sai errado.

### Formas que a biblioteca ainda não tem

**Dois** dispositivos estão sem nenhuma variante ativa (medido em 17/09, depois
do de/para): `oferta_adiada` (offer) e `duvida_antecipada` (body). Quando o
Estruturador pede um deles, a posição fica sem candidata.

Eram **seis** no vocabulário anterior. A queda não é cadastro novo: é que os
nomes passaram a descrever o que a biblioteca de fato faz, em vez de nomear
formas que ninguém tinha. Dos 33 mecanismos pedíveis, **31 têm variante ativa**
— e a contrapartida honesta é que catorze deles têm UMA só, então a escolha ali
não é escolha.

A consulta que refaz esta lista está no fim do guia.

---

## 7. A fronteira entre o schema e a plataforma

Há cerca de 60 tokens que **a plataforma preenche sozinha**. Declará-los no
schema cria um campo que nunca recebe copy; não declará-los é o certo.

Os principais: `LOGO`, `LOGO_URL`, `PREHEADER`, `EMAIL_TITLE`, `BRAND_NAME`,
`YEAR`, `WEBSITE_URL`, `UNSUBSCRIBE_URL`, `UNSUBSCRIBE_LABEL`,
`PREFERENCES_URL`, `FOOTER_ADDRESS`, todos os `*_URL` de rede social e ícone
(`INSTAGRAM_URL`, `FACEBOOK_ICON`…), todos os `PRODUCT_N_*` vindos do feed
(`PRODUCT_N_NAME`, `PRODUCT_N_PRICE`, `PRODUCT_N_URL`, `PRODUCT_N_IMAGE_ALT`),
`REVIEW_N_RATING`, `*_CTA_URL` e os `COUNTDOWN_*`.

A lista completa está no CTE `sistema` de
`supabase/migrations/DIAGNOSTICO_schema_x_tags.sql`.

---

## 8. Cores e fontes: hex ou token?

**No cadastro à mão, hex continua valendo.** É o que as 37 variantes ativas
fazem, e o agente Cores & Botões repinta o documento pela paleta da loja — o
comportamento atual, que funciona.

Tokens de identidade (`{{COR_FUNDO}}`, `{{FONTE_TITULO}}`…) são **opcionais**. O
gerador automático os exige porque escreve HTML do zero; quando uma variante é
tokenizada, o Cores & Botões é pulado naquele bloco e a paleta entra na
montagem. As duas vias convivem e nenhuma variante precisa migrar.

---

## 9. Checklist de pronto

Na ordem. Nada aqui é opcional se você quer que a variante seja usada.

**Enquanto edita**

1. O painel "Texto que nenhum campo escreve" está limpo, ou o que sobra é texto
   fixo de propósito. Trecho em âmbar é mockup vazando para o cliente.
2. O aviso de largura sumiu (ou você clicou em "Fixar em 600px agora").
3. A direção fotográfica não começa com "Pendente"/"aguardando".
4. O preview mostra o bloco com os examples nos lugares certos.

**No save**

5. Nenhum campo ficou sem chave técnica (o save aborta).
6. Se o toast vier vermelho dizendo que o schema não ancora, **conserte antes de
   ativar**. Ele não bloqueia o save de propósito, mas a variante está quebrada.

**Antes de ativar**

7. `dispositivo` escolhido, e a anatomia cumpre o que ele obriga (seção 6).
8. `description`, `copy_guidance` e `when_not_use` preenchidos.
9. Nota criada no Obsidian com o `variant_id` — veja
   `nota-obsidian-como-cadastrar.md`.

**Depois**

10. Rodar `supabase/migrations/DIAGNOSTICO_schema_x_tags.sql` e conferir que a
    variante nova não aparece.
11. Rodar `VERIFICAR_pronto_para_gerar.sql`, bloco 4.
12. Gerar um e-mail de teste numa loja real e olhar a peça.

---

## 10. Como refazer as contagens deste guia

Os números aqui foram medidos em 17/09/2026, depois do de/para do
vocabulário (migration 20261166). Para refazer:

```sql
-- Formas sem nenhuma variante ativa (a lista de encomenda da seção 6).
-- `nao_classificado` fica FORA: ele não é uma forma a encomendar.
with todos(d) as (values
 ('oferta_em_manchete'),('campanha_nomeada'),('oferta_condicionada'),
 ('oferta_adiada'),('codigo_entregue'),('codigo_relembrado'),
 ('prazo_declarado'),('tese_declarada'),('lista_enumerada'),
 ('mecanismo_apontado'),('antes_e_depois'),('comparacao_pareada'),
 ('duvida_antecipada'),('pergunta_ao_leitor'),('cena_de_uso'),
 ('remocao_de_risco'),('oferta_de_ajuda'),('moldura_de_genero'),
 ('abertura_editorial'),('vitrine_paralela'),('vitrine_narrada'),
 ('produto_unico_aprofundado'),('galeria_de_angulos'),('lineup_de_colecao'),
 ('catalogo_por_ocasiao'),('escassez_por_estoque'),('carrinho_dinamico'),
 ('prova_por_autoridade'),('prova_por_relato'),('prova_por_volume'),
 ('prova_com_vitrine'),('menu_de_saida'),('assinatura_minima'))
select t.d from todos t
where not exists (
  select 1 from email_component_variants v
  where v.is_active and v.dispositivo = t.d
) order by 1;

-- Lacunas de preenchimento (a tabela da seção 3)
select
  count(*) filter (where coalesce(trim(when_not_use),'') = '') as sem_quando_nao_usar,
  count(*) filter (where coalesce(trim(copy_guidance),'') = '') as sem_orientacao_de_copy,
  count(*) filter (where coalesce(trim(photo_direction),'') = '') as sem_direcao_foto,
  count(*) filter (where dispositivo is null) as sem_dispositivo,
  count(*) filter (where jsonb_array_length(coalesce(output_schema,'[]'::jsonb)) = 0) as sem_schema
from email_component_variants where is_active;
```

---

## 11. Campos que não fazem nada

Não gaste tempo: `slots`, `tags`, `thumbnail`, `niche_affinity`, `positioning`,
`mood`, `version`. Nenhum é lido pelo pipeline.

Três outros são lidos, mas só em um lugar:

- `rendered_html` — só o agente de hero. Cole o exemplo renderizado real; se você
  editar o HTML depois, o editor avisa que o exemplo ficou velho.
- `design_system` — só o agente de hero. Regras de desenho: hierarquia, bandas de
  fundo, acabamento de botão, o que nunca pode ser removido.
- `long_description` — notas de implementação (quirks de Outlook, hospedagem de
  asset). Vai ao Curador no catálogo completo.

`objectives`, `tones` e `density` são gravados e hoje não influenciam escolha
nenhuma.

select t.d from todos t
where not exists (
  select 1 from email_component_variants v
  where v.is_active and v.dispositivo = t.d
) order by 1;

-- Lacunas de preenchimento (a tabela da seção 3)
select
  count(*) filter (where coalesce(trim(when_not_use),'') = '') as sem_quando_nao_usar,
  count(*) filter (where coalesce(trim(copy_guidance),'') = '') as sem_orientacao_de_copy,
  count(*) filter (where coalesce(trim(photo_direction),'') = '') as sem_direcao_foto,
  count(*) filter (where dispositivo is null) as sem_dispositivo,
  count(*) filter (where jsonb_array_length(coalesce(output_schema,'[]'::jsonb)) = 0) as sem_schema
from email_component_variants where is_active;
```

---

## 11. Campos que não fazem nada

Não gaste tempo: `slots`, `tags`, `thumbnail`, `niche_affinity`, `positioning`,
`mood`, `version`. Nenhum é lido pelo pipeline.

Três outros são lidos, mas só em um lugar:

- `rendered_html` — só o agente de hero. Cole o exemplo renderizado real; se você
  editar o HTML depois, o editor avisa que o exemplo ficou velho.
- `design_system` — só o agente de hero. Regras de desenho: hierarquia, bandas de
  fundo, acabamento de botão, o que nunca pode ser removido.
- `long_description` — notas de implementação (quirks de Outlook, hospedagem de
  asset). Vai ao Curador no catálogo completo.

`objectives`, `tones` e `density` são gravados e hoje não influenciam escolha
nenhuma.
