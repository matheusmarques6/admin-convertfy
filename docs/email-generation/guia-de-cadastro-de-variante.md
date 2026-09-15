# Guia de cadastro de variante

Como cadastrar um bloco novo na biblioteca (`email_component_variants`) de um
jeito que o pipeline inteiro saiba usá-lo. Escrito em 15/09/2026 a partir do
código vigente — cada regra aqui aponta o arquivo que a executa.

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

O `dispositivo` é o vocabulário fechado de 22 valores
(`src/lib/agents/shared/dispositivos.ts`) que o Estruturador e o Curador falam
entre si. O Estruturador pede um pelo nome; o código elimina por ele **antes** de
qualquer outro requisito. Sem dispositivo, a variante nunca é pedida.

| dispositivo | o que é | o que a anatomia OBRIGA |
|---|---|---|
| `hero_apresentacao` | abre apresentando a marca, sem oferta nem pergunta | CTA; sem cupom |
| `hero_oferta_cupom` | a oferta é a manchete | CTA + slot de cupom |
| `hero_pergunta` | a headline pergunta algo ao leitor | CTA; sem cupom |
| `hero_lineup` | anuncia conjunto (kit, rotina, coleção) | CTA + 3 itens ou mais |
| `body_tese` | um argumento em prosa: título, 1–2 parágrafos, CTA | CTA; no máximo 1 item |
| `body_mecanismo_visual` | mostra como funciona, com apoio visual | 2–4 itens + ao menos 1 imagem |
| `body_garantias` | selos e garantias em itens curtos | 2–4 itens; sem cupom |
| `body_comparacao` | nós × os outros, lado a lado | 3–5 itens |
| `body_faq` | perguntas e respostas | 3–5 itens |
| `body_passos` | lista numerada de passos | 3–5 itens |
| `products_grade_preco` | grade com preço visível | preço + 2–4 itens + 2 imagens |
| `products_grade_sem_preco` | grade sem preço | sem preço + 2–4 itens + 2 imagens |
| `products_unico_oferta` | um produto só, com oferta | preço + CTA + 1 item + 1 imagem |
| `products_galeria` | fotos grandes, sem grade regular | sem preço + 2–3 itens + 2 imagens |
| `reviews_2` | exatamente dois depoimentos | 2 itens, sem credencial |
| `reviews_3plus` | três ou mais depoimentos | 3 itens ou mais |
| `reviews_com_credencial` | depoimentos com cargo, idade ou contexto | 1–3 itens **com credencial** |
| `offer_cupom` | bloco de oferta com código | cupom + CTA |
| `offer_sem_cupom` | condição comercial sem código | CTA; sem cupom |
| `offer_lembrete` | lembra um cupom já entregue | cupom + CTA |
| `footer_nav` | rodapé com menu | 4 a 9 links |
| `footer_minimo` | rodapé enxuto | no máximo 3 links |

A régua está em `contratoDoDispositivo`
(`src/lib/agents/gerador-anatomia/validar-anatomia.ts:54`) e é a mesma que o
Curador aplica. Cadastrar `reviews_com_credencial` sem um campo de credencial
faz a variante ser eliminada toda vez que essa forma for pedida.

### Chaves canônicas por dispositivo

Estas são as chaves que o gerador automático emite. Use as mesmas no cadastro à
mão — divergir não quebra nada, mas faz a biblioteca falar dois idiomas.

| dispositivo | chaves |
|---|---|
| `hero_oferta_cupom` | `discount_headline`, `coupon_code`, `cta_label`, `cta_url` |
| `hero_pergunta` | `headline_question`, `cta_label`, `cta_url` |
| `hero_lineup` | `lineup_N_image`, `lineup_N_label` |
| `body_tese` | `paragraph_1`, `paragraph_2`, `cta_label` |
| `body_mecanismo_visual` | `marker_N_title`, `marker_N_text` |
| `body_garantias` | `seal_N_label`, `seal_N_text`, `seal_N_icon` |
| `body_comparacao` | `us_title`, `them_title`, `us_item_N`, `them_item_N` |
| `body_faq` | `question_item_N`, `answer_item_N` |
| `body_passos` | `step_item_N`, `step_text_item_N` |
| `products_*` | `product_N_image`, `product_N_name`, `product_N_price`, `product_N_url` |
| `products_galeria` | `panel_N_image`, `panel_N_label` |
| `reviews_*` | `review_N_quote`, `review_N_name`, `review_N_rating`, `review_N_role` |
| `offer_*` | `offer_headline`, `offer_terms`, `coupon_code`, `deadline` |
| `footer_nav` | `nav_N_label`, `nav_N_url`, `legal_text` |

O nome da chave **carrega significado**: `papelDoCampo`
(`src/lib/agents/shared/field-roles.ts:76`) lê cupom, CTA, preço, avaliação e
credencial por padrão no nome. Um campo de cupom chamado `codigo_promo` não é
reconhecido como cupom, e o contrato da variante sai errado.

### Formas que a biblioteca ainda não tem

**Seis** dispositivos estão sem nenhuma variante ativa (medido em 15/09; o
plano de execução de 14/09 lista cinco e esqueceu `body_mecanismo_visual`).
Quando o Estruturador pede um deles, a posição fica sem candidata:

`hero_apresentacao` · `body_mecanismo_visual` · `body_faq` · `body_passos` ·
`products_grade_preco` · `reviews_2`

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

Os números aqui foram medidos em 15/09/2026. Para refazer:

```sql
-- Formas sem nenhuma variante ativa (a lista de encomenda da seção 6)
with todos(d) as (values
 ('hero_apresentacao'),('hero_oferta_cupom'),('hero_pergunta'),('hero_lineup'),
 ('body_tese'),('body_mecanismo_visual'),('body_garantias'),('body_comparacao'),
 ('body_faq'),('body_passos'),
 ('products_grade_preco'),('products_grade_sem_preco'),('products_unico_oferta'),
 ('products_galeria'),
 ('reviews_2'),('reviews_3plus'),('reviews_com_credencial'),
 ('offer_cupom'),('offer_sem_cupom'),('offer_lembrete'),
 ('footer_nav'),('footer_minimo'))
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
