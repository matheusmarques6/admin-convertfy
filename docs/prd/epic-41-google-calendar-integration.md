# PRD: Epic 41 — Integracao Google Calendar

**Autor:** Morgan (PM Agent)
**Data:** 2026-03-13
**Status:** Draft — Pronto para criacao de stories
**Epic:** 41
**Discovery:** `docs/specs/google-calendar-integration-discovery.md`
**QA Review:** Concerns C1-C10 + Recomendacoes R3/R5/R6/R8 incorporados

---

## 1. Visao Geral

### 1.1 Problema

O sistema de reunioes do admin-convertfy funciona de forma isolada. Reunioes criadas no dashboard nao aparecem no Google Calendar dos participantes, nao geram links de Google Meet automaticamente, e nao ha visibilidade de confirmacao (RSVP) dos participantes. Isso causa:

- Participantes esquecem reunioes (sem lembretes automaticos)
- Links de videoconferencia precisam ser criados manualmente
- Status de confirmacao nao reflete a realidade
- Dupla entrada de dados (sistema + Google Calendar manual)

### 1.2 Solucao

Integracao bidirecional com Google Calendar, onde cada usuario conecta sua propria conta Google. Criar reuniao no Convertfy cria automaticamente evento no Google Calendar com Meet link, e mudancas no Google Calendar refletem no sistema.

### 1.3 Decisoes-Chave

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Token storage | Per-user em `user_google_tokens` | Calendar e pessoal, nao per-store |
| Google Meet | Checkbox default ON | Maioria das reunioes e online |
| Meet link storage | `meeting_url` + `meeting_url_source` enum | R5: Reusar coluna existente, sem criar `google_meet_link` |
| Lembretes | Delegados ao Google Calendar | 1h e 30min antes (default Google) |
| Portal user Calendar | Fase 4 | MVP foca em admin users |
| Multiplas contas Google | 1 por user | Simplicidade; desconecta e reconecta para trocar |
| Calendario alvo | `primary` de cada user | Calendario compartilhado e fase futura |

---

## 2. Faseamento

### Fase 1 — Fundacao (Stories 41.1 a 41.3)
DB migration, auth service, refatoracao OAuth.

### Fase 2 — Sync Convertfy -> Google (Stories 41.4 a 41.6)
Calendar service, integracao CRUD meetings, UI de status.

### Fase 3 — Conectividade do usuario (Stories 41.7 a 41.8)
Botao conectar no perfil, calendar selector, settings.

### Fase 4 — Portal do cliente (Stories 41.9 a 41.10)
RSVP no portal, Meet link visivel, endpoint proprio.

### Fase 5 — Sync Google -> Convertfy (Stories 41.11 a 41.13)
Cron incremental sync, RSVP sync, retry com status de erro.

### Fase 6 — Push Notifications (Opcional/Futuro)
Webhook Google Calendar, watch registration, renewal cron.

---

## 3. Requisitos Funcionais

### RF01 — Conexao Google Calendar per-user
- Cada membro da org (admin) conecta sua propria conta Google
- Tokens armazenados em tabela `user_google_tokens` com encryption AES-256-GCM (padrao `enc:v1:`)
- Um user = uma conta Google. Para trocar, desconecta e reconecta
- **[C5]** RLS policies usam `auth.uid() = user_id`, NAO `is_admin()`

### RF02 — OAuth Flow seguro
- **[C2]** State do OAuth inclui `crypto.randomUUID()` como nonce anti-CSRF
- **[C6]** Handle missing refresh_token na reconexao: usar `prompt: 'consent'` + `access_type: 'offline'` para forccar refresh_token (Google so envia na 1a auth, a menos que force consent)
- Separar fluxo Calendar (per-user) do fluxo existente Ads/outros (per-store)

### RF03 — Token refresh automatico
- **[C3]** Padrao 401 -> refresh -> retry no GoogleCalendarService
- Se refresh falha (token revogado): marcar `is_active = false`, popular `sync_error`
- UI mostra banner "Reconecte seu Google Calendar" quando token invalido

### RF04 — Criar reuniao -> Evento Google Calendar + Meet
- Ao criar reuniao no admin, criar evento no Google Calendar do organizador
- **[C4]** `requestId` do Meet usa `crypto.randomUUID()` (nao `Date.now()`)
- **[R3]** Usar `sendUpdates: "all"` para enviar convites por email
- Participantes adicionados como attendees pelo email
- Meet link salvo em `meeting_url` com `meeting_url_source = 'google_meet'`
- Se organizador nao tem Calendar conectado: reuniao criada sem sync, `google_sync_status = 'not_connected'`

### RF05 — Editar/reagendar reuniao -> Atualizar evento Google
- PATCH no evento Google Calendar com novos dados
- Reset `response_status` para 'pending' nos participantes
- Google notifica participantes automaticamente

### RF06 — Cancelar/excluir reuniao -> Deletar evento Google
- **[C7]** `deleteEvent` deve usar `fetchWithRetry` (hoje usa `fetch` raw)
- Google notifica participantes automaticamente

### RF07 — Timezone
- **[C8]** Timezone vem do browser do usuario na criacao, nao do servidor
- Campo `timezone` na tabela `meetings` (default: 'America/Sao_Paulo')
- Enviado para Google Calendar API no campo `timeZone`

### RF08 — RSVP no portal do cliente
- **[C10]** Endpoint proprio: `POST /api/portal/meetings/[id]/rsvp`
- Portal user pode aceitar/recusar/talvez direto no portal
- Propagar resposta para Google Calendar (se portal user tiver Calendar conectado)

### RF09 — Sync Google -> Convertfy (incremental)
- Cron ou manual sync busca eventos atualizados no Google
- Atualiza `meeting_participants.response_status` com RSVP do Google
- **[C9]** Unique constraint parcial: `CREATE UNIQUE INDEX ON meetings(google_event_id) WHERE google_event_id IS NOT NULL`

### RF10 — Retry de sync com erro
- **[R6]** Index em `meetings.google_sync_status` para queries de retry
- Botao "Tentar sincronizar novamente" na UI
- Job de retry busca meetings com `google_sync_status = 'error'`

---

## 4. Requisitos Nao-Funcionais

### RNF01 — Seguranca
- Tokens encriptados com AES-256-GCM (prefix `enc:v1:`) usando `@/lib/crypto`
- **[C2]** OAuth state com nonce anti-CSRF
- **[C5]** RLS: `auth.uid() = user_id` em `user_google_tokens`
- Validar scopes recebidos vs esperados

### RNF02 — Performance
- Criacao de evento Google pode ser assincrona (nao bloquear response)
- Rate limits Google Calendar API: 500 req/100s/user (risco baixo)
- Token refresh nao deve impactar latencia perceptivel

### RNF03 — Resiliencia
- Se API Google falha: reuniao criada localmente com `google_sync_status = 'error'`
- Token revogado: degradacao graceful, sem quebrar funcionalidade local
- **[C3]** Interceptor 401 -> refresh -> retry (1 tentativa)

### RNF04 — Observabilidade
- `google_sync_status` e `google_sync_error` visiveis na UI
- `sync_error` em `user_google_tokens` para debugging de conexao

---

## 5. Modelo de Dados

### 5.1 Nova tabela: `user_google_tokens`

```sql
CREATE TABLE user_google_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_type TEXT NOT NULL CHECK (user_type IN ('profile', 'portal_user')),
  user_id UUID NOT NULL,
  google_email TEXT NOT NULL,
  google_account_id TEXT,
  access_token TEXT NOT NULL,  -- encrypted enc:v1:
  refresh_token TEXT NOT NULL, -- encrypted enc:v1:
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_type, user_id)
);

-- RLS: auth.uid() = user_id [C5]
CREATE INDEX idx_user_google_tokens_user ON user_google_tokens(user_type, user_id);
CREATE INDEX idx_user_google_tokens_org ON user_google_tokens(org_id);
```

### 5.2 ALTER meetings

```sql
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS meeting_url_source TEXT
    DEFAULT 'manual'
    CHECK (meeting_url_source IN ('manual', 'google_meet', 'external')),
  ADD COLUMN IF NOT EXISTS google_sync_status TEXT
    DEFAULT 'not_connected'
    CHECK (google_sync_status IN ('synced', 'pending', 'error', 'not_connected')),
  ADD COLUMN IF NOT EXISTS google_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';

-- [R5] Nao criar google_meet_link — usar meeting_url + meeting_url_source
-- [R6] Index para queries de retry
CREATE INDEX idx_meetings_google_sync_status ON meetings(google_sync_status);
-- [C9] Unique constraint parcial
CREATE UNIQUE INDEX idx_meetings_google_event_id ON meetings(google_event_id) WHERE google_event_id IS NOT NULL;
```

### 5.3 ALTER meeting_participants

```sql
ALTER TABLE meeting_participants
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS google_rsvp_status TEXT;
  -- [R8] NAO criar google_event_id aqui (evento e criado no calendar do organizador)
```

---

## 6. Stories por Fase

### Fase 1 — Fundacao

#### Story 41.1 — DB Migration: user_google_tokens + ALTER meetings/participants
**Prioridade:** P0 (bloqueante para todas as outras)
**Esforco:** LOW
**Dependencias:** Nenhuma

**Descricao:**
Criar migration com nova tabela `user_google_tokens`, ALTER em `meetings` e `meeting_participants`, RLS policies, e indexes.

**Acceptance Criteria:**
- [ ] AC1: Tabela `user_google_tokens` criada com schema conforme secao 5.1
- [ ] AC2: `meetings` alterada com colunas `google_calendar_id`, `meeting_url_source`, `google_sync_status`, `google_sync_error`, `timezone` conforme secao 5.2
- [ ] AC3: `meeting_participants` alterada com colunas `email`, `google_rsvp_status` (SEM `google_event_id` — R8)
- [ ] AC4: RLS em `user_google_tokens`: SELECT/UPDATE/DELETE com `auth.uid() = user_id` (C5 — NAO usar `is_admin()`)
- [ ] AC5: RLS INSERT: user pode inserir apenas para si mesmo
- [ ] AC6: Index parcial unique em `meetings.google_event_id WHERE google_event_id IS NOT NULL` (C9)
- [ ] AC7: Index em `meetings.google_sync_status` (R6)
- [ ] AC8: Migration roda sem erros em banco limpo e em banco existente (idempotente com IF NOT EXISTS)

---

#### Story 41.2 — Google Auth Service: token management per-user
**Prioridade:** P0
**Esforco:** MEDIUM
**Dependencias:** 41.1

**Descricao:**
Criar `google-auth.service.ts` responsavel por: salvar/buscar tokens encriptados, refresh automatico, deteccao de revogacao, e status de conexao.

**Acceptance Criteria:**
- [ ] AC1: Service em `src/lib/services/google-auth.service.ts`
- [ ] AC2: `saveTokens(userId, userType, orgId, googleTokens)` — encripta access_token e refresh_token com AES-256-GCM (prefix `enc:v1:`) via `@/lib/crypto`
- [ ] AC3: `getValidAccessToken(userId, userType)` — busca token, verifica `expires_at`, refresh automatico se expirado
- [ ] AC4: Token refresh: padrao 401 -> refresh -> retry (C3). Se refresh falha: `is_active = false`, `sync_error = 'Token revogado'`
- [ ] AC5: `getConnectionStatus(userId, userType)` — retorna { connected, google_email, is_active, last_synced_at, sync_error }
- [ ] AC6: `disconnectGoogle(userId, userType)` — revoke token no Google + delete row
- [ ] AC7: Handle missing refresh_token (C6): se `refresh_token` nao veio do Google (reconexao), forcar `prompt: 'consent'` na proxima auth
- [ ] AC8: Tokens nunca expostos em logs ou responses (apenas status/email)

---

#### Story 41.3 — Refatorar OAuth flow: separar Calendar (per-user) de Ads (per-store)
**Prioridade:** P0
**Esforco:** MEDIUM
**Dependencias:** 41.1, 41.2

**Descricao:**
Refatorar `/api/integrations/google/authorize` e `/callback` para suportar contexto Calendar (per-user) vs contexto existente (per-store). Calendar tokens salvos em `user_google_tokens` via google-auth.service.

**Acceptance Criteria:**
- [ ] AC1: `GET /api/integrations/google/authorize` aceita `scope=calendar` + `context=admin|portal`
- [ ] AC2: State do OAuth inclui `crypto.randomUUID()` como nonce anti-CSRF (C2)
- [ ] AC3: State inclui: `{ user_id, user_type, scope, org_id, nonce }`
- [ ] AC4: Callback valida nonce do state contra session/cookie
- [ ] AC5: Quando `scope=calendar`: salvar tokens em `user_google_tokens` via google-auth.service (NAO em `client_stores`)
- [ ] AC6: Usar `prompt: 'consent'` + `access_type: 'offline'` para garantir refresh_token (C6)
- [ ] AC7: Fluxo existente (non-calendar) continua funcionando sem regressao
- [ ] AC8: Redirect pos-callback: admin -> `/admin/settings/integrations`, portal -> `/client/settings`

---

### Fase 2 — Sync Convertfy -> Google

#### Story 41.4 — Google Calendar Sync Service: create/update/delete events com Meet
**Prioridade:** P0
**Esforco:** HIGH
**Dependencias:** 41.2, 41.3

**Descricao:**
Criar `google-calendar-sync.service.ts` que orquestra sincronizacao Convertfy -> Google. Usa `GoogleCalendarService` existente + `google-auth.service` para tokens. Responsavel por criar eventos com Meet, atualizar, deletar, e gerenciar sync status.

**Acceptance Criteria:**
- [ ] AC1: Service em `src/lib/services/google-calendar-sync.service.ts`
- [ ] AC2: `syncMeetingToGoogle(meetingId, organizerUserId)` — cria evento no Calendar do organizador, salva `google_event_id`, `meeting_url`, `google_sync_status`
- [ ] AC3: `requestId` do Meet usa `crypto.randomUUID()` (C4 — nao `Date.now()`)
- [ ] AC4: `sendUpdates: "all"` em createEvent para enviar convites (R3)
- [ ] AC5: Meet link salvo em `meetings.meeting_url` com `meeting_url_source = 'google_meet'` (R5)
- [ ] AC6: Participantes adicionados como attendees pelo email (buscar email de org_members e client_portal_users)
- [ ] AC7: `updateGoogleEvent(meetingId)` — PATCH evento com dados atualizados
- [ ] AC8: `deleteGoogleEvent(meetingId)` — DELETE evento, usa `fetchWithRetry` (C7)
- [ ] AC9: Se organizador sem Calendar conectado: `google_sync_status = 'not_connected'`, nenhuma chamada ao Google
- [ ] AC10: Se API Google falha: `google_sync_status = 'error'`, `google_sync_error` populado, reuniao local intacta
- [ ] AC11: Timezone da reuniao enviado para Google Calendar API (C8)

---

#### Story 41.5 — Integrar Calendar sync no CRUD de meetings (POST/PUT/DELETE)
**Prioridade:** P0
**Esforco:** MEDIUM
**Dependencias:** 41.4

**Descricao:**
Integrar `google-calendar-sync.service` nas rotas existentes de meetings. Criacao, edicao e cancelamento propagam para Google Calendar automaticamente.

**Acceptance Criteria:**
- [ ] AC1: `POST /api/meetings` — apos criar meeting local, chama `syncMeetingToGoogle` (nao bloquear response se possivel)
- [ ] AC2: `PUT /api/meetings/[id]` — ao editar titulo/data/hora/participantes, chama `updateGoogleEvent`
- [ ] AC3: `PUT /api/meetings/[id]` com reagendamento — reset `response_status` para 'pending' em todos participantes
- [ ] AC4: `DELETE /api/meetings/[id]` — chama `deleteGoogleEvent` antes de deletar local
- [ ] AC5: Status change para 'cancelled' — chama `deleteGoogleEvent`
- [ ] AC6: Se sync falha, response inclui warning mas nao falha (meeting local e a fonte de verdade)
- [ ] AC7: `google_sync_status` atualizado em cada operacao
- [ ] AC8: Sem regressao nas funcionalidades existentes de meetings (criar sem Google funciona normalmente)

---

#### Story 41.6 — UI: Sync status e Meet link nas reunioes
**Prioridade:** P1
**Esforco:** LOW
**Dependencias:** 41.5

**Descricao:**
Exibir status de sincronizacao Google e Meet link na UI de reunioes do admin.

**Acceptance Criteria:**
- [ ] AC1: Badge de sync status em cada meeting card (icon Google + status: synced/pending/error/not_connected)
- [ ] AC2: Botao "Entrar na reuniao" com link do Google Meet quando disponivel
- [ ] AC3: Tooltip no badge de erro mostra `google_sync_error`
- [ ] AC4: Botao "Tentar sincronizar" em meetings com `google_sync_status = 'error'`
- [ ] AC5: Checkbox "Criar Google Meet automaticamente" no MeetingDialog (default ON se user tem Calendar conectado)
- [ ] AC6: Campo timezone no MeetingDialog com default do browser do usuario (C8)

---

### Fase 3 — Conectividade do usuario

#### Story 41.7 — UI: Botao Conectar Google Calendar no perfil/settings
**Prioridade:** P1
**Esforco:** MEDIUM
**Dependencias:** 41.3

**Descricao:**
Adicionar botao para conectar/desconectar Google Calendar na pagina de perfil ou settings do admin. Mostrar status da conexao.

**Acceptance Criteria:**
- [ ] AC1: Botao "Conectar Google Calendar" em `/admin/settings` (secao Integracoes)
- [ ] AC2: Quando conectado: mostrar email Google, badge "Conectado", botao "Desconectar"
- [ ] AC3: Desconectar: confirmacao modal, chama `disconnectGoogle`, revoke no Google
- [ ] AC4: Quando token revogado/expirado: banner "Reconecte seu Google Calendar" com botao
- [ ] AC5: Se user nao tem Calendar conectado e tenta criar reuniao com Meet: mostrar prompt para conectar

---

#### Story 41.8 — Calendar selector e settings de sincronizacao
**Prioridade:** P2
**Esforco:** LOW
**Dependencias:** 41.7

**Descricao:**
Permitir ao usuario selecionar qual calendario Google usar (default: 'primary') e configurar preferencias de sincronizacao.

**Acceptance Criteria:**
- [ ] AC1: Endpoint `GET /api/integrations/google/calendar/calendars` lista calendarios do usuario
- [ ] AC2: Dropdown de selecao de calendario no settings (default: 'primary')
- [ ] AC3: Calendario selecionado salvo em `user_google_tokens` (campo adicional ou em coluna separada)
- [ ] AC4: Opcao "Criar Google Meet automaticamente" como preferencia do usuario (default: ON)

---

### Fase 4 — Portal do cliente

#### Story 41.9 — Portal: RSVP de reunioes
**Prioridade:** P1
**Esforco:** MEDIUM
**Dependencias:** 41.5

**Descricao:**
Permitir clientes no portal aceitar/recusar/talvez reunioes. Endpoint proprio no namespace portal.

**Acceptance Criteria:**
- [ ] AC1: **[C10]** Endpoint `POST /api/portal/meetings/[id]/rsvp` com body `{ response: 'accepted' | 'declined' | 'tentative' }`
- [ ] AC2: Validacao: portal user so pode dar RSVP em meetings do seu `client_id`
- [ ] AC3: Atualiza `meeting_participants.response_status`
- [ ] AC4: Se portal user tem Calendar conectado: propagar RSVP para Google Calendar
- [ ] AC5: UI: botoes Aceitar/Recusar/Talvez no `MeetingsSection` do dashboard portal
- [ ] AC6: Status de participacao visivel (badge: pendente/aceito/recusado/talvez)

---

#### Story 41.10 — Portal: Meet link e detalhes de reuniao
**Prioridade:** P2
**Esforco:** LOW
**Dependencias:** 41.6

**Descricao:**
Garantir que Meet link e detalhes completos de reuniao estejam visiveis no portal do cliente.

**Acceptance Criteria:**
- [ ] AC1: `NextMeetingCard` mostra botao "Entrar na reuniao" com Meet link (ja parcialmente existe)
- [ ] AC2: `MeetingsSection` mostra todos participantes com status de confirmacao
- [ ] AC3: Meet link so visivel para meetings com `meeting_url_source = 'google_meet'` ou `meeting_url` preenchido
- [ ] AC4: Dados vem via query segura (portal user so ve meetings do seu client_id)

---

### Fase 5 — Sync Google -> Convertfy

#### Story 41.11 — Sync incremental Google -> Convertfy (RSVP status)
**Prioridade:** P2
**Esforco:** HIGH
**Dependencias:** 41.4

**Descricao:**
Implementar sincronizacao reversa: buscar status de RSVP dos participantes no Google Calendar e atualizar `meeting_participants`.

**Acceptance Criteria:**
- [ ] AC1: Endpoint `POST /api/integrations/google/calendar/sync` para sync manual
- [ ] AC2: Busca eventos Google por `google_event_id` das meetings ativas
- [ ] AC3: Atualiza `meeting_participants.google_rsvp_status` com attendee responseStatus do Google
- [ ] AC4: Mapeia Google RSVP -> sistema: `accepted`->`accepted`, `declined`->`declined`, `tentative`->`tentative`, `needsAction`->`pending`
- [ ] AC5: `user_google_tokens.last_synced_at` atualizado
- [ ] AC6: Erros de sync nao afetam dados locais existentes

---

#### Story 41.12 — Cron de sync periodico
**Prioridade:** P2
**Esforco:** MEDIUM
**Dependencias:** 41.11

**Descricao:**
Cron job que executa sync reversa periodicamente para manter RSVP atualizado.

**Acceptance Criteria:**
- [ ] AC1: Cron endpoint `POST /api/cron/google-calendar-sync`
- [ ] AC2: Busca orgs com usuarios que tem Google Calendar conectado (`is_active = true`)
- [ ] AC3: Para cada usuario conectado: sync meetings futuras (proximos 30 dias)
- [ ] AC4: Rate limiting: respeitar 500 req/100s/user do Google
- [ ] AC5: Log de execucao com stats (total synced, errors)
- [ ] AC6: Retry de meetings com `google_sync_status = 'error'` (R6)

---

#### Story 41.13 — UI: Indicadores de RSVP do Google
**Prioridade:** P2
**Esforco:** LOW
**Dependencias:** 41.11

**Descricao:**
Mostrar status de RSVP do Google Calendar na UI de reunioes.

**Acceptance Criteria:**
- [ ] AC1: Lista de participantes mostra `google_rsvp_status` quando disponivel
- [ ] AC2: Icons: check verde (accepted), X vermelho (declined), ? amarelo (tentative), relogio cinza (pending)
- [ ] AC3: Se RSVP local difere do Google, mostrar ambos com indicacao
- [ ] AC4: Timestamp de ultimo sync visivel (last_synced_at)

---

## 7. Dependencias entre Stories

```
41.1 (DB Migration)
  |
  +-- 41.2 (Auth Service) --+
  |                          |
  +-- 41.3 (OAuth Refactor) -+-- 41.4 (Sync Service)
       |                          |
       +-- 41.7 (Connect UI)     +-- 41.5 (CRUD Integration)
       |    |                     |    |
       |    +-- 41.8 (Settings)   |    +-- 41.6 (Status UI)
       |                          |    |    |
       |                          |    |    +-- 41.10 (Portal Meet)
       |                          |    |
       |                          |    +-- 41.9 (Portal RSVP)
       |                          |
       |                          +-- 41.11 (Reverse Sync)
       |                               |
       |                               +-- 41.12 (Cron Sync)
       |                               |
       |                               +-- 41.13 (RSVP UI)
```

**Caminho critico:** 41.1 -> 41.2 -> 41.4 -> 41.5 -> 41.6

---

## 8. QA Concerns Rastreabilidade

Todos os concerns do QA Review foram incorporados como requisitos explicitos:

| Concern | Severidade | Incorporado em | AC |
|---------|------------|---------------|-----|
| C1 | CRITICO | Decisao-chave: `user_google_tokens` per-user | N/A (resolvido) |
| C2 | CRITICO | Story 41.3 | AC2, AC4 |
| C3 | CRITICO | Story 41.2 | AC4 |
| C4 | CRITICO | Story 41.4 | AC3 |
| C5 | CRITICO | Story 41.1 | AC4 |
| C6 | MEDIO | Story 41.2 AC7, Story 41.3 AC6 | AC7, AC6 |
| C7 | MEDIO | Story 41.4 | AC8 |
| C8 | MEDIO | Story 41.4 AC11, Story 41.6 AC6 | AC11, AC6 |
| C9 | MEDIO | Story 41.1 | AC6 |
| C10 | MEDIO | Story 41.9 | AC1 |
| R3 | RECOM | Story 41.4 | AC4 |
| R5 | RECOM | Story 41.4 AC5, Modelo de Dados 5.2 | AC5 |
| R6 | RECOM | Story 41.1 AC7, Story 41.12 AC6 | AC7, AC6 |
| R8 | RECOM | Story 41.1 AC3, Modelo de Dados 5.3 | AC3 |

---

## 9. Codigo Existente Relevante

| Arquivo | Status | Impacto |
|---------|--------|---------|
| `src/lib/integrations/google-calendar.ts` | Existe, funcional | Reusar como base do GoogleCalendarService. Corrigir: `requestId` (C4), `deleteEvent` sem retry (C7) |
| `src/app/api/integrations/google/authorize/route.ts` | Existe | Refatorar para suportar context admin/portal + nonce (C2) |
| `src/app/api/integrations/google/callback/route.ts` | Existe | Refatorar para salvar em `user_google_tokens` quando scope=calendar |
| `src/app/api/meetings/route.ts` | Existe | Adicionar chamada ao sync service apos create |
| `src/app/api/meetings/[id]/route.ts` | Existe | Adicionar sync em PUT/DELETE |
| `src/lib/services/credentials.service.ts` | Existe | NAO modificar — Google Calendar nao e per-store |
| `src/lib/crypto.ts` | Existe | Reusar para encriptar tokens |
| `src/components/meetings/meetings-page-client.tsx` | Existe | Adicionar badges de sync status |
| `src/app/client/dashboard/meetings-section.tsx` | Existe | Adicionar botoes RSVP |

---

## 10. Variaveis de Ambiente

| Variavel | Status | Necessaria em |
|----------|--------|---------------|
| `GOOGLE_CLIENT_ID` | Ja existe | Todas as fases |
| `GOOGLE_CLIENT_SECRET` | Ja existe | Todas as fases |
| `NEXT_PUBLIC_APP_URL` | Ja existe | Redirect URI |
| `GOOGLE_CALENDAR_WEBHOOK_SECRET` | Nova (Fase 6) | Apenas se implementar push notifications |

---

## 11. Riscos e Mitigacoes

| Risco | Prob. | Impacto | Mitigacao |
|-------|-------|---------|-----------|
| Token revogado pelo usuario no Google | Media | Alto | Deteccao automatica (401 -> is_active=false) + banner de reconexao |
| Google so envia refresh_token na 1a auth | Certa | Alto | Forcar `prompt: 'consent'` + `access_type: 'offline'` (C6) |
| Latencia da API Google na criacao | Media | Medio | Sync assincrono quando possivel |
| Inconsistencia local vs Google | Media | Medio | `google_sync_status` visivel + retry manual + cron |
| Google Workspace restrita (403) | Baixa | Baixo | Tratar 403 gracefully com mensagem clara |
| OAuth consent screen nao configurado | Certa | Bloqueante | Documentar setup no console.cloud.google.com |

---

## 12. Metricas de Sucesso

| Metrica | Alvo |
|---------|------|
| % de reunioes sincronizadas com sucesso | > 95% |
| Tempo medio de criacao de reuniao (com sync) | < 3s |
| % de usuarios admin que conectaram Calendar | > 70% apos 30 dias |
| Taxa de erro de sync | < 2% |
| RSVP via portal (% de reunioes com resposta) | > 50% |

---

## 13. Estimativa de Esforco Total

| Fase | Stories | Esforco |
|------|---------|---------|
| Fase 1 — Fundacao | 41.1, 41.2, 41.3 | LOW + MEDIUM + MEDIUM |
| Fase 2 — Sync -> Google | 41.4, 41.5, 41.6 | HIGH + MEDIUM + LOW |
| Fase 3 — Conectividade | 41.7, 41.8 | MEDIUM + LOW |
| Fase 4 — Portal | 41.9, 41.10 | MEDIUM + LOW |
| Fase 5 — Sync <- Google | 41.11, 41.12, 41.13 | HIGH + MEDIUM + LOW |
| **Total** | **13 stories** | **~5-7 sprints** |

---

*PRD criado por Morgan (PM Agent) — 2026-03-13*
*Discovery: Atlas | Architecture: Architect | QA Review: Incorporado*
