---
Prioridade: P2
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
Epic: CM - Curador, Montador e Hero
Fase: Admin UI / Logs
Estimate: S
---

# Story CM-7 — Selos de curadoria na linha do run

## User Story

**Como** dono do pipeline,
**quero** ver na linha do run que uma seção foi pulada, que um renderizado
está velho ou que o Montador discordou do Curador,
**para que** eu perceba pressão de curadoria sem abrir o detalhe de cada
geração.

---

## Contexto

A página de logs de geração hoje mostra `parsed_output` como **JSON cru**
no drawer de detalhe (`logs-workspace.tsx`). Dados importantes já existem
lá e ninguém vê: `candidates_excluded_untagged` (variantes ativas que
ficaram fora do pool por não ter placeholder) está gravado desde o épico
Taguedor e nunca foi exibido.

As stories CM-3 a CM-6 acrescentam mais quatro sinais do mesmo tipo:
informações que não são erro — o email foi entregue — mas que indicam que
a biblioteca precisa de atenção.

O padrão visual já existe: `StatusBadge` em `logs-workspace.tsx:612`, e os
tokens do DS v3 em `email-generation/ui/eg-theme.ts` (`warnBg`/`warnBorder`
para atenção, `negBg` para problema, `infoBg` para informação).

---

## Acceptance Criteria

### AC CM-7.1 — Componente de selo
- [ ] `CurationBadge` renderizado ao lado do `StatusBadge` na linha do run
- [ ] Tokens do `eg-theme`: âmbar para atenção, vermelho para problema,
      azul para informação. Nada de cor nova
- [ ] Vários selos na mesma linha: layout não quebra, com `flex-wrap`
- [ ] Tooltip com o detalhe (lista de seções, nomes de variantes)
- [ ] Sem selo nenhum quando o run está limpo — a ausência é o estado
      normal e não deve ocupar espaço

### AC CM-7.2 — Os quatro selos
- [ ] **Seções puladas** (âmbar) — posições sem candidata ou sem id
      válido, que saíram do email. Origem: `stats.skipped` (CM-2) e
      `parsed_output` do Curador (CM-3). Tooltip lista `section` + `label`
- [ ] **Fora do pool** (âmbar) — variantes ativas sem `{{PLACEHOLDER}}` no
      HTML efetivo. Origem: `candidates_excluded_untagged`, que já existe.
      Tooltip lista os nomes
- [ ] **Renderizado desatualizado** (azul) — hash de origem divergente ou
      desconhecido. Origem: `parsed_output.rendered_reference` (CM-6)
- [ ] **Desvios do ranking** (azul) — quantas posições o Montador tirou do
      rank 1. Origem: `parsed_output.desvios` (CM-4). Tooltip com posição
      e motivo
- [ ] Cada selo aparece só quando o dado existe e é diferente de zero —
      run antigo sem o campo não mostra nada

### AC CM-7.3 — Filtro
- [ ] Filtro na listagem: "só runs com pressão de curadoria" — qualquer
      selo âmbar presente
- [ ] Combina com os filtros existentes de status, loja e período

### AC CM-7.4 — Retrocompatibilidade
- [ ] Runs gravados antes destas stories não quebram a linha nem o drawer
- [ ] Leitura defensiva de `parsed_output`: campo ausente, `null` ou de
      tipo inesperado → selo não renderiza, sem erro no console
- [ ] Teste com `parsed_output` vazio, `null` e malformado

### AC CM-7.5 — Testes
- [ ] Um teste por selo: presente com dado, ausente sem dado
- [ ] Vários selos na mesma linha
- [ ] Filtro de pressão de curadoria
- [ ] `parsed_output` malformado

---

## Tarefas

- [ ] `CurationBadge` com os tokens do DS
- [ ] Extração defensiva dos quatro sinais
- [ ] Filtro na listagem
- [ ] Testes

---

## Dev Notes

### Por que selo e não notificação

Nada aqui é falha: o email foi entregue. São sinais de **curadoria** —
biblioteca incompleta para uma seção, exemplo de acabamento velho,
ranking sendo corrigido. Notificação para isso vira ruído que se aprende a
ignorar. O selo aparece quando a pessoa já está olhando os logs.

Se um sinal específico virar recorrente e crítico — por exemplo, seções
puladas em toda geração de uma loja — aí sim ele merece alerta ativo, pelo
mesmo canal do `notifyCostAlert`. Fora do escopo desta story.

### Por que `candidates_excluded_untagged` entra aqui

O dado existe desde o épico Taguedor e nunca foi exibido: uma variante
ativa que o pipeline não consegue preencher é trabalho de curadoria
invisível. Custa uma linha exibir junto com os selos novos.

---

## File List

### A modificar
- `src/components/email-generation-logs/logs-workspace.tsx`
- `src/lib/agents/agent-visual.ts` — se couber descrição dos selos

### A criar
- `src/components/email-generation-logs/curation-badge.tsx`
- `src/components/email-generation-logs/curation-badge.test.tsx`

---

## Dependencias

- **Bloqueado por**: CM-3 e CM-4 (fontes dos dados). O selo "fora do pool"
  já poderia ser feito hoje, com dado existente
- **Bloqueia**: nada. Última story do épico

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Selos demais poluem a linha e ninguém lê nenhum | Média | Quatro no máximo, e só quando o dado existe. Se a maioria dos runs mostrar 3+ selos, o problema é a biblioteca, não a UI |
| `parsed_output` muda de forma e o selo silencia | Média | Leitura defensiva com teste explícito de malformado; selo ausente é degradação aceitável |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada |
