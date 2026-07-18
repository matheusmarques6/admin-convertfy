# Push no celular via Pushover

> Camada de push por cima do sino do admin. Fase 0 (atual): todo push
> vai para UM celular piloto via env. O sino in-app continua para todos.
> Complementa [inbox-notifications.md](./inbox-notifications.md) e
> [channel-health-alerts.md](./channel-health-alerts.md).

## Por que Pushover

Sem app próprio, sem FCM/APNs, sem tokens de device: cada pessoa instala
o app do Pushover (pago 1x, ~US$5/plataforma após trial) e nós fazemos um
POST HTTP. API: https://pushover.net/api.

## Arquitetura (Fase 0)

```
notifyCrmInboundMessage()  ──(notificação NASCEU p/ a conversa)──► sendPilotPush()
notifyChannelDisconnected() ──(alerta criado, dedup 1/queda)─────► sendPilotPush(priority=1)
                                                                      │
                                                POST api.pushover.net/1/messages.json
                                                (PUSHOVER_PILOT_USER_KEY)
```

Service: `src/lib/services/pushover.service.ts`. Best-effort SEMPRE —
falha de push nunca derruba webhook/rota (mesma filosofia do sino).

## Regras de disparo

| Evento | Quando dispara push | Prioridade | TTL |
|---|---|---|---|
| Mensagem inbound no inbox | Só quando a notificação da conversa **nasce** (primeira não-lida). Mensagens seguintes só coalescem no sino — rajada de 10 msgs = 1 push. Conversa lida + msg nova = novo push. | 0 (normal) | 24h (auto-limpa do celular) |
| Instância Evolution caiu | 1 por queda (dedup do alerta no sino). | `PUSHOVER_ALERT_PRIORITY` (default **1**) | — (não expira) |

**Prioridades Pushover**: `0` = som/vibração conforme configuração do
usuário no app, respeita quiet hours; `1` = ignora quiet hours, sempre
toca, destacada em vermelho. `2` (emergency, re-alerta até confirmar)
NÃO é usada — exigiria retry/expire e é para on-call formal.

## Envs (Vercel)

| Env | Valor |
|---|---|
| `PUSHOVER_APP_TOKEN` | Token da application (criar em pushover.net/apps/build) |
| `PUSHOVER_PILOT_USER_KEY` | User key do celular piloto (dashboard do Pushover) |
| `PUSHOVER_ALERT_PRIORITY` | `1` (default) ou `0` para alertas de canal |

Sem as envs → no-op silencioso (nenhum log de erro, push simplesmente
desligado).

## Setup do zero (10 min)

1. Criar conta em pushover.net + instalar o app no celular (trial 30d).
2. Copiar a **User Key** do dashboard → `PUSHOVER_PILOT_USER_KEY`.
3. Criar application "Convertfy Admin" em pushover.net/apps/build →
   copiar o **API Token** → `PUSHOVER_APP_TOKEN`.
4. Redeploy. Testar: mandar DM ao número conectado → push em segundos.

## Quota e limites

- **10.000 msgs/mês por conta** (grátis). Fase 0 = 1 destinatário, então
  ~1 push por conversa nova por dia — folga enorme.
- O service loga `warn` quando `X-Limit-App-Remaining` < 1.000.
- Estourou → HTTP 429 até o dia 1 (Central Time); o sino segue normal.
- Máx. 2 conexões concorrentes na API (irrelevante no nosso volume).

## Limitações conhecidas

- **Push não some quando a conversa é lida** (Pushover não tem dismiss
  fora de emergency). O TTL de 24h limpa os antigos; o sino é o estado real.
- Sem agrupamento no device — por isso o disparo é só na primeira
  mensagem não-lida da conversa.

## Fase 1 (futura) — key por usuário

1. Guardar `pushover_user_key` por usuário (tabela `notification_preferences`).
2. Tela em Configurações: colar key + botão Validar
   (`POST /1/users/validate.json`) + toggles por fonte.
3. `sendPilotPush` vira `sendPush(userKeys[])` — até 50 keys num único
   request (separadas por vírgula no param `user`).
4. Destinatários = os mesmos do sino (responsável ∨ broadcast) filtrados
   por quem tem key configurada.
