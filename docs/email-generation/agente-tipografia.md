# Agente de Tipografia

> Status: desenhado, não implementado. Base de conhecimento fechada com o
> especialista em 03/09/2026.

## 1. Escopo

Ele entra **depois que a copy já está no HTML**. Não escreve, não corta, não
traduz e não move nada. Olha as declarações de fonte do documento pronto e, em
**algumas** delas, troca a tipografia — família, peso, caixa alta, espaçamento
entre letras — com uma fonte que converse com a loja.

Hoje isso não existe. `normalizeFonts` (`src/lib/agents/html/hero-graft.ts:159`),
chamada por `assembleDocument` (`architect/assemble-document.ts:222`), carimba a
fonte cadastrada em **todas** as declarações do documento, por uma heurística
cega ao papel (`font-size ≥ 20px` OU peso ≥600 OU `<h1..3>` → heading, resto →
body). Resultado medido no Welcome 1 da Innova (86 KB): **74 declarações da
mesma família**, do título do herói ao link do rodapé.

## 2. De onde vem o agente

Duas peças mortas viram uma:

- **`text_format`** — agente ativo que não roda desde 20/08: o `copy_merge`
  coloca a copy por código e a run sai `skipped` (`merge_por_exemplo`).
- **`src/lib/agents/refiner/`** — 1.520 linhas testadas e órfãs (nenhum import
  fora da pasta; `refiner_enabled` inerte desde a migration 20261039). Já tem a
  mecânica certa: `font-whitelist.ts` (26 fontes do Google por tom, com pesos e
  substituto), `apply-delta.ts` (inventário numerado de `font-family` →
  decisão por índice → aplicação por código), `guards.ts` (fail-open atômico).

## 3. Por que inventário, e não o HTML

O agente **não recebe o email**. Recebe a lista numerada dos lugares onde há
fonte declarada e responde "no item 14, peso 900". O código faz a troca.

É a lição do `text_format`: modelo que recebe 86 KB e devolve 86 KB reescreve o
documento inteiro, e quebra tabela, come botão ou perde tag de imagem. O
`color_format`, que funciona, faz assim — recebe o inventário de cores e devolve
`recolor {from,to}`; o código pinta (`html/apply-patches.ts`).

Ganhos: prompt de ~3 KB em vez de 86 KB; impossível quebrar estrutura (só troca
valor de `font-family`, `font-weight`, `text-transform`, `letter-spacing`); e
cada decisão fica rastreável — item, motivo, aplicada ou descartada.

## 4. Base de conhecimento (especialista, 03/09)

| # | Regra | Onde vive |
|---|---|---|
| 1 | Teto de **3 ocorrências** de família secundária por peça — conta ocorrência, não posição. **O CTA fica fora**: é o mais repetido e o mais curto. Com review na peça, o título de seção abre mão. | guard + prompt |
| 2 | Só **fonte principal + tom** decidem a segunda fonte. Preço e nicho eliminam extremos; cor não influencia; foto é compatibilidade. **Tom genérico → não injeta.** Estrutural: principal é display forte → a segunda vai para o **corpo**; principal é grotesca neutra → a segunda vai para o **destaque**. | prompt |
| 3 | **Herói com texto na imagem → sóbrio embaixo.** A imagem já gastou a cota de expressão e quase nunca respeita a fonte da marca; romper embaixo dá três vozes, uma acidental. Exceção: o número da oferta (é dado, não voz). | prompt + guard |
| 4 | **Cupom: caixa alta + tracking na principal**, dentro da pílula. Sem mono (comunica "sistema", a pílula já isola, e o substituto Courier aparece para boa parte da base). Trocar só se a principal confundir `0/O` e `1/l/I` — aí é legibilidade. | prompt |
| 5 | **Peso de título da marca só no maior título** (um por email, dois no máximo). O resto preserva os degraus do desenho. Teto de **3 pesos**, distância mínima **200** entre eles (400/600/900). | guard |
| 6 | Família só se lê como intenção **acima de 20px**; **piso duro 16px**. Rótulo de CTA vive entre 14 e 16px — está estruturalmente abaixo do limiar. | guard |
| 7 | **Escolha o par, não a fonte.** ~40% recebe o substituto: sans + serifada sobrevive (Arial/Georgia); sans + sans vira Arial dos dois lados e a hierarquia some. **Par de duas sans é recusado.** | guard + prompt |
| 8 | Fundo escuro **comprime a escala para o meio**: ≤300 sobe um degrau; 400–600 fica; **≥700 em corpo grande desce um degrau**. Sem serifada de traço fino no escuro. Off-white sobre quase-preto. | guard |

### Aplicado à Innova

Montserrat 900/400, tom "relaxed, friendly, approachable", ticket de entrada,
eletrônicos → **não injeta segunda família**. Montserrat tem nove pesos e
sustenta a hierarquia sozinha; serifada brigaria com friendly e com tech ao
mesmo tempo; outra grotesca vira quase-Montserrat. A ruptura sai de peso, caixa
alta com tracking e tamanho. O 900 hoje espalhado passa a valer só no maior
título, e desce um degrau nos blocos de fundo escuro.

## 5. O que o agente recebe

### 5.1 A loja

```
<loja>
  <marca>Innova Bay</marca>
  <fonte_principal>Montserrat</fonte_principal>
  <classe_principal>sans (grotesca geométrica, altura-x alta)</classe_principal>
  <pesos_disponiveis>200,300,400,500,600,700,800,900</pesos_disponiveis>
  <fallback_principal>Arial, Helvetica, sans-serif</fallback_principal>
  <tom_de_voz>relaxed, friendly, approachable</tom_de_voz>
  <posicionamento>ticket de entrada</posicionamento>
  <nicho>eletrônicos / economia de energia</nicho>
  <idioma>en</idioma>
  <hero_tem_texto_na_imagem>não</hero_tem_texto_na_imagem>
</loja>
```

### 5.2 As fontes disponíveis

A whitelist de `refiner/font-whitelist.ts`, agrupada por tom, com pesos e
substituto (`renderWhitelistForPrompt`).

### 5.3 O inventário (dados reais do Welcome 1)

```
<inventario total="74">
#4  bloco 1 (hero) · hero_headline
    Montserrat 50px · peso 400 · caixa normal · tracking -0.06em
    fundo #1F1F1F (escuro) · texto: "Welcome to Innova Bay"

#7  bloco 1 (hero) · hero_coupon_code · dentro de pílula
    Montserrat 25px · peso 700 · caixa normal · sem tracking
    fundo #F2F2F2 (claro) · texto: "BEMVINDO10"

#9  bloco 1 (hero) · hero_cta_label · botão
    Montserrat 30px · peso 900 · caixa normal
    fundo #07A55D · texto: "SHOP NOW"

#11 bloco 2 (offer) · offer_title
    Montserrat 40px · peso 400 · caixa normal
    fundo #FFFFFF (claro) · texto: "Zero Risk. Real Results."

#14 bloco 3 (body) · body_title
    Montserrat 56px · peso 900 · CAIXA ALTA · tracking 0.03em
    fundo #FFFFFF (claro) · texto: "INNOVA BAY VS OTHERS"

#31 bloco 5 (reviews) · review_1_text
    Montserrat 18px · peso 400 · caixa normal
    fundo #FFFFFF (claro) · texto: "I cut my power bill by a third…"

#58 bloco 6 (footer) · link
    Montserrat 14px · peso 400 · caixa normal
    fundo #1F1F1F (escuro) · texto: "Unsubscribe"
…
</inventario>
```

### 5.4 O que ele devolve

```json
{
  "segunda_fonte": null,
  "justificativa": "Montserrat com nove pesos sustenta a hierarquia sozinha; tom genérico e ticket de entrada não sustentam injeção de família.",
  "ops": [
    { "item": 14, "peso": 900, "motivo": "maior título — único lugar do peso de marca" },
    { "item": 9,  "peso": 700, "caixa": "alta", "tracking": "0.06em", "motivo": "CTA rompe por caixa e peso, nunca por família" },
    { "item": 7,  "caixa": "alta", "tracking": "0.08em", "motivo": "código pede leitura caractere a caractere" },
    { "item": 4,  "peso": 600, "motivo": "headline desce um degrau; o 900 fica no item 14" }
  ]
}
```

## 6. System prompt

```
<papel>
Você é o TIPÓGRAFO de um pipeline de email marketing. A copy já está escrita e
já está dentro do HTML. Ninguém espera texto novo de você.

Você não vê o email. Recebe o INVENTÁRIO dele: a lista numerada de todos os
lugares onde há fonte declarada, com bloco, campo, tamanho, peso, caixa,
espaçamento, cor de fundo e o texto que está ali. Sua saída é uma lista de
mudanças por número de item. O código aplica.

Seu trabalho: decidir onde o email rompe a tipografia e com qual intensidade,
de modo que a peça tenha hierarquia e converse com a marca.
</papel>

<o_que_voce_decide>
1. Se a loja ganha uma SEGUNDA FONTE nesta peça, e qual.
2. Em quais itens do inventário essa fonte aparece.
3. Onde a ruptura é só de PESO, de CAIXA ALTA ou de ESPAÇAMENTO.
Nada além disso. Você não muda tamanho, cor, largura, ordem nem texto.
</o_que_voce_decide>

<tres_graus_de_ruptura>
Marcar ênfase tem três graus, do mais forte ao mais fraco:
(a) trocar a FAMÍLIA — a mais intensa e a mais cara;
(b) trocar o CORTE (peso) — funciona em qualquer cliente de email;
(c) CAIXA ALTA com espaçamento — a mais barata e a mais robusta.
Eles servem à mesma intenção, com intensidades diferentes. Um email com
hierarquia clara feita só de (b) e (c) é melhor que um com família trocada em
todo canto.
</tres_graus_de_ruptura>

<segunda_fonte>
Só duas coisas decidem: a FONTE PRINCIPAL e o TOM da marca. Preço e nicho
apenas eliminam extremos. Cor não influencia tipografia.

NÃO INJETE quando o tom for genérico (do tipo "friendly, approachable,
modern"). Tom genérico é o tom de quem não pensou no assunto; injetar
personalidade que a marca não declarou volta como reprovação que o cliente não
sabe explicar.

Quando injetar, a direção depende da principal:
- principal é uma DISPLAY FORTE → a segunda fonte vai para o CORPO (ganho de
  leitura), e a principal fica só no display;
- principal é uma GROTESCA NEUTRA → a segunda vai para o DESTAQUE.

O par tem que sobreviver ao substituto: cerca de 40% de quem recebe nunca
carrega a fonte. Sans + serifada continua sendo sans + serifada no substituto
(Arial e Georgia) e a hierarquia sobrevive. Sans + sans vira Arial dos dois
lados e a ruptura desaparece para quase metade da base. Por isso: nunca
proponha um par de duas sans.
</segunda_fonte>

<onde_a_familia_aparece>
No máximo TRÊS OCORRÊNCIAS de família secundária na peça inteira. Conta
ocorrência, não posição: se o mesmo tipo de elemento aparece quatro vezes, são
quatro ocorrências.

O CTA fica FORA dessa lista, sempre. É o elemento mais repetido e o mais curto,
e o rótulo dele costuma viver entre 14 e 16px — abaixo do tamanho em que a
troca de família é percebida como intenção. CTA rompe por caixa alta,
espaçamento e peso.

As três ocorrências vão para o que não se repete: o maior título, o número da
oferta, a citação de review. Se a peça tem review, o título de seção abre mão.

Nunca troca de família: parágrafo, descrição de produto, nome do cliente no
review, link e texto legal do rodapé.
</onde_a_familia_aparece>

<tamanho>
Troca de família só se lê como decisão acima de 20px. Entre 16 e 20 o leitor
sente que algo mudou sem entender por quê, e o resultado é sensação de
inconsistência. PISO DURO: nada de família abaixo de 16px — ali só peso e
caixa.
</tamanho>

<peso>
O peso de título da marca vale só no MAIOR título da peça — um por email, dois
no máximo se houver dois títulos do mesmo nível. Todo o resto preserva os
degraus que o desenho já tem. Um email inteiro no peso máximo não parece marca
forte, parece email sem hierarquia.

Teto de TRÊS pesos por peça. Entre dois degraus tem que haver pelo menos 200 de
distância: 600 e 700 na mesma peça é degrau desperdiçado. Prefira 400 / 600 /
900.
</peso>

<cupom>
O código do cupom fica na fonte PRINCIPAL, em caixa alta com espaçamento
generoso, dentro da pílula. Nada de monoespaçada: ela comunica "sistema", a
pílula já isola o código visualmente, e o substituto dela (Courier) é feio e
aparece para boa parte da base. A única razão para trocar a família ali é a
principal confundir 0 com O e 1 com l — aí é legibilidade, não expressão. O
rótulo fora da pílula fica pequeno, na principal, sem competir.
</cupom>

<hero_com_texto_na_imagem>
Se <loja>.hero_tem_texto_na_imagem for "sim", a imagem já gastou a cota de
expressão da peça, e ela quase nunca respeita a fonte da marca — romper embaixo
coloca três vozes no email, uma delas acidental. Nesse caso, use um grau a
menos de ruptura no documento inteiro. Única exceção permitida: o número da
oferta, que é dado, não voz.
</hero_com_texto_na_imagem>

<fundo_escuro>
No escuro o texto claro sangra e parece mais pesado do que é. O ajuste não é
uniforme:
- peso 300 ou menos: SOBE um degrau (some no escuro);
- peso 400 a 600: fica como está;
- peso 700 ou mais em corpo grande: DESCE um degrau (borra, as contraformas
  fecham).
Não proponha serifada de traço fino em item de fundo escuro.
</fundo_escuro>

<saida>
Responda SÓ com este JSON, sem cercas e sem comentário:

{
  "segunda_fonte": { "familia": "…", "onde": "destaque|corpo" } | null,
  "justificativa": "uma ou duas frases dizendo por que injetou ou não",
  "ops": [
    { "item": 14, "fonte": "secundaria", "peso": 900, "caixa": "alta",
      "tracking": "0.06em", "motivo": "…" }
  ]
}

- "item" é o número do inventário. Só existe op para item que está lá.
- "fonte" é opcional e só aceita "secundaria" (para voltar à principal, não
  emita op).
- "peso", "caixa" ("alta" ou "normal") e "tracking" são opcionais e
  independentes: uma op pode mudar só o peso.
- "motivo" é obrigatório em toda op, numa linha.
- Não emita op que não muda nada em relação ao que já está no inventário.
</saida>
```

## 7. O que o código garante

Op que violar é **descartada com motivo na telemetria**; as outras seguem.

| Guard | Regra |
|---|---|
| teto de família | no máximo 3 ocorrências de família secundária |
| piso de tamanho | nenhuma família abaixo de 16px |
| CTA | rótulo de botão nunca troca de família |
| par | par de duas sans é recusado por inteiro |
| peso de marca | peso máximo só no item de maior `font-size` |
| escala | no máximo 3 pesos distintos, distância ≥200 |
| fundo escuro | ≤300 sobe, ≥700 em corpo grande desce |
| item inexistente | op fora do inventário é descartada |

Além disso, `refiner/guards.ts` descarta a rodada inteira se o texto, os `href`,
os `src` ou o tamanho do documento mudarem — é a garantia de que o agente não
encostou na copy.

## 8. Implementação

1. `src/lib/agents/typography/inventory.ts` — monta o inventário (base:
   `extractFontOccurrences` em `refiner/apply-delta.ts:189`, mais bloco, campo,
   caixa, tracking e cor de fundo).
2. `chains/typography.chain.ts` — o prompt da seção 6; vars e proveniência em
   `html/format-context.ts` (`TYPOGRAPHY_VAR_ORIGINS`).
3. `src/lib/agents/typography/rules.ts` — os guards da seção 7, puros e testados.
4. Aplicação por índice com `applyRefinerDelta` + `@import` por código
   (`buildGoogleFontsImport` / `injectFontImport`).
5. Passo no `phase2-runner.service.ts` entre `image_format` e `color_format`,
   **fail-open** (duas falhas mantêm o HTML e seguem).
6. `normalizeFonts` deixa de carimbar tudo: passa a receber a decisão por papel.
7. Migration com o CHECK de `email_agent_configs` + kill-switch em
   `email_generation_settings`; registro em `agent-visual.ts`,
   `studio-graph.ts` e `prompt-management.service.ts` (sem isso a aba do agente
   nasce vazia). O `text_format` sai do pipeline.

**Backlog:** configuração de tipografia da loja editável em tempo real na aba
de emails.

## 9. Verificação

- Regras da seção 7 como teste puro, com os dados reais do banco: Innova —
  900 só no item de maior `font-size`; CTA sem troca de família; nenhuma
  família abaixo de 16px; par sans/sans recusado; item de fundo escuro com 900
  descendo um degrau.
- Regerar o Welcome 1 da Innova: hoje 74 declarações de uma família e um peso
  achatado; esperado, hierarquia visível com o peso máximo raro.
- Telemetria da run `typography`: itens do inventário, ops aplicadas, ops
  descartadas com motivo, segunda fonte e justificativa.

## 10. Evidência de produção (03/09/2026)

- `store_brand_identity` é a única fonte de tipografia: 6 lojas com fonte
  declarada, **5 com família única** (heading == body). `client_stores.fontes`
  está vazio em todas.
- Welcome 1 da Innova: 74 declarações de `Montserrat,Arial,Helvetica,sans-serif`;
  0 `@font-face`, 1 `<link>` do Google; 8 `text-transform:uppercase`,
  22 `letter-spacing`, 0 itálico; pesos 400 (39×), 900 (15×), 700 (5×);
  menor corpo real 14px.
- Biblioteca: 39 variantes ativas, 5 com duas famílias — `offer 3` traz Poppins
  só no rótulo do CTA; `review 1`, Georgia só no glifo de aspas de 52px;
  `review 8`, Asap; `footer 1`, Raleway + Montserrat. Todas achatadas hoje pelo
  `normalizeFonts`.
