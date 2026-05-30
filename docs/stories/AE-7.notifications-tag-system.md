---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: In Review
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
- [x] Em `src/lib/services/notification.service.ts`:
  ```ts
  async notifyByTag(tags: string[], data: Omit<CreateNotificationData,'user_id'>): Promise<number>
  ```
- [x] Query: `SELECT id, email, name FROM profiles WHERE tags && ARRAY[$tags]` (operator `&&` = qualquer overlap)
- [x] Se `tags=['cto']` e nenhum profile tem essa tag: retorna 0 + log warn `notifyByTag.empty_audience` com `tags`
- [x] Cria 1 notification por user (via insert direto com admin client — `createBulk` legacy usa browser client, ver decisão abaixo)
- [x] Email transacional sai do orquestrador (generation-notify), não do `notifyByTag` — separação de concerns
- [x] Retorna `count` de destinatários

### AC AE-7.2 — Eventos disparados em AE-3 (phase2-runner)
- [x] Função `notifyEmailFailed({ storeId, emailId, failureReason, batchId })`:
  - Cria notification para `notifyByTag(['cto'], ...)`
  - Title: `"Falha na geracao de email"`
  - Body: `"Store {nome} - {flow_type} #{number} - {failure_reason}"`
  - Link: `/admin/stores/[id]/emails?email_id=...`
  - Metadata: `{ dedup_key, store_id, email_id, failure_reason, batch_id }`
- [x] Função `notifyBatchComplete({ storeId, batchId })`:
  - Lê estatísticas do batch (X de Y prontos, Z falhas)
  - Identifica admins envolvidos via `getStoreInvolvedAdmins`
  - Cria notification + envia email
- [x] Função `notifyBatchAllFailed({ storeId, batchId })`:
  - Disparado quando 100% dos emails do batch acabaram em `failed`
  - Notifica `tags=['cto']` com title `"Batch totalmente falhou - {store_name}"`
  - Email usa template de erro (severity alta)

### AC AE-7.3 — Quem é "admin envolvido com a loja"
- [x] Definição: `client_stores.client_id → clients.owner_id` (profile owner do cliente)
- [x] Plus: deal owners ativos nos últimos 30 dias para o client (best-effort) — tasks não está disponível na story, deals cobrem o uso atual
- [x] Se conjunto vazio: fallback para todos profiles com `role IN ('admin','owner','cs')`
- [x] Função `getStoreInvolvedAdmins(storeId): Promise<{id, email, name}[]>` adicionada ao `generation-notify.service.ts` existente (NÃO criou arquivo novo)

### AC AE-7.4 — Email transacional
- [x] Reutiliza `emailService.send({ to, subject, html })` existente (Resend via `src/lib/email/email.service.ts` — provider já configurado)
- [x] `sendTransactionalBatch` interno usa `Promise.allSettled` — falhas logadas, não throw
- [x] Não criou novo provider
- [x] Templates: reusa `error-email.template.ts` e `success-email.template.ts` (já em uso pelo notifyGenerationError/notifyGenerationBatchComplete legacy)
- [x] Não bloqueia: try/catch envolvendo o envio garante que falha de email nunca derruba o pipeline

### AC AE-7.5 — Preferências por usuário
- [ ] Tabela `user_notification_preferences` — não verificado / out-of-scope desta story. Documentado para futuro epic.

### AC AE-7.6 — Idempotência
- [x] Antes de criar notification: dedup-key em `notifications.metadata.dedup_key`
- [x] Query antes de insert via `.contains('metadata', { dedup_key })` + `gte('created_at', now-1h)`
- [x] Se já existe: skip + log `notify.skipped_dedup`
- [x] Garante que watchdog re-disparando não duplica
- [x] Testado: 2ª chamada `notifyEmailFailed` em <1h não cria nova notification nem envia email

### AC AE-7.7 — UI: bell de notificações
- [ ] Não alterado nesta story — bell consome `notifications` table normalmente. Validar em staging com profile taggeado como `cto`.

### AC AE-7.8 — Logs e telemetria
- [x] `log.info('notify.fired', { event_type, recipients_count, tags, store_id, ... })`
- [x] `log.warn('notifyByTag.empty_audience', { tags })`
- [x] `log.warn('notify.email.batch_partial', { sent, failed, total })` em falha parcial de envio
- [x] Métrica queryable via logs estruturados

### AC AE-7.9 — Seed inicial (documentação)
- [x] `docs/architecture/agent-email-generation-setup.md` adicionado com seção "Configurar tag CTO" + SQL idempotente + variáveis de ambiente
- [ ] Aviso no log de startup do app — out-of-scope. O warn `notifyByTag.empty_audience` cobre runtime mas não startup.

### AC AE-7.10 — Testes
- [x] Teste: `notifyByTag(['cto'])` com 2 profiles taggeados → 2 notifications + 2 emails
- [x] Teste: `notifyByTag(['inexistente'])` → 0 notifications
- [x] Teste: dedup-key impede duplicação dentro de 1h
- [x] Teste: `notifyBatchComplete` chama owner do client; `getStoreInvolvedAdmins` cai pra role fallback quando vazio

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
| 2026-05-30 | @dev (Dex) | AE-7 implementada: notifyByTag + notifyEmailFailed/notifyBatchComplete/notifyBatchAllFailed + getStoreInvolvedAdmins. ESTENDEU `generation-notify.service.ts` existente (não criou novo). Watchdog (AE-4) e phase2-runner (AE-3) substituíram mocks por dispatchers reais. 9/9 testes verdes; typecheck/lint OK. Status: Draft → In Review. |
