# WhatsApp — Núcleo de Atendimento (setup e operação)

Porte da integração WhatsApp Cloud API do worder para o modelo `crm_*`
da convertfy. Cobre: webhook resiliente com fila durável (QStash),
mídia in/out via Supabase Storage, janela de 24h real, templates Meta,
quick replies, read receipts, atribuição de agente e realtime no inbox
(`/admin/inbox`).

## Arquitetura (resumo)

```
Meta → POST /api/webhooks/whatsapp (HMAC)
     → INSERT crm_webhook_events (payload cru, ANTES de processar)
     → ENABLE_ASYNC_WEBHOOK=true ? QStash → /api/workers/whatsapp-webhook
                                 : processa inline (claim atômico)
     → webhook-processor: thread upsert → mídia → crm_messages
       (idempotente) → RPC open_crm_thread_window (janela 24h)

Falhou em qualquer ponto? cron whatsapp-reprocess-webhooks (1min)
re-tenta com claim atômico até max_attempts (depois marca dead + loga).
```

Código: `src/lib/whatsapp/*` (client v22, processor, mídia, templates,
fila) · rotas em `src/app/api/webhooks/whatsapp`, `src/app/api/workers/
whatsapp-webhook`, `src/app/api/crm/inbox/*`, `src/app/api/crm/whatsapp/
templates` · UI em `src/components/crm/inbox/*`.

## Setup (ordem importa)

### 1. Migration (ANTES do deploy do código)

Aplicar `supabase/migrations/20260812_whatsapp_core_messaging.sql` no
banco de produção (idempotente — rodável 2x). Cria: colunas de janela
em `crm_threads`, colunas de mídia em `crm_messages`,
`crm_whatsapp_templates`, `crm_quick_replies`, `crm_webhook_events`,
6 RPCs, publication realtime e o bucket `whatsapp-media`.

> O repo tem a convenção `APPLY_MANUALLY_*`/`CONSOLIDATED_production_apply.sql`
> — siga o fluxo usual de aplicação manual se for o caso.

### 2. Env vars (Vercel)

| Var | Obrigatória | Uso |
|---|---|---|
| `WHATSAPP_APP_SECRET` | já existe | HMAC do webhook |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | já existe | GET verify |
| `ENCRYPTION_KEY` (64 hex) | já existe | cifra do access_token do canal |
| `ENABLE_ASYNC_WEBHOOK` | recomendada `true` | `false` = processa inline (sem QStash) |
| `QSTASH_TOKEN` | se async | publish na fila |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | se async | assinatura do worker |
| `QSTASH_URL` | opcional | endpoint regional (GeoDNS do global já falhou em prod no worder) |
| `NEXT_PUBLIC_APP_URL` | já existe | URL do worker no enqueue |
| `UPSTASH_REDIS_REST_URL/TOKEN` | opcional | rate limit 80/s por org no envio (fail-open sem) |

QStash: criar em https://console.upstash.com/qstash → copiar token e as
duas signing keys.

### 3. Tokens dos canais (uma vez)

Os `access_token` em `crm_channels.config` estavam em texto plano. Após
o deploy, rodar:

```bash
npx tsx scripts/encrypt-whatsapp-channel-configs.ts
```

Idempotente (pula tokens já cifrados). Enquanto não rodar, tudo continua
funcionando — `decrypt()` tem passthrough de plaintext.

### 4. Webhook na Meta

**Nada a fazer** — a URL continua `/api/webhooks/whatsapp` (GET verify e
POST). Se criar um canal novo: registrar a URL + verify token no painel
da Meta e assinar os campos `messages` e `message_template_status_update`.

### 5. Primeira sincronização de templates

No inbox, abrir o picker de templates (ícone 📄 no composer) → botão
"Sincronizar" — ou `POST /api/crm/whatsapp/templates` com
`{ channel_id, action: "sync" }`. Depois o cron mantém (15min).

## Crons (vercel.json)

| Cron | Schedule | Função |
|---|---|---|
| `whatsapp-reprocess-webhooks` | `* * * * *` | rede de segurança da fila (claim + processa pendentes >60s; loga dead) |
| `whatsapp-close-windows` | `*/10 * * * *` | fecha janelas de 24h expiradas |
| `whatsapp-resync-templates` | `*/15 * * * *` | sync de templates por canal + alerta de PENDING >60min |
| `whatsapp-prune-webhook-events` | `0 3 * * *` | apaga eventos done >7 dias |

## Decisões e limitações conhecidas

- **Janela de 24h**: cada inbound reabre (+24h, RPC). Fora da janela o
  backend bloqueia free-form (422 `WINDOW_EXPIRED`) e a UI desabilita o
  composer oferecendo template.
- **Mídia inbound** é baixada da Meta no processamento e persistida no
  bucket privado `whatsapp-media` (signed URL 1h; a UI renova via
  `GET .../media?message_id=`). Mensagens antigas com `wa-media:{id}`
  são resolvidas lazy — media_id da Meta expira em ~30d; expirado → UI
  mostra "mídia indisponível" (sem backfill batch por design).
- **Áudio**: gravador prefere `audio/ogg;codecs=opus` (Meta rejeita
  webm); browser sem suporte recebe erro claro. Transcodificação = fase 2.
- **Realtime**: `crm_threads`/`crm_messages` na publication. RLS dessas
  tabelas é permissiva (padrão crm_*) → eventos chegam a qualquer
  usuário autenticado do admin; o payload só dispara revalidação SWR,
  que filtra server-side por org.
- **Adapter legado**: `whatsapp-cloud.service.ts` mantém as assinaturas
  antigas sobre o client novo — acompanhamento, automação do CRM e
  onboarding não mudaram.
- **Fase 2 (fora do núcleo)**: CSAT, transferência entre agentes,
  copiloto IA, notas com anexos, payment links, catálogo, opt-out
  guard, auto-resposta IA, crons de saúde (quality/heartbeat).
