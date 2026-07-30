---
Prioridade: P2
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: In Review
Epic: CM - Curador, Montador e Hero
Fase: Fase 2 / Hero
Estimate: S
---

# Story CM-5 — Hero: relatório do que foi descartado e fim do `full_doc`

## User Story

**Como** responsável pelo acabamento dos emails,
**quero** que o agente de hero declare o que descartou e deixe de ter a
opção de reescrever o documento inteiro,
**para que** uma linha de CTA apagada por falta de copy apareça no log em
vez de virar surpresa no email.

---

## Contexto

O agente de hero tem dois modos: `fragment` (devolve só a região) e
`full_doc` (devolve o documento inteiro com a hero trocada). O `full_doc`
existe como fallback para quando a região da hero **não é localizável** —
situação causada por marcador inválido, que só acontecia porque o Montador
LLM emitia os marcadores. Com a montagem por código (CM-2), os marcadores
são sempre válidos e a região é sempre localizável.

Manter o `full_doc` significa manter: um contrato de output alternativo,
um guard estrutural de documento (`heroFullDocGuard`, com tolerância de ±3
tabelas e limite de encolhimento), a var `montador_html` com o documento
de ~40KB no prompt, e um caminho onde o agente pode legitimamente
reescrever o email todo. É a maior superfície de risco da cadeia para um
fallback que deixa de ter causa.

A segunda metade: hoje, quando o agente remove uma linha de CTA porque a
copy não tem label nem URL — comportamento **correto** e previsto no
`<empty_slot_rule>` — ninguém sabe. O relatório torna isso visível.

---

## Acceptance Criteria

### AC CM-5.1 — `full_doc` removido
- [x] `HeroChainMode` deixa de ser união e o modo passa a ser único
- [x] `HERO_OUTPUT_CONTRACT_FULL_DOC` removido
- [x] `heroFullDocGuard` removido, com seus testes
- [x] Var `montador_html` removida do `user_template` e do schema Zod em
      `html/contract.ts`
- [x] Região não localizável passa a ser **falha do step**, com razão
      `hero_region_not_found`, sujeita ao retry 1× que a cadeia já tem.
      Registrar em log de `error`: com montagem por código isso é bug, não
      cenário esperado
- [x] Reference legada sem marcadores válidos cai no `tag`-locator, que
      **permanece** — só o `full_doc` sai
- [x] **Extra:** corrigido o furo do `tag`-locator descoberto no CM-2. A
      validação de "não invade o próximo bloco" só enxergava vizinhos COM
      tag canônica; um footer sem tags deixava o candidato mais externo (a
      tabela container) passar, e o splice apagava o resto do email. Guard
      de proporção (`MAX_REGION_RATIO = 0.7`) com teste

### AC CM-5.2 — Relatório do agente
- [x] Contrato de output ganha o segundo wrapper:
      ```
      <CFY_HERO_REPORT>
      {"imagem":"aplicada"|"ausente","campos_vazios":["TAG",...],
       "linhas_removidas":["cta","imagem",...],"logo":"light"|"dark"|"nenhuma"}
      </CFY_HERO_REPORT>
      ```
- [x] Instrução no prompt: o relatório é o que o pipeline sabe sobre o que
      foi descartado; linha removida e campo não preenchido **precisam**
      aparecer
- [x] Parser: relatório **opcional**. Ausência registra
      `hero_report_missing` no run e segue. JSON inválido no relatório →
      mesmo tratamento. Nunca derruba o email — observabilidade não
      derruba entrega
- [x] `parseHeroFragment` continua exigindo o wrapper do fragmento e
      `<table>`, como hoje

### AC CM-5.3 — Relatório na telemetria
- [x] Relatório gravado em `parsed_output.hero_report` do run
      `hero_section`, com `hero_report_missing` quando ausente
- [ ] ~~`campos_vazios` alimenta o QA~~ — **não implementado, por
      redundância.** O `runSchemaChecks` já valida `required` contra o
      `content` REAL dos blocos, que é a fonte de verdade; o relatório é a
      declaração do agente sobre o mesmo fato. Emitir issue a partir dele
      duplicaria o check e criaria divergência quando os dois discordassem.
      O valor do relatório está no que o QA **não** vê: `linhas_removidas`.
      Um check para isso exigiria saber quais linhas deveriam existir —
      informação que o QA não tem. Se a telemetria mostrar valor, vira story
      própria
- [x] Relatório inteiro visível no drawer de detalhe do run (`parsed_output`)

### AC CM-5.4 — Modo `montador` vira fallback declarado
- [x] O texto do modo `montador` no `<hero_source_modes>` passa a dizer
      que ele é fallback de **reference legada** — gerada pelo Montador LLM
      antes da montagem por código
- [x] O modo `library` permanece como está: substituição pura sobre a
      variante canônica
- [x] Nenhuma outra mudança em `<copy_rules>`: a hero segue **dentro** do
      documento, então a região pode continuar engolindo blocos vizinhos e
      o array de copy segue correto

### AC CM-5.5 — Testes
- [x] Output com fragmento + relatório válido → os dois parseados
- [x] Output com fragmento e **sem** relatório → passa, com
      `hero_report_missing`
- [x] Output com relatório malformado → passa, registrado
- [x] Output sem o wrapper do fragmento → `HeroOutputInvalidError`, como
      hoje
- [x] Nenhuma referência a `full_doc` sobra no código
- [x] Regressão: cadeia completa num email com hero enxertada

---

## Tarefas

- [x] Remover `full_doc` e o guard
- [x] Contrato de output novo + parser do relatório
- [x] Migration com o prompt ajustado
- [ ] ~~Ligar `campos_vazios` no QA~~ — descartado por redundância (ver AC CM-5.3)
- [x] Relatório no `parsed_output` (o drawer já mostra o JSON; selo dedicado é CM-7)
- [x] Testes

---

## Dev Notes

### Por que a região deixa de ter fallback

Com marcadores gerados por código e validados por self-check (CM-2), região
não localizável só acontece se: o documento é legado (cai no `tag`-locator)
ou há bug na concatenação (que o self-check já grita). Nos dois casos, um
modo que autoriza o LLM a reescrever o email inteiro é a pior resposta
possível.

### O relatório não é `remove_row`

O agente de hero devolve HTML, não ops — diferente de `image_format` e
`color_format`. O relatório é **declaração**, não instrução: o código não
age sobre ele, só registra. Se um dia a hero migrar para o protocolo de
ops, o relatório vira redundante.

---

## File List

### A modificar
- `src/lib/agents/chains/hero.chain.ts`
- `src/lib/agents/html/contract.ts`
- `src/lib/agents/html/format-context.ts` — remove `montador_html`
- `src/lib/agents/phase2-runner.service.ts` — STEP 1
- `src/lib/agents/html/hero-locator.ts` — guard de proporção
- `supabase/migrations/20261054_hero_report.sql`

---

## Dependencias

- **Bloqueado por**: CM-2 (o `full_doc` só sai com segurança quando os
  marcadores são sempre válidos). CM-1 idealmente antes, para o prompt
  chegar íntegro ao modelo
- **Bloqueia**: CM-6

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Reference legada sem marcador válido passa a falhar em vez de cair no `full_doc` | Média | O `tag`-locator permanece como fallback intermediário; só o `full_doc` sai. Medir `hero_region_not_found` na primeira semana |
| O modelo mente no relatório (diz que aplicou imagem quando não aplicou) | Média | Relatório é declaração, não verdade: o QA continua verificando o HTML. Divergência entre relatório e HTML é sinal de prompt ruim, mensurável |
| Kimi K3 ignora o segundo wrapper | Média | Relatório opcional por design; `hero_report_missing` mede a taxa. Se for alta, o formato muda (ex.: comentário HTML no fim do fragmento) |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada. Escopo reduzido após o hero-graft: extração da hero descartada, `copy_rules` intocado |
| 2026-07-30 | @dev (Dex) | `full_doc` removido inteiro (modo, contrato, `heroFullDocGuard`, `montador_html` e o campo no Zod); região ausente virou `hero_region_not_found`. `parseHeroReport` tolerante + wrapper `CFY_HERO_REPORT` no contrato. Modo `montador` declarado como fallback legado. Migration `20261054`. Corrigido junto o furo do tag-locator herdado do CM-2. 12 testes novos; agents 907/907, lint no baseline. Status → In Review |
