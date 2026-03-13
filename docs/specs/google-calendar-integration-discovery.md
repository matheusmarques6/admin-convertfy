# Discovery: Integração Google Calendar

**Data:** 2026-03-13
**Analista:** Atlas
**Status:** Discovery completo - pronto para PRD

---

## 1. Estado Atual do Sistema

### 1.1 O que já existe

O sistema possui uma funcionalidade de reuniões funcional, porém **sem integração com Google Calendar**. A seguir, o inventário completo do que está implementado:

**Tabelas no banco:**
- `meetings` — tabela principal com `google_event_id TEXT` (coluna existe mas nunca é populada)
- `meeting_participants` — participantes polimórficos (`participant_type`: `profile` | `org_member`)
- Enums: `meeting_status` (scheduled, completed, cancelled, no_show), `meeting_participant_type`, `meeting_response_status` (pending, accepted, declined, tentative)

**API routes:**
- `POST /api/meetings` — cria reunião + participantes + auto-task no board
- `GET /api/meetings` — lista com filtros (status, client_id, upcoming, participant_id)
- `GET /api/meetings/[id]` — detalhe
- `PUT /api/meetings/[id]` — update + participant_response + reconciliação de participantes
- `DELETE /api/meetings/[id]` — exclui

**UI no admin (`/admin/meetings`):**
- View de lista + view de calendário (componente customizado, não Google)
- Stats (próximas, realizadas, hoje)
- Filtros por status e período
- Dialog de criação/edição com seleção de cliente e participantes (org_members)
- Dialog de conclusão com notas
- Ações: editar, concluir, no-show, cancelar, excluir
- Accept/decline de convite (`MeetingInviteActions`)
- Permissão: `calendar_control` feature flag

**UI no portal do cliente (`/client/dashboard`):**
- `NextMeetingCard` — exibe próxima reunião com countdown e link de acesso
- `MeetingsSection` — lista reuniões futuras e recentes com notas de conclusão
- Dados vêm via `PortalMeeting` type (read-only, sem ações de RSVP)

**OAuth Google já parcialmente implementado:**
- `GET /api/integrations/google/authorize` — suporta `scope=calendar` (scopes: `calendar` + `calendar.events`)
- `GET /api/integrations/google/callback` — troca code por tokens, salva em `client_stores`
- Env vars esperadas: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Problema:** O callback salva tokens em `client_stores` (por loja), mas Calendar é per-user, não per-store

### 1.2 Gaps identificados

| # | Gap | Severidade |
|---|-----|------------|
| G1 | `google_event_id` na tabela `meetings` nunca é populado | Alta |
| G2 | Nenhum código cria eventos no Google Calendar | Alta |
| G3 | OAuth Google salva tokens em `client_stores` — incorreto para Calendar (deveria ser per-user) | Alta |
| G4 | Sem tabela para armazenar tokens Google per-user | Alta |
| G5 | Sem criação automática de Google Meet link | Alta |
| G6 | Portal do cliente é read-only (sem RSVP, sem ver participantes) | Média |
| G7 | Sem webhook/push notification do Google Calendar para sync reversa | Média |
| G8 | Sem handling de timezone explícito (meetings usa TIMESTAMPTZ, ok no banco, mas UI assume BR) | Média |
| G9 | Sem lembretes — depende 100% do Google Calendar uma vez integrado | Baixa |
| G10 | Sem detecção de conflitos de horário | Baixa |

---

## 2. User Journey Completo

### 2.1 Conectar Google Calendar (setup one-time)

```
[Admin User] → Perfil/Settings → "Conectar Google Calendar"
  → Redirect para Google OAuth (scope: calendar + calendar.events)
  → Google pede permissão
  → Callback salva tokens na tabela `user_google_tokens` (NOVA)
  → Badge "Google Calendar Conectado" aparece no perfil
  → Reuniões futuras passam a ser sincronizadas

[Portal User] → Settings → "Conectar Google Calendar"
  → Mesmo fluxo OAuth, tokens salvos vinculados ao portal_user
  → Opcional: pode funcionar sem conectar (recebe convites via email do Google)
```

### 2.2 Criar reunião (admin)

```
[Admin] → /admin/meetings → "Agendar Reunião"
  1. Preenche: título, data/hora, duração, cliente (opcional), notas
  2. Seleciona participantes:
     - Membros da equipe (org_members) — dropdown existente
     - Contato do cliente (email) — NOVO: campo de email livre
  3. Checkbox "Criar Google Meet automaticamente" (default: ON se org tem integração)
  4. Clica "Agendar"

  Backend:
  a) Cria registro na tabela `meetings`
  b) Cria `meeting_participants`
  c) Para cada participante com Google Calendar conectado:
     → Cria evento no Calendar pessoal via API
     → Inclui Google Meet link (conferenceData)
  d) Para participantes sem Calendar conectado:
     → Convite chega via email do Google (attendee com email)
  e) Salva `google_event_id` na meeting
  f) Salva `meeting_url` com o link do Google Meet
  g) Auto-cria task no board (já existe)

  Resultado:
  - Evento aparece no Google Calendar de todos os participantes
  - Link do Meet aparece no sistema
  - Google Calendar gerencia lembretes (1h e 30min antes — default do Google)
```

### 2.3 Visualizar reunião (admin)

```
[Admin] → /admin/meetings
  - View lista: vê próximas reuniões com link "Entrar" (Google Meet)
  - View calendário: vê no calendário visual
  - Cada reunião mostra:
    * Título, data/hora, duração
    * Cliente associado
    * Participantes com status de confirmação (aceito/recusado/pendente/talvez)
    * Link do Google Meet
    * Notas
```

### 2.4 Visualizar reunião (portal do cliente)

```
[Cliente] → /client/dashboard
  - Card "Próxima Reunião" com countdown e botão "Entrar na reunião"
  - Seção "Próximas Reuniões" com lista
  - Seção "Reuniões Recentes" com notas de conclusão

  NOVO:
  - Ação de RSVP (aceitar/recusar/talvez) direto no portal
  - Visualização de todos os participantes
  - Página dedicada /client/meetings (opcional, pode manter no dashboard)
```

### 2.5 Confirmar/Recusar participação

```
[Participante interno — admin] → /admin/meetings
  - Badge de status "Pendente" com botões Aceitar/Recusar (já existe)
  - Ao aceitar/recusar → atualiza meeting_participants.response_status
  - NOVO: Propaga resposta para o Google Calendar (PATCH evento)

[Participante externo — portal] → /client/dashboard ou email do Google
  - NOVO: Botões Aceitar/Recusar no portal
  - OU: Responde direto pelo Google Calendar (sync reversa via webhook)
```

### 2.6 Reagendar reunião

```
[Admin] → Edita reunião → Altera data/hora
  Backend:
  a) UPDATE na tabela `meetings`
  b) PATCH no Google Calendar event (nova data)
  c) Google envia atualização automática para todos os participantes
  d) Reset response_status para "pending" nos participantes
  e) Log de activity "meeting_rescheduled"
```

### 2.7 Cancelar reunião

```
[Admin] → Menu → "Cancelar"
  Backend:
  a) UPDATE meetings.status = 'cancelled'
  b) DELETE ou CANCEL evento no Google Calendar
  c) Google notifica participantes automaticamente
  d) Notificação in-app para participantes internos
```

### 2.8 Lembretes

```
Delegado ao Google Calendar:
- 1 hora antes: pop-up no Google Calendar + notificação no celular
- 30 minutos antes: pop-up + email (configurável no Google)
- O sistema NÃO gerencia lembretes diretamente

Opcional futuro:
- Notificação in-app 15min antes (via cron ou realtime)
```

---

## 3. Entidades e Modelo de Dados

### 3.1 Nova tabela: `user_google_tokens`

```sql
CREATE TABLE user_google_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Polymorphic: pode ser admin user (profiles) ou portal user
  user_type TEXT NOT NULL CHECK (user_type IN ('profile', 'portal_user')),
  user_id UUID NOT NULL,  -- profiles.id ou client_portal_users.id

  -- Google account info
  google_email TEXT NOT NULL,
  google_account_id TEXT,  -- Google sub claim

  -- OAuth tokens (encrypted)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,  -- calculated from expires_in

  -- Scopes granted
  scopes TEXT[] DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,  -- último erro de sync para debugging

  -- Multi-tenant
  org_id UUID REFERENCES organizations(id) NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one Google account connected
  UNIQUE(user_type, user_id)
);

CREATE INDEX idx_user_google_tokens_user ON user_google_tokens(user_type, user_id);
CREATE INDEX idx_user_google_tokens_org ON user_google_tokens(org_id);
```

### 3.2 Alterações na tabela `meetings`

```sql
-- Já existe google_event_id TEXT, mas precisa de mais campos:
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,       -- Calendar ID onde o evento foi criado (default: 'primary')
  ADD COLUMN IF NOT EXISTS google_meet_link TEXT,         -- Link do Google Meet (redundante com meeting_url, mas explícito)
  ADD COLUMN IF NOT EXISTS google_sync_status TEXT        -- 'synced', 'pending', 'error', 'not_connected'
    DEFAULT 'not_connected'
    CHECK (google_sync_status IN ('synced', 'pending', 'error', 'not_connected')),
  ADD COLUMN IF NOT EXISTS google_sync_error TEXT,        -- Último erro de sync
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';  -- Timezone da reunião
```

### 3.3 Alterações na tabela `meeting_participants`

```sql
ALTER TABLE meeting_participants
  ADD COLUMN IF NOT EXISTS email TEXT,                    -- Email do participante (para convites externos)
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,          -- Event ID no calendar pessoal do participante
  ADD COLUMN IF NOT EXISTS google_rsvp_status TEXT;       -- Status vindo do Google ('accepted', 'declined', 'tentative', 'needsAction')
```

### 3.4 Diagrama de relacionamento

```
organizations
  |
  |-- org_members --> profiles (auth.users)
  |     |                |
  |     |                +-- user_google_tokens (user_type='profile')
  |     |
  |     +-- meeting_participants (participant_type='org_member')
  |
  |-- clients
  |     |
  |     +-- client_portal_users
  |     |     |
  |     |     +-- user_google_tokens (user_type='portal_user')
  |     |
  |     +-- meetings (client_id FK)
  |           |
  |           +-- meeting_participants
  |                 |
  |                 +-- google_event_id (per-participant)
```

---

## 4. Integrações Externas

### 4.1 Google Calendar API

**Base URL:** `https://www.googleapis.com/calendar/v3`

**Scopes necessários:**
| Scope | Motivo |
|-------|--------|
| `https://www.googleapis.com/auth/calendar` | Ler/escrever calendários |
| `https://www.googleapis.com/auth/calendar.events` | CRUD em eventos |
| `https://www.googleapis.com/auth/userinfo.email` | Identificar conta Google (já existe) |
| `https://www.googleapis.com/auth/userinfo.profile` | Nome/foto (já existe) |

**Operações necessárias:**

| Operação | Endpoint | Quando |
|----------|----------|--------|
| Criar evento | `POST /calendars/primary/events` | Ao criar reunião |
| Atualizar evento | `PATCH /calendars/{calendarId}/events/{eventId}` | Ao editar/reagendar |
| Deletar evento | `DELETE /calendars/{calendarId}/events/{eventId}` | Ao cancelar/excluir |
| Buscar evento | `GET /calendars/{calendarId}/events/{eventId}` | Sync reversa |
| Listar eventos | `GET /calendars/primary/events` | Detecção de conflitos (futuro) |

### 4.2 Google Meet (via Calendar API)

Google Meet links são criados automaticamente via `conferenceData` no evento:

```json
{
  "conferenceData": {
    "createRequest": {
      "requestId": "unique-meeting-id",
      "conferenceSolutionKey": {
        "type": "hangoutsMeet"
      }
    }
  }
}
```

**Requisitos:**
- Parâmetro `conferenceDataVersion=1` no request
- A conta Google deve ter Google Meet habilitado (Google Workspace ou conta pessoal)
- Retorna `conferenceData.entryPoints[0].uri` com o link `meet.google.com/xxx-yyy-zzz`

### 4.3 OAuth2 Flow

**Estado atual:** Parcialmente implementado em `/api/integrations/google/authorize` e `/callback`.

**Mudanças necessárias:**

1. **Authorize route:** Adicionar parâmetro `context` (admin vs portal) e `user_type` ao state
2. **Callback route:** Salvar tokens em `user_google_tokens` (não em `client_stores`)
3. **Token refresh:** Criar service `google-auth.service.ts` com auto-refresh

```typescript
// Novo flow:
// 1. GET /api/integrations/google/authorize?scope=calendar&context=admin
//    → state = { user_id, user_type: 'profile', scope: 'calendar', org_id }
//
// 2. Callback → salva em user_google_tokens
//
// 3. Quando precisa usar API:
//    → getGoogleAccessToken(userId, userType)
//    → Verifica expires_at, refresh se necessário
//    → Retorna access_token válido
```

### 4.4 Push Notifications (Webhook do Google Calendar)

**Para sync reversa (Google -> Convertfy):**

```
POST /api/integrations/google/calendar/webhook
```

**Como funciona:**
1. Registrar watch no calendário: `POST /calendars/primary/events/watch`
2. Google envia notificações quando eventos mudam
3. Webhook recebe header `X-Goog-Resource-State` (sync, exists, not_exists)
4. No handler, busca evento atualizado e sincroniza `response_status`

**Considerações:**
- Watch expira (max ~30 dias) — precisa de cron para renovar
- Google envia apenas notificação de mudança, não o payload completo
- Precisa fazer GET no evento para obter dados atualizados
- Complexidade alta — **recomendo para fase 2**

### 4.5 Rate Limits da Google Calendar API

| Limit | Valor |
|-------|-------|
| Queries per day | 1,000,000 |
| Queries per 100s per user | 500 |
| Max attendees per event | 2,000 |
| Max reminders per event | 5 |

Risco baixo para o volume esperado.

---

## 5. Cenários e Edge Cases

### 5.1 Usuário sem Google Calendar conectado

**Cenário:** Admin cria reunião mas não conectou Google Calendar.

**Tratamento:**
- Reunião é criada normalmente no banco
- `google_sync_status = 'not_connected'`
- Banner na UI: "Conecte seu Google Calendar para sincronizar automaticamente"
- meeting_url pode ser preenchido manualmente (já suportado)
- Participantes não recebem convite via Google

### 5.2 Participante sem Google Calendar conectado

**Cenário:** Organizador conectou Calendar, mas participante (org_member) não.

**Tratamento:**
- Evento é criado no Calendar do organizador
- Participante é adicionado como attendee pelo **email**
- Google envia convite por email automaticamente
- Participante pode aceitar/recusar via email
- Sync de RSVP funciona via Google Calendar API (buscar attendees do evento)

### 5.3 Participante do portal (cliente)

**Cenário:** Reunião com cliente que usa o portal.

**Tratamento:**
- Cliente é adicionado como attendee pelo email do `client_portal_users`
- Se cliente conectou Google Calendar no portal → evento aparece no Calendar dele
- Se não conectou → recebe convite por email do Google
- RSVP visível no admin via sync com Google

### 5.4 Múltiplos participantes de orgs diferentes

**Cenário:** Impossível no modelo atual — meetings são scoped por `org_id`.

**Tratamento:** Participantes externos (de outra org) são adicionados apenas por email como attendees do Google Calendar. Não aparecem como `meeting_participants` internos.

### 5.5 Cancelamento e reagendamento

**Cenário:** Admin cancela ou muda data da reunião.

**Tratamento:**
- **Cancelamento:** `meetings.status = 'cancelled'` + DELETE evento no Google Calendar
- **Reagendamento:** UPDATE `scheduled_at` + PATCH evento no Google + reset RSVP status
- Google notifica todos os attendees automaticamente em ambos os casos

### 5.6 Conflitos de horário

**Recomendação:** Fase 2. Exigiria:
- `GET /calendars/primary/freeBusy` para cada participante
- UI de seleção de horário com visualização de disponibilidade
- Complexidade alta, valor baixo para MVP

### 5.7 Timezone handling

**Estado atual:** `meetings.scheduled_at` é `TIMESTAMPTZ` (correto).

**Necessário:**
- Adicionar campo `timezone` na meeting (default: `America/Sao_Paulo`)
- Google Calendar API exige timezone no evento (`timeZone` field)
- UI deve mostrar hora no timezone do usuário (browser timezone)
- Brasil tem 4 fusos: BRT (-3), AMT (-4), ACT (-5), FNT (-2)
- Recomendação: usar timezone do perfil do usuário ou da org

### 5.8 Token refresh

**Cenário:** Access token expira (1 hora default do Google).

**Tratamento:**
- `google-auth.service.ts` verifica `expires_at` antes de cada chamada
- Se expirado, usa `refresh_token` para obter novo `access_token`
- Atualiza `user_google_tokens` com novo token e expiry
- Se refresh falha (token revogado) → marca `is_active = false`, notifica usuário

### 5.9 Token revogado pelo usuário no Google

**Cenário:** Usuário revoga acesso do app nas configurações do Google.

**Tratamento:**
- Próxima chamada à API retorna 401
- Service marca `is_active = false` e `sync_error = 'Token revogado'`
- UI mostra banner: "Reconecte seu Google Calendar"
- Reuniões existentes mantêm dados locais, mas param de sincronizar

### 5.10 Criação de reunião falha no Google

**Cenário:** API do Google retorna erro (rate limit, server error, etc.).

**Tratamento:**
- Reunião é criada localmente com `google_sync_status = 'error'`
- `google_sync_error` armazena mensagem de erro
- Botão "Tentar sincronizar novamente" na UI
- Job de retry pode rodar via cron (fase 2)

---

## 6. Impacto em Cada Área do Sistema

### 6.1 Dashboard Admin

| Componente | Mudança | Esforço |
|------------|---------|---------|
| `/admin/meetings` page | Adicionar badge de sync status (Google icon) | Baixo |
| `MeetingDialog` | Checkbox "Criar Google Meet", campo timezone | Médio |
| `meetings-page-client.tsx` | Mostrar Google Meet link, sync status por meeting | Baixo |
| `/admin/settings/profile` | Botão "Conectar Google Calendar" | Médio |
| `/admin/settings/integrations` | Status da conexão Google Calendar | Baixo |
| Sidebar | Sem mudança — `/admin/meetings` já existe | Zero |

### 6.2 Portal do Cliente

| Componente | Mudança | Esforço |
|------------|---------|---------|
| `NextMeetingCard` | Sem mudança funcional (já exibe link) | Zero |
| `MeetingsSection` | Adicionar botões RSVP (aceitar/recusar) | Médio |
| `/client/settings` | Botão "Conectar Google Calendar" (opcional) | Médio |
| Dashboard | Mostrar status de participação nos convites | Baixo |

### 6.3 API Routes

| Route | Mudança | Esforço |
|-------|---------|---------|
| `POST /api/meetings` | Após criar, chamar Google Calendar API | Alto |
| `PUT /api/meetings/[id]` | Propagar mudanças para Google Calendar | Alto |
| `DELETE /api/meetings/[id]` | Deletar evento do Google Calendar | Médio |
| `GET /api/integrations/google/authorize` | Refatorar para suportar context admin/portal | Médio |
| `GET /api/integrations/google/callback` | Salvar em `user_google_tokens` ao invés de `client_stores` | Alto |
| **NOVO** `POST /api/integrations/google/calendar/sync` | Forçar sync manual | Médio |
| **NOVO** `POST /api/integrations/google/calendar/webhook` | Receber push notifications (fase 2) | Alto |

### 6.4 Services

| Service | Mudança | Esforço |
|---------|---------|---------|
| **NOVO** `google-auth.service.ts` | Token management, refresh, revocation handling | Alto |
| **NOVO** `google-calendar.service.ts` | CRUD eventos, Meet link, attendees management | Alto |
| `notification.service.ts` | Notificações para eventos de Calendar (convite, RSVP) | Baixo |
| `task-automation.service.ts` | Sem mudança (já cria tasks) | Zero |
| `credentials.service.ts` | Sem mudança (Google Calendar não é per-store) | Zero |

### 6.5 Banco de Dados

| Migração | Mudança | Esforço |
|----------|---------|---------|
| Nova tabela `user_google_tokens` | CREATE TABLE + RLS + indexes | Médio |
| ALTER `meetings` | 4 colunas novas | Baixo |
| ALTER `meeting_participants` | 3 colunas novas | Baixo |

### 6.6 Permissões e RLS

| Tabela | Política |
|--------|----------|
| `user_google_tokens` | User pode ver/editar apenas seus próprios tokens. Admin pode listar da org. |
| `meetings` | Sem mudança — já scoped por `org_id` |
| `meeting_participants` | Sem mudança funcional, mas RSVP no portal precisa de check: portal_user só pode dar RSVP nos meetings do seu `client_id` |

### 6.7 Variáveis de Ambiente

| Variável | Status | Uso |
|----------|--------|-----|
| `GOOGLE_CLIENT_ID` | Já existe | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Já existe | OAuth client secret |
| `NEXT_PUBLIC_APP_URL` | Já existe | Redirect URI base |
| **NOVO** `GOOGLE_CALENDAR_WEBHOOK_SECRET` | Necessário fase 2 | Validar push notifications |

---

## 7. Proposta de Faseamento

### Fase 1 — MVP (estimativa: 5-7 stories)

**Objetivo:** Criar reunião no admin -> evento no Google Calendar com Meet link -> participantes recebem convite.

1. **Migração DB** — `user_google_tokens` + ALTER meetings + ALTER meeting_participants
2. **google-auth.service.ts** — Token storage, refresh, status check
3. **Refatorar OAuth flow** — Separar fluxo Calendar (per-user) do fluxo Ads (per-store)
4. **google-calendar.service.ts** — Create event, update event, delete event, com Meet link
5. **Integrar no POST /api/meetings** — Criar evento Google após criar meeting local
6. **Integrar no PUT/DELETE** — Propagar edições e cancelamentos
7. **UI: Connect button** — Em /admin/settings/profile, status badge nas reuniões

### Fase 2 — Sync Bidirecional (3-4 stories)

**Objetivo:** Mudanças no Google Calendar refletem no sistema.

1. **Google Calendar webhook** — Endpoint + watch registration + renewal cron
2. **Sync reversa RSVP** — Google attendee status -> meeting_participants.response_status
3. **Portal RSVP** — Botões aceitar/recusar no portal do cliente
4. **Conflict detection** — FreeBusy API para mostrar disponibilidade

### Fase 3 — Polimento (2-3 stories)

**Objetivo:** Experiência completa e robusta.

1. **Portal Google Calendar** — Connect button no portal, eventos no Calendar do cliente
2. **Retry mechanism** — Cron para re-sync eventos com erro
3. **Notificações in-app** — Lembrete 15min antes, RSVP recebido
4. **Timezone selector** — Na criação de meeting e no perfil do usuário

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Google revoga tokens sem aviso | Média | Alto | Detecção automática + UI de reconexão |
| Rate limit da API Google | Baixa | Médio | Volume esperado está muito abaixo dos limits |
| Latência da API Google aumenta tempo de criação de reunião | Média | Médio | Criar evento Google de forma assíncrona (after response) |
| Inconsistência entre dados locais e Google | Média | Médio | `google_sync_status` visível na UI + retry manual |
| Usuário com conta Google Workspace restrita | Baixa | Baixo | Treat 403 gracefully, mostrar mensagem clara |
| Google Cloud Console: configurar OAuth consent screen | Certa | Baixo | Documentar setup necessário no console.cloud.google.com |
| Custo: Google Calendar API é gratuita | N/A | Zero | Sem custo adicional |

---

## 9. Decisões Pendentes (para alinhar com @pm)

1. **Portal user precisa conectar Google Calendar?** Recomendação: fase 3, não MVP. Clientes recebem convite por email.

2. **Reunião sem cliente associado?** Já é suportado (client_id é nullable). Manter para reuniões internas da equipe.

3. **Criar Google Meet automaticamente sempre?** Recomendação: checkbox default ON, mas permitir desligar (para reuniões presenciais).

4. **Participantes externos (sem conta no sistema)?** Via campo de email. Google Calendar envia convite por email para qualquer endereço.

5. **Múltiplas contas Google?** Recomendação: 1 conta por user. Se precisar trocar, desconecta e reconecta.

6. **Calendário compartilhado da org?** Fase futura. MVP usa calendar 'primary' de cada user.

---

## 10. Arquivos Relevantes do Codebase

### Meetings (core)
- `src/app/admin/meetings/page.tsx` — Server page com data fetching
- `src/components/meetings/meetings-page-client.tsx` — Client component principal
- `src/components/meetings/meeting-calendar.tsx` — View de calendário
- `src/components/meetings/meeting-completion-dialog.tsx` — Dialog de conclusão
- `src/components/meetings/meeting-invite-actions.tsx` — Botões aceitar/recusar
- `src/components/meetings/meeting-filters.tsx` — Filtros
- `src/components/meetings/calendar-day-view.tsx` — View dia
- `src/components/meetings/calendar-week-view.tsx` — View semana
- `src/app/api/meetings/route.ts` — CRUD principal (GET, POST)
- `src/app/api/meetings/[id]/route.ts` — GET, PUT, DELETE por ID
- `src/types/meeting.ts` — Types de Meeting

### Portal (meetings no dashboard do cliente)
- `src/app/client/dashboard/next-meeting-card.tsx` — Card próxima reunião
- `src/app/client/dashboard/meetings-section.tsx` — Seção de reuniões
- `src/app/client/dashboard/types.ts` — PortalMeeting type

### Google OAuth (existente)
- `src/app/api/integrations/google/authorize/route.ts` — Inicia OAuth
- `src/app/api/integrations/google/callback/route.ts` — Callback com token exchange

### Services relacionados
- `src/lib/services/credentials.service.ts` — Credential management (referência de padrão)
- `src/lib/services/notification.service.ts` — Notificações in-app
- `src/lib/services/task-automation.service.ts` — Auto-criação de tasks no board

### Migrações relevantes
- `supabase/migrations/00001_initial_schema.sql` — meetings table original
- `supabase/migrations/00002_meeting_participants.sql` — meeting_participants + enums
- `supabase/migrations/20260222_meeting_completion.sql` — completion_notes fields
- `supabase/migrations/20260223_fix_meeting_participants_schema.sql` — Schema migration polimórfico

---

## 11. Recomendação de Próximo Passo

Este discovery está pronto para ser consumido pelo **@pm (Morgan)** para criação do PRD e pelo **@architect** para decisões técnicas (especialmente sobre o fluxo assíncrono de criação de eventos e a estratégia de token storage/encryption).

Stories sugeridas para o @pm criar:

1. **DB Migration: user_google_tokens + ALTER meetings/participants**
2. **Google Auth Service: token management per-user**
3. **Refatorar OAuth flow: separar Calendar (per-user) de Ads (per-store)**
4. **Google Calendar Service: create/update/delete events com Meet**
5. **Integrar Calendar na criação de reunião (POST /api/meetings)**
6. **Integrar Calendar na edição/cancelamento (PUT/DELETE)**
7. **UI: Connect Google Calendar no perfil + sync status nas reuniões**

---

-- Atlas, investigando a verdade
