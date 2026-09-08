# Por que o e-mail gerado não chega perto da referência — agente por agente

Caso medido: Hero Boxers · Welcome 1 · batch `644d86c5` (08/09/2026, 21:31→21:43),
a última geração que atravessou o pipeline inteiro. Referência: os 37 e-mails de
welcome do Figma (`Sem título`, section `Welcome flow`).

## A pergunta certa

A referência usa a **mesma gramática de blocos** que a gente monta — hero com
incentivo → "why marca" → faixa de selos → grade → reviews → footer. O que a
torna autêntica é o **conteúdo dos campos de maior densidade**: mecanismo do
produto (`Soft Eucalyptus Knit / Medium Comfort Foam / Targeted Coil Support`),
prova quantificada (`82% increased deep sleep cycles`, `Proven by 370+ reviews`),
garantia concreta (`60-Day Returns`, `1 Year Warranty`), caminho guiado
(`A few best places to begin, depending on your goal`).

O nosso Welcome 1 tem a gramática e perde exatamente esses campos. A pergunta
não é "o pipeline pensa?" — ele pensa. É **onde a decisão se perde entre um
agente e o seguinte**.

## O que o Estruturador decidiu × o que saiu

| posição | Estruturador decidiu | o que o e-mail entregou |
|---|---|---|
| hero | **sem CTA, sem cupom** ("sem incentivo confirmado, o hero é apresentação"); foto de uso real em corpo adulto; headline que nomeia público e promessa | `Welcome To` / `Here's 10% OFF Your First Order` / `Use code: [WELCOME-CODE]` / `SHOP 10% OFF`; flat-lay de produtos |
| body pivô | origem da marca + mecanismo (bambu, corte acima do abdômen) em **2 parágrafos**; sem CTA | tabela comparativa `HERO BOXERS VS REST`, 5×6 itens |
| garantias | faixa escura com **3 selos nomeados**: pagamento seguro, troca em linguagem de intenção, compromisso da marca | `ICON 1 · ICON 2 · ICON 3` + o mesmo parágrafo do Shopify duas vezes |
| produtos | cada card com **avaliação + preço** + botão; reduzir a 2–3 (são variantes do mesmo produto) | 4 cards, sem preço, sem avaliação |
| reviews | **um** depoimento com nome, **idade** e contexto físico | 3 depoimentos, sem idade |
| footer | navegação por categoria + suporte simples + credencial | `Link Here` ×6 |
| offer | **descartado** (sem incentivo ativo) | o incentivo voltou pela hero e pelo assunto |

A estratégia foi invertida em 6 de 7 posições. Abaixo, quem inverteu.

## Agente por agente

### 0. Pesquisa / Catalogador — o insumo que falta

O `proibido_neste_toque` do Seletor tem 17 itens e a maioria é da forma "não
afirmar X — não encontrado na pesquisa": política de devolução, SLA de frete,
preço all-in, canal de suporte, controle de qualidade, o "83% more resistant"
(depoimento, não teste), e **nenhum incentivo ativo com código**. O tratamento
do alvo pede "secure-payment badge and plain-language return policy" — e a
devolução está proibida. O Seletor se contradiz porque o dado não existe.

Toda referência do Figma tem esses fatos porque o cliente os forneceu. Sem eles
a cadeia inteira é forçada à profundidade `afirmacao` e os selos não têm o que
dizer. **É lacuna de DADO, não de prompt.**

Otimizar: uma ficha operacional da loja com campos verificados (incentivo ativo
+ código + validade, política de troca em texto vivo, prazo de envio, garantia,
nº de reviews e nota, preço) que alimente `lastro_operacional.verificado`. E o
Seletor deve levantar `lacuna` quando o tratamento exige dado proibido — hoje
ele engole a contradição.

### 1. Seletor — pensa certo, entrega só o "não"

Acertou: `obj_1` ("nunca ouvi falar, não confio meu cartão"), risco
`seguranca`, primeiro toque, dimensão `integridade`. Falhas de forma:

- 17 proibições, várias em dobro (inglês e português da mesma regra);
- decide `promessa_a_pagar: null` e `incentivo` ausente, mas isso não vira
  **instrução positiva** para quem vem depois — o outline do flow segue
  mandando "entregar o incentivo nos primeiros segundos";
- não lista o que **pode** ser usado (Shopify checkout, fibra de bambu, corte,
  tamanhos).

Otimizar: além de `proibido`, emitir `insumos_permitidos` e uma decisão
tipada `incentivo: {existe:false}` que hero, assunto, outline e n8n são
obrigados a honrar. Deduplicar proibições.

### 2. Estruturador — o melhor agente da cadeia, e nada obriga o resto a obedecê-lo

A estrutura, o `porque`, a `adaptacao` e os `aprendizados_aplicados` são de
alta qualidade (ver tabela acima). O problema é de **forma da saída**: tudo
viaja como prosa dentro de `papel`. Não existe campo legível por máquina —
`cta: false`, `cupom: false`, `n_itens: 2-3`, `precisa_preco`,
`precisa_avaliacao`, `campos_exigidos: [selo_1..3]`. Então nenhum agente
consegue **validar** a variante escolhida contra a decisão, e o Curador só
recebe os NOMES das seções (`<secoes_disponiveis>`), não as anatomias.

Otimizar: um bloco `requisitos` tipado por posição, ao lado da prosa. O
Curador usa como filtro duro; o Blueprint valida o schema da variante contra
ele; o QA confere no fim.

### 3. Curador do vault (Sonnet) — o agente que expressa a estratégia na escolha… e cuja resposta é descartada

O raw da run mostra o raciocínio certo:

> hero-3: exige cupom ativo → **eliminada** (sem incentivo confirmado)
> hero-4: exige cupom ativo + serif/script display → eliminada
> hero-5: exige cupom ativo → eliminada
> hero-6: exige cupom ativo → eliminada
> …papel pede "cada card com avaliação visível + preço + botão próprio"…

Ele eliminou exatamente o bloco que acabou no e-mail. Morreu porque:

1. `runCuradorShadow` fixa **`max_tokens: 8192` no código** (a config do banco
   diz 16000 e é ignorada);
2. o protocolo é prosa-primeiro ("Vou agora trabalhar posição por posição") —
   8.327 tokens de saída, cortado **antes** de emitir o JSON;
3. `parseCuradorVaultOutput` procura `{…}` no raw → nada → `shadow_json_ilegivel`;
4. **não há retry** pedindo só o JSON; cai direto no legado.

160 s e US$ gastos para jogar fora a resposta certa. **É o maior alavancador
isolado.**

Otimizar: JSON-primeiro com `justificativa` curta por posição (ou raciocínio
num campo limitado); `max_tokens` da config; uma segunda volta "devolva só o
JSON" antes do fallback; e quando cair no legado, passar as eliminações já
feitas (o legado não deveria poder escolher o que o vault eliminou).

### 4. Curador legado (Kimi) — escolhe pela descrição, sem ver o contrato

Motivo registrado para a hero: *"sem depender de cupom ausente"* — para a
variante cujo `output_schema` **obriga** `coupon_line` e `cta_label`. O
catálogo servido a ele exclui o `output_schema` de propósito ("insumo
exclusivo do Montador (CM-4)") — mas o **Montador está desligado**
(`montador_mode='off'`), então a checagem de viabilidade de dados saiu do
pipeline junto com ele. Também casou "2 parágrafos de origem" com uma tabela
comparativa, "um depoimento" com 3 slots, "preço + avaliação" com cards sem
esses campos.

Otimizar: servir por candidata um resumo do contrato (`campos_obrigatorios`,
`exige_cupom`, `n_slots`, `tem_preco`, `tem_avaliacao`) e aplicar os
`requisitos` do Estruturador como filtro duro. Com o Montador off, a
viabilidade tem de morar aqui.

### 5. Blueprint — cola duas ordens contraditórias e manda as duas

`estruturador-consume.ts` faz
`purpose = papel + "\n\nForma (variante): " + copy_guidance`. O `purpose` da
hero que foi ao n8n contém, no mesmo texto:

> Sem CTA de compra aqui — sem incentivo confirmado, o hero é apresentação
> […] Headline — a oferta em duas linhas: linha 1 abre com o valor […] Linha
> do cupom — o código em bold […] CTA — verbo + o valor da oferta. Repetir o
> percentual aqui é o padrão

E os `fields` do bloco (do schema da variante) trazem `coupon_line` e
`cta_label` como campos a preencher. Quatro vozes chegam ao n8n — Estruturador,
forma da variante, outline do flow e `alvo.proibido` — sem arbitragem. O n8n
obedece a mais concreta: o schema.

Otimizar: quando `papel` e `forma` colidem num requisito duro, o Blueprint
marca o campo como `omitir` (o merge já tem `remove_row`) ou reprova a
variante ("incompatível com o papel"). `papel` viaja como campo próprio, não
colado no `purpose`.

### 6. Outline do flow (`email_outline_templates`) — genérico vencendo o específico

A "Estrutura geral" do welcome-1 diz: *"Cumprir o contrato imediatamente. O
incentivo prometido é entregue nos primeiros segundos […] Quem abriu para
pegar o código precisa achá-lo sem procurar."* Para uma loja sem incentivo é
uma ordem errada, e ela chega ao n8n com o mesmo peso da decisão do
Estruturador.

Otimizar: outline condicional a `incentivo.existe`, ou subordinado ao
Seletor/Estruturador (que são por loja; o outline é por flow).

### 7. Copy (n8n) — obedece ao bloco, não à estratégia

Escreveu `Here's 10% OFF`, `Use code: HERO10`, `SHOP 10% OFF` e o assunto
`Your 10% off is here, [First Name]` — 10% e código **inventados**
(`coupon_code` no payload é `null`). Ao mesmo tempo, os reviews vieram
excelentes e exatamente como o Estruturador pediu: *"I'm 54, 38-inch waist"*,
*"I sit at a desk eight hours a day"*.

Otimizar: receber a decisão arbitrada (`incentivo: null` → nunca escrever
oferta; campo `omitir` → devolver vazio) e os `insumos_permitidos`. Merge tag
`[First Name]` é token de plataforma, não texto.

### 8. copy_fit — apaga o que era específico

- Rejeitou os dois melhores reviews (`ainda_acima_do_limite`, max 190) — os
  que tinham idade e cintura.
- Reescreveu *"Sits low — rolls down by midmorning"* como *"Low rise, no
  midday roll"*: **inverteu o sentido** na coluna dos concorrentes.
- Preencheu `column_b_item_6` (ausente) com *"High rise, stays in place all
  day"* — um benefício da Hero na coluna OTHERS.
- `section_title` com max 20 virou `WHY HERO BOXERS`.

Otimizar: item ausente em coluna comparativa remove a linha, não inventa;
travessão vira vírgula/dois-pontos por código, sem reescrita por LLM; review
acima do limite é aparado no fim, não descartado; auditar os `max_len` dos
schemas (190 chars para review é menor que as citações das referências).

### 9. Imagem — a direção da variante sobrepõe a decisão

`PHOTO_DIRECTION` vem do `photo_direction` da **variante** ("flat-lay em
ângulo alto com o kit de produtos"); o pedido do Estruturador ("foto de uso
real em corpo adulto, não estúdio") viaja em `block_purpose`, que está em
`CFY_SUPPORT` — o peso mais baixo. O `seal_1_image` recebeu como direção
fotográfica a **tabela de layout** da variante (`# — Elemento — Padding-top —
Dimensão`). 8 imagens geradas (100–240 s cada), **4 mergeadas**.

Otimizar: a intenção visual do Estruturador entra em `CFY_PRIMARY_BRIEF`
quando existir; sanitizar `photo_direction` (tabela não é brief); não gerar
imagem para slot que o merge não vai colocar.

### 10. Hero section (LLM) — reescreve a copy pronta

Roda **depois** do `copy_merge` e devolve HTML. O merge tinha escrito
`The right fit for / your real body` e `Use code: HERO10`; o HTML final tem
`Here's 10% OFF Your First Order` e `[WELCOME-CODE]` (`position(...) = 0`
para os textos do merge). O prompt proíbe em maiúsculas; não há guard.

Otimizar: diff do texto visível antes/depois com rejeição; ou virar ops como
os outros agentes.

### 11. QA — desligado

`EMAIL_QA_ENABLED != 'true'` → `skipped`. Nada reprova `ICON 1`,
`[WELCOME-CODE]`, parágrafo duplicado, oferta em e-mail sem incentivo.

Otimizar: ligar com quatro checks baratos: cupom presente com
`incentivo.existe=false`; texto de exemplo da biblioteca no HTML; parágrafo
repetido; placeholder entre colchetes.

### 12. Mapeamento example → HTML — consequência, não causa

94% dos campos ancoram. 16 examples a corrigir e 36 textos sem campo
(`worklist-cobertura-biblioteca.md`). Pequeno, e só aparece depois que tudo
acima já decidiu errado.

## O 80/20

1. **A resposta do Curador do vault é descartada.** `max_tokens` fixo + prosa
   antes do JSON + sem retry → cai num fallback que não vê contrato e escolhe
   o bloco que o vault tinha eliminado. Consertar parser/tokens/retry e dar ao
   fallback a visão do contrato é a mudança de maior efeito por linha de código.
2. **Não existe arbitragem entre estratégia e forma do bloco.** Estruturador
   diz "sem cupom"; schema, forma da variante e outline dizem "cupom"; o n8n
   obedece ao schema. Precisa de requisitos tipados → filtro no Curador →
   `omitir` no Blueprint → `remove_row` no merge → check no QA.
3. **Faltam os fatos operacionais** que fazem uma referência parecer
   autêntica (política, garantia, números, incentivo). Sem eles o Seletor
   proíbe tudo e os selos ficam vazios. Isso é onboarding, não prompt.
