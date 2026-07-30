---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: In Review
Epic: CM - Curador, Montador e Hero
Fase: Fase 2 / Hero
Estimate: XS
---

# Story CM-1 — O system prompt do hero está sendo mutilado a cada run

## User Story

**Como** responsável pelo pipeline de geração,
**quero** que o prompt do agente de hero chegue ao modelo com as tags
canônicas que ele próprio usa como exemplo,
**para que** o agente saiba quais placeholders precisa preencher.

---

## Contexto

`chains/hero.chain.ts` passa o **system prompt** por `renderImageTemplate`
antes de invocar o modelo:

```ts
const systemPrompt = renderImageTemplate(
  config.system_prompt.trim() || DEFAULT_HERO_SYSTEM_PROMPT,
  { output_contract: outputContract },
)
```

Esse renderer substitui **qualquer** `{{ALGO}}` e, quando a var não existe
no mapa, resolve para **string vazia** (`image/template-renderer.ts`,
`resolveSimpleVars` → `normalize(undefined) === ""`). Como o mapa só tem
`output_contract`, todo o resto é apagado.

O system do hero é exatamente o texto que cita as tags canônicas como
exemplo. Efeito real, verificado rodando o renderer sobre o texto em uso:

```
ANTES : it IS the authored variant, byte for byte, with its {{PLACEHOLDERS}} intact
DEPOIS: it IS the authored variant, byte for byte, with its  intact

ANTES : The hero image slot is an <img> carrying the `{{HERO_IMAGE}}` placeholder
        (and `{{HERO_IMAGE_ALT}}` for a short description)
DEPOIS: The hero image slot is an <img> carrying the `` placeholder
        (and `` for a short description)

ANTES : Fill EVERY placeholder in the region ({{COUPON_CODE}}, {{HERO_HEADLINE}},
        {{HERO_CTA_LABEL}}...) with the matching field
DEPOIS: Fill EVERY placeholder in the region (, , ...) with the matching field

ANTES : ESP merge tags ([unsubscribe_link], [first_name], {{ unsubscribe }}, {% ... %})
DEPOIS: ESP merge tags ([unsubscribe_link], [first_name], , {% ... %})
```

Apagados hoje: `{{PLACEHOLDERS}}`, `{{HERO_IMAGE}}`, `{{HERO_IMAGE_ALT}}`,
`{{COUPON_CODE}}`, `{{HERO_HEADLINE}}`, `{{HERO_CTA_LABEL}}`,
`{{ unsubscribe }}`.

Por que está em produção: a migration `20261039` semeia
`system_prompt = ''`, e `20261049` (hero-graft) zerou de novo — então o
texto em uso é o `DEFAULT_HERO_SYSTEM_PROMPT` hardcoded, que é justamente
o caminho que passa pelo renderer. Um prompt editado na aba Agentes
sofreria o mesmo.

Gravidade subiu com o hero-graft: o modo `library` instrui o agente a
fazer **substituição pura** dos `{{PLACEHOLDERS}}` — e é essa palavra que
desaparece do prompt.

**Só o hero faz isso.** `text-format`, `image-format`, `color-format` e
`component-tagger` renderizam apenas o `user_template`. Confirmado por
varredura.

### Por que não corrigir o renderer

O comportamento "var indefinida → string vazia" é documentado e outros
agentes dependem dele: um prompt de imagem com var ausente deve ficar
limpo, não mostrar `{{VAR}}` cru ao modelo. A correção é no ponto de uso.

---

## Acceptance Criteria

### AC CM-1.1 — O system do hero não passa mais pelo renderer
- [x] `invokeHeroChain` monta o system com substituição literal apenas do
      contrato de output:
      ```ts
      // NÃO usar renderImageTemplate aqui: ele apagaria as {{TAGS}}
      // canônicas que o próprio prompt usa como exemplo (ver CM-1).
      const systemPrompt = (config.system_prompt.trim() || DEFAULT_HERO_SYSTEM_PROMPT)
        .replaceAll("{{output_contract}}", outputContract)
      ```
- [x] Comentário no código explicando o porquê, para ninguém "consertar"
      de volta
- [x] `user_template` continua passando por `renderImageTemplate` — ele
      precisa das vars

### AC CM-1.2 — Teste de regressão
- [x] Teste que invoca o builder do prompt com o system default e afirma
      que `{{HERO_IMAGE}}`, `{{HERO_IMAGE_ALT}}`, `{{COUPON_CODE}}`,
      `{{HERO_HEADLINE}}`, `{{HERO_CTA_LABEL}}`, `{{PLACEHOLDERS}}` e
      `{{ unsubscribe }}` **sobrevivem** no texto final
- [x] Teste que afirma que `{{output_contract}}` **foi** substituído pelo
      contrato correspondente ao modo
- [x] Teste com `system_prompt` customizado (não vazio) contendo tag
      canônica — também sobrevive

### AC CM-1.3 — Varredura dos demais chains
- [x] Confirmar por teste ou lint que nenhum outro chain passa
      `system_prompt` por `renderImageTemplate`
- [x] Se algum passar, aplicar o mesmo tratamento

### AC CM-1.4 — Nada mais muda
- [x] Nenhuma mudança em prompt, modelo, temperatura, `max_tokens` ou
      fluxo. Só a montagem do system
- [x] Suíte de agents verde

---

## Tarefas

- [x] Trocar a montagem do system em `invokeHeroChain`
- [x] Comentário de guarda
- [x] Testes de sobrevivência das tags
- [x] Varredura dos outros chains
- [x] Rodar `npm run lint` e a suíte de agents

---

## File List

### A modificar
- `src/lib/agents/chains/hero.chain.ts` — montagem do system
- `src/lib/agents/chains/format-chains.test.ts` — testes novos

---

## Dependencias

- **Bloqueado por**: nada
- **Bloqueia**: nada. Sai isolada, antes de qualquer outra story do épico

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Algum prompt em produção depende do apagamento (usa `{{X}}` esperando vazio) | Muito baixa | O único agente afetado é o hero, cujo prompt está em `''` no banco (usa o default in-code) |
| A qualidade da hero muda de comportamento ao receber o prompt íntegro | Média — é o objetivo | Comparar 2-3 emails antes/depois em staging; o prompt passa a ser o que sempre foi a intenção |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada a partir da auditoria dos prompts do épico CM |
| 2026-07-30 | @dev (Dex) | `buildHeroSystemPrompt` exportado e testável substitui o renderer no system. 8 testes novos: sobrevivência das 7 tags canônicas, substituição do contrato, system customizado, e um guarda que varre os 7 chains procurando `renderImageTemplate(...system_prompt`. Suíte de agents 837/837 verde, typecheck limpo. Os 9 problemas de lint são pré-existentes (confirmado com stash). Status → In Review; pendente validação visual de 2-3 emails em staging |
