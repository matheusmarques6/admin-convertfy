# Epic: Redesign Completo do Fluxo de Onboarding

> **Epic ID:** ONB-EPIC-01
> **Prioridade:** Critical
> **Estimativa Total:** ~15-20 stories
> **Dependências:** Supabase, N8N, Sistema de Notificações existente
> **Criado por:** River (SM) com análise de Orion (AIOS Master)
> **Data:** 2026-02-25

---

## Visão Geral do Fluxo Desejado

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────────┐    ┌───────────┐
│  FORMULÁRIO │───▶│ CRIAÇÃO DE   │───▶│  APROVAÇÃO   │───▶│  COPIES N8N  │───▶│    DESIGN      │───▶│IMPLEMENTA-│───▶ CONCLUÍDO
│  PÚBLICO    │    │ LOGIN/CONTA  │    │  DO COO      │    │ (automático) │    │  (designers)   │    │   ÇÃO      │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘    └────────────────┘    └───────────┘
      │                   │                  │                   │                    │                    │
   Cliente            Automático          COO notif.        N8N webhook          Designers            Devs notif.
   preenche           + email            + dashboard        + auto-move          notificados          + auto-move
                      credenciais                                                + auto-move

   ▼ A cada mudança de fase: CLIENTE É NOTIFICADO (email + portal) ▼
```

---

## STORY MAP — Ordem de Implementação

| Fase | Story ID | Título | Dependência |
|------|----------|--------|-------------|
| 1 - DB | ONB-1.1 | Migração: Novos status + tabela de aprovação | Nenhuma |
| 2 - Backend | ONB-2.1 | Formulário público: API sem autenticação | ONB-1.1 |
| 2 - Backend | ONB-2.2 | Criação automática de conta do portal | ONB-1.1 |
| 2 - Backend | ONB-2.3 | API de aprovação do COO | ONB-1.1 |
| 2 - Backend | ONB-2.4 | Trigger outbound para N8N | ONB-2.3 |
| 2 - Backend | ONB-2.5 | Motor de transição de fases + notificações | ONB-1.1 |
| 3 - Frontend | ONB-3.1 | Formulário público (página) | ONB-2.1, ONB-2.2 |
| 3 - Frontend | ONB-3.2 | Kanban reestruturado por fases | ONB-2.5 |
| 3 - Frontend | ONB-3.3 | Dashboard de aprovação do COO | ONB-2.3 |
| 3 - Frontend | ONB-3.4 | Timeline visual no portal do cliente | ONB-2.5 |
| 4 - Integ. | ONB-4.1 | Webhook N8N: copies → transição automática | ONB-2.4, ONB-2.5 |
| 4 - Integ. | ONB-4.2 | Templates de email por fase | ONB-2.5 |
| 5 - Polish | ONB-5.1 | Permissões e RLS para novo fluxo | Todas |
| 5 - Polish | ONB-5.2 | Testes e validação end-to-end | Todas |

---

## STORIES DETALHADAS

---

### ONB-1.1 — Migração: Novos Status, Tabela de Aprovação e Roles

**Tipo:** Database Migration
**Complexidade:** Alta
**Risco:** Alto (altera enum existente, afeta dados em produção)

#### Contexto Atual

O enum `onboarding_status` no banco possui:
```sql
-- Em 20250125_08_onboarding.sql (linha ~10)
CREATE TYPE onboarding_status AS ENUM (
  'not_started', 'in_progress', 'paused', 'completed', 'cancelled'
);
```

O TypeScript em `src/types/onboarding.ts` (linha ~1) define:
```typescript
export type OnboardingStatus = "not_started" | "in_progress" | "paused" | "completed" | "cancelled"
```

O Kanban em `src/components/onboarding/onboarding-kanban.tsx` (linha ~25) define 4 stages:
```typescript
const STAGES = [
  { id: "not_started", label: "Não Iniciado", ... },
  { id: "in_progress", label: "Em Andamento", ... },
  { id: "paused", label: "Pausado", ... },
  { id: "completed", label: "Concluído", ... },
]
```

#### O Que Será Alterado

**Arquivo:** `supabase/migrations/YYYYMMDD_onboarding_flow_redesign.sql` (CRIAR)

```sql
-- 1. Adicionar novos valores ao enum onboarding_status
ALTER TYPE onboarding_status ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'in_progress';
ALTER TYPE onboarding_status ADD VALUE IF NOT EXISTS 'generating_copies' AFTER 'pending_approval';
ALTER TYPE onboarding_status ADD VALUE IF NOT EXISTS 'design' AFTER 'generating_copies';
ALTER TYPE onboarding_status ADD VALUE IF NOT EXISTS 'implementation' AFTER 'design';

-- Novo enum completo será:
-- pending_approval → generating_copies → design → implementation → completed
-- (not_started, in_progress, paused, cancelled permanecem para retrocompatibilidade)

-- 2. Tabela de log de aprovações
CREATE TABLE IF NOT EXISTS onboarding_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES client_onboardings(id) ON DELETE CASCADE,
  approved_by UUID NOT NULL,  -- org_member que aprovou
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'revision_requested')),
  comments TEXT,
  form_snapshot JSONB,  -- snapshot dos dados no momento da aprovação
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de log de transições de fase (audit trail)
CREATE TABLE IF NOT EXISTS onboarding_phase_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES client_onboardings(id) ON DELETE CASCADE,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  triggered_by TEXT NOT NULL,  -- 'coo_approval', 'n8n_webhook', 'manual', 'auto'
  triggered_by_user UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Adicionar campos ao client_onboardings
ALTER TABLE client_onboardings
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,           -- quando form foi submetido
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,            -- quando COO aprovou
  ADD COLUMN IF NOT EXISTS approved_by UUID,                   -- quem aprovou
  ADD COLUMN IF NOT EXISTS copies_completed_at TIMESTAMPTZ,    -- quando copies ficaram prontas
  ADD COLUMN IF NOT EXISTS design_completed_at TIMESTAMPTZ,    -- quando design finalizou
  ADD COLUMN IF NOT EXISTS implementation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS client_notified_at TIMESTAMPTZ;     -- última notificação ao cliente

-- 5. Feature de aprovação no catálogo
INSERT INTO feature_catalog (key, name, description, category)
VALUES ('onboarding_approve', 'Aprovar Onboarding', 'Permite aprovar/rejeitar formulários de onboarding', 'onboarding')
ON CONFLICT (key) DO NOTHING;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_oa_onboarding ON onboarding_approvals(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_opt_onboarding ON onboarding_phase_transitions(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_co_current_phase ON client_onboardings(current_phase);
CREATE INDEX IF NOT EXISTS idx_co_submitted ON client_onboardings(submitted_at);

-- 7. RLS
ALTER TABLE onboarding_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_phase_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_onboarding_approvals" ON onboarding_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_onboarding_phase_transitions" ON onboarding_phase_transitions FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **Dados existentes** | Onboardings antigos mantêm status atual. `current_phase` será NULL para registros antigos — tratar no código com fallback |
| **Retrocompatibilidade** | `not_started`, `in_progress`, `paused` continuam existindo. Código antigo não quebra |
| **Rollback** | Não é possível remover valores de enum no PostgreSQL. Se precisar rollback, criar novo enum e migrar |
| **RLS** | Policies permissivas (mesmo padrão do projeto). Refinar em ONB-5.1 |

#### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| `src/types/onboarding.ts` | Adicionar novos tipos ao `OnboardingStatus`, criar `OnboardingApproval`, `OnboardingPhaseTransition` |
| `src/components/onboarding/onboarding-kanban.tsx` | Será alterado em ONB-3.2 |
| `src/app/api/onboarding/[id]/route.ts` | Será alterado em ONB-2.5 |

---

### ONB-2.1 — API Pública para Formulário de Onboarding (Sem Auth)

**Tipo:** Backend API
**Complexidade:** Alta
**Risco:** Médio (rota sem autenticação precisa de proteção contra abuso)

#### Contexto Atual

- O wizard do portal (`/portal/onboarding/wizard`) **requer autenticação** (middleware Supabase)
- O formulário de store onboarding (`store-onboarding-form.tsx`) é **interno** (dashboard admin)
- Não existe rota pública para clientes novos preencherem dados sem login

#### O Que Será Criado

**Arquivo:** `src/app/api/public/onboarding-form/route.ts` (CRIAR)

```
API pública com rate limiting agressivo + honeypot + validação
```

**Endpoints:**

```
POST /api/public/onboarding-form
  - Rate limit: 3 requests por IP por hora
  - Honeypot field para bots
  - Campos aceitos:
    -- DADOS PESSOAIS:
       name* (string, 2-100 chars)
       email* (string, email válido)
       phone (string, opcional)
       cpf_cnpj (string, opcional)
       company (string, opcional)
    -- DADOS DA LOJA:
       store_name* (string, 2-100 chars)
       store_url* (string, URL válida)
       platform* (enum: shopify, nuvemshop, woocommerce, tray, vtex, other)
       niche (string, opcional)
       country (string, default 'BR')
       language (string, default 'pt-BR')
       target_audience (text, opcional)
       free_shipping_type (enum: all, conditional, none, null)
       shopify_collaborator_code (string, opcional)
    -- DADOS DE DESIGN:
       price_sensitivity (enum: price, quality, balanced)
       additional_notes (text, opcional)
       logo_url (string, URL de upload)
       design_direction_text (text, opcional)
       design_direction_file_url (string, URL de upload)
       brand_manual_url (string, URL de upload)
    -- SENHA:
       password* (string, min 8 chars, ou flag use_temp_password=true)

  - Lógica:
    1. Validar todos os campos (Zod schema)
    2. Verificar se email já existe em clients OU client_portal_users
    3. Se existir: retornar erro "Email já cadastrado"
    4. Se não existir:
       a. Criar registro em `clients` (status: 'prospect')
       b. Criar registro em `client_stores` (com dados da loja)
       c. Criar registro em `store_onboarding_data` (com dados de design)
       d. Criar `client_portal_user` via Supabase Auth (ONB-2.2 detalha)
       e. Criar `client_onboardings` com status 'pending_approval'
       f. Registrar `submitted_at` no onboarding
       g. Notificar COO/aprovadores (ONB-2.5)
       h. Retornar { success: true, message: "Formulário enviado" }
    5. Transação: se qualquer passo falhar, rollback de tudo
```

**Arquivo:** `src/app/api/public/upload/route.ts` (CRIAR)

```
API pública para upload de arquivos (logo, design files, brand manual)
  - Rate limit: 5 uploads por IP por hora
  - Limite: 10MB por arquivo
  - Tipos aceitos: PNG, JPG, JPEG, SVG, WEBP, PDF
  - Upload para Supabase Storage bucket 'onboarding-public'
  - Retorna URL pública do arquivo
  - Validação de tipo MIME real (não apenas extensão)
```

#### Segurança

| Proteção | Implementação |
|----------|---------------|
| Rate Limiting | 3 submits/hora por IP (usar `checkRateLimit` existente) |
| Honeypot | Campo `website` invisível — se preenchido, rejeitar silenciosamente |
| Validação | Zod schema rigoroso com sanitização |
| CSRF | Não necessário (API stateless) mas adicionar header check |
| Email Injection | Sanitizar campos de texto contra injection |
| File Upload | Validar MIME type real, limitar tamanho, scan de conteúdo |
| Duplicatas | Verificar email existente antes de criar |

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **Nova rota pública** | Primeira rota sem auth do sistema (exceto login). Documentar bem |
| **Storage bucket** | Criar bucket `onboarding-public` no Supabase Storage |
| **Rate limit config** | Adicionar `RATE_LIMITS.publicForm` em `src/lib/rate-limit.ts` |
| **Validação de email** | Pode conflitar com fluxo de criação manual de clientes |

#### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/rate-limit.ts` | Adicionar preset `publicForm: { windowMs: 3600000, max: 3 }` |
| `src/lib/schemas/` | Criar `public-onboarding.schema.ts` com validação Zod |
| `src/lib/cors.ts` | Permitir origin `*` para rotas `/api/public/*` |
| `next.config.mjs` | Adicionar headers CORS para `/api/public/*` se necessário |

---

### ONB-2.2 — Criação Automática de Conta no Portal

**Tipo:** Backend Service
**Complexidade:** Média
**Risco:** Médio (envolve criação de auth users)

#### Contexto Atual

- `src/app/api/portal-users/route.ts` já cria portal users (POST)
- Usa `generateTempPassword()` de `src/lib/utils/generate-password.ts`
- Cria user no Supabase Auth + `client_portal_users` table
- Campo `must_change_password` existe (migração `20250122`)
- **MAS:** tudo é feito manualmente pelo admin, não automaticamente

#### O Que Será Criado

**Arquivo:** `src/lib/services/portal-account.service.ts` (CRIAR)

```typescript
// Serviço que encapsula a criação de conta do portal
export class PortalAccountService {

  /**
   * Cria conta do portal para um novo cliente
   * Chamado automaticamente pelo formulário público
   *
   * @param clientId - ID do cliente recém-criado
   * @param email - Email do cliente
   * @param name - Nome do cliente
   * @param password - Senha escolhida pelo cliente OU undefined para gerar temporária
   * @returns { userId, portalUserId, tempPassword? }
   */
  async createPortalAccount(params: {
    clientId: string
    email: string
    name: string
    password?: string  // se undefined, gera temporária
  }): Promise<{
    userId: string
    portalUserId: string
    tempPassword?: string
    mustChangePassword: boolean
  }>

  /**
   * Envia email de boas-vindas com credenciais
   * Se senha temporária: inclui senha + link para trocar
   * Se senha própria: inclui confirmação + link de login
   */
  async sendWelcomeEmail(params: {
    email: string
    name: string
    tempPassword?: string
    loginUrl: string
  }): Promise<void>
}
```

**Lógica detalhada:**

```
1. Se `password` fornecido pelo cliente:
   - Criar Supabase Auth user com email + password
   - must_change_password = false
   - Não incluir senha no email (ele já sabe)

2. Se `password` NÃO fornecido:
   - Gerar senha temporária via generateTempPassword()
   - Criar Supabase Auth user com email + tempPassword
   - must_change_password = true
   - Incluir senha temporária no email

3. Criar registro em client_portal_users:
   - auth_user_id: userId criado
   - client_id: clientId do formulário
   - name: nome do cliente
   - email: email
   - role: 'owner'
   - is_active: true
   - must_change_password: conforme acima

4. Enviar email de boas-vindas (via serviço de email)
```

#### Integração com Email

**Problema:** O projeto não tem um serviço de envio de email configurado explicitamente.

**Opções:**
1. **Supabase Auth emails** — Usar o sistema de email do Supabase (limitado, mas funciona para auth)
2. **N8N** — Disparar webhook para n8n que envia o email (recomendado, já tem integração)
3. **Resend/SendGrid** — Adicionar SDK de email (mais trabalho)

**Recomendação:** Usar N8N para envio de emails (já tem integração). Disparar webhook para n8n com os dados, n8n monta e envia o email.

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **Supabase Auth** | Cada formulário cria um Auth user. Monitorar limites do plano Supabase |
| **Email obrigatório** | Email precisa ser funcional para receber credenciais |
| **Duplicatas** | Se o cliente tentar preencher de novo com mesmo email, bloquear |
| **Rollback** | Se criação do Auth user falhar após criar o client, precisa de cleanup |

#### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/utils/generate-password.ts` | Já existe, reutilizar |
| `src/app/api/portal-users/route.ts` | Refatorar para usar o novo service (DRY) |
| `.env.example` | Adicionar `WELCOME_EMAIL_N8N_WEBHOOK_URL` |

---

### ONB-2.3 — API de Aprovação do COO

**Tipo:** Backend API
**Complexidade:** Alta
**Risco:** Médio

#### Contexto Atual

- Existe sistema de aprovação para **campanhas** (`/api/campaigns/[id]/approve` e `/api/campaigns/[id]/reject`)
- **NÃO existe** para onboarding
- Roles atuais: `owner, manager, coordinator, copywriter, designer, developer, support, analyst`
- **NÃO existe** role `coo` explícito

#### Decisão de Design: Role do COO

**Opção A:** Criar role `coo` no enum `org_role`
- Pro: Explícito, claro
- Con: Altera enum, pode ter apenas 1 COO na org

**Opção B:** Usar feature `onboarding_approve` (já planejada em ONB-1.1)
- Pro: Flexível, qualquer role pode ter essa permissão
- Con: Menos semântico

**Recomendação:** **Opção B** — Usar feature `onboarding_approve`. O COO (que provavelmente é `owner` ou `manager`) recebe essa feature. Qualquer pessoa com essa feature pode aprovar. Isso é mais flexível e segue o padrão de features já existente no projeto.

#### O Que Será Criado

**Arquivo:** `src/app/api/onboarding/[id]/approve/route.ts` (CRIAR)

```
POST /api/onboarding/[id]/approve
  Headers: Authorization (auth required)
  Body: { action: 'approved' | 'rejected' | 'revision_requested', comments?: string }

  Permissão: feature 'onboarding_approve'

  Lógica:
  1. Verificar auth + feature 'onboarding_approve'
  2. Verificar que onboarding.current_phase === 'pending_approval'
  3. Se action === 'approved':
     a. Atualizar client_onboardings:
        - current_phase = 'generating_copies'
        - approved_at = now()
        - approved_by = userId
     b. Inserir em onboarding_approvals (audit log)
     c. Inserir em onboarding_phase_transitions
     d. Disparar trigger N8N para gerar copies (ONB-2.4)
     e. Notificar cliente: "Seu onboarding foi aprovado e está em processamento"
     f. Atualizar client.status = 'onboarding'
  4. Se action === 'rejected':
     a. Atualizar current_phase = 'pending_approval' (mantém)
     b. Inserir em onboarding_approvals com comments
     c. Notificar cliente: "Precisamos de ajustes no seu cadastro"
     d. (Opcional) Reabrir formulário para edição
  5. Se action === 'revision_requested':
     a. Mesmo que rejected mas com mensagem diferente
     b. Marcar quais campos precisam de revisão (metadata)

  Retorno: { success: true, onboarding: updatedOnboarding }
```

**Arquivo:** `src/app/api/onboarding/pending-approval/route.ts` (CRIAR)

```
GET /api/onboarding/pending-approval
  Headers: Authorization (auth required)
  Permissão: feature 'onboarding_approve'

  Retorna: Lista de onboardings com current_phase === 'pending_approval'
  Inclui: dados do cliente, dados da loja, dados do formulário, data de submissão
  Ordenado por: submitted_at ASC (mais antigos primeiro — FIFO)
```

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **Feature catalog** | Nova feature `onboarding_approve` precisa ser atribuída manualmente ao COO |
| **Rejeição** | Cliente precisa poder re-editar formulário após rejeição |
| **Timeout** | Se COO não aprovar em X dias, alertar? (considerar em fase futura) |
| **Múltiplos aprovadores** | Se mais de 1 pessoa tem a feature, primeiro que clicar aprova |

#### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/hooks/use-permissions.tsx` | Já suporta feature checks, sem alteração |
| `src/types/onboarding.ts` | Adicionar tipo `OnboardingApproval` |
| `src/lib/services/notification.service.ts` | Será chamado (sem alteração no service) |

---

### ONB-2.4 — Trigger Outbound para N8N

**Tipo:** Backend Service
**Complexidade:** Média
**Risco:** Médio (dependência externa)

#### Contexto Atual

- `N8N_WEBHOOK_URL` existe no `.env.example` mas **não é usado no código**
- `N8N_API_KEY` existe no `.env.example`
- O webhook **inbound** (n8n → app) funciona em `/api/onboarding/webhook`
- **NÃO existe** trigger **outbound** (app → n8n) para iniciar processos

#### O Que Será Criado

**Arquivo:** `src/lib/services/n8n-trigger.service.ts` (CRIAR)

```typescript
export class N8nTriggerService {
  private baseUrl: string  // N8N_WEBHOOK_URL
  private apiKey: string   // N8N_API_KEY

  /**
   * Dispara geração de copies de email no N8N
   * Chamado após aprovação do COO
   */
  async triggerCopyGeneration(params: {
    onboarding_id: string
    client_name: string
    store_name: string
    store_url: string
    platform: string
    niche: string
    target_audience: string
    price_sensitivity: string
    briefing_data: BriefingData
    callback_url: string  // URL do webhook de retorno
  }): Promise<{ success: boolean; n8n_execution_id?: string }>

  /**
   * Dispara envio de email de notificação ao cliente
   * Chamado em cada transição de fase
   */
  async triggerClientNotification(params: {
    email: string
    client_name: string
    phase: string
    phase_label: string
    message: string
    portal_url: string
  }): Promise<{ success: boolean }>

  /**
   * Dispara envio de email de boas-vindas com credenciais
   */
  async triggerWelcomeEmail(params: {
    email: string
    name: string
    temp_password?: string
    login_url: string
  }): Promise<{ success: boolean }>

  /**
   * Health check do N8N
   */
  async healthCheck(): Promise<boolean>
}
```

**Lógica de trigger para copies:**

```
1. COO aprova (ONB-2.3)
2. Montar payload com todos os dados do briefing
3. POST para N8N_WEBHOOK_URL/copy-generation
4. N8N recebe, processa (gera copies com IA)
5. N8N chama de volta: POST /api/onboarding/webhook
   com type: 'copies_generated' + data
6. App recebe, salva copies, transiciona para fase 'design'
```

**Variáveis de ambiente necessárias:**

```env
# Já existem:
N8N_WEBHOOK_URL=https://n8n.seudominio.com/webhook
N8N_API_KEY=seu-api-key
ONBOARDING_WEBHOOK_SECRET=secret-para-callback

# Novas:
N8N_COPY_GENERATION_PATH=/copy-generation
N8N_CLIENT_NOTIFICATION_PATH=/client-notification
N8N_WELCOME_EMAIL_PATH=/welcome-email
```

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **Dependência N8N** | Se N8N estiver offline, a aprovação funciona mas copies não são geradas. Precisa de retry/fallback |
| **Timeout** | Se N8N demorar, não bloquear. Usar fire-and-forget com callback |
| **Retry** | Se trigger falhar, logar erro e permitir re-trigger manual |
| **Configuração N8N** | Precisa criar os workflows no N8N (fora do escopo deste app, mas documentar) |

#### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| `.env.example` | Adicionar novas variáveis N8N |
| `.env.local.example` | Adicionar novas variáveis N8N |
| `src/app/api/onboarding/[id]/approve/route.ts` | Chamar `n8nTrigger.triggerCopyGeneration()` |

---

### ONB-2.5 — Motor de Transição de Fases + Notificações

**Tipo:** Backend Service (Core)
**Complexidade:** Alta
**Risco:** Alto (é o coração do novo fluxo)

#### Contexto Atual

- `notification.service.ts` existe com `notifyByRole()` e `notifyClientOwner()` mas **não é chamado** em nenhum handler de onboarding
- Transições de status são feitas via PUT simples sem lógica de máquina de estados
- Não há validação de transições válidas

#### O Que Será Criado

**Arquivo:** `src/lib/services/onboarding-phase.service.ts` (CRIAR)

```typescript
/**
 * Máquina de estados do onboarding
 * Controla transições válidas e efeitos colaterais
 */
export class OnboardingPhaseService {

  // Transições válidas
  private static VALID_TRANSITIONS: Record<string, string[]> = {
    'pending_approval': ['generating_copies', 'cancelled'],       // COO aprova ou cancela
    'generating_copies': ['design', 'pending_approval'],          // copies prontas ou erro
    'design': ['implementation', 'generating_copies'],             // design pronto ou voltar
    'implementation': ['completed', 'design'],                     // impl pronta ou voltar
    'completed': [],                                                // estado final
    'cancelled': ['pending_approval'],                             // reabrir
    // Legacy (retrocompatibilidade):
    'not_started': ['pending_approval', 'in_progress', 'cancelled'],
    'in_progress': ['paused', 'completed', 'cancelled'],
    'paused': ['in_progress', 'cancelled'],
  }

  /**
   * Transiciona onboarding para nova fase
   * Valida transição, executa side effects, notifica
   */
  async transition(params: {
    onboardingId: string
    toPhase: string
    triggeredBy: 'coo_approval' | 'n8n_webhook' | 'manual' | 'auto'
    triggeredByUserId?: string
    metadata?: Record<string, unknown>
  }): Promise<{ success: boolean; onboarding: ClientOnboarding }>

  /**
   * Side effects por fase
   */
  private async executeSideEffects(
    onboarding: ClientOnboarding,
    fromPhase: string,
    toPhase: string
  ): Promise<void> {
    switch (toPhase) {
      case 'pending_approval':
        // Notificar aprovadores
        await this.notifyApprovers(onboarding)
        await this.notifyClient(onboarding, 'form_submitted',
          'Seu cadastro foi recebido e está em análise')
        break

      case 'generating_copies':
        // Disparar N8N + notificar cliente
        await this.triggerN8nCopyGeneration(onboarding)
        await this.notifyClient(onboarding, 'approved',
          'Seu onboarding foi aprovado! Estamos preparando seus materiais')
        break

      case 'design':
        // Notificar designers + cliente
        await this.notifications.notifyByRole(['designer'], {
          title: `Novo onboarding para design: ${onboarding.client?.company}`,
          body: `Copies prontas. Iniciar design para ${onboarding.store?.store_name}`,
          type: 'info',
          link: `/onboarding?id=${onboarding.id}`
        })
        await this.notifyClient(onboarding, 'design_started',
          'Nosso time de design está trabalhando nos seus materiais')
        break

      case 'implementation':
        // Notificar devs + cliente
        await this.notifications.notifyByRole(['developer'], {
          title: `Novo onboarding para implementação: ${onboarding.client?.company}`,
          body: `Design finalizado. Implementar para ${onboarding.store?.store_name}`,
          type: 'info',
          link: `/onboarding?id=${onboarding.id}`
        })
        await this.notifyClient(onboarding, 'implementation_started',
          'Estamos implementando tudo na sua loja. Falta pouco!')
        break

      case 'completed':
        // Notificar cliente + atualizar status
        await this.notifyClient(onboarding, 'completed',
          'Seu onboarding foi concluído! Sua loja está pronta')
        await this.updateClientStatus(onboarding.client_id, 'active')
        break
    }
  }

  /**
   * Notificar cliente via portal + email (N8N)
   */
  private async notifyClient(
    onboarding: ClientOnboarding,
    event: string,
    message: string
  ): Promise<void> {
    // 1. Notificação interna (portal)
    await this.notifications.notifyClientOwner(onboarding.client_id, {
      title: 'Atualização do Onboarding',
      body: message,
      type: 'info',
      link: '/portal/onboarding'
    })

    // 2. Email via N8N
    await this.n8nTrigger.triggerClientNotification({
      email: onboarding.client?.email,
      client_name: onboarding.client?.name,
      phase: event,
      phase_label: this.getPhaseLabel(event),
      message: message,
      portal_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/onboarding`
    })

    // 3. Registrar última notificação
    await this.updateOnboarding(onboarding.id, {
      client_notified_at: new Date().toISOString()
    })
  }

  /**
   * Registrar transição no audit log
   */
  private async logTransition(params: {
    onboardingId: string
    fromPhase: string
    toPhase: string
    triggeredBy: string
    triggeredByUserId?: string
    metadata?: Record<string, unknown>
  }): Promise<void>
}
```

#### Mapa de Notificações por Fase

```
┌──────────────────────┬──────────────────────┬───────────────────────┐
│ Transição            │ Quem é notificado    │ Canal                 │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ → pending_approval   │ COO/aprovadores      │ Portal + Email (N8N)  │
│                      │ Cliente              │ Portal + Email (N8N)  │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ → generating_copies  │ Cliente              │ Portal + Email (N8N)  │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ → design             │ Designers (role)     │ Portal                │
│                      │ Cliente              │ Portal + Email (N8N)  │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ → implementation     │ Developers (role)    │ Portal                │
│                      │ Cliente              │ Portal + Email (N8N)  │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ → completed          │ Cliente              │ Portal + Email (N8N)  │
│                      │ Admin/CS             │ Portal                │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ → rejected           │ Cliente              │ Portal + Email (N8N)  │
└──────────────────────┴──────────────────────┴───────────────────────┘
```

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **Ponto central** | Todas as transições passam por este service. Garante consistência |
| **Retrocompatibilidade** | PUT direto no `/api/onboarding/[id]` precisa chamar este service em vez de update direto |
| **Falha em side effect** | Se notificação falhar, transição NÃO deve falhar. Side effects são best-effort |
| **Race conditions** | Se N8N chamar webhook e alguém arrastar card ao mesmo tempo, pode haver conflito. Usar optimistic locking |

#### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| `src/app/api/onboarding/[id]/route.ts` | **ALTERAR** — PUT deve chamar `phaseService.transition()` em vez de update direto quando `current_phase` muda |
| `src/app/api/onboarding/webhook/route.ts` | **ALTERAR** — Após receber `copies_generated`, chamar `phaseService.transition(id, 'design', 'n8n_webhook')` |
| `src/app/api/onboarding/route.ts` | **ALTERAR** — POST deve criar com `current_phase: 'pending_approval'` em vez de `status: 'in_progress'` |

---

### ONB-3.1 — Formulário Público (Página Frontend)

**Tipo:** Frontend Page
**Complexidade:** Alta
**Risco:** Baixo (nova página, não altera existente)

#### O Que Será Criado

**Arquivo:** `src/app/public/onboarding/page.tsx` (CRIAR)

```
Página pública acessível sem auth em /public/onboarding
Formulário multi-step (3-4 etapas) com design atrativo
```

**Etapas do formulário:**

```
Step 1: DADOS PESSOAIS
  - Nome completo*
  - Email*
  - Telefone
  - CPF/CNPJ
  - Empresa
  - Senha* (input password com confirmação)
    OU checkbox "Gerar senha temporária para mim"

Step 2: DADOS DA LOJA
  - Nome da loja*
  - URL da loja*
  - Plataforma* (select com ícones)
  - Nicho (com sugestões)
  - País (default Brasil)
  - Idioma (default Português)
  - Público-alvo (textarea)
  - Tipo de frete grátis
  - Código de colaborador Shopify (se plataforma = Shopify)

Step 3: IDENTIDADE VISUAL E MARCA
  - Logo (upload com preview)
  - Direção de design (textarea com placeholder explicativo)
  - Referência visual (upload - imagem ou PDF)
  - Manual da marca (upload - PDF)
  - Sensibilidade de preço (radio: Preço | Qualidade | Equilibrado)
  - Observações adicionais (textarea)

Step 4: REVISÃO E ENVIO
  - Resumo de todos os dados preenchidos
  - Editar qualquer seção
  - Termos de uso / checkbox de consentimento
  - Botão "Enviar Cadastro"
```

**Componentes a criar:**

| Componente | Arquivo |
|------------|---------|
| PublicOnboardingForm | `src/components/public/public-onboarding-form.tsx` |
| PublicFormStep | `src/components/public/public-form-step.tsx` |
| PublicFileUpload | `src/components/public/public-file-upload.tsx` |
| PublicFormReview | `src/components/public/public-form-review.tsx` |
| PublicFormSuccess | `src/components/public/public-form-success.tsx` |

**Após envio bem-sucedido:**
```
Tela de sucesso:
  "Cadastro enviado com sucesso! 🎉"
  "Você receberá um email com seus dados de acesso em instantes."
  "Nosso time irá analisar seus dados e em breve seu onboarding começará."
  [Botão: Acessar Portal →] (link para /portal/login)
```

**Layout:**
- Usar o `src/app/public/layout.tsx` (CRIAR) — layout limpo, sem sidebar/header admin
- Responsivo (mobile-first, clientes podem acessar pelo celular)
- Branding Convertfy (logo, cores)

#### Rota e Middleware

**Arquivo:** `src/middleware.ts` (ALTERAR)

```
Adicionar exceção para /public/* — não exigir auth
Atualmente o middleware redireciona para /login se não autenticado
Precisa permitir /public/onboarding sem redirecionamento
```

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **SEO** | Página pública pode ser indexada. Adicionar noindex se não desejado |
| **Middleware** | Precisa permitir rotas `/public/*` sem auth |
| **UX** | Primeira impressão do cliente. Precisa ser polido |
| **Uploads** | Uploads públicos precisam de bucket separado + cleanup de orphans |

---

### ONB-3.2 — Kanban Reestruturado por Fases

**Tipo:** Frontend Component (Major Refactor)
**Complexidade:** Alta
**Risco:** Alto (altera componente existente usado em produção)

#### Contexto Atual

`src/components/onboarding/onboarding-kanban.tsx` tem 4 colunas baseadas em status genérico:

```typescript
const STAGES = [
  { id: "not_started", label: "Não Iniciado", icon: Circle, color: "#94A3B8" },
  { id: "in_progress", label: "Em Andamento", icon: PlayCircle, color: "#3B82F6" },
  { id: "paused", label: "Pausado", icon: PauseCircle, color: "#F59E0B" },
  { id: "completed", label: "Concluído", icon: CheckCircle2, color: "#22C55E" },
]
```

#### O Que Será Alterado

**Arquivo:** `src/components/onboarding/onboarding-kanban.tsx` (ALTERAR)

Novas colunas:

```typescript
const STAGES = [
  {
    id: "pending_approval",
    label: "Aguardando Aprovação",
    icon: Clock,           // ou FileCheck
    color: "#F97316",      // orange
    description: "Formulários pendentes de análise do COO",
    assigneeRole: null,    // COO (via feature)
    autoTransition: false, // manual (COO aprova)
  },
  {
    id: "generating_copies",
    label: "Gerando Copies",
    icon: Sparkles,        // ou Wand2
    color: "#8B5CF6",      // purple
    description: "N8N está gerando as copies de email",
    assigneeRole: null,    // automático
    autoTransition: true,  // webhook do N8N
  },
  {
    id: "design",
    label: "Design",
    icon: Palette,
    color: "#EC4899",      // pink
    description: "Time de design trabalhando nos materiais",
    assigneeRole: "designer",
    autoTransition: false, // manual (designer marca como pronto)
  },
  {
    id: "implementation",
    label: "Implementação",
    icon: Code2,           // ou Wrench
    color: "#3B82F6",      // blue
    description: "Time de implementação configurando a loja",
    assigneeRole: "developer",
    autoTransition: false, // manual (dev marca como pronto)
  },
  {
    id: "completed",
    label: "Concluído",
    icon: CheckCircle2,
    color: "#22C55E",      // green
    description: "Onboarding finalizado",
    assigneeRole: null,
    autoTransition: false,
  },
]
```

**Mudanças no componente:**

1. **Drag & Drop restrito:** Só permitir arrastar para a próxima coluna (não pular fases)
2. **Coluna "Gerando Copies":** Não permitir drag manual (só webhook transiciona)
3. **Coluna "Aguardando Aprovação":** Mostrar botão "Aprovar" no card (se user tem feature `onboarding_approve`)
4. **Cards:** Mostrar dados do formulário resumidos + badge da fase atual
5. **Contagem por coluna:** Mostrar número de itens em cada coluna
6. **Filtros:** Filtrar por assignee, por data de submissão, por plataforma

**Card redesenhado:**

```
┌─────────────────────────────────────────┐
│ 🏪 Nome da Loja                    [⋮] │
│ Cliente: Nome do Cliente                │
│ Plataforma: Shopify  |  Nicho: Moda    │
│ ─────────────────────────────────────── │
│ 📋 Form: ✅ Completo                    │
│ 📅 Submetido: 25/02/2026               │
│ ███████████░░░░░░░░░░░░░░  45%         │
│ ─────────────────────────────────────── │
│ 👤 Responsável: João Silva              │
│ ⏰ Prazo: 10/03/2026                    │
│                                         │
│ [Aprovar ✓] [Rejeitar ✗] (se na col 1) │
│ [Marcar Pronto ✓]     (se nas col 3-4) │
└─────────────────────────────────────────┘
```

#### Consequências

| Impacto | Detalhe |
|---------|---------|
| **Breaking change** | Cards existentes com status `in_progress` não vão aparecer nas novas colunas. Precisar migrar ou mostrar coluna legacy |
| **Retrocompatibilidade** | Adicionar coluna "Legado" ou migrar onboardings antigos para nova estrutura |
| **Performance** | Mais colunas = mais cards renderizados. Considerar virtualização se volume alto |
| **Permissões** | Botão "Aprovar" só aparece para quem tem feature. Verificar no frontend |

---

### ONB-3.3 — Dashboard de Aprovação do COO

**Tipo:** Frontend Page/Component
**Complexidade:** Média
**Risco:** Baixo (nova funcionalidade)

#### O Que Será Criado

**Opção A (Recomendada):** Adicionar aba "Aprovações" no `onboarding-tabs.tsx` existente

**Arquivo:** `src/components/onboarding/onboarding-approvals.tsx` (CRIAR)

```
Componente que mostra:
1. Lista de onboardings pendentes de aprovação
2. Para cada item:
   - Dados do cliente (nome, email, empresa)
   - Dados da loja (nome, URL, plataforma)
   - Dados de design (logo preview, direção)
   - Resumo do formulário completo
   - Data de submissão
   - Botões: [Aprovar] [Solicitar Revisão] [Rejeitar]
3. Dialog de confirmação com campo de comentários
4. Histórico de aprovações recentes

Visível apenas para: users com feature 'onboarding_approve'
```

**Arquivo:** `src/components/onboarding/onboarding-tabs.tsx` (ALTERAR)

```
Adicionar 4ª aba: "Aprovações" (com badge de contagem)
Tabs: Kanban | Formulários | Briefings | Aprovações (N)
Aba só visível para users com feature 'onboarding_approve'
```

#### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/onboarding/onboarding-tabs.tsx` | Adicionar tab + import do novo componente |
| `src/app/(dashboard)/onboarding/page.tsx` | Pode precisar ajustar permissões |

---

### ONB-3.4 — Timeline Visual no Portal do Cliente

**Tipo:** Frontend Component
**Complexidade:** Média
**Risco:** Baixo

#### Contexto Atual

`src/app/portal/onboarding/page.tsx` mostra progresso com:
- Barra de progresso (%)
- Steps agrupados por categoria
- Status por step (pending, in_progress, completed, etc.)

#### O Que Será Alterado

**Arquivo:** `src/app/portal/onboarding/page.tsx` (ALTERAR)

Adicionar timeline visual no topo:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Progresso do Onboarding                      │
│                                                                 │
│  ✅ ──────── ✅ ──────── 🔵 ──────── ⚪ ──────── ⚪           │
│ Cadastro    Aprovado   Design    Implementação  Concluído       │
│ 25/02       26/02      Agora         -             -            │
│                                                                 │
│ "Nosso time de design está trabalhando nos seus materiais"      │
└─────────────────────────────────────────────────────────────────┘
```

**Componente:** `src/components/portal/onboarding-timeline.tsx` (CRIAR)

```
Props:
  - currentPhase: string
  - phases: { id, label, completedAt?, message? }[]

Visual:
  - Stepper horizontal com ícones
  - Fase atual destacada (azul pulsante)
  - Fases completas em verde com check
  - Fases futuras em cinza
  - Data de conclusão de cada fase
  - Mensagem contextual da fase atual
  - Responsivo (vertical em mobile)
```

**Arquivo:** `src/app/api/portal/onboarding/route.ts` (ALTERAR)

```
Adicionar ao retorno:
  - current_phase: string
  - phase_history: Array<{ phase, completed_at, message }>
  - current_phase_message: string
```

---

### ONB-4.1 — Webhook N8N: Copies → Transição Automática para Design

**Tipo:** Backend Integration
**Complexidade:** Média
**Risco:** Médio

#### O Que Será Alterado

**Arquivo:** `src/app/api/onboarding/webhook/route.ts` (ALTERAR)

```typescript
// ATUAL: Apenas salva generated_copies
if (body.type === "copies_generated") {
  await adminClient
    .from("client_onboardings")
    .update({ generated_copies: body.data })
    .eq("id", body.onboarding_id)
  return successResponse(...)
}

// NOVO: Salva copies + transiciona para design + notifica
if (body.type === "copies_generated") {
  // 1. Salvar copies
  await adminClient
    .from("client_onboardings")
    .update({
      generated_copies: body.data,
      copies_completed_at: new Date().toISOString()
    })
    .eq("id", body.onboarding_id)

  // 2. Transicionar para fase "design" via PhaseService
  const phaseService = new OnboardingPhaseService()
  await phaseService.transition({
    onboardingId: body.onboarding_id,
    toPhase: 'design',
    triggeredBy: 'n8n_webhook',
    metadata: { copies_count: body.data?.length || 0 }
  })
  // PhaseService automaticamente:
  //   - Notifica designers por role
  //   - Notifica cliente
  //   - Loga transição no audit trail

  return successResponse(...)
}
```

#### Configuração N8N Necessária (fora do app, documentar)

```
Workflow N8N "Copy Generation":
1. Trigger: Webhook (recebe dados do app)
2. Process: Usar OpenAI/Claude para gerar copies baseado no briefing
3. Output: POST para APP_URL/api/onboarding/webhook
   Headers: X-Webhook-Secret: {ONBOARDING_WEBHOOK_SECRET}
   Body: {
     onboarding_id: "...",
     type: "copies_generated",
     data: {
       email_copies: [...],
       subject_lines: [...],
       generated_at: "..."
     }
   }
```

---

### ONB-4.2 — Templates de Email por Fase

**Tipo:** Configuration + N8N Workflows
**Complexidade:** Média
**Risco:** Baixo

#### O Que Será Criado

**Templates de notificação por email (para N8N processar):**

| Fase | Assunto | Conteúdo |
|------|---------|----------|
| form_submitted | "Cadastro recebido - {store_name}" | "Recebemos seu cadastro e ele está sendo analisado pela nossa equipe..." |
| approved | "Onboarding aprovado! - {store_name}" | "Seu onboarding foi aprovado! Estamos preparando os materiais de email..." |
| design_started | "Design em andamento - {store_name}" | "Nosso time de design está criando os materiais visuais para sua loja..." |
| implementation_started | "Implementação iniciada - {store_name}" | "Estamos implementando tudo na sua loja. Falta pouco para tudo ficar pronto!" |
| completed | "Onboarding concluído! - {store_name}" | "Parabéns! Sua loja está 100% configurada e pronta para operar!" |
| rejected | "Ajustes necessários - {store_name}" | "Precisamos de alguns ajustes no seu cadastro. Por favor, revise os pontos abaixo..." |
| welcome | "Bem-vindo à Convertfy! - Seus dados de acesso" | "Sua conta foi criada com sucesso. Acesse o portal com as credenciais abaixo..." |

**Arquivo:** `src/lib/constants/onboarding-emails.ts` (CRIAR)

```typescript
export const ONBOARDING_EMAIL_TEMPLATES = {
  form_submitted: {
    subject: 'Cadastro recebido - {{store_name}}',
    preheader: 'Seu cadastro está sendo analisado',
  },
  approved: {
    subject: 'Onboarding aprovado! - {{store_name}}',
    preheader: 'Estamos preparando seus materiais',
  },
  // ... etc
}
```

> Nota: O HTML dos emails será montado no N8N, não no app. O app envia apenas os dados + template key.

---

### ONB-5.1 — Permissões e RLS para Novo Fluxo

**Tipo:** Security
**Complexidade:** Média
**Risco:** Alto (segurança)

#### O Que Será Alterado

1. **Feature catalog:** Garantir que `onboarding_approve` existe e é atribuível
2. **RLS policies:** Criar policies específicas para `onboarding_approvals` e `onboarding_phase_transitions`
3. **Middleware:** Rotas `/public/*` não exigem auth
4. **API routes:** Verificar feature antes de aprovar
5. **Portal routes:** Cliente só vê seu próprio onboarding
6. **Upload público:** Rate limit + validação de tipo

#### Feature Map

| Feature Key | Quem Deve Ter | O Que Permite |
|-------------|---------------|---------------|
| `onboarding_approve` | COO, Owner, Manager designado | Aprovar/rejeitar formulários |
| `onboarding_control` | CS, Managers | Gerenciar kanban, mover cards |
| `onboarding_view` | Todos do time | Visualizar kanban (já existe) |

---

### ONB-5.2 — Testes e Validação End-to-End

**Tipo:** Testing
**Complexidade:** Média

#### Cenários de Teste

```
1. HAPPY PATH:
   - Cliente acessa /public/onboarding
   - Preenche todos os campos + senha própria
   - Submete → recebe email de boas-vindas
   - Faz login no portal → vê timeline "Aguardando aprovação"
   - COO acessa admin → vê card em "Aguardando Aprovação"
   - COO aprova → card move para "Gerando Copies"
   - N8N gera copies → webhook callback → card move para "Design"
   - Designer é notificado → trabalha → marca como pronto → card move para "Implementação"
   - Dev é notificado → implementa → marca como pronto → card move para "Concluído"
   - Cliente vê timeline completa com todas as datas

2. REJECTION PATH:
   - COO rejeita com comentário
   - Cliente recebe email de rejeição
   - Cliente pode re-editar? (definir se sim)

3. ERROR PATHS:
   - N8N offline quando COO aprova
   - Email duplicado no formulário
   - Upload de arquivo inválido
   - Webhook com secret inválido
   - Race condition: dois aprovadores ao mesmo tempo

4. RETROCOMPATIBILIDADE:
   - Onboardings existentes continuam funcionando
   - Cards antigos aparecem em coluna legada ou são migrados
```

---

## DIAGRAMA DE INTEGRAÇÃO

```
                     ┌──────────────────┐
                     │   FORMULÁRIO     │
                     │   PÚBLICO        │
                     │ /public/onboard  │
                     └────────┬─────────┘
                              │ POST /api/public/onboarding-form
                              ▼
              ┌───────────────────────────────────┐
              │         APP (Next.js)             │
              │                                    │
              │  1. Criar client                   │
              │  2. Criar store                    │
              │  3. Criar store_onboarding_data    │
              │  4. Criar portal_user (Auth)       │──────▶ Supabase Auth
              │  5. Criar onboarding               │
              │     (phase: pending_approval)      │
              │  6. Gerar briefing                 │
              │  7. Notificar COO                  │
              │  8. Trigger welcome email ──────────│──────▶ N8N (welcome email)
              └───────────────┬────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  COO APROVA        │
                    │  /api/.../approve  │
                    └─────────┬──────────┘
                              │
              ┌───────────────▼───────────────────┐
              │  PhaseService.transition()         │
              │  phase: generating_copies          │
              │  → Trigger N8N copy-generation ────│──────▶ N8N (gera copies)
              │  → Notificar cliente               │──────▶ N8N (email notif)
              └───────────────┬────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  N8N CALLBACK      │ ◀────────────────── N8N retorna copies
                    │  /api/.../webhook  │
                    └─────────┬──────────┘
                              │
              ┌───────────────▼───────────────────┐
              │  PhaseService.transition()         │
              │  phase: design                     │
              │  → notifyByRole(['designer'])      │
              │  → Notificar cliente               │──────▶ N8N (email notif)
              └───────────────┬────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  DESIGNER FINALIZA │ (manual no kanban)
                    └─────────┬──────────┘
                              │
              ┌───────────────▼───────────────────┐
              │  PhaseService.transition()         │
              │  phase: implementation             │
              │  → notifyByRole(['developer'])     │
              │  → Notificar cliente               │──────▶ N8N (email notif)
              └───────────────┬────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  DEV FINALIZA      │ (manual no kanban)
                    └─────────┬──────────┘
                              │
              ┌───────────────▼───────────────────┐
              │  PhaseService.transition()         │
              │  phase: completed                  │
              │  → client.status = 'active'        │
              │  → Notificar cliente               │──────▶ N8N (email notif)
              └────────────────────────────────────┘
```

---

## RESUMO DE ARQUIVOS

### Arquivos a CRIAR (17 arquivos)

| # | Arquivo | Tipo |
|---|---------|------|
| 1 | `supabase/migrations/YYYYMMDD_onboarding_flow_redesign.sql` | Migration |
| 2 | `src/app/api/public/onboarding-form/route.ts` | API Route |
| 3 | `src/app/api/public/upload/route.ts` | API Route |
| 4 | `src/app/api/onboarding/[id]/approve/route.ts` | API Route |
| 5 | `src/app/api/onboarding/pending-approval/route.ts` | API Route |
| 6 | `src/lib/services/portal-account.service.ts` | Service |
| 7 | `src/lib/services/n8n-trigger.service.ts` | Service |
| 8 | `src/lib/services/onboarding-phase.service.ts` | Service |
| 9 | `src/lib/schemas/public-onboarding.schema.ts` | Schema |
| 10 | `src/lib/constants/onboarding-emails.ts` | Constants |
| 11 | `src/app/public/onboarding/page.tsx` | Page |
| 12 | `src/app/public/layout.tsx` | Layout |
| 13 | `src/components/public/public-onboarding-form.tsx` | Component |
| 14 | `src/components/public/public-file-upload.tsx` | Component |
| 15 | `src/components/onboarding/onboarding-approvals.tsx` | Component |
| 16 | `src/components/portal/onboarding-timeline.tsx` | Component |
| 17 | `docs/n8n-workflows-setup.md` | Documentation |

### Arquivos a ALTERAR (12 arquivos)

| # | Arquivo | O Que Muda |
|---|---------|------------|
| 1 | `src/types/onboarding.ts` | Novos status, novos tipos (Approval, PhaseTransition) |
| 2 | `src/components/onboarding/onboarding-kanban.tsx` | Novas colunas por fase, cards redesenhados, botões de ação |
| 3 | `src/components/onboarding/onboarding-tabs.tsx` | Nova aba "Aprovações", ajuste no link público |
| 4 | `src/app/api/onboarding/route.ts` | POST cria com phase `pending_approval` |
| 5 | `src/app/api/onboarding/[id]/route.ts` | PUT usa PhaseService para transições |
| 6 | `src/app/api/onboarding/webhook/route.ts` | copies_generated → transição automática para design |
| 7 | `src/app/api/portal/onboarding/route.ts` | Retornar phase_history + timeline data |
| 8 | `src/app/portal/onboarding/page.tsx` | Adicionar timeline visual |
| 9 | `src/middleware.ts` (ou equivalente) | Permitir rotas /public/* sem auth |
| 10 | `src/lib/rate-limit.ts` | Adicionar preset para formulário público |
| 11 | `.env.example` | Novas variáveis N8N |
| 12 | `.env.local.example` | Novas variáveis N8N |

### Workflows N8N a Criar (fora do app, documentar)

| # | Workflow | Trigger | Output |
|---|----------|---------|--------|
| 1 | Copy Generation | Webhook do app | Callback webhook com copies |
| 2 | Welcome Email | Webhook do app | Envia email |
| 3 | Client Phase Notification | Webhook do app | Envia email por fase |

---

## ORDEM DE EXECUÇÃO RECOMENDADA

```
Sprint 1 (Fundação):
  ├── ONB-1.1: Migração do banco
  ├── ONB-2.5: Motor de transição (core)
  └── ONB-2.1: API pública

Sprint 2 (Fluxo Principal):
  ├── ONB-2.2: Criação de conta automática
  ├── ONB-2.3: API de aprovação
  ├── ONB-2.4: Trigger N8N
  └── ONB-4.1: Webhook copies → design

Sprint 3 (Frontend):
  ├── ONB-3.1: Formulário público (página)
  ├── ONB-3.2: Kanban reestruturado
  ├── ONB-3.3: Dashboard aprovação COO
  └── ONB-3.4: Timeline portal cliente

Sprint 4 (Polish):
  ├── ONB-4.2: Templates de email
  ├── ONB-5.1: Permissões e RLS
  └── ONB-5.2: Testes end-to-end
```

---

## RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Enum ALTER falhar em produção | Baixa | Alto | Testar em staging primeiro. ALTER TYPE ADD VALUE é seguro no PG |
| N8N offline durante aprovação | Média | Médio | Fire-and-forget + retry manual. Não bloquear aprovação |
| Race condition em transições | Baixa | Médio | Optimistic locking com version check no PhaseService |
| Formulário público abusado | Média | Médio | Rate limit agressivo + honeypot + captcha se necessário |
| Onboardings legados quebram | Média | Alto | Manter colunas antigas + migração suave com fallback |
| Volume de emails alto | Baixa | Baixo | Templates no N8N com throttling |

---

*Plano criado por River (SM) com análise técnica de Orion (AIOS Master)*
*Data: 2026-02-25*

— River, removendo obstáculos 🌊
