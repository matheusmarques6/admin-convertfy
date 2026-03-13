---
Epic: 42
Titulo: "Google Calendar Integration"
Status: Ready for Dev
PRD: "docs/prd/epic-41-google-calendar-integration.md"
Discovery: "docs/specs/google-calendar-integration-discovery.md"
Total Stories: 13
Estimativa: "5-7 sprints"
---

# Epic 42 — Google Calendar Integration

## Objetivo

Integracao bidirecional com Google Calendar: reunioes criadas no Convertfy criam eventos no Google Calendar com Meet link automatico, e mudancas no Google Calendar (RSVP) refletem no sistema.

## Faseamento

### Fase 1 — Fundacao
| Story | Titulo | Esforco | Status | Deps |
|-------|--------|---------|--------|------|
| 42.1 | DB Migration: user_google_tokens + ALTER meetings/participants | LOW | Ready for Dev | - |
| 42.2 | Google Auth Service: token management per-user | MEDIUM | Ready for Dev | 42.1 |
| 42.3 | Refatorar OAuth flow: separar Calendar (per-user) de Ads (per-store) | MEDIUM | Ready for Dev | 42.1, 42.2 |

### Fase 2 — Sync Convertfy -> Google
| Story | Titulo | Esforco | Status | Deps |
|-------|--------|---------|--------|------|
| 42.4 | Google Calendar Sync Service: create/update/delete events com Meet | HIGH | Ready for Dev | 42.2, 42.3 |
| 42.5 | Integrar Calendar sync no CRUD de meetings (POST/PUT/DELETE) | MEDIUM | Ready for Dev | 42.4 |
| 42.6 | UI: Sync status e Meet link nas reunioes | LOW | Ready for Dev | 42.5 |

### Fase 3 — Conectividade do usuario
| Story | Titulo | Esforco | Status | Deps |
|-------|--------|---------|--------|------|
| 42.7 | UI: Botao Conectar Google Calendar no perfil/settings | MEDIUM | Ready for Dev | 42.3 |
| 42.8 | Calendar selector e settings de sincronizacao | LOW | Ready for Dev | 42.7 |

### Fase 4 — Portal do cliente
| Story | Titulo | Esforco | Status | Deps |
|-------|--------|---------|--------|------|
| 42.9 | Portal: RSVP de reunioes | MEDIUM | Ready for Dev | 42.5 |
| 42.10 | Portal: Meet link e detalhes de reuniao | LOW | Ready for Dev | 42.6 |

### Fase 5 — Sync Google -> Convertfy
| Story | Titulo | Esforco | Status | Deps |
|-------|--------|---------|--------|------|
| 42.11 | Sync incremental Google -> Convertfy (RSVP status) | HIGH | Ready for Dev | 42.4 |
| 42.12 | Cron de sync periodico | MEDIUM | Ready for Dev | 42.11 |
| 42.13 | UI: Indicadores de RSVP do Google | LOW | Ready for Dev | 42.11 |

## Grafo de Dependencias

```
42.1 (DB Migration)
  |
  +-- 42.2 (Auth Service) --+
  |                          |
  +-- 42.3 (OAuth Refactor) -+-- 42.4 (Sync Service)
       |                          |
       +-- 42.7 (Connect UI)     +-- 42.5 (CRUD Integration)
       |    |                     |    |
       |    +-- 42.8 (Settings)   |    +-- 42.6 (Status UI)
       |                          |    |    |
       |                          |    |    +-- 42.10 (Portal Meet)
       |                          |    |
       |                          |    +-- 42.9 (Portal RSVP)
       |                          |
       |                          +-- 42.11 (Reverse Sync)
       |                               |
       |                               +-- 42.12 (Cron Sync)
       |                               |
       |                               +-- 42.13 (RSVP UI)
```

**Caminho critico:** 42.1 -> 42.2 -> 42.4 -> 42.5 -> 42.6

## QA Concerns Incorporados

| Concern | Severidade | Story | AC |
|---------|------------|-------|-----|
| C2 - Nonce anti-CSRF | CRITICO | 42.3 | AC2, AC4 |
| C3 - Token refresh 401 | CRITICO | 42.2 | AC4 |
| C4 - requestId Meet UUID | CRITICO | 42.4 | AC3 |
| C5 - RLS auth.uid() | CRITICO | 42.1 | AC4 |
| C6 - Missing refresh_token | MEDIO | 42.2 AC7, 42.3 AC6 |
| C7 - deleteEvent fetchWithRetry | MEDIO | 42.4 | AC8 |
| C8 - Timezone do browser | MEDIO | 42.4 AC11, 42.6 AC6 |
| C9 - Unique constraint parcial | MEDIO | 42.1 | AC6 |
| C10 - Endpoint portal RSVP | MEDIO | 42.9 | AC1 |
| R3 - sendUpdates all | RECOM | 42.4 | AC4 |
| R5 - Reusar meeting_url | RECOM | 42.4 | AC5 |
| R6 - Index sync_status | RECOM | 42.1 AC7, 42.12 AC6 |
| R8 - SEM google_event_id em participants | RECOM | 42.1 | AC3 |

## Variaveis de Ambiente

| Variavel | Status |
|----------|--------|
| `GOOGLE_CLIENT_ID` | Ja existe |
| `GOOGLE_CLIENT_SECRET` | Ja existe |
| `NEXT_PUBLIC_APP_URL` | Ja existe |

## QA Review Fixes (2026-03-13)

Fixes aplicados a partir do QA review (`docs/qa/epic-42-stories-review.md`):

| Issue | Severidade | Story | Fix |
|-------|------------|-------|-----|
| H1 | HIGH | 42.5 | `timezone` aceito no POST/PUT body e persistido em `meetings.timezone` |
| H2 | HIGH | 42.4 | `sendUpdates: "all"` clarificado: deve ser aplicado dentro de `createEventWithMeet` |
| H3 | HIGH | 42.6 | Path corrigido: `src/components/board/meeting-dialog.tsx` (nao `meetings/`) |
| H4 | HIGH | 42.1 | RLS `auth.uid() = user_id` documentada como admin-only; portal via `createAdminClient()` |
| M1 | MEDIUM | 42.3 | Lookup condicional de `org_id`: portal via `client_portal_users -> clients.org_id` |
| M2 | MEDIUM | 42.8 | Migration date mudada para `20260315` (evitar colisao com 42.1) |
| M3 | MEDIUM | 42.5 | PUT SELECT expandido com `google_event_id, user_id, scheduled_at` |
| M4 | MEDIUM | 42.9 | Portal user matching por email em `meeting_participants` (+ fallback por ID) |
| M5 | MEDIUM | 42.12 | Lock/dedup adicionado (AC 42.12.8) para evitar execucao concorrente |
| M6 | MEDIUM | 42.4 | AC 42.4.12: `request()` trata 204 No Content antes de `response.json()` |

## Nota sobre numeracao

O PRD usa "Epic 41" mas o numero 41 ja estava em uso por "Portal Campaign Calendar Metrics". Este epic foi renumerado para 42.

---

*Epic criado por River (SM Agent) — 2026-03-13*
*QA fixes aplicados — 2026-03-13*
