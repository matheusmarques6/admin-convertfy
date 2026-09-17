# Prompt: catalogar as 31 variantes novas no vault do Obsidian

Este documento é para ser entregue inteiro a quem (pessoa ou agente) vai
escrever as notas no vault. Ele é autossuficiente: as regras, o
vocabulário fechado, o procedimento e a ficha medida de cada uma das 31
variantes estão aqui. O diagnóstico que o originou está em
`docs/email-generation/auditoria-variantes-set26.md`.

---

## 0. O pedido, em uma frase

Escrever **31 notas novas** em
`Admin Convertfy/Emails/componentes/variantes/<secao>/<slug>.md` — uma
por variante da tabela do §7 — para que o Curador volte a ter eixos de
decisão sobre a metade nova da biblioteca.

Hoje ele não tem: **nenhuma das 31 tem nota**, e todos os eixos que ele
usa para rankear (`objecao`, `aliviador`, `profundidade`, `registro`,
`paleta`, `papel_na_peca`, `peso`, `convivencia`, `itens`) vêm do vault,
não do cadastro do banco. Sem a nota, a linha da variante no catálogo
sai assim:

```
- <uuid> · body 16 — <primeira frase da descrição> | anatomia: cta
```

Ela não é eliminada — o protocolo diz que "eixo que não separa é
neutro" —, ela **não compete**. E como `when_not_use` está vazio nas 31
no banco, hoje não existe nenhum critério para eliminá-la também.

---

## 1. Regras que fazem a nota existir (não são estilo)

São as mesmas do briefing anterior
(`docs/email-generation/briefing-obsidian-vault-emails.md`, §1), repetidas
aqui porque nota que viola qualquer uma delas continua bonita no Obsidian
e some do pipeline, sem erro em lugar nenhum. Valem só para
`Admin Convertfy/Emails/`. Repositório
`matheusmarques6/All-for-Eficiencia`, branch `main`. **Não mexa em
`Admin Convertfy/Conhecimento/`** — é o vault do advisor Max, outro
sincronizador.

1. **`status: aprovada`** — exatamente essa palavra, no feminino.
   `aprovado`, `approved` e `publicado` **não** ativam a nota
   (`isDocActive` compara a string literal). Nota inativa some do
   catálogo sem erro em lugar nenhum.
2. **O caminho é o tipo.** Variante vive em
   `componentes/variantes/<secao>/<slug>.md`, e `<secao>` é o
   `block_type` do banco: `hero`, `body`, `products`, `reviews`
   (`offer`, `footer`, `cta`, `header` existem, mas não neste lote).
   Subpasta a mais = a nota não existe para o pipeline.
3. **O slug é o nome do arquivo** — é ele que o Curador cita e o que os
   wikilinks resolvem. Use os slugs do §7.
4. **Frontmatter simples.** Escalar de uma linha, array inline
   `[a, b]`, lista em bloco. **Sem** `>` dobrado e **sem** objeto
   aninhado — a única exceção é `peso`, que é lido por regex no formato
   exato `{ altura_px: 949, classe: medio, fonte: medido }`.
5. **Todo valor de eixo precisa de nota em `componentes/eixos/<eixo>/`.**
   Use apenas os valores do §3 — todos já têm nota. Valor novo exige
   criar a nota do eixo antes, e `python .tools/valida.py` reprova sem
   ela.
6. Depois de editar: `python .tools/valida.py` e então
   `python .tools/gera_catalogo.py`. **Nunca edite `_catalogo.md` à
   mão** — ele é gerado.
7. **Não renomeie nem mova nota nenhuma** que já existe. Editar conteúdo
   e frontmatter é seguro; renomear quebra a geração em produção.

---

## 2. O contrato exato: o que o código lê de uma nota de variante

Isto não é convenção — é `buildCatalogVaultExtras`
(`src/lib/agents/architect/curador-vault.ts`). Chave que não está nesta
lista **não chega a agente nenhum**.

### Frontmatter que o pipeline consome

| Chave | Quem usa | Observação |
|---|---|---|
| `variant_id` | casamento nota ↔ banco | **Obrigatório.** UUID do §7, minúsculo. É o primeiro critério; sem ele o casamento cai no nome. |
| `nome_no_banco` | casamento, fallback | O nome EXATO do banco (§7), inclusive quando está com erro de digitação. |
| `objecao` | ranking (1º eixo) | Vocabulário do §3. |
| `aliviador` | ranking (2º eixo) | Vence a derivação automática. Vocabulário do §3. |
| `profundidade` | ranking (3º eixo) | Escalar, não lista. |
| `registro` · `registro_vetado` | ranking (4º eixo) | |
| `paleta` | ranking (5º eixo) | |
| `papel_na_peca` | ranking (6º eixo) | |
| `peso` | orçamento visual da peça | Formato fixo; valor medido no §7. |
| `convivencia` | passo 8 do protocolo | Wikilinks para `componentes/convivencia/`. |
| `itens` | catálogo | String livre curta ("3 produtos", "2 colunas"). |
| `exige` | medidor de proibições e derivação do aliviador | **Não** vai ao Curador — desde 01/09 eliminar por `exige` reprovava sobre requisito não verificável. |
| `status` | ativação | `aprovada`. |

### Corpo que o pipeline consome

O corte é por título `##`, em minúsculas, exato:

- `## Descrição curta` → `descricao_curta` (cortado em 600 chars)
- `## Quando usar` → `quando_usar` (1200)
- `## Quando NÃO usar` → `quando_nao_usar` (1200)

As outras seções canônicas — `## Descrição detalhada`,
`## Orientações de copy para a IA`, `## Design system`,
`## Direção fotográfica` — **não** vão para o Curador (design system e
direção fotográfica servem aos agentes de hero e de imagem, que os leem
do banco). Escreva-as assim mesmo: são o registro humano da peça, e a
próxima pessoa decide por elas.

**Antes do primeiro `##`, uma frase corrida de prosa.** É o resumo que o
índice do vault serve; nota que começa com `#`, tabela ou lista produz
resumo vazio e nunca é escolhida para leitura.

### O que NÃO preencher

- **`momento` e `momento_vetado`**: o eixo foi **aposentado em 07/09**.
  Saiu de `CatalogVaultExtra`, dos dois prompts do Curador e do medidor.
  Preenchê-lo é trabalho que ninguém lê. (Não mexa nas notas antigas que
  o têm.) Se o `valida.py` exigir a chave, deixe a lista vazia.
- **`diretivas_de_imagem`, `serve_estruturas`, `schema_campos`,
  `densidade_no_banco`, `aprendizados`**: nenhum é lido por código.
  Mantenha só se ajudar a navegação humana.

---

## 3. Vocabulário fechado dos eixos

Valor fora destas listas reprova no `valida.py` (não existe nota do
eixo) e, onde o código compara, vira eixo neutro.

**`objecao`** (11 — `componentes/eixos/objecao/`)
`adesao-social` · `amplitude-de-catalogo` · `composicao-formulacao` ·
`confianca-no-canal` · `disponibilidade-urgencia` · `escolha-variedade` ·
`pertencimento` · `preco-valor` · `qualidade-eficacia` ·
`suporte-duvida` · `uso-aprendizado`

**`registro` / `registro_vetado`** (10)
`bold-alto-contraste` · `clinico-sobrio` · `comercial` ·
`comunidade-identitario` · `festivo` · `luxo` · `minimalista-leve` ·
`popular-informal` · `premium-editorial` · `volume-impulso`

**`paleta`** (8)
`cinza-neutro` · `claro` · `com-acento-definido` · `creme` ·
`escuro-saturado` · `full-dark` · `monocromatico` · `preto-e-branco`

**`papel_na_peca`** (6)
`abre` · `apoio` · `fecha` · `meio` · `peca-inteira` · `ponte`

**`aliviador`** (10 — vocabulário da spec de objeções, não tem pasta de
eixo próprio)
`garantia_de_devolucao` · `prova_de_terceiro` · `prova_por_volume` ·
`demonstracao_de_mecanismo` · `transparencia_de_politica` ·
`amostra_ou_teste` · `dado_de_adequacao` · `comparacao_de_categoria` ·
`seguranca_de_pagamento` · `reputacao_da_loja`

**`profundidade`** (4, ordenada)
`afirmacao` < `mecanismo` < `prova_de_terceiro` < `garantia`

**`peso`** — formato literal
`{ altura_px: <n>, classe: <classe>, fonte: medido }`, com
`leve` <600px · `medio` 600–1200 · `pesado` 1200–2000 ·
`peca-inteira` >2000. **O número já está medido no §7** (Chromium, 600px
de viewport) — copie, não estime.

**`convivencia`** (6 notas existentes, cite como wikilink)
`[[exige-hero-ou-contexto-acima]]` ·
`[[grade-de-produtos-nao-convive-com-review-vitrine]]` ·
`[[monoespacado-nao-convive-com-serif-display]]` ·
`[[peca-inteira-nao-e-bloco]]` ·
`[[prova-social-nao-duplica-na-peca]]` ·
`[[raio-alto-nao-convive-com-canto-vivo]]`

**`exige`** — use um dos 52 requisitos já existentes em
`componentes/requisitos/`. Os mais prováveis neste lote:
`cupom-ativo`, `prazo-real`, `desconto-percentual`,
`desconto-automatico-sem-cupom`, `foto-de-uso-real`,
`foto-estudio-fundo-claro`, `packshot-recortado`, `produtos-com-pagina-propria`,
`produto-de-entrada-definido`, `colecao-ou-kit`, `grade-de-tamanho-real`,
`reviews-curtos`, `reviews-longos`, `tres-reviews-distintos`,
`depoimento-com-credencial`, `selo-compra-verificada`, `foto-do-depoente`,
`ugc-autorizado`, `tres-diferenciais-concretos`,
`quatro-criterios-objetivos`, `valores-articulados`,
`manifesto-de-marca-escrito`, `motivo-sazonal`, `terco-superior-liso`,
`wordmark-tipografico`, `estoque-integrado`. Requisito novo só com nota
nova em `componentes/requisitos/`.

---

## 4. Procedimento, variante a variante

A maior parte do texto **já existe no cadastro do banco** e está na ficha
do §7. O trabalho novo é decidir os eixos, escrever o "Quando NÃO usar" e
conferir a peça.

**Passo 1 — abra a peça.** No admin, aba Componentes
(`/admin/settings/email-generation`), procure pelo nome do §7. O preview
renderiza a 600px. É a peça, não a descrição, que decide os eixos.

**Passo 2 — monte o corpo a partir do cadastro.** O banco já tem seis das
sete seções, e elas são boas:

| Seção da nota | Campo do banco |
|---|---|
| `## Descrição curta` | `description` (está na ficha do §7) |
| `## Descrição detalhada` | `long_description` |
| `## Quando usar` | `when_use` (está na ficha) |
| `## Orientações de copy para a IA` | `copy_guidance` |
| `## Design system` | `design_system` |
| `## Direção fotográfica` | `photo_direction` |

Copie com fidelidade. **Onde o cadastro contradizer a peça, vale a
peça** — e a divergência vira nota em `componentes/lacunas/` (o §6 traz
as duas que já conhecemos). O cadastro do banco é que prevalece no
catálogo, então a nota descrever outra coisa é o defeito
`catalogo_divergente`, que já custou caro em 09/09.

**Passo 3 — escreva o `## Quando NÃO usar`.** Esta seção **não existe no
banco** para nenhuma das 31, e é a única fonte de eliminação que o
Curador tem. Escreva o negativo concreto, no tom das notas existentes:
qual momento, qual ativo faltando, qual registro de marca, qual peça
vizinha a torna redundante. Frases curtas, uma por linha.

**Passo 4 — decida os eixos.** Critério de cada um:

- **`objecao`**: que dúvida a ANATOMIA fecha — não o assunto da copy. Uma
  grade de 9 produtos fecha `escolha-variedade`/`amplitude-de-catalogo`;
  um depoimento com nome e cargo fecha `adesao-social`; um bloco de
  garantia e política fecha `confianca-no-canal`. Uma ou duas, não cinco.
- **`aliviador`**: o mecanismo pelo qual ela fecha. `prova_de_terceiro`
  exige voz de terceiro com identificação; `prova_por_volume` é número
  agregado; `comparacao_de_categoria` é "nós × os outros";
  `demonstracao_de_mecanismo` é como funciona. É vocabulário fechado —
  não troque por equivalente.
- **`profundidade`**: até onde a peça prova. Afirmar é `afirmacao`;
  mostrar o porquê é `mecanismo`; terceiro falando é `prova_de_terceiro`;
  compromisso da loja é `garantia`.
- **`registro` / `registro_vetado`**: a voz visual. Vete o que a peça
  destrói — a hero retrô com marquise não sobrevive em `luxo`.
- **`paleta`**: o que a peça assume hoje, não o que aceitaria.
- **`papel_na_peca`**: **leia a descrição antes de marcar `abre`.** Sete
  peças deste lote se descrevem como "e-mail inteiro" (marcadas na ficha)
  — elas são `peca-inteira`, e essa marcação é o que aciona
  `[[peca-inteira-nao-e-bloco]]`. Sem ela, o Curador monta uma peça
  inteira como hero e soma body e products embaixo.
- **`peso`**: copiado do §7.
- **`itens`**: o que a grade pede, em texto ("3 produtos", "2 colunas",
  "3 depoimentos"). Hoje é a única forma de o Curador saber disso — a
  contagem automática está quebrada para todas as 31 (ver o §1 da
  auditoria), então **este campo é obrigatório em toda peça com item
  repetido**.
- **`exige`**: o ativo da loja sem o qual a peça não funciona. Hero com
  slot de cupom exige `cupom-ativo`; vitrine com link por produto exige
  `produtos-com-pagina-propria`.

**Passo 5 — rode `valida.py` e `gera_catalogo.py`.**

---

## 4.1 Gabarito da nota

Copie esta forma. Os valores são do exemplo `hero section 11`; troque
tudo menos as chaves.

```markdown
---
tipo: componente
slug: hero-11-bogo-de-percentual-gigante
secao: hero
variant_id: 2ce07010-4b17-4f44-931a-f5f0b014b444
nome_no_banco: hero section 11
status: aprovada
ativa: true
objecao: [preco-valor, disponibilidade-urgencia]
aliviador: [comparacao_de_categoria]
profundidade: afirmacao
registro: [bold-alto-contraste, comercial]
registro_vetado: [luxo, clinico-sobrio]
paleta: [com-acento-definido]
papel_na_peca: [peca-inteira]
peso: { altura_px: 1022, classe: medio, fonte: medido }
convivencia: ["[[peca-inteira-nao-e-bloco]]"]
itens: null
exige: [cupom-ativo, foto-de-uso-real]
product_slots: 0
fonte: catalogacao-2026-09-17
---

E-mail inteiro de campanha promocional para quando a oferta cabe em duas
linhas: percentual enorme no topo, foto ocupando o meio, cupom e CTA no
fim.

## Descrição curta

<`description` do banco, na íntegra>

## Descrição detalhada

<`long_description` do banco>

## Quando usar

<`when_use` do banco>

## Quando NÃO usar

<escrito por você — não existe no banco>

## Orientações de copy para a IA

<`copy_guidance` do banco>

## Design system

<`design_system` do banco>

## Direção fotográfica

<`photo_direction` do banco>
```

Três detalhes que custam caro se passarem:

- **a frase de prosa vem antes do primeiro `##`** e é diferente da
  "Descrição curta" abaixo (pode ser a primeira frase dela). Sem ela, o
  índice do vault mostra a nota sem resumo e ela nunca é aberta;
- **`peso` é escrito literalmente assim**, entre chaves, em uma linha. É
  lido por regex — quebrar em várias linhas ou virar objeto YAML devolve
  `null`;
- **wikilink dentro de array inline vai entre aspas**
  (`["[[peca-inteira-nao-e-bloco]]"]`), senão o colchete duplo confunde o
  parser de array.

---

## 4.2 Pronto quando

1. `python .tools/valida.py` passa, e `python .tools/gera_catalogo.py`
   regenerou `_catalogo.md` com as 31 linhas novas.
2. No admin, aba **Conhecimento → sincronizar**: **0 notas puladas**.
3. No card **Higiene do vault** (mesma aba):
   - `variantes_sem_nota` = **0** (eram 31);
   - `notas_orfas` = **0** (eram 3 — as do §5);
   - `divergentes` sem nenhuma das 31 (se aparecer, a nota e o cadastro
     estão descrevendo peças diferentes — releia o passo 2).
4. As duas lacunas do §6 existem com `status: aberta`.

---

## 5. As armadilhas deste lote

**`body 21` está duplicado no banco** — duas variantes ativas com o mesmo
nome e peças diferentes. Os slugs do §7 já as separam (`body-21a` e
`body-21b`) e o `variant_id` de cada uma está na ficha. **Confira o
`variant_id` contra a ficha**, não pelo nome: o nome é ambíguo por
construção e o próprio código descarta esse apelido.

**`hero seciton 19` tem erro de digitação no nome do banco** (e um espaço
no fim). O slug da nota é `hero-19-…`, correto; mas `nome_no_banco` tem de
reproduzir o nome **exatamente como está no banco**, erro incluído — é
uma chave de casamento, não um texto. Se o nome for corrigido no admin
depois, a nota tem de ser corrigida junto.

**`reviews-8-ugc-de-comunidade` já existe e descreve outra peça.** O
`variant_id` dela (`d92f812f…`) não está mais no banco, e o
`nome_no_banco` dela é "review 8" — que hoje é o nome de uma variante
nova e diferente. Por isso:

- a nota da `review 8` nova nasce como **`reviews-8b-…`** (o vault já usa
  esse sufixo: `products-8a`/`8b`, `reviews-3a`/`3b`);
- **na nota antiga**, troque `status: aprovada` por **`status: retratada`**
  e apague o valor de `nome_no_banco` (deixe `nome_no_banco:` vazio ou
  `(variante removida do banco)`). Não renomeie, não apague o arquivo.
  Sem isso, qualquer conserto futuro do `variant_id` faz a peça nova
  herdar os eixos da peça antiga, em silêncio.
- Mesmo tratamento para **`reviews-3a-…`** e **`reviews-3b-…`**
  (`nome_no_banco: review 2` e `review 3`, ids órfãos, nenhum nome
  correspondente no banco hoje).

**Não invente o que a peça não tem.** Onde a ficha marca campo sem
âncora, o campo existe no contrato e não tem lugar no HTML: isso é
defeito de cadastro, não característica da peça. Descreva a peça que o
preview mostra e registre o resto no §6.

---

## 6. Lacunas a registrar (`componentes/lacunas/`)

Frontmatter no padrão das vizinhas:

```yaml
---
tipo: lacuna
sobre: biblioteca
secao: <secao ou geral>
descoberta_em: 2026-09-17
status: aberta
---
```

(`status: aberta` é o correto — o código serve lacuna aberta.)

1. **`produtos-13-quarto-produto-sem-lugar.md`** — o schema tem
   `showcase_product_4_name` e `_desc`, a descrição diz "vitrine de três
   produtos", `product_slots` diz 3 e não existe
   `showcase_product_4_photo`. Os dois campos não ancoram no HTML: o n8n
   escreve copy para um produto que a peça não mostra.
2. **`logo-here-nas-heros.md`** — as 9 heros novas (e 5 das 9 antigas)
   trazem o texto `LOGO HERE` no HTML, sem campo que o enderece, e um
   campo `*_logo_image` marcado como imagem GERADA. O logo é ativo da
   marca (`logo_light`/`logo_dark`), não imagem a gerar. Enquanto não for
   corrigido, `LOGO HERE` chega ao cliente.

---

## 7. As 31 variantes — ficha medida

Para cada uma: o `variant_id` (copie para o frontmatter), o slug da nota,
o texto que o banco já tem, a anatomia do schema, o peso medido e o que a
auditoria encontrou.

**Slugs.** O número segue o nome no banco; o prefixo é a **seção**
(`products-`, não `produto-`); complete com 3 a 5 palavras que descrevam
a peça, como nas notas existentes (`hero-9-atendimento-proativo`,
`products-8b-grade-3x3`).

| Nome no banco | Pasta | Slug (complete a descrição) |
|---|---|---|
| hero section 11 | `hero/` | `hero-11-…` |
| hero 12 | `hero/` | `hero-12-…` |
| hero section 13 | `hero/` | `hero-13-…` |
| hero section 14 | `hero/` | `hero-14-…` |
| hero section 15 | `hero/` | `hero-15-…` |
| hero section 16 | `hero/` | `hero-16-…` |
| hero section 17 | `hero/` | `hero-17-…` |
| hero section 18 | `hero/` | `hero-18-…` |
| `hero seciton 19 ` (sic) | `hero/` | `hero-19-…` |
| body 11 … body 20 | `body/` | `body-11-…` … `body-20-…` |
| body 21 (`f8fd38f6…`) | `body/` | `body-21a-…` |
| body 21 (`a2b509a4…`) | `body/` | `body-21b-…` |
| produto 10 | `products/` | `products-10-…` |
| produtos 11 | `products/` | `products-11-…` |
| produto 12 | `products/` | `products-12-…` |
| produtos 13 | `products/` | `products-13-…` |
| produto 14 | `products/` | `products-14-…` |
| produto 15 | `products/` | `products-15-…` |
| produto 16 | `products/` | `products-16-…` |
| review 8 | `reviews/` | `reviews-8b-…` (o `8` está ocupado) |
| review 9 | `reviews/` | `reviews-9-…` |
| review 10 | `reviews/` | `reviews-10-…` |

### Como ler a ficha

- **peso medido** foi obtido renderizando a peça a 600px no Chromium, com
- **auditoria** é o resultado das réguas do pipeline. "sem âncora" = o
  campo existe no contrato e não tem lugar no HTML. "texto órfão" = texto
  visível que nenhum campo escreve e que chega ao cliente como está.
- **maior índice numerado** é o maior número que aparece nas chaves do
  schema. Use-o para escrever `itens:` **só quando a família for de item
  repetido** — produto, depoimento, card, coluna, selo. `headline_1/2`,
  `body_1/2` e `title_1/2` são LINHAS do mesmo texto, não itens: a peça
  com `bogo_headline_1` e `_2` tem uma headline em duas linhas, não duas
  headlines. A contagem automática do código está quebrada para todas as
  31 (ver o §1 da auditoria), então este campo é o que resta.
  as imagens de placeholder substituídas por um pixel. Todas as imagens
  do lote declaram altura no HTML, então a medida não subestima.

---

### hero 12  ·  `9bc6a6c7-2fb8-4b66-bffa-0d64b6d28063`

- **⚠ a descrição diz E-MAIL INTEIRO** — candidata a `papel_na_peca: peca-inteira` + `convivencia: [[peca-inteira-nao-e-bloco]]`, não a `abre`.
- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 8849 chars · **dispositivo:** hero_oferta_cupom
- **descrição (banco):** E-mail inteiro de último dia, para quando a urgência é o argumento principal e precisa aparecer antes de qualquer outra coisa. Abre com um contador regressivo ocupando a tela inteira e só depois entrega a oferta e o botão.
- **quando usar (banco):** Último dia ou última hora de uma promoção, com prazo real e verificável. Campanha de canal específico, quando a oferta vale só em um marketplace ou loja. Oferta simples de percentual único, que cabe em um lockup de três partes. Quando existe um benefício secundário para pendurar na faixa do contador — frete, brinde, troca.
- **schema:** 10 campos (8 copy · 2 imagem) — `countdown_benefit_line`, `countdown_eyebrow`, `countdown_offer_main`, `countdown_offer_symbol`, `countdown_offer_suffix`, `countdown_subline`, `countdown_body`, `countdown_cta_label`, `countdown_background_image`, `countdown_logo_image`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 937 → classe `medio`
- **auditoria:** texto ancorado 6/8 · imagem 1/2 · **sem âncora (texto):** countdown_offer_symbol [frase_curta], countdown_offer_suffix [frase_curta] · **sem âncora (imagem):** countdown_logo_image · **texto órfão:** "LOGO HERE"

### hero seciton 19   ·  `e156f52e-4046-44be-a1e3-cc325a10e405`

- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 11994 chars
- **descrição (banco):** Bloco de oferta com estética de sistema operacional antigo, para marca que quer se comunicar por referência cultural em vez de por desconto. Entrega a oferta dentro de uma janela de programa, com faixas de marquise no topo e grade em perspectiva no fundo.
- **quando usar (banco):** Campanha com apelo nostálgico ou de referência cultural: retrô, Y2K, aniversário de marca, edição limitada. Marca de público jovem que se comunica por código visual compartilhado. Oferta de uma frase, sem regra nem escalonamento. Quando a peça precisa se destacar na caixa de entrada por estranhamento, não por tamanho de percentual.
- **schema:** 8 campos (5 copy · 3 imagem) — `retro_marquee_word`, `retro_headline`, `retro_body_1`, `retro_body_2`, `retro_cta_label`, `retro_background_image`, `retro_cta_image`, `retro_logo_image`
- **maior índice numerado:** 2 (famílias: body)
- **peso medido (Chromium, 600px):** altura_px 797 → classe `medio`
- **auditoria:** texto ancorado 4/5 · imagem 2/3 · **sem âncora (texto):** retro_headline [nao_encontrado] · **sem âncora (imagem):** retro_logo_image · **texto órfão:** "LOGO HERE"

### hero section 11  ·  `2ce07010-4b17-4f44-931a-f5f0b014b444`

- **⚠ a descrição diz E-MAIL INTEIRO** — candidata a `papel_na_peca: peca-inteira` + `convivencia: [[peca-inteira-nao-e-bloco]]`, não a `abre`.
- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 5286 chars · **dispositivo:** hero_oferta_cupom
- **descrição (banco):** E-mail inteiro de campanha promocional para quando a oferta é simples o bastante para caber em duas linhas. Abre com o percentual em corpo enorme, deixa a foto ocupar todo o meio da peça e fecha com cupom, reforço e CTA.
- **quando usar (banco):** Campanha promocional com mecânica de uma frase: BOGO, percentual único, leve 3 pague 2. Categoria em que a foto de produto vestido ou em cena vende sozinha — moda, calçado, acessório, beleza. Queima de estoque ou último dia, quando a urgência é o argumento e não há o que explicar. Quando existe um código de cupom para entregar junto.
- **schema:** 9 campos (7 copy · 2 imagem) — `bogo_headline_1`, `bogo_headline_2`, `bogo_subline`, `bogo_coupon_label`, `bogo_coupon_code`, `bogo_body`, `bogo_cta_label`, `bogo_background_image`, `bogo_logo_image`
- **maior índice numerado:** 2 (famílias: headline)
- **peso medido (Chromium, 600px):** altura_px 1022 → classe `medio`
- **auditoria:** texto ancorado 5/7 · imagem 1/2 · **sem âncora (texto):** bogo_coupon_label [nao_encontrado], bogo_coupon_code [nao_encontrado] · **sem âncora (imagem):** bogo_logo_image · **texto órfão:** "LOGO HERE"

### hero section 13  ·  `bd4965fe-9606-49ca-bdbf-f260571acb3a`

- **⚠ a descrição diz E-MAIL INTEIRO** — candidata a `papel_na_peca: peca-inteira` + `convivencia: [[peca-inteira-nao-e-bloco]]`, não a `abre`.
- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 9241 chars · **dispositivo:** hero_oferta_cupom
- **descrição (banco):** E-mail inteiro de data comemorativa forte, quando a oferta é um percentual único e a campanha já tem nome próprio. Entrega a oferta num card inclinado, o cupom logo abaixo e fecha com uma marcação diagonal repetindo o nome da data.
- **quando usar (banco):** Data comemorativa com nome próprio: Black Friday, Cyber Monday, Natal, aniversário da loja. Oferta de percentual único e válida para tudo, que cabe em três linhas. Marca com identidade escura ou de alto contraste, que aguenta um card preto ocupando o topo da peça. Quando existe cupom para entregar junto.
- **schema:** 11 campos (7 copy · 4 imagem) — `bf_offer_line_1`, `bf_offer_value`, `bf_offer_line_3`, `bf_coupon_label`, `bf_coupon_code`, `bf_cta_label`, `bf_campaign_name`, `bf_offer_card_image`, `bf_diagonal_stripes_image`, `bf_background_image`, `bf_logo_image`
- **maior índice numerado:** 3 (famílias: line)
- **peso medido (Chromium, 600px):** altura_px 1048 → classe `medio`
- **auditoria:** texto ancorado 6/7 · imagem 1/4 · **sem âncora (texto):** bf_coupon_label [frase_curta] · **sem âncora (imagem):** bf_diagonal_stripes_image, bf_background_image, bf_logo_image · **texto órfão:** "LOGO HERE"

### hero section 14  ·  `fea49994-d150-40fa-a8e9-513686563686`

- **⚠ a descrição diz E-MAIL INTEIRO** — candidata a `papel_na_peca: peca-inteira` + `convivencia: [[peca-inteira-nao-e-bloco]]`, não a `abre`.
- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 7373 chars · **dispositivo:** hero_oferta_cupom
- **descrição (banco):** E-mail inteiro de desconto adicional, para campanha de coleção em que a oferta é um percentual extra sobre o que já está no site. Constrói um bloco tipográfico gigante com a palavra do reforço repetida quatro vezes e entrega a coleção e o botão embaixo.
- **quando usar (banco):** Desconto adicional sobre preço de outlet ou sobre uma coleção específica. Campanha de coleção sazonal com nome próprio. Marca com identidade tipográfica forte, que dispensa foto de produto. Quando o percentual é de um ou dois dígitos — a coluna estreita não comporta mais.
- **schema:** 10 campos (7 copy · 3 imagem) — `lockup_eyebrow`, `lockup_repeat_word`, `lockup_value`, `lockup_suffix`, `lockup_collection_title`, `lockup_body`, `lockup_cta_label`, `lockup_type_image`, `lockup_background_image`, `lockup_logo_image`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 1006 → classe `medio`
- **auditoria:** texto ancorado 5/7 · imagem 0/3 · **sem âncora (texto):** lockup_value [frase_curta], lockup_suffix [frase_curta] · **sem âncora (imagem):** lockup_type_image, lockup_background_image, lockup_logo_image · **texto órfão:** "LOGO HERE"

### hero section 15  ·  `54881d0b-bcda-42ef-a56e-706f7ecc415b`

- **⚠ a descrição diz E-MAIL INTEIRO** — candidata a `papel_na_peca: peca-inteira` + `convivencia: [[peca-inteira-nao-e-bloco]]`, não a `abre`.
- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 6761 chars · **dispositivo:** hero_oferta_cupom
- **descrição (banco):** E-mail inteiro de data comemorativa com oferta única, para quando a campanha se resolve em uma linha e a marca quer dizer isso do jeito mais direto possível. Um selo identifica a data, a headline ocupa um terço da peça e o cupom vem logo abaixo.
- **quando usar (banco):** Data comemorativa com nome próprio e oferta de percentual único válida para tudo. Marca com foto de fundo forte, que aguenta a peça inteira apoiada numa imagem só. Quando existe cupom para entregar e ele é o único passo entre o leitor e a compra. E-mail curto de anúncio, sem necessidade de explicar nada.
- **schema:** 9 campos (7 copy · 2 imagem) — `cyber_badge_line_1`, `cyber_badge_line_2`, `cyber_eyebrow`, `cyber_headline`, `cyber_coupon_label`, `cyber_coupon_code`, `cyber_cta_label`, `cyber_background_image`, `cyber_logo_image`
- **maior índice numerado:** 2 (famílias: line)
- **peso medido (Chromium, 600px):** altura_px 855 → classe `medio`
- **auditoria:** texto ancorado 6/7 · imagem 1/2 · **sem âncora (texto):** cyber_headline [nao_encontrado] · **sem âncora (imagem):** cyber_logo_image · **texto órfão:** "LOGO HERE"

### hero section 16  ·  `28b9815c-466f-4621-b432-2babcab6e012`

- **⚠ a descrição diz E-MAIL INTEIRO** — candidata a `papel_na_peca: peca-inteira` + `convivencia: [[peca-inteira-nao-e-bloco]]`, não a `abre`.
- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 5692 chars · **dispositivo:** hero_apresentacao
- **descrição (banco):** E-mail inteiro de apresentação de coleção ou de conceito de marca, para quando a peça não tem oferta nenhuma e precisa vender por imagem e frase. A foto ocupa quase tudo dentro de um bloco em arco, e o texto entra só no terço final.
- **quando usar (banco):** Lançamento de coleção, reposicionamento ou apresentação de conceito, sem desconto envolvido. Marca com foto de campanha forte o bastante para carregar 783px de altura sozinha. Welcome de marca premium ou reengajamento por conteúdo, quando o objetivo é lembrar quem a marca é. Quando a mensagem cabe numa frase de duas a quatro palavras.
- **schema:** 6 campos (4 copy · 2 imagem) — `arch_headline_1`, `arch_headline_2`, `arch_body`, `arch_cta_label`, `arch_background_image`, `arch_logo_image`
- **maior índice numerado:** 2 (famílias: headline)
- **peso medido (Chromium, 600px):** altura_px 966 → classe `medio`
- **auditoria:** texto ancorado 4/4 · imagem 1/2 · **sem âncora (imagem):** arch_logo_image · **texto órfão:** "LOGO HERE"

### hero section 17  ·  `7f3a72a6-e24c-4aa6-b4ca-14df7f3d80b5`

- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 5480 chars · **dispositivo:** hero_apresentacao
- **descrição (banco):** Hero curto para abrir um e-mail quando a foto é horizontal e tem o assunto de um lado só. Encosta título, copy e botão na margem esquerda, deixando a metade direita da imagem livre.
- **quando usar (banco):** Abertura de e-mail com foto horizontal em que o assunto ocupa um dos lados. Peça curta: hero, CTA e nada mais, ou hero seguido de seções de conteúdo. Quando existe uma frase de destaque curta para colocar acima da copy. Marca com foto clara o bastante para receber texto preto por cima sem scrim.
- **schema:** 6 campos (4 copy · 2 imagem) — `hero_title`, `hero_body_lead`, `hero_body`, `hero_cta_label`, `hero_background_image`, `hero_logo_image`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 556 → classe `leve`
- **auditoria:** texto ancorado 4/4 · imagem 1/2 · **sem âncora (imagem):** hero_logo_image · **texto órfão:** "LOGO HERE"

### hero section 18  ·  `d5fe8ba1-05df-4803-9807-fc1e51019203`

- **seção (block_type):** hero · **product_slots cadastrado:** 0 · **HTML:** 5320 chars · **dispositivo:** hero_apresentacao
- **descrição (banco):** Hero de abertura para e-mail de conteúdo, quando o assunto precisa ser anunciado antes de qualquer imagem. Resolve título, contexto e botão no terço superior e entrega a metade inferior inteira para a foto.
- **quando usar (banco):** E-mail de conteúdo ou editorial, em que o assunto é um tema e não um produto. Quando a foto é ilustrativa e não precisa ser vista antes da decisão de clique. Peça curta: hero completo e nada mais, ou hero seguido de blocos de conteúdo. Marca com identidade neutra, que não depende de cor para se identificar.
- **schema:** 5 campos (3 copy · 2 imagem) — `hero_headline`, `hero_body`, `hero_cta_label`, `hero_background_image`, `hero_logo_image`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 977 → classe `medio`
- **auditoria:** texto ancorado 2/3 · imagem 1/2 · **sem âncora (texto):** hero_headline [nao_encontrado] · **sem âncora (imagem):** hero_logo_image · **texto órfão:** "LOGO HERE"

### body 11  ·  `3ce59e7b-0b26-4ec7-9de7-5b8ddc9ca4bc`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 5718 chars
- **descrição (banco):** Bloco de oferta para campanha de vale-presente ou data afetiva, quando o desconto é um valor fixo em moeda. Empilha título, contexto e cupom em branco sobre cinza e coloca o valor da oferta dentro do botão, que é o maior elemento da peça.
- **quando usar (banco):** Campanha de vale-presente, data afetiva ou sazonal em que o desconto é um valor fixo e não um percentual. Marca sem paleta autoral, que se comunica em neutro. Oferta simples e sem regra, com um código para acompanhar. Bloco de fechamento ou e-mail curto de anúncio.
- **schema:** 8 campos (7 copy · 1 imagem) — `gift_title`, `gift_subtitle`, `gift_body_1`, `gift_body_2`, `gift_coupon_label`, `gift_coupon_code`, `gift_cta_label`, `gift_background_image`
- **maior índice numerado:** 2 (famílias: body)
- **peso medido (Chromium, 600px):** altura_px 611 → classe `medio`
- **auditoria:** texto ancorado 7/7 · imagem 1/1

### body 12  ·  `9e1b454a-7af8-46f4-bdcf-f65fb0c09509`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 4934 chars
- **descrição (banco):** Seção de abertura para campanha sazonal em que o produto é mostrado recortado, sem cena. Resolve título, copy e botão sobre um degradê de preto a cinza claro e deixa a foto do produto encostada na base, sem moldura.
- **quando usar (banco):** Campanha sazonal ou de coleção com um produto-herói recortado em fundo transparente. Marca de identidade neutra, que se comunica em preto e branco. Peça curta: abertura completa e nada mais, ou seção de topo seguida de grade de produtos. Quando a foto do produto funciona melhor recortada do que em cena.
- **schema:** 4 campos (3 copy · 1 imagem) — `grad_title`, `grad_body`, `grad_cta_label`, `grad_product_image`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 692 → classe `medio`
- **auditoria:** texto ancorado 3/3 · imagem 1/1

### body 13  ·  `3789f525-7a72-4409-8c80-19cd3a1c1991`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 3899 chars
- **descrição (banco):** Bloco de prova visual para categoria em que o resultado é fotografável. Coloca duas fotos lado a lado dentro de um quadro de borda preta, com etiquetas nomeando cada lado encavaladas na borda superior.
- **quando usar (banco):** Categoria em que o resultado é visível: beleza, skincare, limpeza, organização, reforma, saúde estética. No meio de um e-mail, depois de uma promessa que precisa de comprovação. Quando existe par de fotos do mesmo ângulo e da mesma luz. Como bloco reaproveitável entre campanhas, já que não carrega copy nenhuma.
- **schema:** 4 campos (2 copy · 2 imagem) — `compare_label_left`, `compare_label_right`, `compare_image_left`, `compare_image_right`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 528 → classe `leve`
- **auditoria:** texto ancorado 2/2 · imagem 2/2

### body 14  ·  `8d87af44-1d73-4e09-a019-ec6efc1196e4`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 7970 chars
- **descrição (banco):** Bloco de lista para enumerar três benefícios ou etapas com apoio visual. Cada item é uma faixa retangular de contorno com um círculo de foto encavalado na borda esquerda.
- **quando usar (banco):** Lista de três benefícios, etapas ou diferenciais que se explicam em uma ou duas linhas cada. Quando existe foto específica por item — produto, ingrediente, detalhe, etapa. No meio de um e-mail, depois de uma promessa que precisa ser destrinchada. Marca de identidade neutra, em preto e branco.
- **schema:** 8 campos (5 copy · 3 imagem) — `list_title`, `list_item_1_text`, `list_item_2_text`, `list_item_3_text`, `list_cta_label`, `list_item_1_image`, `list_item_2_image`, `list_item_3_image`
- **maior índice numerado:** 3 (famílias: item)
- **peso medido (Chromium, 600px):** altura_px 823 → classe `medio`
- **auditoria:** texto ancorado 5/5 · imagem 3/3

### body 15  ·  `f32b479b-d0a9-4858-892a-f2864fb0e967`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 5985 chars
- **descrição (banco):** Bloco de detalhamento para produto cujos diferenciais são partes visíveis dele. Uma foto grande ocupa o miolo da seção e quatro chamadas com linha indicadora apontam para pontos específicos da imagem.
- **quando usar (banco):** Produto com diferenciais localizáveis na própria imagem: costura, fecho, material, acabamento, componente. Quando existe uma foto grande e limpa do produto inteiro, com áreas de sobra nas laterais. No meio de um e-mail, depois da apresentação do produto e antes da oferta. Exatamente quatro pontos a destacar — menos deixa a foto vazia, mais polui.
- **schema:** 10 campos (10 copy · 0 imagem) — `callout_title`, `callout_1_title`, `callout_2_title`, `callout_3_title`, `callout_4_title`, `callout_1_text`, `callout_2_text`, `callout_3_text`, `callout_4_text`, `callout_cta_label`
- **maior índice numerado:** 4 (famílias: callout)
- **peso medido (Chromium, 600px):** altura_px 1116 → classe `medio`
- **auditoria:** texto ancorado 10/10 · imagem 0/0

### body 16  ·  `3c462f82-795f-4d85-8e5d-7b6e7b3b8125`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 15095 chars
- **descrição (banco):** Bloco de diferenciação para quando o argumento é ponto a ponto contra a concorrência genérica. Usa três colunas arredondadas independentes, com os critérios à esquerda e as duas comparações à direita, e um selo circular ancorando a coluna da marca.
- **quando usar (banco):** Objeção de preço ou de escolha em categoria saturada, com seis critérios objetivos a comparar. Marca premium que precisa justificar valor contra um genérico sem nomear ninguém. Meio ou fim de régua, depois de a marca já ter se apresentado. Quando existe um selo, prêmio ou certificação para ancorar a coluna da marca.
- **schema:** 23 campos (22 copy · 1 imagem) — `compare_title`, `compare_header_them`, `compare_header_us`, `compare_feature_1`, `compare_feature_2`, `compare_feature_3`, `compare_feature_4`, `compare_feature_5`, `compare_feature_6`, `compare_them_1`, `compare_them_2`, `compare_them_3`, `compare_them_4`, `compare_them_5`, `compare_them_6`, `compare_us_1`, `compare_us_2`, `compare_us_3`, `compare_us_4`, `compare_us_5`, `compare_us_6`, `compare_cta_label`, `compare_badge`
- **maior índice numerado:** 6 (famílias: feature, them, us)
- **peso medido (Chromium, 600px):** altura_px 1339 → classe `pesado`
- **auditoria:** texto ancorado 21/22 · imagem 1/1 · **sem âncora (texto):** compare_header_us [frase_curta]

### body 17  ·  `b005cbd3-94df-4d2a-af76-095fecfccb30`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 3687 chars
- **descrição (banco):** Bloco compacto de duas colunas para inserir no meio de um e-mail quando a foto e a chamada têm o mesmo peso. Metade da largura é imagem sangrada, a outra metade é um painel preto com headline e botão.
- **quando usar (banco):** Bloco de apoio no meio de um e-mail, entre seções maiores, quando é preciso dar um respiro visual sem perder o clique. Quando existe uma foto vertical forte que funciona cortada pela metade da largura. Chamada de uma frase, sem contexto nem explicação. Marca de identidade preto e branco.
- **schema:** 3 campos (2 copy · 1 imagem) — `split_headline`, `split_cta_label`, `split_photo`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 403 → classe `leve`
- **auditoria:** texto ancorado 2/2 · imagem 1/1

### body 18  ·  `f8e40d35-efa5-448f-9c5f-f720b993e51f`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 8972 chars
- **descrição (banco):** Bloco de lista para enumerar cinco passos ou benefícios em ordem. Cada item tem um círculo numerado encavalado numa pílula branca com o título, e a descrição vem solta abaixo.
- **quando usar (banco):** Passo a passo de uso, de compra ou de programa de fidelidade, com cinco etapas. Lista de benefícios em que a ordem importa. No meio de um e-mail, depois de uma promessa que precisa ser destrinchada. Marca de identidade neutra, em preto e branco sobre cinza claro.
- **schema:** 12 campos (12 copy · 0 imagem) — `list_headline`, `list_item_1_title`, `list_item_1_text`, `list_item_2_text`, `list_item_3_text`, `list_item_4_text`, `list_item_5_text`, `list_item_2_title`, `list_item_3_title`, `list_item_4_title`, `list_item_5_title`, `list_cta_label`
- **maior índice numerado:** 5 (famílias: item)
- **peso medido (Chromium, 600px):** altura_px 1129 → classe `medio`
- **auditoria:** texto ancorado 12/12 · imagem 0/0

### body 19   ·  `d6fb99f3-6243-4f33-92c9-d90105900c98`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 9833 chars
- **descrição (banco):** Bloco de três features para marca de identidade escura, quando o e-mail precisa mostrar produto e explicar ao mesmo tempo. Três cards claros descem em zigue-zague sobre placas de foto giradas, num fundo preto com foco de luz.
- **quando usar (banco):** Três features ou diferenciais que se explicam em duas linhas cada. Marca de identidade escura, com fotos de produto que funcionam como textura de fundo. No meio de um e-mail, depois da apresentação e antes da oferta. Quando existe um jogo de ícones consistente para os três itens.
- **schema:** 11 campos (7 copy · 4 imagem) — `feat_headline`, `feat_card_1_title`, `feat_card_2_title`, `feat_card_3_title`, `feat_card_1_text`, `feat_card_2_text`, `feat_card_3_text`, `feat_background_image`, `feat_card_1_icon`, `feat_card_3_icon`, `feat_card_2_icon`
- **maior índice numerado:** 3 (famílias: card)
- **peso medido (Chromium, 600px):** altura_px 944 → classe `medio`
- **auditoria:** texto ancorado 7/7 · imagem 1/4 · **sem âncora (imagem):** feat_card_1_icon, feat_card_3_icon, feat_card_2_icon

### body 20  ·  `d2d50046-f27b-42dc-92c6-9c0e83dd57cc`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 10584 chars
- **descrição (banco):** Bloco de recuperação de checkout para quando o cupom já foi concedido e falta a foto vender. Resolve o código e o botão num painel preto compacto no topo, e usa a metade de baixo para uma foto grande com um painel translúcido de detalhes.
- **quando usar (banco):** Recuperação de checkout ou de carrinho com cupom já concedido. Quando existe uma foto forte do produto que precisa aparecer grande, mas depois do botão. Categoria em que os detalhes do item importam: medida, material, composição, prazo. Marca de identidade preto e branco.
- **schema:** 10 campos (9 copy · 1 imagem) — `cart_coupon_intro`, `cart_coupon_code`, `cart_coupon_condition`, `cart_cta_label`, `cart_panel_headline`, `cart_detail_1_left`, `cart_detail_2_left`, `cart_detail_1_right`, `cart_detail_2_right`, `cart_photo`
- **maior índice numerado:** 2 (famílias: detail)
- **peso medido (Chromium, 600px):** altura_px 1076 → classe `medio`
- **auditoria:** texto ancorado 8/9 · imagem 1/1 · **sem âncora (texto):** cart_coupon_condition [nao_encontrado]

### body 21  ·  `a2b509a4-2b74-42de-851d-01fe91735847`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 6371 chars
- **descrição (banco):** Bloco de garantias para fechar um e-mail, quando as três razões de confiança precisam vir antes da chamada final. Uma faixa preta com três ícones legendados abre a seção, um bloco branco carrega o argumento e o botão, e uma foto fecha embaixo.
- **quando usar (banco):** Fechamento de e-mail, depois do conteúdo principal e antes do rodapé. Quando existem exatamente três garantias que cabem em duas palavras cada: frete, troca, garantia, atendimento, pagamento. Marca de identidade preto e branco. Quando há uma foto de ambiente ou de marca que funciona como faixa, sem precisar de assunto centralizado.
- **schema:** 10 campos (6 copy · 4 imagem) — `trust_icon_1_label`, `trust_icon_2_label`, `trust_icon_3_label`, `trust_headline`, `trust_body`, `trust_cta_label`, `trust_icon_1`, `trust_icon_3`, `trust_icon_2`, `trust_photo`
- **maior índice numerado:** 3 (famílias: icon)
- **peso medido (Chromium, 600px):** altura_px 959 → classe `medio`
- **auditoria:** texto ancorado 6/6 · imagem 1/4 · **sem âncora (imagem):** trust_icon_3, trust_icon_2, trust_photo

### body 21  ·  `f8fd38f6-04d0-4337-a130-31e207510b59`

- **seção (block_type):** body · **product_slots cadastrado:** 0 · **HTML:** 7470 chars
- **descrição (banco):** Bloco de recuperação de checkout para quando o incentivo é um brinde e não um desconto. Resolve o código dentro de uma frase, entrega o botão, mostra a foto do que está em jogo e fecha com três selos de garantia.
- **quando usar (banco):** Recuperação de checkout ou de carrinho em que o incentivo é brinde, frete ou acessório, e não percentual. Marca de identidade escura. Quando existe uma foto horizontal do brinde ou do conjunto que precisa aparecer. Quando há exatamente três garantias a listar.
- **schema:** 12 campos (8 copy · 4 imagem) — `gift_coupon_line`, `gift_cta_label`, `gift_icon_1_label`, `gift_icon_1_sub`, `gift_icon_2_sub`, `gift_icon_3_sub`, `gift_icon_2_label`, `gift_icon_3_label`, `gift_photo`, `gift_icon_1`, `gift_icon_2`, `gift_icon_3`
- **maior índice numerado:** 3 (famílias: icon)
- **peso medido (Chromium, 600px):** altura_px 634 → classe `medio`
- **auditoria:** texto ancorado 8/8 · imagem 4/4

### produto 10  ·  `c43b3b63-88b8-4527-96d1-da10d19b840e`

- **seção (block_type):** products · **product_slots cadastrado:** 1 · **HTML:** 5685 chars
- **descrição (banco):** Bloco de reengajamento para marca de suplemento ou saúde, quando o argumento é lembrar a pessoa do motivo que a trouxe. Abre com uma headline serifada marcada a caneta e fecha com um depoimento dentro de uma moldura que a foto do produto atravessa.
- **quando usar (banco):** Quando existe um depoimento longo e específico, com resultado concreto. Marca de identidade clara e neutra, com um acento de cor único. Quando há uma foto do produto que funciona recortada e vertical.
- **schema:** 7 campos (6 copy · 1 imagem) — `winback_headline_1`, `winback_headline_2`, `winback_symptom`, `winback_desire`, `winback_review`, `winback_review_author`, `winback_product_photo`
- **maior índice numerado:** 2 (famílias: headline)
- **peso medido (Chromium, 600px):** altura_px 772 → classe `medio`
- **auditoria:** texto ancorado 6/6 · imagem 1/1

### produto 12  ·  `c772b4f0-f453-4f08-9862-34e8c1acc66a`

- **seção (block_type):** products · **product_slots cadastrado:** 4 · **HTML:** 15608 chars
- **descrição (banco):** Vitrine de quatro produtos em grade de dois por dois, para quando o e-mail precisa mostrar catálogo e cada item tem seu próprio destino. Abre com um selo dourado nomeando a seção e fecha com um botão de largura total.
- **quando usar (banco):** Vitrine de quatro produtos, coleção ou seleção, com cada item indo para uma página diferente. No meio ou no fim de um e-mail, depois do argumento e antes do rodapé. Marca que usa ornamento metálico na identidade: joalheria, relojoaria, perfumaria, premium acessível. Quando os nomes de produto são curtos e cabem em uma linha.
- **schema:** 11 campos (7 copy · 4 imagem) — `grid_badge`, `grid_product_1_name`, `grid_product_2_name`, `grid_product_3_name`, `grid_product_4_name`, `grid_product_cta_label`, `grid_final_cta_label`, `grid_product_1_photo`, `grid_product_2_photo`, `grid_product_3_photo`, `grid_product_4_photo`
- **maior índice numerado:** 4 (famílias: product)
- **peso medido (Chromium, 600px):** altura_px 1373 → classe `pesado`
- **auditoria:** texto ancorado 7/7 · imagem 4/4

### produto 14  ·  `87bca4da-b37a-42bd-a792-c74b55bf9afb`

- **seção (block_type):** products · **product_slots cadastrado:** 4 · **HTML:** 13097 chars
- **descrição (banco):** Vitrine de quatro produtos em grade de dois por dois, na versão mais enxuta possível: título, foto emoldurada, nome e botão. Serve como bloco de catálogo em marca de identidade neutra, sem ornamento nenhum.
- **quando usar (banco):** Vitrine de quatro produtos, coleção ou seleção, com cada item indo para uma página diferente. Marca de identidade neutra, sem paleta autoral. No meio ou no fim de um e-mail, depois do argumento. Quando os nomes de produto são curtos e cabem em uma linha.
- **schema:** 7 campos (7 copy · 0 imagem) — `grid2_title`, `grid2_product_1_name`, `grid2_product_2_name`, `grid2_product_3_name`, `grid2_product_4_name`, `grid2_product_cta_label`, `grid2_final_cta_label`
- **maior índice numerado:** 4 (famílias: product)
- **peso medido (Chromium, 600px):** altura_px 1073 → classe `medio`
- **auditoria:** texto ancorado 7/7 · imagem 0/0

### produto 15  ·  `ddad9b06-55f3-423e-8dc6-6f9f2629d104`

- **seção (block_type):** products · **product_slots cadastrado:** 4 · **HTML:** 19994 chars
- **descrição (banco):** Vitrine de quatro produtos com o cupom no fim, para campanha em que o desconto vale para o catálogo inteiro. Uma moldura arredondada envolve a grade e é atravessada pela headline no topo e pela faixa de oferta na base.
- **quando usar (banco):** Campanha promocional com desconto que vale para o catálogo e quatro produtos a destacar. Quando o cupom precisa aparecer depois da vitrine, não antes. Marca com um azul-petróleo ou cor escura de apoio na identidade. No meio ou no fim de um e-mail.
- **schema:** 13 campos (9 copy · 4 imagem) — `offergrid_headline_1`, `offergrid_headline_2`, `offergrid_product_1_title`, `offergrid_product_2_title`, `offergrid_product_3_title`, `offergrid_product_4_title`, `offergrid_product_cta_label`, `offergrid_coupon_line`, `offergrid_final_cta_label`, `offergrid_product_1_photo`, `offergrid_product_2_photo`, `offergrid_product_3_photo`, `offergrid_product_4_photo`
- **maior índice numerado:** 4 (famílias: headline, product)
- **peso medido (Chromium, 600px):** altura_px 1191 → classe `medio` · **⚠ estoura o container: scrollWidth 620px**
- **auditoria:** texto ancorado 7/9 · imagem 4/4 · **sem âncora (texto):** offergrid_product_cta_label [ocorrencias_excedem_campos], offergrid_final_cta_label [ocorrencias_excedem_campos]

### produto 16  ·  `417bf754-cc2c-4b1d-93bb-f429a7f9d4b6`

- **⚠ a descrição diz E-MAIL INTEIRO** — candidata a `papel_na_peca: peca-inteira` + `convivencia: [[peca-inteira-nao-e-bloco]]`, não a `abre`.
- **seção (block_type):** products · **product_slots cadastrado:** 0 · **HTML:** 9899 chars
- **descrição (banco):** Vitrine de dois produtos em cards bipartidos, para quando cada item merece meia peça inteira. Cada card é dividido ao meio entre foto e texto, e os dois se espelham.
- **quando usar (banco):** Vitrine de dois produtos em destaque, com foto forte. Quando cada item vai para uma página diferente. No meio ou no fim de um e-mail, depois do argumento. Marca de identidade neutra, em preto e branco.
- **schema:** 7 campos (5 copy · 2 imagem) — `pair_title`, `pair_product_1_name`, `pair_product_2_name`, `pair_product_cta_label`, `cta_here`, `pair_product_1_photo`, `pair_product_2_photo`
- **maior índice numerado:** 2 (famílias: product)
- **peso medido (Chromium, 600px):** altura_px 830 → classe `medio`
- **auditoria:** texto ancorado 5/5 · imagem 2/2

### produtos 11  ·  `57f25213-768b-4102-9617-3394fac595ce`

- **seção (block_type):** products · **product_slots cadastrado:** 1 · **HTML:** 13361 chars
- **descrição (banco):** Bloco de produto para quando a foto precisa ser grande e o argumento cabe em três linhas. Uma moldura de contorno fino começa no meio da imagem e envolve a lista de features e o botão.
- **quando usar (banco):** Apresentação de um produto único, com foto vertical forte e três atributos objetivos. No meio de um e-mail, depois da abertura e antes da oferta. Quando os três atributos são verificáveis e cabem em três ou quatro palavras cada. Marca de identidade neutra, com um acento de cor.
- **schema:** 6 campos (5 copy · 1 imagem) — `prod_intro`, `prod_feature_1`, `prod_feature_2`, `prod_feature_3`, `prod_cta_label`, `prod_photo`
- **maior índice numerado:** 3 (famílias: feature)
- **peso medido (Chromium, 600px):** altura_px 941 → classe `medio`
- **auditoria:** texto ancorado 5/5 · imagem 1/1

### produtos 13  ·  `ed0cf7b6-1f7e-4486-b97e-8430d9b49480`

- **seção (block_type):** products · **product_slots cadastrado:** 3 · **HTML:** 21015 chars
- **descrição (banco):** Vitrine de três produtos em linhas alternadas, para quando cada item merece nome, descrição e botão próprios. Uma moldura de contorno emoldura cada linha e a foto sangra para fora dela pelo lado oposto ao texto.
- **quando usar (banco):** Vitrine de três produtos que precisam de nome e descrição, não só de nome. No meio ou no fim de um e-mail, depois do argumento. Quando cada produto vai para uma página diferente. Marca de identidade preto e branco.
- **schema:** 14 campos (11 copy · 3 imagem) — `showcase_title`, `showcase_product_1_name`, `showcase_product_2_name`, `showcase_product_3_name`, `showcase_product_4_name`, `showcase_product_1_desc`, `showcase_product_2_desc`, `showcase_product_3_desc`, `showcase_product_4_desc`, `showcase_product_cta_label`, `showcase_final_cta_label`, `showcase_product_1_photo`, `showcase_product_2_photo`, `showcase_product_3_photo`
- **maior índice numerado:** 4 (famílias: product)
- **peso medido (Chromium, 600px):** altura_px 1288 → classe `pesado`
- **auditoria:** texto ancorado 9/11 · imagem 3/3 · **sem âncora (texto):** showcase_product_4_name [nao_encontrado], showcase_product_4_desc [nao_encontrado]

### review 10  ·  `32476827-5458-4cc6-af26-f7e428f81521`

- **seção (block_type):** reviews · **product_slots cadastrado:** 0 · **HTML:** 7571 chars
- **descrição (banco):** Bloco de prova social para marca com identidade editorial, quando um depoimento fecha o e-mail. Um card branco de cantos arredondados flutua sobre fundo cinza médio, com o depoimento em serifada.
- **quando usar (banco):** Fechamento de e-mail com um depoimento, para marca de identidade editorial. Quando a marca tem uma serifada na identidade e quer usá-la na voz do cliente. Quando um fundo cinza chapado se encaixa no e-mail sem destoar das seções vizinhas. Meio ou fim de régua, quando o argumento é confiança.
- **schema:** 5 campos (5 copy · 0 imagem) — `cardrev_title`, `cardrev_text`, `cardrev_author`, `cardrev_verified_label`, `cardrev_cta_label`
- **maior índice numerado:** nenhum
- **peso medido (Chromium, 600px):** altura_px 658 → classe `medio`
- **auditoria:** texto ancorado 4/5 · imagem 0/0 · **sem âncora (texto):** cardrev_cta_label [frase_curta] · **base64 embutido:** 1

### review 8  ·  `a6a84ff1-3068-4ab4-8ced-9cd0f30fe661`

- **seção (block_type):** reviews · **product_slots cadastrado:** 0 · **HTML:** 20168 chars
- **descrição (banco):** Bloco de prova social para fechar um e-mail de recuperação, quando o argumento é o volume de avaliações. Três depoimentos em cards de contorno, cada um com estrelas, uma barra cinza de identificação e a citação.
- **quando usar (banco):** Fechamento de e-mail de recuperação de carrinho ou checkout, depois da oferta. Quando existem três depoimentos reais e verificáveis. Marca que já tem volume de avaliações para citar no subtítulo. Meio ou fim de régua, quando o argumento é confiança e não desconto.
- **schema:** 12 campos (12 copy · 0 imagem) — `social_headline`, `social_subtitle`, `social_review_1_name`, `social_review_2_name`, `social_review_3_name`, `social_review_1_text`, `social_review_2_text`, `social_review_3_text`, `social_verified_label`, `social_verified_label_2`, `social_verified_label_3`, `social_cta_label`
- **maior índice numerado:** 3 (famílias: review, label)
- **peso medido (Chromium, 600px):** altura_px 1359 → classe `pesado`
- **auditoria:** texto ancorado 12/12 · imagem 0/0 · **base64 embutido:** 3

### review 9  ·  `3af5382a-4c22-4302-801c-4cd80ff2ce82`

- **seção (block_type):** reviews · **product_slots cadastrado:** 0 · **HTML:** 8987 chars
- **descrição (banco):** Bloco de prova social para fechar um e-mail com um depoimento só, quando o argumento é a qualidade da avaliação e não o volume. Uma pílula preta de estrelas fica encavalada no topo da moldura do card.
- **quando usar (banco):** Fechamento de e-mail de recuperação, depois da oferta. Quando existe um depoimento longo e específico, com detalhe concreto. Marca de identidade neutra, em preto e cinza escuro. Quando um relato vale mais que três genéricos.
- **schema:** 6 campos (6 copy · 0 imagem) — `review_title_1`, `review_title_2`, `review_text`, `review_author`, `review_verified_label`, `review_cta_label`
- **maior índice numerado:** 2 (famílias: title)
- **peso medido (Chromium, 600px):** altura_px 562 → classe `leve`
- **auditoria:** texto ancorado 6/6 · imagem 0/0 · **base64 embutido:** 1
