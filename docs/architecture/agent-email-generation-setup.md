# Agent Email Generation — Setup operacional

Runbook curto para garantir que o pipeline AE (Epic Agent Email Generation)
funciona end-to-end em produção, incluindo notificações de falha e batch
complete (story AE-7).

> ADR de design: `docs/architecture/adr-agent-email-generation.md`
> Stories: `docs/stories/AE-1.*.md` ... `docs/stories/AE-7.notifications-tag-system.md`

---

## 1. Migrations a aplicar (ordem)

```bash
# Em ordem cronológica — supabase migration up roda automatico no deploy.
20260530_agent_email_generation.sql      # AE-1: status enum + profiles.tags + queue_signals
20260530b_email_status_events.sql        # AE-6: audit log + SSE bus
20260530c_copy_ready_dispatch_attempts.sql # AE-4: cap re-dispatch
```

Sanity check pós-migration:

```sql
-- 1) Verificar tags em profiles
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'tags';

-- 2) Verificar status enum aceita os novos valores
SELECT unnest(enum_range(NULL::email_flow_email_status));

-- 3) Verificar índice GIN em profiles.tags
SELECT indexname FROM pg_indexes
WHERE tablename = 'profiles' AND indexname = 'idx_profiles_tags';
```

---

## 2. Configurar tag CTO (pré-requisito de notificações)

Sem nenhum profile marcado como `cto`, as notificações de falha do
pipeline AE não chegam a ninguém — o service loga
`notifyByTag.empty_audience` e segue.

```sql
-- Marcar 1+ profiles como CTO. array_append é idempotente se a tag já existe?
-- NÃO — usar union para idempotência:
UPDATE profiles
SET tags = ARRAY(SELECT DISTINCT unnest(tags || ARRAY['cto']))
WHERE email IN ('cto@convertfy.me', 'tech@convertfy.me');

-- Verificar
SELECT email, tags FROM profiles WHERE 'cto' = ANY(tags);
```

Para remover:

```sql
UPDATE profiles
SET tags = array_remove(tags, 'cto')
WHERE email = 'cto@convertfy.me';
```

### Tags reservadas

| Tag             | Propósito                                                          |
| --------------- | ------------------------------------------------------------------ |
| `cto`           | Recebe alertas de falha do pipeline AE (story AE-7)                |
| `designer_lead` | Reservada — futura rota de QA reprovado                            |
| `cs_lead`       | Reservada — futura rota de batch completo high-touch               |
| `dev`           | Reservada — futura visibilidade de painel debug (AE-6)             |

Adicionar uma nova rota requer apenas chamar
`notificationService.notifyByTag(['nova_tag'], { ... })` — sem mudança
de schema.

---

## 3. Variáveis de ambiente

| Variável                          | Obrigatório | Default                | Onde                       |
| --------------------------------- | ----------- | ---------------------- | -------------------------- |
| `RESEND_API_KEY`                  | Sim p/ email | —                      | Provider transacional      |
| `RESEND_FROM_EMAIL`               | Não         | `noreply@convertfy.com` | Sender                     |
| `RESEND_FROM_NAME`                | Não         | `Convertfy`            | Sender display name        |
| `NEXT_PUBLIC_APP_URL`             | Sim         | —                      | Links em emails/notif      |
| `INTERNAL_SECRET`                 | Sim         | —                      | Watchdog → run-phase2      |
| `WATCHDOG_COPY_TIMEOUT_MIN`       | Não         | `15`                   | Cap copy stuck             |
| `WATCHDOG_PHASE2_TIMEOUT_MIN`     | Não         | `10`                   | Cap rendering/qa stuck     |
| `WATCHDOG_STALE_COPY_READY_MIN`   | Não         | `3`                    | Cap copy_ready stale       |
| `WATCHDOG_STALE_DISPATCH_MAX`     | Não         | `3`                    | Cap re-dispatch attempts   |
| `MAX_GENERATION_ATTEMPTS`         | Não         | `3`                    | Copy retry cap             |
| `EMAIL_QA_BLOCK_SEVERITY`         | Não         | `high`                 | QA threshold (AE-5)        |

Se `RESEND_API_KEY` estiver ausente, o pipeline NÃO trava — apenas as
notificações in-app são criadas e o envio de email loga warn. Permite
roll-out faseado.

---

## 4. Verificar end-to-end

```bash
# Disparar um batch de teste e observar logs do watchdog
curl -X GET "$APP_URL/api/cron/email-generation-watchdog" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Sinais de saúde:

1. `notify.fired` aparece com `recipients_count > 0` quando falhas
   ocorrem.
2. `notifyByTag.empty_audience` **NÃO** aparece — se aparecer, voltar
   ao passo 2.
3. Notificações in-app aparecem em `/admin` (bell).
4. Emails transacionais aparecem em `email_logs` com `status='sent'`.

---

## 5. Troubleshooting

**Sintoma:** notificações in-app aparecem mas email não chega.
→ Verificar `email_logs` por `status='failed'`. Geralmente é
`RESEND_API_KEY` inválida ou domínio não verificado no Resend.

**Sintoma:** dois alertas idênticos no mesmo email.
→ Verificar dedup-key em `notifications.metadata.dedup_key`. A janela é
1h — se passou, é esperado (cron re-rodou após o gap).

**Sintoma:** batch_complete não dispara.
→ Verificar que TODOS os emails do batch atingiram terminal (`ready` ou
`failed`). `checkBatchTerminal` (phase2-runner) e
`safeNotifyBatchTerminalIfDone` (watchdog) só notificam quando o batch
inteiro saiu do estado intermediário.

**Sintoma:** owner do client errado recebendo notificações.
→ `getStoreInvolvedAdmins` resolve via
`client_stores.client_id → clients.owner_id`. Corrigir owner no DB.
