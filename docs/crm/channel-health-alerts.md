# Alertas de Saúde dos Canais WhatsApp (Evolution)

> Quando uma instância Evolution cai (deslogou no celular, conexão
> quebrou, servidor fora do ar), todos os membros ativos da org recebem
> uma notificação `error` no sino do admin — e ela some sozinha quando a
> conexão volta. Complementa [inbox-notifications.md](./inbox-notifications.md).

## Por que existe

Uma instância desconectada é falha **silenciosa**: mensagens dos clientes
simplesmente param de chegar no inbox, sem nenhum erro visível. Pior: a
instância pode ficar "zumbi" — o config diz `open`, a tela de canais mostra
"Conectado", mas as chamadas à API retornam 500 (caso real: markMessageAsRead
falhando com 500 enquanto a UI mostrava conectado).

## Arquitetura — 3 detectores, 1 service

```
1. TEMPO REAL — webhook connection.update (evolution-processor.ts)
   close + statusCode 401 (deslogou no celular)  → alerta IMEDIATO
   open                                          → limpa alertas
   close genérico → NÃO alerta aqui (Baileys oscila close→connecting→open
   em reconexão normal; alerta prematuro seria ruído) — o cron confirma.

2. USO REAL — envio recusado (channel-client.ts markEvolutionDisconnected)
   provider recusou envio com "not connected"    → alerta IMEDIATO

3. HEALTH CHECK — cron /api/cron/whatsapp-connection-health (*/5 min)
   consulta GET /instance/connectionState de CADA canal evolution ativo:
   open              → corrige drift do config + limpa alertas
   close/connecting  → persiste estado + alerta
   erro/timeout      → alerta "Evolution inacessível" (pega zumbi e
                       servidor fora do ar — o que o webhook nunca entrega)
```

Todos os caminhos convergem no service único
**`src/lib/services/crm-channel-alert.service.ts`**:

- `notifyChannelDisconnected(admin, { channelId, kind, detail? })` — cria a
  notificação para todos os membros ativos da org do canal. **Dedup**:
  enquanto existir alerta ABERTO (read=false) do canal, não cria outro —
  desconexão contínua não re-alerta a cada ciclo.
- `clearChannelAlerts(admin, channelId)` — marca os alertas como lidos
  quando a conexão volta (`open` via webhook ou health check).
- `buildDisconnectReason(kind, detail?)` — texto legível por tipo de falha
  (`logged_out`, `close`, `connecting`, `unreachable`, `send_refused`).
- Tudo best-effort: falha de alerta nunca derruba webhook/cron/envio.

## A notificação

- `type: "error"`, título `WhatsApp desconectado: <display_name|instância>`
- `link: /admin/comercial/canais` (tela com o botão de reconectar/QR)
- Entra no MESMO sistema do sino (tabela `notifications` + realtime +
  `useUnifiedNotifications`) — badge sobe em <2s com a aba aberta.

### Contrato de `metadata` (estável — futuro push mobile)

```jsonc
{
  "source": "crm_channel_alert",   // discriminador
  "channel_id": "<uuid>",
  "org_id": "<uuid>",
  "state": "disconnected",
  "kind": "logged_out|close|connecting|unreachable|send_refused",
  "reason": "texto legível"
}
```

Invariantes:
1. No máximo 1 alerta aberto por canal por usuário (dedup no service).
2. `read: false → true` = conexão voltou (ou usuário marcou como lida).
3. O app mobile pode tratar `source: 'crm_channel_alert'` como notificação
   de ALTA prioridade (canal parado = leads sendo perdidos) — mesmo seam
   descrito em [inbox-notifications.md](./inbox-notifications.md#integração-futura-push-mobile-):
   realtime na tabela `notifications` filtrado por `user_id`, ou dispatch
   FCM/APNs plugado no `notifyChannelDisconnected`.

## Latência de detecção

| Cenário | Detector | Latência |
|---|---|---|
| Deslogou no celular (401) | webhook | segundos |
| Envio falhou "not connected" | send route | imediato no uso |
| Conexão caiu sem 401 | cron | ≤ 5 min |
| Instância zumbi / Evolution fora do ar | cron | ≤ 5 min |

## Verificação manual

1. Desconectar o WhatsApp no celular (Dispositivos conectados → sair) →
   webhook 401 → alerta no sino em segundos.
2. Derrubar o container da Evolution → próximo ciclo do cron (≤5 min) →
   alerta "Evolution API não respondeu".
3. Reconectar (ler QR) → `connection.update open` → alerta some do sino
   de todos os membros.
4. Cron manual: `GET /api/cron/whatsapp-connection-health` com o header
   de cron auth → responde `{ healthy, unhealthy, unreachable }`.
