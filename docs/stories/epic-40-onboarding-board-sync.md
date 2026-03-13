# Epic 40 — Onboarding <-> Board Sync

## Resumo

Integrar o pipeline de onboarding com o board pessoal de cada membro da equipe. Quando uma etapa do onboarding atinge o turno de um membro (ex: designer, developer), um card aparece automaticamente no board pessoal dele. Ao completar o card no board, o pipeline de onboarding avanca para a proxima fase e notifica o proximo responsavel. Essa cadeia percorre todos os roles envolvidos ate o onboarding ser concluido.

## Valor de Negocio

- **Visibilidade**: Cada membro ve apenas as tarefas que dependem dele, no board que ele ja usa diariamente
- **Fluxo automatico**: Nao precisa de coordenacao manual entre fases — o sistema encadeia automaticamente
- **Rastreabilidade**: Progresso do onboarding calculado em tempo real a partir das etapas completadas
- **Reducao de atritos**: Sem handoffs manuais, sem esquecimentos, sem silos de informacao

## Escopo

| Story | Titulo | Prioridade | Esforco | Dependencia |
|-------|--------|------------|---------|-------------|
| 40.1 | DB Migration — Step Lifecycle + DAG Columns | P0 | MEDIUM | - |
| 40.2 | Step Dependency Resolution Service | P0 | MEDIUM | 40.1 |
| 40.3 | Auto-Task Creation on Step Ready | P0 | MEDIUM | 40.2 |
| 40.4 | Bi-directional Sync Service | P0 | HIGH | 40.3 |
| 40.5 | Notification Chain on Step Ready | P1 | LOW | 40.2 |
| 40.6 | Shared Onboarding Step Card Component | P1 | MEDIUM | 40.1 |
| 40.7 | Onboarding Kanban Refactor — Dynamic Steps | P1 | HIGH | 40.2, 40.6 |
| 40.8 | Realtime Updates for Steps + Tasks | P1 | LOW | 40.4 |
| 40.9 | Progress Tracking from Step Completion | P2 | LOW | 40.4 |
| 40.10 | Edge Cases and Guards | P2 | MEDIUM | 40.4 |

## Dependencias

```
40.1 ──► 40.2 ──► 40.3 ──► 40.4 ──► 40.8
                    │         │
                    │         ├──► 40.9
                    │         │
                    │         └──► 40.10
                    │
                    ├──► 40.5
                    │
40.1 ──► 40.6 ──┐
                 ├──► 40.7
40.2 ────────────┘
```

## Arquivos Principais

### Existentes (modificar)
- `src/lib/services/task-automation.service.ts` — expandir com `onOnboardingStepReady()`
- `src/lib/services/onboarding-phase.service.ts` — substituir logica de fases fixas por DAG
- `src/lib/services/notification.service.ts` — usar para cadeia de notificacoes
- `src/components/onboarding/onboarding-kanban.tsx` — refatorar para steps dinamicos
- `src/components/board/task-card.tsx` — renderizar cards de onboarding step
- `src/types/index.ts` — novos tipos para step lifecycle
- `src/types/onboarding.ts` — expandir interfaces

### Novos (criar)
- `src/lib/services/step-dependency.service.ts` — resolver DAG de dependencias
- `src/lib/services/onboarding-sync.service.ts` — sync bi-direcional board <-> onboarding
- `src/components/onboarding/onboarding-step-card.tsx` — card compartilhado
- `supabase/migrations/YYYYMMDD_onboarding_board_sync.sql` — migration

## Decisoes de Arquitetura

1. **DAG via `depends_on_steps UUID[]`** (template) / **`depends_on_step_ids UUID[]`** (client): Cada step pode depender de multiplos steps (array), permitindo paralelismo. Colunas antigas `depends_on` mantidas para compatibilidade
2. **Step lifecycle**: `waiting` -> `pending` -> `in_progress` -> `review` -> `completed` (+ `blocked`, `skipped`). `pending` = "ready to start" (deps met, actionable). Do NOT use `ready` as an enum value.
3. **Source type `auto_onboarding_step`**: Novo source_type na tabela `tasks` para linkar board task -> onboarding step
4. **Sync HYBRID**: DB triggers handle task completion -> step completion and step completion -> cascade waiting deps to pending. App service (`OnboardingSyncService`) handles task creation (needs board_config checks) and notifications
5. **Card compartilhado**: Mesmo componente visual renderiza em ambos os kanbans (onboarding e board pessoal)
6. **Realtime**: Supabase postgres_changes em `client_onboarding_steps` e `tasks`

## Riscos

- **Migracao de dados**: Onboardings existentes usam `depends_on UUID` (single). Precisa criar novas colunas `depends_on_steps UUID[]` / `depends_on_step_ids UUID[]` e backfill
- **Complexidade do DAG**: Ciclos de dependencia devem ser detectados e rejeitados na validacao
- **Race conditions**: Dois membros completando steps paralelos que desbloqueiam o mesmo step seguinte
- **Performance**: Resolucao de DAG em onboardings com muitos steps — manter eficiente com queries batch
