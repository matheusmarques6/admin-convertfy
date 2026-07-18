# Notificações do Inbox Comercial (CRM)

> Cada mensagem recebida no inbox (`/admin/inbox`) gera uma notificação no
> sino do admin. Ela some quando a conversa é vista. Este documento é a
> referência da arquitetura e o **contrato de integração para o futuro app
> mobile de push**.

## Arquitetura

```
Mensagem chega (WhatsApp Cloud API ou Evolution/Baileys)
  │
  ▼
Webhook (/api/webhooks/whatsapp | /api/webhooks/evolution/[secret])
  → persiste em crm_webhook_events (fila durável)
  → processor insere em crm_messages (upsert idempotente)
  │
  ▼  somente quando o insert foi REAL (não duplicata)
notifyCrmInboundMessage()                    ← produtor ÚNICO
  → resolve destinatários (assigned_to ∨ membros ativos da org)
  → RPC upsert_crm_inbox_notification (coalescência atômica em SQL)
  │
  ▼
Tabela notifications (INSERT ou UPDATE coalescido)
  │
  ▼  Supabase Realtime (publication supabase_realtime, INSERT + UPDATE)
useUnifiedNotifications → badge do sino sobe (sidebar-user / mobile-top-bar)
  e a notificação aparece em /admin/notifications

Agente abre a thread (POST /read) ou responde (POST /messages,
ou fromMe pelo celular via Evolution)
  → clearCrmThreadNotifications()  → read=true para TODOS os destinatários
  → Realtime UPDATE → badge zera
```

### Arquivos

| Papel | Arquivo |
|---|---|
| Service (produtor + clear) | `src/lib/services/crm-inbox-notification.service.ts` |
| Migration (índice + RPC) | `supabase/migrations/20260718_crm_inbox_notifications.sql` |
| Produtor Cloud API | `src/lib/whatsapp/webhook-processor.ts` (`handleInboundMessage`, bloco `if (inserted)`) |
| Produtor/clear Evolution | `src/lib/whatsapp/evolution-processor.ts` (`handleEvolutionMessage`) |
| Clear ao abrir a conversa | `src/app/api/crm/inbox/threads/[id]/read/route.ts` |
| Clear ao responder | `src/app/api/crm/inbox/threads/[id]/messages/route.ts` |
| Deep-link | `src/app/admin/inbox/page.tsx` → `InboxView({ initialThreadId })` |
| Badge/sino (já existia) | `src/hooks/use-unified-notifications.ts`, `src/components/layout/sidebar-user.tsx`, `mobile-top-bar.tsx` |
| Testes | `src/lib/services/crm-inbox-notification.service.test.ts` |

## Regras de negócio

**Destinatários** (`pickRecipients`):
- Thread com `assigned_to` apontando para um membro **ativo** da org → só o
  responsável recebe.
- Thread sem responsável (ou responsável inativo/fora da org) → **todos** os
  membros ativos da org recebem — ninguém perde lead sem dono.

**Coalescência** — 1 notificação aberta por `(thread, user)`:
- 1ª mensagem: `"Nova mensagem de <contato>"` + preview.
- Mensagens seguintes com a notificação ainda aberta: a MESMA linha é
  atualizada — `"N novas mensagens de <contato>"`, preview da última,
  `metadata.message_count` incrementado e `created_at` recebe bump (sobe no
  topo do sino; o realtime UPDATE revalida o badge).
- A coalescência vive **em SQL** (RPC + unique partial index
  `uniq_notifications_crm_inbox_open`), não em TypeScript: webhooks
  concorrentes da mesma thread (a Meta reenvia eventos; clientes mandam
  rajadas) fariam SELECT-depois-INSERT duplicar. `ON CONFLICT` garante
  atomicidade sob qualquer concorrência.

**Clear GLOBAL** — a notificação some para **todos** os destinatários quando
*qualquer* agente:
- abre a conversa no inbox (`POST /api/crm/inbox/threads/[id]/read` — o mesmo
  endpoint que zera `crm_threads.unread_count` e envia read receipt à Meta);
- responde pelo inbox (`POST .../messages`);
- responde pelo celular (Evolution `fromMe=true` espelhada como outbound).

Racional: `crm_threads.unread_count` é global (não por usuário). Clear
por-usuário criaria um modelo híbrido inconsistente — o inbox mostraria a
conversa como lida enquanto o sino de outros membros ainda acusaria pendência
já atendida por um colega. O sino espelha exatamente o estado do inbox.

**Preview** (`buildNotificationPreview`): texto truncado em 120 chars; mídia
vira label (`📷 Imagem`, `🎤 Áudio`, `🎬 Vídeo`, `📄 Documento`, `Figurinha`,
`📍 Localização`, `👤 Contato`); corpo vazio → `"Nova mensagem"`.

**Best-effort em todo lugar**: nenhuma função do service lança. Falha de
notificação NUNCA falha o webhook (que precisa responder 200 à Meta) nem as
rotas do inbox. Erros viram `log.warn`.

## Contrato de `notifications.metadata` (estável — API de integração)

Toda notificação do inbox carrega:

```jsonc
{
  "source": "crm_inbox",          // discriminador — filtre por ele
  "thread_id": "<uuid>",          // conversa no inbox (string)
  "org_id": "<uuid>",             // organização (string)
  "message_count": 3,             // mensagens coalescidas nesta notificação
  "last_message_id": "<uuid>"     // última crm_messages.id incluída
}
```

Campos da linha: `user_id` (destinatário), `title`, `body` (preview),
`type='info'`, `link='/admin/inbox?thread=<thread_id>'`, `read`, `read_at`,
`created_at` (bump a cada coalescência).

**Invariantes que integradores podem assumir:**
1. No máximo **1 linha com `read=false`** por `(thread_id, user_id)` —
   garantido pelo índice único parcial.
2. `read` transiciona `false → true` quando a conversa é vista; nunca volta.
   Uma nova mensagem depois disso cria uma **nova** linha.
3. UPDATE com `read=false` e `created_at` alterado = coalescência (nova
   mensagem na mesma conversa). UPDATE com `read=true` = conversa vista.

## Deep-link

`/admin/inbox?thread=<id>` abre a conversa direto (prop `initialThreadId` do
`InboxView`). Ao abrir, o `useEffect` existente dispara o `POST /read` — ou
seja, **seguir o link da notificação já a faz sumir**, sem código extra.

## Integração futura: push mobile 📱

O **seam** é o service: `notifyCrmInboundMessage` é o produtor único — todo
push de "mensagem nova" deve ser disparado ali (após o RPC retornar), e todo
"remover push do device" se ancora no clear. Duas opções, em ordem de esforço:

### Opção A — app assina o Supabase Realtime (menor esforço)

O app mobile (logado com a sessão Supabase do usuário) assina:

```ts
supabase
  .channel("mobile-notifications")
  .on("postgres_changes",
    { event: "*", schema: "public", table: "notifications",
      filter: `user_id=eq.${userId}` },
    (payload) => {
      const meta = payload.new?.metadata
      if (meta?.source !== "crm_inbox") return
      if (payload.new.read === false) showLocalNotification(payload.new)
      else dismissNotification(meta.thread_id)   // clear → remove do device
    })
  .subscribe()
```

- Entrega governada pela RLS existente (`user_id = auth.uid()`).
- O evento UPDATE de clear permite **remover** a notificação do celular
  quando alguém atende no desktop — invariante 3 acima.
- Limitação: exige o app vivo/backgroundável escutando o socket; para push
  real com o app morto, use a Opção B.

### Opção B — push server-side (FCM/APNs)

1. Nova tabela `device_push_tokens (id, user_id → profiles, platform
   'ios'|'android', token, created_at, last_seen_at)` + endpoint
   `POST /api/mobile/push-tokens` para o app registrar o token.
2. Em `notifyCrmInboundMessage`, após o RPC: buscar tokens dos `recipients` e
   despachar via FCM/APNs (payload: `title`, `body`, `link`, e o `metadata`
   completo — o app usa `thread_id` para deep-link e agrupamento nativo por
   conversa, `collapse_key`/`thread-id` = `thread_id`).
3. Em `clearCrmThreadNotifications`: despachar push silencioso de dismiss
   (mesmo `collapse_key`) para remover a notificação dos devices.
4. Manter o mesmo caráter best-effort: falha de push nunca propaga.

Em ambas as opções, **nada muda nos produtores/consumidores** — só o service
cresce. Esse é o motivo de ele ser o produtor único.

### Fora do escopo atual (pluga no mesmo seam)

- Instagram inbound (`/api/webhooks/instagram`): basta chamar
  `notifyCrmInboundMessage` no ponto de insert da mensagem, como os
  processors de WhatsApp.

## Edge cases conhecidos

- **Duplicatas Meta/Evolution**: os processors só notificam quando o upsert
  em `crm_messages` inseriu de fato (`insertedRows.length > 0`) — retries e
  ecos não geram notificação.
- **Thread já aberta na tela**: o `POST /read` dispara quando `activeThreadId`
  muda; mensagem nova com a conversa já aberta mantém a notificação até o
  próximo open/reply (mesmo comportamento pré-existente do `unread_count`).
- **Reatribuição de thread com notificação pendente**: a notificação do
  destinatário antigo persiste até o próximo clear global.
- **`contact_name` nulo**: o título usa `contact_external_id` (telefone).
- **Clear × insert simultâneos**: se o clear rodar antes do insert commitar,
  a notificação sobrevive até o próximo open/reply — janela de milissegundos.

## Verificação manual

1. Enviar WhatsApp ao número conectado → badge do sino sobe em <2s.
2. Enviar 2ª mensagem → mesma notificação vira "2 novas mensagens de …".
3. Abrir a conversa no inbox → notificação some para todos os membros.
4. Thread com responsável → só ele recebe.
5. Clicar na notificação em `/admin/notifications` → abre
   `/admin/inbox?thread=<id>` com a conversa ativa e a notificação some.
6. RPC no SQL editor: 2 chamadas com mesma thread/user → 1 linha,
   `message_count=2`; após `read=true`, nova chamada cria linha nova.
