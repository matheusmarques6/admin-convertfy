# Epic 36 — Onboarding UX Redesign

## Resumo

Redesign dos dois formularios de onboarding (`/cliente/onboarding` e `/portal/onboarding/wizard`) para unificar design system, melhorar validacao, responsividade, tipografia e organizacao de campos. Auditoria identificou ~11 pontos criticos de inconsistencia visual e funcional entre os dois forms.

## Contexto

Existem 2 formularios de onboarding servindo contextos distintos:
- **Publico** (`/cliente/onboarding`): Prospect sem conta, cria client + store
- **Portal Wizard** (`/portal/onboarding/wizard`): Usuario logado completando dados

Os dois forms parecem de projetos diferentes: cores hardcoded vs tokens shadcn, listas de plataformas/paises divergentes, stepper com design diferente, validacao inconsistente.

## Escopo

| Story | Titulo | Prioridade | Esforco | Dependencia |
|-------|--------|------------|---------|-------------|
| 36.1 | Constantes compartilhadas de onboarding | Alta | Baixo | - |
| 36.2 | Unificar design system do wizard (tokens shadcn) | Alta | Baixo | - |
| 36.3 | Validacao inline com focus no erro | Alta | Medio | 36.1 |
| 36.4 | Step Shopify condicional no wizard | Media | Baixo | 36.1 |
| 36.5 | Quebrar step "Dados da Loja" em 2 | Media | Medio | 36.1, 36.4 |
| 36.6 | Stepper unificado (componente compartilhado) | Media | Medio | 36.5 |
| 36.7 | sessionStorage no form publico | Media | Baixo | - |
| 36.8 | Mascara CPF/CNPJ com deteccao automatica | Baixa | Baixo | - |
| 36.9 | Redesign upload (grid assimetrico) | Baixa | Baixo | - |
| 36.10 | Review interativo (botao editar por secao) | Baixa | Baixo | - |

## Arquivos Principais

- `src/app/cliente/onboarding/page.tsx` (form publico, 777 linhas)
- `src/app/portal/onboarding/wizard/page.tsx` (wizard portal, 469 linhas)
- `src/lib/schemas/public-onboarding.schema.ts` (Zod schema backend)
- `src/app/api/portal/onboarding/wizard/route.ts` (API wizard)
- `src/app/api/cliente/onboarding-form/route.ts` (API publico)

## Ordem de Execucao

```
[36.1 Constantes] ──→ base para tudo
     │
     ├──→ [36.2 Design System]  (paralelo)
     ├──→ [36.3 Validacao Inline]
     ├──→ [36.4 Step Condicional] ──→ [36.5 Quebrar Step] ──→ [36.6 Stepper]
     │
     └──→ [36.7 sessionStorage]  (independente)
          [36.8 Mascara CPF]     (independente)
          [36.9 Upload redesign] (independente)
          [36.10 Review]         (independente)
```
