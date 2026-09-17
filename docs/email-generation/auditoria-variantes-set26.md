# Auditoria das 31 variantes novas (15–17/set/2026)

Medido em produção contra as réguas do próprio repositório — não por
leitura de código nem por amostragem. Toda afirmação abaixo tem o número
que a sustenta e o módulo que a produziu.

**Como foi medido.** As 31 linhas foram exportadas inteiras (HTML +
`output_schema`) e passadas por `variantIsFillable`, `auditSchemaAnchors`,
`auditImageAnchors`, `auditOrphanText` (`schema-example-coherence.ts`),
`auditEmailWidth` (`email-width.ts`), `resumirContrato`/`papelDoCampo`
(`field-roles.ts`) e `buildCatalogVaultExtras` (`curador-vault.ts`). O
`peso` foi medido renderizando cada peça a 600px no Chromium.

---

## O lote

31 variantes criadas em 15, 16 e 17/09, **todas ativas**, todas
`source: manual`: 9 `hero`, 12 `body`, 7 `products`, 3 `reviews`. A
biblioteca ativa foi de **44 para 65** variantes (+48%) — e o catálogo
inteiro vai no system prompt do Curador, então o lote mexe em todas as
gerações, não só nas que escolherem uma delas.

## O que está certo

Não é formalidade: são as quatro coisas que costumam quebrar num
cadastro em lote, e nenhuma quebrou.

- **As 31 passam em `variantIsFillable`** — todas têm schema e pelo menos
  uma âncora real no HTML. Nenhuma fica fora do pool do Montador.
- **Largura declarada em 600px em todas** (`auditEmailWidth` ok, raiz
  `document` em todas as 31).
- **A numeração não colide** com a biblioteca antiga: as antigas vão até
  `hero section 10`, `body 10`, `produtos 9`, `review 7`; as novas
  continuam de 11 em diante.
- **A curadoria escrita está densa e é boa**: `description` (165–255
  chars), `when_use`, `copy_guidance` (340–772), `long_description`
  (729–1185) e `photo_direction` (202–885) preenchidos em 30 ou 31 das
  31. Isso é o insumo mais caro de produzir, e ele existe.

---

## Bloqueador 1 — o prefixo temático apaga a contagem de itens

**0 de 134** campos numerados das novas são reconhecidos por
`papelDoCampo`. Nas antigas, **162 de 182** são.

A causa é uma regex ancorada no início da chave
(`field-roles.ts:67-72`): as famílias são `^product_(\d+)_`,
`^(review|testimonial)_(\d+)_`, `^panel_(\d+)_`,
`^(feature|marker|seal)_(\d+)_`. As antigas escrevem `product_1_name`,
`review_1_quote`, `panel_2_main_photo`. As novas escrevem
`grid_product_1_name`, `showcase_product_1_name`,
`offergrid_product_1_title`, `pair_product_1_name`,
`social_review_1_name`, `feat_card_1_icon`, `trust_icon_3` — o prefixo
temático entra antes e o `^` não casa mais.

O efeito é silencioso e está medido: **as 31 saem com `n_itens: null` e
`itens: {}`**, enquanto `produtos 8 - 9 produtos` sai com `n_itens: 9` e
`review 5` com `3`. Consequências, na ordem em que aparecem:

- O **catálogo do Curador** perde a linha `slots` (o `campo("slots", …)`
  do `buildCompactCatalog` só imprime quando `itens.product > 0`). Ele
  decide sem saber que `produtos 13` é uma vitrine de 3 e `review 8` traz
  3 depoimentos.
- O passo 2 do protocolo manda **eliminar por contrato** ("grade de 4
  quando o papel pede 2"). Sem `n_itens`, essa eliminação não acontece.
- `arbitrarCampos` (Blueprint) marca `omitir` no item que passa de
  `n_itens.max`. Sem família, nada é omitido e o n8n escreve copy para
  item que não existe.

**O que NÃO quebra** (conferido, para não corrigir o que está bom): o
agente de imagem continua acertando o produto de cada campo —
`productIndexForField` usa `(?:^|_)(?:panel|product|…)_(\d+)`, com `_`
como alternativa ao início, e casa com `showcase_product_2_photo`
normalmente.

Há duas saídas, e a escolha é de arquitetura: renomear as chaves para o
padrão ancorado (mexe em 134 campos e nos `example` já ancorados) ou
afrouxar as regex de `FAMILIAS` para `(?:^|_)`, como o
`product-for-field.ts` já faz. A segunda é uma linha e alinha as duas
réguas; a primeira é mais trabalho e não traz nada que a segunda não
traga.

## Bloqueador 2 — 36 campos sem endereço no HTML

16 das 31 variantes têm campo que o merge não consegue ancorar: **17 de
texto e 19 de imagem**. O campo existe no contrato, o n8n escreve a copy,
e ela não tem onde entrar.

Os casos que doem mais:

- **`hero section 11`: `bogo_coupon_label` e `bogo_coupon_code` não
  ancoram** (`nao_encontrado`). É a hero descrita como "fecha com cupom" —
  o cupom é o motivo dela existir e é justamente o que não entra.
- **`hero section 15`, `hero section 18`, `hero seciton 19`: a própria
  headline** (`cyber_headline`, `hero_headline`, `retro_headline`) não
  ancora.
- **`produtos 13`: `showcase_product_4_name` e `_desc`** não ancoram — e
  a descrição da peça diz "vitrine de três produtos", `product_slots` diz
  3, e não existe `showcase_product_4_photo`. O 4º produto está no
  contrato e não existe na peça.
- **`produto 15`: dois CTAs caem em `ocorrencias_excedem_campos`** — o
  mesmo texto aparece mais vezes no HTML do que há campos para reivindicá-lo,
  e o merge recusa em vez de chutar.
- **`hero 12`, `hero section 13`, `hero section 14`, `body 16`:
  `frase_curta`** — o `example` normalizado tem menos de 4 caracteres, que
  é o mínimo do `anchor-match`. Um `%` ou um `OFF` não dá para ancorar.

## Bloqueador 3 — "LOGO HERE" e o campo de logo

As **9 heros novas** trazem o texto literal `LOGO HERE` no HTML, e o
`auditOrphanText` o classifica como suspeito — é o caso canônico do teste
do próprio módulo (`schema-example-coherence.test.ts:132`). Texto órfão
não vai no payload do n8n, não volta como copy, nenhum agente de
formatação tem alçada para tocá-lo: atravessa o pipeline e chega ao
cliente.

Junto vem o campo `*_logo_image`, marcado `type: image` e portanto
derivado como `imagem_gerada` — ou seja, **pedindo ao modelo de imagem
que gere o logo da marca**. Nas 9, ele é um dos 19 campos de imagem sem
âncora. O logo não é imagem gerada: ele chega pelos ativos da loja
(`logo_light`/`logo_dark`, classe `loja` na proveniência).

**Isto é dívida preexistente, não regressão do lote**: `LOGO HERE` está
em 5 das 9 heros antigas e `brand_logo[image/imagem_gerada]` em 3 delas.
O lote dobra a incidência (9/9) em vez de criá-la.

## Bloqueador 4 — base64 embutido em 3 reviews

`review 8` (3 ocorrências), `review 9` e `review 10` (1 cada) têm
`data:image/` dentro do HTML. Existe rota pronta para isso —
`POST /api/admin/components/extract-base64` move a imagem para o Storage.
É um clique, mas precisa ser dado: HTML com base64 infla o documento e
vários clientes de e-mail não renderizam.

---

## Conflitos com o que já existe

**`body 21` está duplicado.** Duas variantes ativas com o mesmo nome
(`f8fd38f6…` e `a2b509a4…`, peças diferentes — 12 e 8 campos). O
`buildAliasIndex` normaliza nome → id e **descarta a chave quando dois
ids a disputam**; o comentário do módulo é explícito ("resolver para a
variante errada é pior que não resolver"). Resultado: se o Curador citar
"body 21", a escolha vira `invalid_ids` e a posição fica vazia — o
mesmo modo de falha do `offer-4` de 07/09.

**`hero seciton 19` tem erro de digitação no nome** (e um espaço no fim).
Não quebra nada hoje — o alias resolve o que está escrito —, mas o nome
é a chave que o Curador cita e o que a nota do vault vai declarar em
`nome_no_banco`. A biblioteca já carrega um `hero sectiion 8` de junho
pelo mesmo motivo.

**7 peças se descrevem como "e-mail inteiro" e estão cadastradas como
bloco**: `hero 12`, `hero section 11`, `13`, `14`, `15`, `16` e
`produto 16`. O vault tem a regra
(`peca-inteira-nao-e-bloco`, em `componentes/convivencia/`) e o eixo
(`papel_na_peca: peca-inteira`), mas nada disso existe no cadastro do
banco. Sem a nota, o Curador vai montar uma peça inteira como se fosse a
hero e somar body + products embaixo.

**`produto 16` declara `product_slots: 0`** e tem `pair_product_1_*` e
`pair_product_2_*` — dois produtos. `product_slots` é o que o Estruturador
usa para saber se a loja consegue preencher a peça.

**`produto 15` estoura o container**: `scrollWidth` 620px num viewport de
600. O `auditEmailWidth` passa porque olha a largura DECLARADA do
container, não o layout renderizado — é o mesmo tipo de defeito do
incidente de 08/09 ("a calha somava por fora"), que só aparece
renderizando.

---

## O que falta, e é o trabalho do vault

**Nenhuma das 31 tem nota no Obsidian.** A cobertura por seção hoje:
`body` 3 de 16, `hero` 9 de 18, `products` 9 de 16, `reviews` 5 de 7 —
`footer` e `offer` estão completos.

Isso não é cosmético. Os eixos de decisão do catálogo vêm **todos** do
vault (`buildCompactCatalog`, campo `axes`): `objecao`, `aliviador`,
`profundidade`, `registro`, `registro_vetado`, `paleta`, `papel_na_peca`,
`peso`, `convivencia`, `itens`. Sem nota, a linha da variante nova no
catálogo é:

```
- <uuid> · body 16 — <primeira frase da descrição> | anatomia: cta
```

Contra oito eixos preenchidos nas antigas. O protocolo manda rankear por
`objecao → aliviador → profundidade → registro → paleta → papel_na_peca`
e diz que "eixo que não separa é neutro" — então **as novas não são
eliminadas, elas simplesmente não competem**: chegam ao desempate final
(nota de seção → menor uso → menor número no slug) sem nunca ter ganhado
um eixo. Some-se que `when_not_use` está vazio nas 31 e que o vault é o
outro lugar de onde o "quando NÃO usar" poderia vir: hoje **não existe
critério de eliminação para nenhuma delas**.

O caminho está em `prompt-catalogar-variantes-set26.md`, com a ficha
medida de cada uma.

### Duas armadilhas no vault, para quem for catalogar

**Três notas apontam para variantes que não existem mais**:
`reviews-3a-…` (`nome_no_banco: review 2`), `reviews-3b-…` (`review 3`) e
`reviews-8-ugc-de-comunidade` (`variant_id d92f812f…`, que não está na
tabela). A última é a perigosa: o `nome_no_banco` dela é **"review 8"**, e
existe hoje uma variante ativa `review 8` — outra peça, criada em 17/09.
Hoje não contamina, porque `buildCatalogVaultExtras` casa por
`variant_id` primeiro e só cai no nome quando o id é nulo. Mas basta
alguém "consertar" a nota apagando o id órfão para a peça nova herdar os
eixos e o "quando usar" de outra.

**Quatro colunas existem no banco e não no repositório**: `dispositivo`,
`anatomia_slug`, `tokens_de_identidade` e `geracao_meta` foram criadas
direto em produção, sem migration em `supabase/migrations/`. Nenhuma é
lida por código algum hoje (`dispositivo` está preenchida em 8 heros).
Não quebra nada agora; diverge repo × banco e some em ambiente novo.

---

## Ordem sugerida

1. **`body 21` duplicado** — renomear um dos dois. É o único que produz
   posição vazia numa geração.
2. **`papelDoCampo`** — afrouxar `FAMILIAS` para `(?:^|_)`, alinhando com
   `product-for-field.ts`. Uma linha por família, devolve `n_itens` a 134
   campos.
3. **Catalogar as 31 no vault** — é o que devolve os eixos de decisão.
4. **Os 36 campos sem âncora**, começando pelo cupom da `hero section 11`
   e pelas três headlines.
5. **`extract-base64` nas 3 reviews** e o `produtos 13` (4º produto),
   `produto 16` (slots), `produto 15` (620px).
6. **LOGO HERE / `*_logo_image`** — vale resolver junto com as 5 heros
   antigas que têm o mesmo padrão, não só nas novas.
