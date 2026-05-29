---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: Draft
Epic: AE - Agent Email Generation
Fase: Notificações
Estimate: M
---

# Story AE-7 — Notificações in-app + email com sistema de tags genérico

## User Story

**Como** time operacional,
**quero** ser notificado quando um batch de emails completa OU quando algum email falha,
**para que** eu possa agir rápido sem precisar checar a página manualmente.

E como CTO,
**quero** receber alertas específicos de falhas de geração via tag `cto`,
**para que** o sistema seja future-proof para outras tags (designer_lead, cs_lead) sem mudar código.

---

## Contexto

A story AE-1 adicionou `profiles.tags TEXT[]`. Esta story implementa o serviço de notificação que:
1. Filtra destinatários por tag (genérico)
2. Envia in-app (tabela `notifications` existente) + email transacional
3. É chamado pelos hooks dispatchados em AE-3 e AE-4

A tabela `notifications` já existe (`001_events_system.sql`):
```sql
notifications (id, user_id, title, body, type, link, read, read_at, event_id, metadata, created_at)
```

E `src/lib/services/notification.service.ts` já tem `notifyByRole`, `create`, `createBulk`. Adicionar `notifyByTag`.

Email transacional: usar provider já configurado (verificar `src/lib/email/` ou env). Se não existir, esta story criar o pattern com `Resend` (padrão moderno).

---

## Acceptance Criteria

### AC AE-7.1 — `notifyByTag` no notification service
- [ ] Em `src/lib/services/notification.service.ts`:
  ```ts
  async notifyByTag(tags: string[], data: Omit<CreateNotificationData,'user_id'>): Promise<number>
  ```
- [ ] Query: `SELECT id, email, name FROM profiles WHERE tags && ARRAY[$tags]` (operator `&&` = qualquer overlap)
- [ ] Se `tags=['cto']` e nenhum profile tem essa tag: retorna 0 + log warn `notifyByTag.empty_audience` com `tags`
- [ ] Cria 1 notification por user (via `createBulk`)
- [ ] Dispara email transacional para cada user (em fila/batch — fora do request principal)
- [ ] Retorna `count` de destinatários

### AC AE-7.2 — Eventos disparados em AE-3 (phase2-runner)
- [ ] Função `notifyEmailFailed({ storeId, emailId, failureReason })`:
  - Cria notification para `notifyByTag(['cto'], ...)`
  - Title: `"Falha na geração de email"`
  - Body: `"Store {nome} — {flow_type} #{number} — {failure_reason}"`
  - Link: `/admin/stores/[id]/emails?email_id=...`
  - Metadata: `{ store_id, email_id, failure_reason, batch_id }`
- [ ] Função `notifyBatchComplete({ storeId, batchId })`:
  - Lê estatísticas do batch (X de Y prontos, Z falhas)
  - Identifica admins envolvidos com a loja (owner do client + assignees de tasks recentes da loja)
  - Cria notification para esses admins
  - Title: `"Batch de emails completo — {store_name}"`
  - Body: `"{ready} de {total} emails prontos. {failed} falharam."`
  - Link: `/admin/stores/[id]/emails`
- [ ] Função `notifyBatchAllFailed({ storeId, batchId })`:
  - Disparado quando 100% dos emails do batch acabaram em `failed`
  - Notifica `tags=['cto']` com title `"Batch totalmente falhou — {store_name}"`
  - Severity alta no email

### AC AE-7.3 — Quem é "admin envolvido com a loja"
- [ ] Definição: `client_stores.client_id → clients.owner_id` (profile owner do cliente)
- [ ] Plus: assignees ativos em `deals`/`tasks` da loja nos últimos 30 dias (best-effort)
- [ ] Se conjunto vazio: fallback para todos profiles com `role IN ('admin','owner','cs')`
- [ ] Função `getStoreInvolvedAdmins(storeId): Promise<{id, email, name}[]>` — **estender** `src/lib/agents/generation-notify.service.ts` existente (já tem `notifyGenerationError`, `notifyBatchComplete`), não criar arquivo novo

### AC AE-7.4 — Email transacional
- [ ] **Reusar** `emailService.send({ to, subject, html })` existente (já em uso por `generation-notify.service.ts`). Verificar provider real no service antes de implementar — pode ser Resend, Postmark, Supabase Auth, ou customizado.
- [ ] Se função utilitária pra batch ainda não existir, criar `sendTransactionalBatch` chamando `emailService.send` em loop com `Promise.allSettled`
- [ ] Não criar novo provider — só estender o que tem
- [ ] Templates simples reusando os já existentes em `src/lib/agents/templates/error-email.template.ts` e `success-email.template.ts` quando aplicável
- [ ] Templates simples (não-HTML rich) suficiente nesta fase:
  ```
  Subject: [Convertfy] {title}
  Body: {body}
  ---
  Ver no admin: {APP_URL}/admin/stores/.../emails
  ```
- [ ] Não bloqueia: `Promise.allSettled` no envio batch; falhas logadas mas não throw

### AC AE-7.5 — Preferências por usuário
- [ ] Tabela existente `user_notification_preferences` (verificar — Epic 9.3 menciona)
- [ ] Se existir: respeitar `email_enabled` por tipo
- [ ] Tipo novo: `email_generation_failure`, `email_generation_batch_complete`
- [ ] Default: ambos `true` para todas as tags (opt-out, não opt-in)
- [ ] Se tabela não existir: out-of-scope desta story; documentar para futuro

### AC AE-7.6 — Idempotência
- [ ] Antes de criar notification: dedup-key em `notifications.metadata.dedup_key = '{eventType}:{storeId}:{batchId or emailId}'`
- [ ] Query antes de insert: `SELECT 1 FROM notifications WHERE metadata->>'dedup_key' = $key AND created_at > now() - interval '1 hour'`
- [ ] Se já existe: skip + log info
- [ ] Garante que watchdog re-disparando não duplique notificações

### AC AE-7.7 — UI: bell de notificações
- [ ] Componente existente provavelmente em `src/components/layout/notifications-bell.tsx` ou similar
- [ ] Subscrever SSE de notificações OU polling (verificar implementação atual — esta story NÃO altera UI da bell, apenas garante que notifications criadas aqui aparecem)
- [ ] Click na notification: navega para `metadata.link` (ou `link` column)

### AC AE-7.8 — Logs e telemetria
- [ ] `log.info('notify.fired', { event_type, recipients_count, tags })`
- [ ] `log.warn('notify.empty_audience', { tags })` — alerta para CTO setup
- [ ] `log.error('notify.email_failed', { user_id, error })`
- [ ] Métrica acessível via query: count por event_type por dia (sem dashboard, apenas log queryable)

### AC AE-7.9 — Seed inicial (documentação)
- [ ] README adicionado: `docs/architecture/agent-email-generation-setup.md` (curto) com instrução:
  ```sql
  -- Antes do deploy em prod, marcar ao menos 1 profile como CTO:
  UPDATE profiles SET tags = array_append(tags, 'cto') WHERE email = 'cto@convertfy.me';
  ```
- [ ] Aviso no log de startup do app: se 0 profiles com tag CTO existem, log warn "Nenhum profile com tag CTO — notificações de falha não chegarão a ninguém"

### AC AE-7.10 — Testes
- [ ] Teste: `notifyByTag(['cto'])` com 2 profiles taggeados → 2 notifications + 2 emails enviados
- [ ] Teste: `notifyByTag(['inexistente'])` → 0 notifications + log warn
- [ ] Teste: dedup-key impede duplicação dentro de 1h
- [ ] Teste: `notifyBatchComplete` com 0 admins envolvidos → fallback para todos admins/owners

---

## Tarefas

- [ ] Estender `src/lib/services/notification.service.ts` com `notifyByTag`
- [ ] Criar `src/lib/services/email-generation-notify.service.ts` com `notifyEmailFailed`, `notifyBatchComplete`, `notifyBatchAllFailed`, `getStoreInvolvedAdmins`
- [ ] Criar `src/lib/email/transactional.service.ts` (se não existir)
- [ ] Integrar chamadas em `phase2-runner.service.ts` (AE-3) e no watchdog (AE-4)
- [ ] Adicionar `RESEND_API_KEY` em `.env.example` (opcional)
- [ ] Criar `docs/architecture/agent-email-generation-setup.md` (operations runbook curto)
- [ ] Testes em `src/lib/services/notification.service.test.ts` + `email-generation-notify.service.test.ts`

---

## Dev Notes

### Padrão de tags como sistema genérico

Decisão arquitetural: `profiles.tags` é open-ended. Hoje usamos `cto`. No futuro:
- `designer_lead` — recebe alertas de QA reprovado
- `cs_lead` — recebe alertas de batch completo de clientes high-touch
- `dev` — vê painel debug em AE-6
- `qa` — recebe alertas de discordância QA agent vs review humana

Nenhuma dessas precisa mudança de código além de `notifyByTag([...])`.

### Dedup-key pattern

```ts
const dedupKey = `email_gen_failed:${storeId}:${emailId}`
const { data: existing } = await admin.from('notifications')
  .select('id').contains('metadata', { dedup_key: dedupKey })
  .gte('created_at', new Date(Date.now() - 60*60*1000).toISOString())
  .limit(1).maybeSingle()
if (existing) { log.info('notify.skipped_dedup', { dedupKey }); return }
```

### Anatomia da query Postgres array overlap

```sql
-- Profiles com QUALQUER uma das tags:
SELECT * FROM profiles WHERE tags && ARRAY['cto','designer_lead']::text[]

-- Profiles com TODAS as tags:
SELECT * FROM profiles WHERE tags @> ARRAY['cto','designer_lead']::text[]
```

Esta story usa `&&` (overlap) por padrão — se chamarem com 1 tag o comportamento é correto.

### Email transactional sem provider

Se `RESEND_API_KEY` não estiver definida: a função `sendTransactional` apenas loga warn e retorna `{ skipped: true }`. Notificação in-app continua funcionando. Permite roll-out faseado.

---

## Reuso de padrões existentes

- `src/lib/services/notification.service.ts` — service base já existe
- `notifications` table — já existe
- `createBulk` — já existe
- `notifyByRole` — referência para o padrão de `notifyByTag`
- Logger: `src/lib/logger`
- Bell de notificações: provavelmente já existe (não alterar)

---

## File List

### A criar
- `src/lib/services/email-generation-notify.service.ts`
- `src/lib/email/transactional.service.ts` (se não existir)
- `src/lib/services/email-generation-notify.service.test.ts`
- `docs/architecture/agent-email-generation-setup.md`

### A modificar
- `src/lib/services/notification.service.ts` — adicionar `notifyByTag`
- `src/lib/agents/phase2-runner.service.ts` (AE-3) — chamar notify hooks
- `src/app/api/cron/email-generation-watchdog/route.ts` (AE-4) — chamar notify hooks
- `.env.example` — adicionar `RESEND_API_KEY` (se aplicável)

---

## Dependencias

- **Bloqueado por**: AE-1 (`profiles.tags`)
- **Bloqueia**: nada — pipeline funciona sem notificações, mas operação fica cega

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Tag `cto` vazia no início | Alta | Log warn explícito + runbook |
| Email transacional spam-classificado | Baixa | Provider confiável (Resend); SPF/DKIM já configurados no domínio |
| Dedup-key colide entre eventos diferentes | Baixa | Key inclui event_type explicitamente |
| Notificações em loop (cascata) | Baixa | Dedup 1h previne; só dispara em transição de estado |
| Owner de client não existe (legado) | Média | Fallback para `role IN ('admin','owner','cs')` |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
