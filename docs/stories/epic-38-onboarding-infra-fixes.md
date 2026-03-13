# Epic 38 -- Onboarding Infrastructure Fixes

## Origem

Auditoria QA (2026-03-13) da infraestrutura de onboarding revelou conflitos entre sistema legado e novo, campos inexistentes no banco, e progress tracking inconsistente.

## Stories

| # | Story | Prioridade | Esforco | Status |
|---|-------|-----------|---------|--------|
| 38.1 | Fix trigger `update_onboarding_progress` conflitando com phase service | Alta | Medium | Done |
| 38.2 | Remover referencia a `visual_reference_url` inexistente | Media | Low | Done |
| 38.3 | Remover trigger legado `handle_onboarding_completion` | Baixa | Low | Done |

## Contexto Tecnico

O sistema de onboarding tem duas camadas que coexistem:

1. **Sistema legado** (`20250107_onboarding_system.sql`): usa `onboarding_stage` na tabela `clients` e trigger `handle_onboarding_completion`
2. **Sistema novo** (`20250125_08_onboarding.sql` + `20260225_onboarding_flow_redesign.sql`): usa `client_onboardings.current_phase` gerenciado pelo `onboarding-phase.service.ts`

O conflito principal (W2/W5) e que a trigger `update_onboarding_progress` sobrescreve `client_onboardings.status` com valores genericos (`in_progress`, `completed`) enquanto o phase service usa esse campo para tracking de fases (`design`, `implementation`, etc).
