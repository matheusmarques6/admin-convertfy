---
Prioridade: P1
Sprint: Atual
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
Epic: CM - Curador, Montador e Hero
Fase: Cadeia de formatacao
Estimate: M
---

# Story CM-8 — o espelho de acabamento da hero precisa ser VISTO

## User Story

**Como** responsável pela qualidade dos emails gerados,
**quero** que o agente da hero enxergue de fato o exemplo renderizado da
variante quando ele é uma imagem,
**para que** o "espelho de acabamento" deixe de ser uma URL que ninguém
abre e volte a ser o que o campo prometia.

---

## Contexto

Decisão de 30/jul: o `rendered_html` da variante vai SEMPRE ao agente da
hero, mesmo sendo mockup ou estando desatualizado — porque "um print ainda
mostra o acabamento pretendido".

A intenção está certa. A execução não funciona, e a verificação de 30/jul
mostrou por quê:

```js
// openrouter-invoke.ts
messages: [
  { role: "system", content: input.systemPrompt },
  { role: "user",   content: input.userMessage },   // string pura
]
```

`content` é **string**. Não há array multimodal, o modelo não tem tool de
browsing e o Kimi K3 não recebe modalidade de imagem nessa chamada. Para os
26 exemplos de ~1.7KB — casca de HTML em volta de um `<img src="https://…">`
— o que chega ao modelo é **a string da URL**. Zero informação visual.

Pior que inútil: gasta tokens e dá ao modelo um molde do formato errado (foi
o que produziu o `fragmento contém documento`).

Para os exemplos grandes (`footer 1` com 19KB, `body 3` com 15,9KB) a
história é outra — ali é HTML estrutural e o modelo aprende acabamento lendo
o CSS. Esses continuam valendo como texto.

**O que o Matheus pediu (30/jul):** quando o exemplo exigir visão, o step
deve ter um **fallback declarado** para um modelo que consiga ver a imagem
de verdade.

### O precedente que já existe

`chains/qa-vision.chain.ts` já faz exatamente isso, com Claude Sonnet 4.6:

```js
{ type: "image_url", image_url: { url: input.imageUrl } }
```

O provider busca a URL e o modelo vê a imagem. Não é o modelo "navegando" —
é o provider resolvendo o anexo. O padrão é conhecido e está em produção.

---

## Acceptance Criteria

### AC CM-8.1 — Extrair a imagem do exemplo
- [ ] `shared/rendered-image.ts`: função pura que devolve as URLs de
      imagem de um `rendered_html` (atributo `src` de `<img>`), ignorando
      `data:` (base64 estoura o payload) e tracking pixels (1x1, dimensões
      declaradas ≤ 2px)
- [ ] Devolve no máximo N URLs (constante nomeada) — um mockup tem uma
      imagem; mais que isso é HTML estrutural, que segue como texto
- [ ] Testes com os quatro casos: mockup de uma imagem, estrutural com
      muitas imagens, `data:` URI, vazio

### AC CM-8.2 — Payload multimodal
- [ ] `invokeOpenRouter` aceita `images?: string[]`; com a lista não-vazia,
      `content` do usuário vira array (`image_url` de cada uma + o `text`),
      no MESMO formato do `qa-vision.chain`
- [ ] Sem `images`, o corpo da request é **byte a byte** o de hoje — teste
      que trava isso
- [ ] `invokeFormatModel` repassa `images` (caminho Anthropic direto:
      converte para blocos de imagem do SDK ou recusa explicitamente)

### AC CM-8.3 — Fallback declarado
- [ ] Constante `HERO_VISION_MODEL` in-code, com o modelo e o motivo da
      escolha escritos
- [ ] Override sem deploy: `email_generation_settings.hero_vision_model`
      (NULL = usa a constante; string vazia = desliga o fallback)
- [ ] O fallback dispara SÓ quando: o exemplo classificou como `mockup`
      **e** há URL de imagem extraível. Exemplo estrutural continua no
      modelo configurado, como texto
- [ ] Desligado (ou sem URL) → comportamento de hoje, e a razão vai para a
      telemetria. Nunca falha o step por causa disso

### AC CM-8.4 — O prompt sabe que a imagem existe
- [ ] Com a imagem anexada, o `<finish_reference>` diz que o exemplo está
      ANEXADO como imagem e que `<hero_variant_rendered>` vem vazio de
      propósito (não mandar o HTML do mockup junto — a URL crua não ensina
      nada e o texto ainda induz a forma errada)
- [ ] Sem imagem, o texto do prompt é o de hoje

### AC CM-8.5 — Telemetria
- [ ] `parsed_output.vision` no run da hero: `{used, model, reason, images}`
      — `reason` explica por que usou ou não (`exemplo_estrutural`,
      `sem_imagem`, `desligado`, `mockup_com_imagem`)
- [ ] Entrada no `telemetry-contract.ts`, com o motivo escrito
- [ ] O modelo que REALMENTE rodou vai na coluna `model` do run — hoje ela
      recebe `config.model`, e com o fallback isso mentiria

### AC CM-8.6 — Custo
- [ ] O custo real do OpenRouter (`usage.cost`) continua sendo registrado —
      o fallback troca o modelo, não o accounting
- [ ] Log `warn` quando o fallback dispara, com o modelo, para o custo por
      email não subir sem ninguém perceber

---

## Tarefas

- [ ] `shared/rendered-image.ts` + testes
- [ ] `images` no `invokeOpenRouter` e no `invokeFormatModel` + teste de
      não-regressão do corpo da request
- [ ] Decisão do fallback no `hero.chain` + constante + setting
- [ ] Prompt condicional
- [ ] Telemetria + contrato
- [ ] Migration do setting

---

## Dev Notes

### Por que só a hero

É onde o acabamento é decidido e onde o espelho existe como campo. Validado
aqui, o mesmo desenho se estende aos demais steps — mesma sequência do
enxerto por ID, que começou pela hero e depois vira regra.

### Por que não mandar sempre no modelo com visão

Custo. O modelo de visão é mais caro por token e a maior parte do trabalho da
hero é textual (casar copy com placeholder). A imagem só agrega quando o
exemplo É uma imagem — quando é HTML estrutural, o CSS ensina mais do que um
screenshot.

### O que NÃO resolve

Exemplo desatualizado continua desatualizado: ver o print de uma versão
antiga da variante pode ATRAPALHAR. Por isso `stale` segue na telemetria e o
prompt continua dizendo que, na divergência, a região vence.

---

## File List

### A criar
- `src/lib/agents/shared/rendered-image.ts`
- `src/lib/agents/shared/rendered-image.test.ts`
- `supabase/migrations/2026XXXX_hero_vision_model.sql`

### A modificar
- `src/lib/agents/openrouter-invoke.ts`
- `src/lib/agents/chains/format-invoke.ts`
- `src/lib/agents/chains/hero.chain.ts`
- `src/lib/agents/html/format-context.ts`
- `src/lib/agents/phase2-runner.service.ts`
- `src/lib/agents/architect/telemetry-contract.ts`
- `src/types/email-generation.ts`

---

## Dependencias

- **Bloqueado por**: nada
- **Bloqueia**: extensão do espelho visual aos demais agentes de formatação

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| O modelo de visão é pior no trabalho textual da hero (casar copy com placeholder) | Média | Comparar antes/depois nas primeiras gerações; o setting desliga sem deploy |
| Custo por email sobe sem ninguém notar | Média | `warn` no disparo + custo real do OpenRouter no run + `vision` na telemetria |
| A URL do exemplo é signed e expira, e o provider recebe 403 | Baixa | Falha graceful: sem imagem, cai no caminho de hoje e registra a razão |
| Mockup de versão antiga leva o agente a "restaurar" algo que a variante não tem mais | Média | `stale` na telemetria; o prompt mantém "a região vence" |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada após verificar que o exemplo renderizado chega ao modelo como string de URL — sem multimodal e sem browsing, o espelho não existe para os 26 mockups da biblioteca |
