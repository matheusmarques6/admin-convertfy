# Epic 9 - Configuracoes de Conta e Perfil

**Prioridade:** Alta
**Status:** Planning
**Objetivo:** Corrigir e implementar funcionalidade completa de configuracoes de conta (perfil, senha, avatar, notificacoes) no dashboard admin, contas de agentes e portal do cliente.

---

## Contexto

As configuracoes de conta (nome, email, senha, etc.) nao funcionam no dashboard admin, contas de agentes ou portal do cliente. Apos analise de 4 especialistas (Dev, Architect, UX, Data Engineer), foi definido um plano em 3 fases. O portal do cliente possui uma implementacao funcional em `src/app/portal/settings/page.tsx` que serve como referencia para as demais.

---

## Fases e Stories

### Fase 1 - Core Account Settings (P0)

| Story | Titulo | Status |
|-------|--------|--------|
| 9.1 | Admin/Agent Profile Edit API & UI | Pending |
| 9.2 | Admin/Agent Password Change | Pending |

### Fase 2 - Data Integrity & Polish (P1)

| Story | Titulo | Status |
|-------|--------|--------|
| 9.3 | Database Migrations - Email Sync, Notifications Table, Phone Column | Pending |
| 9.4 | Avatar Upload | Pending |
| 9.5 | Security Hardening & Portal Fixes | Pending |

### Fase 3 - Future (P2, DEFERRED)

| Story | Titulo | Status |
|-------|--------|--------|
| 9.6 | Email Change Flow | DEFERRED |
| 9.7 | Password Strength Indicator | DEFERRED |

---

## Dependencias entre Stories

```
Fase 1: 9.1 e 9.2 (paralelas, sem dependencias entre si)
  |
  v
Fase 2: 9.3 (primeiro — cria fundacao de DB)
         |
         v
         9.4 e 9.5 (paralelas, dependem de 9.3)
```

**Nota:** Stories 9.6 e 9.7 estao DEFERRED e nao serao implementadas neste momento.

- **9.6 (Email Change Flow):** Fluxo de double confirmation do Supabase, cascata de atualizacoes de email, UX para confirmacao assincrona.
- **9.7 (Password Strength Indicator):** Barra visual (vermelho/amarelo/verde), requisitos de complexidade (maiuscula, minuscula, numero, caractere especial, comprimento).

---

## Criterios de Aceite do Epic

| Criterio | Metrica |
|----------|---------|
| Admin pode editar perfil | Nome editavel, email somente leitura |
| Admin pode alterar senha | Verificacao de senha atual + nova senha com min 8 chars |
| Email sincronizado | Trigger automatico auth.users -> profiles + client_portal_users |
| Avatar funcional | Upload, preview, delete com Storage RLS |
| Seguranca reforçada | Rate limiting, Zod validation, activity logging em todos endpoints |
| Notificacoes funcionais | Tabela notification_preferences criada e acessivel |
| Portal alinhado | Endpoints do portal refatorados para usar servicos compartilhados |

---

## Changelog

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-02-28 | Epic criado com 5 stories ativas + 2 deferred | @sm (River) |
