---
Prioridade: P2
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
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
- [ ] `HeroChainMode` deixa de ser união e o modo passa a ser único
- [ ] `HERO_OUTPUT_CONTRACT_FULL_DOC` removido
- [ ] `heroFullDocGuard` removido, com seus testes
- [ ] Var `montador_html` removida do `user_template` e do schema Zod em
      `html/contract.ts`
- [ ] Região não localizável passa a ser **falha do step**, com razão
      `hero_region_not_found`, sujeita ao retry 1× que a cadeia já tem.
      Registrar em log de `error`: com montagem por código isso é bug, não
      cenário esperado
- [ ] Reference legada sem marcadores válidos cai no `tag`-locator, que
      **permanece** — só o `full_doc` sai

### AC CM-5.2 — Relatório do agente
- [ ] Contrato de output ganha o segundo wrapper:
      ```
      <CFY_HERO_REPORT>
      {"imagem":"aplicada"|"ausente","campos_vazios":["TAG",...],
       "linhas_removidas":["cta","imagem",...],"logo":"light"|"dark"|"nenhuma"}
      </CFY_HERO_REPORT>
      ```
- [ ] Instrução no prompt: o relatório é o que o pipeline sabe sobre o que
      foi descartado; linha removida e campo não preenchido **precisam**
      aparecer
- [ ] Parser: relatório **opcional**. Ausência registra
      `hero_report_missing` no run e segue. JSON inválido no relatório →
      mesmo tratamento. Nunca derruba o email — observabilidade não
      derruba entrega
- [ ] `parseHeroFragment` continua exigindo o wrapper do fragmento e
      `<table>`, como hoje

### AC CM-5.3 — Relatório na telemetria e no QA
- [ ] Relatório gravado em `parsed_output.hero_report` do run
      `hero_section`
- [ ] `campos_vazios` do relatório entra como insumo do QA: campo que a
      hero declarou vazio e o schema marca `required` gera issue
      `campo_obrigatorio_vazio` (o tipo já existe em `runSchemaChecks`)
- [ ] `linhas_removidas` visível no drawer de detalhe do run

### AC CM-5.4 — Modo `montador` vira fallback declarado
- [ ] O texto do modo `montador` no `<hero_source_modes>` passa a dizer
      que ele é fallback de **reference legada** — gerada pelo Montador LLM
      antes da montagem por código
- [ ] O modo `library` permanece como está: substituição pura sobre a
      variante canônica
- [ ] Nenhuma outra mudança em `<copy_rules>`: a hero segue **dentro** do
      documento, então a região pode continuar engolindo blocos vizinhos e
      o array de copy segue correto

### AC CM-5.5 — Testes
- [ ] Output com fragmento + relatório válido → os dois parseados
- [ ] Output com fragmento e **sem** relatório → passa, com
      `hero_report_missing`
- [ ] Output com relatório malformado → passa, registrado
- [ ] Output sem o wrapper do fragmento → `HeroOutputInvalidError`, como
      hoje
- [ ] Nenhuma referência a `full_doc` sobra no código
- [ ] Regressão: cadeia completa num email com hero enxertada

---

## Tarefas

- [ ] Remover `full_doc` e o guard
- [ ] Contrato de output novo + parser do relatório
- [ ] Migration com o prompt ajustado
- [ ] Ligar `campos_vazios` no QA
- [ ] Exibir o relatório no drawer dos logs
- [ ] Testes

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
age sobre ele, só registra e alimenta o QA. Se um dia a hero migrar para o
protocolo de ops, o relatório vira redundante.

---

## File List

### A modificar
- `src/lib/agents/chains/hero.chain.ts`
- `src/lib/agents/html/contract.ts`
- `src/lib/agents/html/format-context.ts` — remove `montador_html`
- `src/lib/agents/phase2-runner.service.ts` — STEP 1
- `src/lib/agents/chains/qa.chain.ts` — `campos_vazios`
- `src/components/email-generation-logs/logs-workspace.tsx`
- `supabase/migrations/2026XXXX_hero_report.sql`

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
