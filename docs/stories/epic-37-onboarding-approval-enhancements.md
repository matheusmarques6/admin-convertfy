# Epic 37 — Melhorias no Fluxo de Aprovacao de Onboarding

## Resumo

Adicionar confirmacao obrigatoria na rejeicao, email humanizado ao cliente rejeitado, e capacidade do COO editar campos do formulario antes de aprovar/rejeitar.

## Contexto

O fluxo atual de aprovacao de onboarding permite que o COO aprove, rejeite ou solicite revisao. Ao rejeitar/solicitar revisao, os dados sao deletados via RPC atomica e o cliente pode re-submeter pelo formulario publico. Porem:

1. **Sem confirmacao robusta**: O backend aceita rejeicao sem comentarios (frontend valida, mas API nao)
2. **Email generico**: O email de rejeicao e um texto cru sem contexto acolhedor
3. **Sem edicao**: Se o COO ve um erro de digitacao, precisa rejeitar e esperar o cliente preencher de novo

### Estado atual relevante
- Componente de aprovacao: `src/components/onboarding/onboarding-approvals.tsx`
- API de aprovacao: `src/app/api/onboarding/[id]/approve/route.ts`
- Servico N8N: `src/lib/services/n8n-trigger.service.ts`
- API de dados: `src/app/api/onboarding/store-data/route.ts`
- RPC de delecao: `delete_rejected_onboarding` (migration `20260312`)

## Escopo

| Story | Titulo | Prioridade | Esforco | Dependencia |
|-------|--------|-----------|---------|-------------|
| 37.1 | Confirmacao obrigatoria na rejeicao | HIGH | LOW | — |
| 37.2 | Email humanizado de rejeicao | MEDIUM | LOW | 37.1 |
| 37.3 | COO edita campos do formulario | MEDIUM | HIGH | 37.1 |

## Arquivos Principais

- `src/components/onboarding/onboarding-approvals.tsx`
- `src/app/api/onboarding/[id]/approve/route.ts`
- `src/lib/services/n8n-trigger.service.ts`
- `src/app/api/onboarding/[id]/edit/route.ts` (NOVO — Story 37.3)
- `supabase/migrations/20260313_onboarding_approval_enhancements.sql` (NOVO)

## Ordem de Execucao

```
37.1 (backend guard + UX warning)
  -> 37.2 (payload enriquecido + sanitizacao)
    -> Migration (edit_log + unique indexes + NOT NULL comments)
      -> 37.3 (PATCH endpoint + UI editavel)
```

## Concerns Pre-Existentes (detectados durante analise)

Estes problemas ja existem no codigo e devem ser corrigidos durante ou antes do epic:

| # | Concern | Severidade | Onde |
|---|---------|-----------|------|
| CC-1 | `visual_reference_url` nao e salvo pelo `store-data` POST (falta no `onboardingFields` map) | LOW | `store-data/route.ts` — bug pre-existente, fora do escopo deste epic |
| CC-2 | RLS policies de `store_onboarding_data` e `client_stores` nao tem policy UPDATE para role COO — edicao via Story 37.3 usara `adminClient` (service_role) | MEDIUM | Design decision: OK para MVP. Futura hardening story pode adicionar UPDATE policy granular. |
| CC-5 | `GET /api/onboarding/pending-approval` NAO filtra por `org_id` — vaza dados cross-tenant | HIGH | `pending-approval/route.ts` |
| P3-2 | `POST /api/onboarding/store-data` sem org-scoping — qualquer membro autenticado edita qualquer store | HIGH | `store-data/route.ts` |

## Status

| Story | Status |
|-------|--------|
| 37.1 | Done |
| 37.2 | Done |
| 37.3 | Done |
