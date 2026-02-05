# Arquitetura Otimizada - Convertfy Ecosystem

## Visão Geral do Ecossistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONVERTFY ECOSYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   ADMIN      │    │   AGENT      │    │   CLIENT     │                   │
│  │  (este app)  │    │   (futuro)   │    │   (futuro)   │                   │
│  ├──────────────┤    ├──────────────┤    ├──────────────┤                   │
│  │ • Dashboard  │    │ • Pipeline   │    │ • Reports    │                   │
│  │ • Clients    │    │ • Deals      │    │ • Invoices   │                   │
│  │ • Pipeline   │    │ • Meetings   │    │ • Meetings   │                   │
│  │ • Automations│    │ • Tasks      │    │ • Support    │                   │
│  │ • Financial  │    │ • Reports    │    │ • Docs       │                   │
│  │ • Reports    │    │              │    │              │                   │
│  │ • Settings   │    │              │    │              │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│          │                  │                  │                             │
│          └──────────────────┼──────────────────┘                             │
│                             │                                                │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    SUPABASE (Backend Unificado)                       │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │  Auth │ Database │ Storage │ Edge Functions │ Realtime │ RLS          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Modelo de Dados Unificado

### Hierarquia de Usuários

```sql
-- Tipo de conta principal (separação de apps)
CREATE TYPE account_type AS ENUM ('admin', 'agent', 'client');

-- Roles dentro do Admin
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'sdr', 'closer', 'cs', 'financial');

-- Profiles estendido
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  account_type account_type NOT NULL DEFAULT 'admin',
  role user_role, -- NULL para agents/clients
  client_id UUID REFERENCES clients(id), -- Para account_type = 'client'
  agency_id UUID, -- Para multi-agency futuro
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Matriz de Permissões

| Recurso | Admin | Manager | SDR | Closer | CS | Financial | Agent | Client |
|---------|-------|---------|-----|--------|----|-----------| ------|--------|
| Dashboard | ✅ Full | ✅ Full | ✅ Own | ✅ Own | ✅ Own | ✅ Financial | ✅ Own | ❌ |
| Clients | ✅ CRUD | ✅ CRUD | ✅ View | ✅ View | ✅ CRUD | ✅ View | ✅ Assigned | ✅ Self |
| Pipeline | ✅ Full | ✅ Full | ✅ Own | ✅ Own | ✅ View | ❌ | ✅ Own | ❌ |
| Deals | ✅ Full | ✅ Full | ✅ Own | ✅ Own | ✅ View | ❌ | ✅ Assigned | ❌ |
| Meetings | ✅ Full | ✅ Full | ✅ Own | ✅ Own | ✅ Own | ❌ | ✅ Own | ✅ Own |
| Reports | ✅ Full | ✅ Full | ❌ | ❌ | ✅ Own | ✅ View | ✅ Assigned | ✅ Own |
| Financial | ✅ Full | ✅ View | ❌ | ❌ | ❌ | ✅ Full | ❌ | ✅ Own |
| Automations | ✅ Full | ✅ Full | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Settings | ✅ Full | ✅ Partial | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Users | ✅ Full | ✅ View | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 2. Sistema de Eventos (Event-Driven)

### Event Bus Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EVENT BUS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLISHERS                           SUBSCRIBERS                            │
│  ─────────                            ───────────                            │
│                                                                              │
│  [Admin App]                          [Notification Service]                 │
│     │                                    ├─ Email                            │
│     ├─► client.created ──────────────────├─ WhatsApp                         │
│     ├─► client.status_changed ───────────├─ Push                             │
│     ├─► deal.moved ──────────────────────├─ In-App                           │
│     ├─► deal.won ────────────────────────│                                   │
│     ├─► deal.lost                        │                                   │
│     ├─► meeting.scheduled ───────────────┤                                   │
│     ├─► meeting.completed                │                                   │
│     ├─► payment.received ────────────────├─► [Agent App]                     │
│     ├─► payment.overdue                  │      └─ Real-time dashboard       │
│     ├─► report.created                   │                                   │
│     └─► contract.expiring ───────────────├─► [Client App]                    │
│                                          │      └─ Self-service portal       │
│  [Automation Engine]                     │                                   │
│     │                                    │                                   │
│     └─► automation.triggered ────────────┴─► [Activity Logger]               │
│                                                  └─ Audit trail              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tabela de Eventos

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'client', 'deal', 'meeting', etc.
  entity_id UUID NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  actor_type account_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para processamento
CREATE INDEX idx_events_unprocessed ON events(created_at) WHERE processed = FALSE;
CREATE INDEX idx_events_entity ON events(entity_type, entity_id);
```

### Tipos de Eventos

```typescript
// src/types/events.ts
export type EventType =
  // Client Events
  | 'client.created'
  | 'client.updated'
  | 'client.status_changed'
  | 'client.deleted'
  | 'client.health_changed'

  // Deal Events
  | 'deal.created'
  | 'deal.moved'
  | 'deal.won'
  | 'deal.lost'
  | 'deal.value_changed'

  // Meeting Events
  | 'meeting.scheduled'
  | 'meeting.rescheduled'
  | 'meeting.completed'
  | 'meeting.cancelled'
  | 'meeting.no_show'

  // Financial Events
  | 'payment.created'
  | 'payment.received'
  | 'payment.overdue'
  | 'payment.refunded'
  | 'contract.created'
  | 'contract.renewed'
  | 'contract.expiring'
  | 'contract.cancelled'

  // Report Events
  | 'report.created'
  | 'report.sent'

  // Automation Events
  | 'automation.triggered'
  | 'automation.completed'
  | 'automation.failed';

export interface SystemEvent<T = Record<string, unknown>> {
  id: string;
  event_type: EventType;
  entity_type: string;
  entity_id: string;
  actor_id: string;
  actor_type: 'admin' | 'agent' | 'client' | 'system';
  payload: T;
  metadata: {
    ip?: string;
    user_agent?: string;
    source_app?: 'admin' | 'agent' | 'client';
  };
  created_at: string;
}
```

---

## 3. Camada de Serviços

### Estrutura Proposta

```
src/
├── lib/
│   ├── services/                    # Camada de serviços
│   │   ├── index.ts                 # Export barrel
│   │   ├── client.service.ts        # CRUD + business logic
│   │   ├── deal.service.ts
│   │   ├── meeting.service.ts
│   │   ├── payment.service.ts
│   │   ├── report.service.ts
│   │   ├── automation.service.ts
│   │   └── notification.service.ts
│   │
│   ├── events/                      # Sistema de eventos
│   │   ├── publisher.ts             # Publicar eventos
│   │   ├── subscriber.ts            # Subscrever a eventos
│   │   ├── handlers/                # Event handlers
│   │   │   ├── notification.handler.ts
│   │   │   ├── automation.handler.ts
│   │   │   └── activity.handler.ts
│   │   └── types.ts
│   │
│   ├── permissions/                 # Sistema de permissões
│   │   ├── index.ts
│   │   ├── roles.ts                 # Definição de roles
│   │   ├── policies.ts              # Políticas de acesso
│   │   └── guards.ts                # Guards para componentes
│   │
│   └── integrations/                # Integrações externas
│       ├── asaas.ts                 # Pagamentos
│       ├── google-calendar.ts       # Calendário
│       ├── whatsapp.ts              # Mensagens
│       └── shopify.ts               # E-commerce
```

### Exemplo de Service

```typescript
// src/lib/services/client.service.ts
import { createClient } from '@/lib/supabase/server';
import { publishEvent } from '@/lib/events/publisher';
import type { Client, ClientStatus } from '@/types';

export class ClientService {

  async create(data: Omit<Client, 'id' | 'created_at' | 'updated_at'>, actorId: string) {
    const supabase = await createClient();

    const { data: client, error } = await supabase
      .from('clients')
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    // Publicar evento
    await publishEvent({
      event_type: 'client.created',
      entity_type: 'client',
      entity_id: client.id,
      actor_id: actorId,
      actor_type: 'admin',
      payload: { client }
    });

    return client;
  }

  async updateStatus(clientId: string, newStatus: ClientStatus, actorId: string) {
    const supabase = await createClient();

    // Buscar status atual
    const { data: current } = await supabase
      .from('clients')
      .select('status')
      .eq('id', clientId)
      .single();

    const oldStatus = current?.status;

    // Atualizar
    const { data: client, error } = await supabase
      .from('clients')
      .update({ status: newStatus })
      .eq('id', clientId)
      .select()
      .single();

    if (error) throw error;

    // Publicar evento
    await publishEvent({
      event_type: 'client.status_changed',
      entity_type: 'client',
      entity_id: clientId,
      actor_id: actorId,
      actor_type: 'admin',
      payload: {
        old_status: oldStatus,
        new_status: newStatus,
        client
      }
    });

    return client;
  }
}

export const clientService = new ClientService();
```

---

## 4. Sistema de Notificações Unificado

### Canais de Notificação

```typescript
// src/lib/services/notification.service.ts
export type NotificationChannel = 'email' | 'whatsapp' | 'sms' | 'push' | 'in_app';

export interface NotificationPayload {
  recipient_id: string;
  recipient_type: 'admin' | 'agent' | 'client';
  channels: NotificationChannel[];
  template: string;
  variables: Record<string, string>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  scheduled_for?: string;
}

export class NotificationService {
  async send(payload: NotificationPayload) {
    const promises = payload.channels.map(channel =>
      this.sendToChannel(channel, payload)
    );

    await Promise.allSettled(promises);
  }

  private async sendToChannel(channel: NotificationChannel, payload: NotificationPayload) {
    switch (channel) {
      case 'email':
        return this.sendEmail(payload);
      case 'whatsapp':
        return this.sendWhatsApp(payload);
      case 'in_app':
        return this.createInAppNotification(payload);
      // ...
    }
  }
}
```

### Templates de Notificação

```typescript
// src/lib/notifications/templates.ts
export const notificationTemplates = {
  // Para Admin/Agent
  'payment.received': {
    email: {
      subject: 'Pagamento Recebido - {{client_name}}',
      body: 'O cliente {{client_name}} realizou o pagamento de {{amount}}.'
    },
    in_app: {
      title: 'Pagamento Recebido',
      body: '{{client_name}} pagou {{amount}}'
    }
  },

  // Para Cliente
  'meeting.scheduled': {
    email: {
      subject: 'Reunião Agendada - {{date}}',
      body: 'Sua reunião foi agendada para {{date}} às {{time}}.'
    },
    whatsapp: {
      body: 'Olá {{client_name}}! Sua reunião está confirmada para {{date}} às {{time}}. Link: {{meeting_url}}'
    }
  },

  'report.available': {
    email: {
      subject: 'Seu Relatório de {{month}} está disponível',
      body: 'Olá {{client_name}}, seu relatório mensal está pronto.'
    }
  }
};
```

---

## 5. Fluxo de Integração Entre Contas

### Cenários de Integração

#### 1. Cliente criado no Admin → Disponível no Agent

```
Admin App                    Supabase                     Agent App
    │                            │                            │
    │ create client              │                            │
    ├───────────────────────────►│                            │
    │                            │ INSERT clients             │
    │                            │ PUBLISH event              │
    │                            │────────────────────────────►
    │                            │                            │ realtime update
    │                            │                            │ refresh deals list
```

#### 2. Deal ganho no Agent → Atualiza Financial no Admin

```
Agent App                    Supabase                     Admin App
    │                            │                            │
    │ deal.won                   │                            │
    ├───────────────────────────►│                            │
    │                            │ UPDATE deals               │
    │                            │ PUBLISH deal.won           │
    │                            │────────────────────────────►
    │                            │                            │ update revenue
    │                            │                            │ trigger automation
    │                            │ CREATE contract            │
    │                            │ CREATE invoice             │
```

#### 3. Relatório criado no Admin → Notifica Cliente

```
Admin App                    Supabase                     Client App
    │                            │                            │
    │ create report              │                            │
    ├───────────────────────────►│                            │
    │                            │ INSERT reports             │
    │                            │ PUBLISH report.created     │
    │                            │                            │
    │                            │ Notification Service       │
    │                            │ ─────────────────────────► │
    │                            │      email + in_app        │
    │                            │                            │ view report
```

---

## 6. Middleware Otimizado

```typescript
// src/lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Configuração de rotas por tipo de conta
const routeConfig = {
  admin: {
    protected: ['/dashboard', '/clients', '/pipeline', '/automations',
                '/settings', '/reports', '/tools', '/financial', '/meetings'],
    auth: ['/login', '/register', '/forgot-password', '/reset-password'],
    roleRestricted: {
      '/settings/users': ['admin', 'manager'],
      '/automations': ['admin', 'manager'],
      '/financial': ['admin', 'manager', 'financial'],
    }
  },
  agent: {
    protected: ['/agent/dashboard', '/agent/pipeline', '/agent/meetings', '/agent/tasks'],
    auth: ['/agent/login'],
    default: '/agent/dashboard'
  },
  client: {
    protected: ['/portal/dashboard', '/portal/reports', '/portal/invoices', '/portal/meetings'],
    auth: ['/portal/login'],
    default: '/portal/dashboard'
  }
};

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(/* ... */);

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (!user) {
    // Redirecionar para login apropriado
    if (pathname.startsWith('/agent')) {
      return NextResponse.redirect(new URL('/agent/login', request.url));
    }
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/portal/login', request.url));
    }
    if (routeConfig.admin.protected.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // Buscar perfil com role
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, role')
    .eq('id', user.id)
    .single();

  if (!profile) return response;

  // Verificar acesso baseado em tipo de conta
  const accountType = profile.account_type;
  const userRole = profile.role;

  // Verificar restrições de role
  if (accountType === 'admin') {
    for (const [route, allowedRoles] of Object.entries(routeConfig.admin.roleRestricted)) {
      if (pathname.startsWith(route) && !allowedRoles.includes(userRole)) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  }

  // Impedir acesso cruzado entre apps
  if (accountType === 'agent' && !pathname.startsWith('/agent')) {
    return NextResponse.redirect(new URL('/agent/dashboard', request.url));
  }
  if (accountType === 'client' && !pathname.startsWith('/portal')) {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url));
  }

  return response;
}
```

---

## 7. Hooks de Autorização

```typescript
// src/lib/permissions/guards.ts
import { useAuth } from '@/lib/hooks/use-auth';

type Permission =
  | 'clients.view' | 'clients.create' | 'clients.edit' | 'clients.delete'
  | 'deals.view' | 'deals.create' | 'deals.edit' | 'deals.delete'
  | 'meetings.view' | 'meetings.create' | 'meetings.edit'
  | 'reports.view' | 'reports.create'
  | 'financial.view' | 'financial.manage'
  | 'automations.view' | 'automations.manage'
  | 'settings.view' | 'settings.manage'
  | 'users.view' | 'users.manage';

const rolePermissions: Record<string, Permission[]> = {
  admin: ['*'], // Todas as permissões
  manager: [
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
    'meetings.view', 'meetings.create', 'meetings.edit',
    'reports.view', 'reports.create',
    'financial.view',
    'automations.view', 'automations.manage',
    'settings.view',
    'users.view'
  ],
  sdr: [
    'clients.view',
    'deals.view', 'deals.create', 'deals.edit',
    'meetings.view', 'meetings.create', 'meetings.edit'
  ],
  closer: [
    'clients.view',
    'deals.view', 'deals.create', 'deals.edit',
    'meetings.view', 'meetings.create', 'meetings.edit'
  ],
  cs: [
    'clients.view', 'clients.edit',
    'deals.view',
    'meetings.view', 'meetings.create', 'meetings.edit',
    'reports.view', 'reports.create'
  ],
  financial: [
    'clients.view',
    'reports.view',
    'financial.view', 'financial.manage'
  ]
};

export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (!user?.role) return false;

  const permissions = rolePermissions[user.role];
  if (!permissions) return false;

  return permissions.includes('*') || permissions.includes(permission);
}

export function useCanAccess(permissions: Permission[]): boolean {
  return permissions.some(p => usePermission(p));
}

// Componente wrapper
export function PermissionGate({
  permission,
  children,
  fallback = null
}: {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hasPermission = usePermission(permission);
  return hasPermission ? children : fallback;
}
```

---

## 8. Plano de Execução por Fases

### Fase 1: Fundação (1-2 semanas)
- [ ] Implementar sistema de eventos (`src/lib/events/`)
- [ ] Criar camada de serviços (`src/lib/services/`)
- [ ] Atualizar middleware com verificação de roles
- [ ] Migrar operações CRUD para usar serviços

### Fase 2: Permissões (1 semana)
- [ ] Implementar guards de permissão
- [ ] Adicionar RLS policies no Supabase
- [ ] Criar componente PermissionGate
- [ ] Testar fluxos de acesso por role

### Fase 3: Notificações (1-2 semanas)
- [ ] Implementar NotificationService
- [ ] Criar tabela de notificações in-app
- [ ] Integrar com templates de email
- [ ] Configurar webhooks para WhatsApp

### Fase 4: App Agent (2-3 semanas)
- [ ] Criar estrutura `/agent/*`
- [ ] Implementar dashboard do agent
- [ ] Criar pipeline simplificado
- [ ] Integrar com eventos do admin

### Fase 5: Portal Cliente (2-3 semanas)
- [ ] Criar estrutura `/portal/*`
- [ ] Implementar visualização de relatórios
- [ ] Criar área de faturas
- [ ] Integrar agendamento de reuniões

---

## 9. Métricas de Sucesso

| Métrica | Atual | Meta |
|---------|-------|------|
| Tempo de resposta API | N/A | < 200ms |
| Cobertura de tipos | ~80% | 100% |
| Lint errors | 0 | 0 |
| TypeScript errors | 0 | 0 |
| Testes unitários | 0% | > 70% |
| Eventos rastreados | 0 | 100% das ações |

---

## 10. Decisões Arquiteturais

### ADR-001: Serviços vs. Queries Diretas
**Decisão:** Migrar para camada de serviços
**Motivo:** Centraliza lógica de negócio, facilita testes, permite eventos
**Trade-off:** Mais código inicial, mas melhor manutenibilidade

### ADR-002: Eventos Síncronos vs. Assíncronos
**Decisão:** Eventos síncronos inicialmente (Supabase triggers)
**Motivo:** Simplicidade, garantia de ordem
**Futuro:** Migrar para fila assíncrona quando necessário (Inngest/Trigger.dev)

### ADR-003: Multi-app vs. Monorepo
**Decisão:** Monorepo com rotas separadas
**Motivo:** Compartilhamento de tipos e componentes
**Estrutura:** `/app/(admin)/*`, `/app/agent/*`, `/app/portal/*`

---

## Próximos Passos Imediatos

1. **Criar `/src/lib/events/publisher.ts`** - Sistema básico de eventos
2. **Criar `/src/lib/services/client.service.ts`** - Primeiro service
3. **Atualizar middleware** - Adicionar verificação de roles
4. **Testar fluxo** - Cliente criado → Evento → Log de atividade
