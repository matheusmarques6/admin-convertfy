---
Prioridade: Medium
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "3 - Medium/Low"
Dependencias: "AK-1 (testar apos tiered limiter)"
Nota: "A revision `2025-01-15` precisa ser VERIFICADA no changelog Klaviyo antes de implementar. Pode nao existir como revision valida."
---

# Story AK-8 — Upgrade Revision para Ultima Estavel

## Story

**Como** operador do sistema,
**Quero** atualizar o header `revision` da Klaviyo API de `2024-10-15` para `2025-01-15`,
**Para que** tenhamos acesso a bug fixes, novas features, e nao sejamos pegos pela aposentadoria da revision antiga (prevista para Oct 2026).

## Contexto

### Problema

`client.ts:54` define:
```typescript
export const KLAVIYO_REVISION = "2024-10-15"
```

A Klaviyo tem politica de suporte de 2 anos por revision. A revision `2024-10-15` sera aposentada em **Outubro 2026** (~7 meses). A ultima revision estavel e `2025-01-15` (15 meses mais recente).

### Riscos da Revision Atual

- Nao temos acesso a bug fixes e melhorias dos ultimos 15 meses
- Se nao atualizarmos antes de Oct 2026, requests com revision expirada podem ser rejeitados ou roteados para behavior inesperado
- Novas features (ex: melhorias no reporting, novos filtros) nao estao disponiveis

### Riscos do Upgrade

- Breaking changes entre revisions (improvavel mas possivel)
- Mudancas no formato de response que quebram parsing
- Mudancas no rate limiting behavior

## Acceptance Criteria

### AK-8.1 — Verificar changelog e revision exata

- [ ] Consultar changelog oficial: https://developers.klaviyo.com/en/docs/changelog_
- [ ] Identificar a **ultima revision estavel** (pode nao ser `2025-01-15` — Klaviyo usa datas de release especificas)
- [ ] Documentar breaking changes entre `2024-10-15` e a revision alvo
- [ ] Identificar endpoints afetados no nosso codebase

### AK-8.2 — Atualizar revision

- [ ] Em `src/lib/integrations/klaviyo/client.ts:54`, alterar:
  - De: `export const KLAVIYO_REVISION = "2024-10-15"`
  - Para: `export const KLAVIYO_REVISION = "{revision validada em AK-8.1}"`
- [ ] Atualizar comentarios que referenciam a revision antiga
- [ ] Adicionar log de revision no first-call: `[Klaviyo] Using API revision: {version}`

### AK-8.3 — Testes de compatibilidade

- [ ] Testar endpoints criticos com a nova revision:
  - `GET /flows/`
  - `GET /campaigns/`
  - `GET /lists/`
  - `GET /metrics/`
  - `POST /metric-aggregates/`
  - `POST /flow-values-reports/`
  - `POST /campaign-values-reports/`
  - `GET /profiles/`
  - `GET /accounts/`
- [ ] Comparar responses com revision antiga vs nova para verificar compatibilidade
- [ ] Verificar que parsing existente nao quebra

### AK-8.4 — Atualizar documentacao

- [ ] Atualizar `CLAUDE.md` onde referencia `revision: 2024-10-15`
- [ ] Atualizar memoria do projeto

## Impacto Esperado

- Acesso a 15 meses de bug fixes e melhorias
- Margem de 2 anos antes da proxima aposentadoria (Jan 2027)
- Possivel melhoria no rate limiting behavior (Klaviyo otimiza internamente)

## Riscos

- Baixo risco de breaking changes (Klaviyo e conservadora com backwards compat)
- Mitigacao: testar todos os endpoints criticos em staging antes do deploy

## Arquivos Afetados

- `src/lib/integrations/klaviyo/client.ts` — KLAVIYO_REVISION
- `CLAUDE.md` — atualizar referencias
- Potencialmente: qualquer arquivo que faz parsing de responses Klaviyo (se houver breaking changes)

---

## Revisao Multi-Agente

### @dev — Anotacoes de Implementacao

- **Complexidade: MEDIUM** (nao pela mudanca em si — trivial — mas pela verificacao necessaria).
- A mudanca e 1 linha. O trabalho e verificar o changelog e testar endpoints.
- **Estrategia**: Criar branch separada, mudar a revision, rodar os testes existentes, e fazer chamadas manuais para cada endpoint critico.
- **Rollback facil**: Se algo quebrar, reverter a revision em 1 linha.
- Idealmente, testar com 1 loja real em producao (feature flag) antes de aplicar globalmente. Mas dado o baixo risco, deploy direto e aceitavel.

### @qa — Anotacoes de Qualidade

- **Teste critico**: Comparacao side-by-side de responses com revision antiga vs nova. Focar em:
  1. Estrutura do JSON (chaves adicionadas/removidas?)
  2. Tipos de valores (string vs number?)
  3. Paginacao (cursor format mudou?)
  4. Rate limit headers (mudaram?)
- **Automatizar**: Se possivel, gravar responses da revision antiga como fixtures e comparar com nova.
- **Smoke test em producao**: Monitorar logs por 24h apos deploy. Qualquer novo erro e sinal de breaking change.

### @data-engineer — Anotacoes de Dados

- **Impacto em dados**: Se a Klaviyo mudou precisao de numeros (ex: 2 casas → 4 casas) ou formato de datas, pode afetar persistencia. Verificar.
- **Migrations**: Nenhuma necessaria a priori, mas se formatos mudaram, pode ser necessario migration de dados.

### @architect — Anotacoes Arquiteturais

- **Padrao**: Manter `KLAVIYO_REVISION` como const centralizada e o correto. NAO ter revisions diferentes por endpoint.
- **Monitoramento**: Adicionar log de revision no startup/first-call para facilitar debugging: `[Klaviyo] Using API revision: 2025-01-15`.
- **Politica**: Sugestao de agendar upgrade de revision a cada 12 meses. Adicionar lembrete ao backlog.

### @analyst — Anotacoes de Impacto

- **Urgencia baixa mas deadline claro**: Oct 2026 e o deadline hard. Com 7 meses de margem, nao e urgente mas nao deve ser esquecido.
- **Beneficio invisivel**: Usuarios nao perceberao mudanca. O beneficio e preventivo (evitar problemas futuros).
- **Recomendacao**: Agendar para apos as stories P0/P1 estarem deployadas e estaveis.