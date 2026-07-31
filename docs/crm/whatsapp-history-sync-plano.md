# Importar histórico do WhatsApp — plano e implementação

Decisão tomada: **o histórico é necessário.** Este documento mapeia o que
precisa mudar e por que este desenho é o mais seguro entre os possíveis.

Riscos e a decisão que os aceitou estão em
[`whatsapp-history-sync-riscos.md`](./whatsapp-history-sync-riscos.md).
Aqui o foco é execução.

> **Status: implementado** (migration `20261065_whatsapp_history_import.sql`).
> Ambiente confirmado: Evolution **2.3.7** com `DATABASE_SAVE_DATA_HISTORIC=true`
> e `DATABASE_SAVE_DATA_CHATS=true` — os dois pré-requisitos do modelo pull.
> Falta apenas rodar a migration, dar deploy e executar o teste da seção 8.

---

## 1. O insight que define o desenho

Separar o que **fala com o WhatsApp** do que é **tráfego interno**:

| Etapa | Fala com o WhatsApp? | Risco de banimento |
|---|---|---|
| Parear com `syncFullHistory` | **Sim** — uma vez, no QR | **Todo o risco está aqui** |
| Evolution grava o histórico no banco dela | Não | Nenhum |
| Nós lermos esse banco, em páginas | Não | Nenhum |
| Persistir em `crm_messages` | Não | Nenhum |

Ou seja: **o risco de banimento acontece uma vez, no pareamento, e não
aumenta com o tamanho da importação.** Depois que o histórico está na
Evolution, podemos ler no ritmo que quisermos — é HTTP entre dois
servidores nossos.

Daí a regra do desenho: **puxar (pull), nunca receber empurrado (push).**

### Por que não receber por webhook

Assinar `MESSAGES_SET` entrega o histórico inteiro num único POST. Isso
bate no limite de 4,5 MB do Vercel e toma `413` **antes do nosso código
rodar** — sem persistência, sem retry, sem log. É o pior modo de falha:
silencioso. Com pull, o tamanho de cada página é decisão nossa.

---

## 2. Fluxo proposto

```
[1] Reparear o número com syncFullHistory=true
    └─ único momento de exposição; a Evolution grava o histórico no banco dela

[2] Operador clica "Importar histórico" no canal
    └─ cria um JOB (não processa nada no request)

[3] Cron processa o job em páginas, com cursor e budget de tempo
    ├─ lê uma página da Evolution
    ├─ persiste reusando o caminho já testado do webhook (modo importação)
    ├─ salva o cursor e os contadores
    └─ acabou o tempo? devolve — a próxima execução retoma do cursor

[4] Fim: reconciliação (last_message_at e unread_count por thread)
```

Retomável por construção: um timeout ou crash no meio custa uma página,
não a importação.

---

## 3. Mapa de alterações

### A. Conexão — fazer o histórico existir na Evolution

| # | Onde | Mudança |
|---|---|---|
| A1 | `src/lib/whatsapp/evolution-api.ts:238` | `createInstance()` passa a aceitar `syncFullHistory` (default `false` — só liga quando o operador pedir). |
| A2 | Servidor da Evolution | Confirmar persistência ligada (`DATABASE_SAVE_DATA_*`). **Bloqueante:** sem isso a Evolution recebe o histórico e descarta, e o pull não tem o que ler. |
| A3 | `evolution-api.ts:165` | **Não mexer.** Continuamos sem assinar `MESSAGES_SET` — é deliberado (seção 1). |

### B. Client HTTP — ler o histórico

| # | Onde | Mudança |
|---|---|---|
| B1 | `evolution-api.ts` | Adicionar `findChats()` e `findMessages({ remoteJid, page, offset })`. **Confirmar o contrato na versão instalada antes de escrever** — nosso client não tem esses métodos hoje, e a assinatura mudou entre versões da Evolution. |

### C. Persistência — modo importação

O caminho de persistência **já existe e é o mesmo do webhook**:
`handleEvolutionMessage` (`evolution-processor.ts:104-237`) já faz dedup,
`getOrCreateThread`, mídia e upsert idempotente
(`onConflict: thread_id,external_id`). Reusar é o que mantém histórico e
mensagem nova com exatamente a mesma forma no banco.

Mas ele tem quatro comportamentos que estão certos para mensagem nova e
**errados** para histórico:

| # | Onde | Comportamento hoje | No modo importação |
|---|---|---|---|
| C1 | `evolution-processor.ts:212` | `notifyCrmInboundMessage` a cada inbound | **Pular.** Senão o sino recebe uma notificação por mensagem antiga. |
| C2 | `evolution-processor.ts:208` | Inbound reabre thread `resolved` → `open` | **Pular.** Conversa encerrada não deve reabrir por mensagem de meses atrás. |
| C3 | `evolution-processor.ts:141-168` | Baixa mídia e grava no Storage | **Pular na fase 1** (ver seção 5). |
| C4 | `webhook-processor.ts:367` | `getOrCreateThread` grava `last_message_at: now()` | Aceitar a **data real** da mensagem. |

Implementação: um parâmetro `opts: { historical?: boolean }` em
`handleEvolutionMessage` e um `lastMessageAt` opcional em
`getOrCreateThread`. Sem `opts`, o comportamento é idêntico ao de hoje —
o fluxo de mensagens novas não muda em nada.

### D. Banco

| # | Mudança | Motivo |
|---|---|---|
| D1 | Tabela `crm_history_import_jobs` (`channel_id`, `status`, `cursor`, `chats_total/done`, `messages_imported`, `error`, timestamps) | Estado retomável do job. |
| D2 | `crm_messages.is_historical BOOLEAN DEFAULT false` | O trigger precisa distinguir importação de mensagem nova. |
| D3 | Trigger `crm_messages_update_thread` (`20260508_crm_phase4_messaging.sql:110`): `last_message_at = GREATEST(thread.last_message_at, NEW.created_at)` | Hoje sobrescreve sem comparar: histórico fora de ordem afunda conversa ativa no inbox. **Correção boa por si só**, independente da importação. |
| D4 | Mesmo trigger: não incrementar `unread_count` quando `NEW.is_historical` | Senão o inbox abre com centenas de "não lidas" de meses atrás. |

### E. Orquestração

| # | Onde | Mudança |
|---|---|---|
| E1 | `POST /api/crm/channels/[id]/import-history` | Cria o job e retorna. **Não processa no request** (o request morre em 60 s). |
| E2 | `GET` na mesma rota | Progresso, para a UI acompanhar. |
| E3 | `/api/cron/crm-history-import` (a cada minuto, `maxDuration = 300`) | Processa **um** job por vez, em páginas, parando por budget de tempo e salvando cursor. Mesmo padrão do `email-dispatch-queue`. |
| E4 | `vercel.json` | Registrar o cron. |
| E5 | `src/app/admin/comercial/canais/page.tsx` | Botão "Importar histórico" + progresso no card. |

### F. Reconciliação (uma vez, ao fim do job)

```sql
-- last_message_at real por thread
UPDATE crm_threads t SET last_message_at = m.max_at
FROM (SELECT thread_id, MAX(created_at) AS max_at FROM crm_messages GROUP BY thread_id) m
WHERE m.thread_id = t.id AND t.channel_id = :channel_id;

-- histórico não conta como não lido
UPDATE crm_threads SET unread_count = 0 WHERE channel_id = :channel_id;
```

---

## 4. Ordem de execução

Cada etapa é entregável e verificável sozinha:

1. **D3** (trigger `GREATEST`) — corrige um bug real do inbox hoje, sem
   depender de nada.
2. **B1** — client, depois de confirmar o contrato na Evolution instalada.
3. **D1/D2** — migration das tabelas/coluna.
4. **C1–C4** — modo importação na persistência.
5. **E1–E4** — job + cron.
6. **E5** — UI.
7. **F** — reconciliação.

Nada disso toca o fluxo de mensagens novas: o modo importação é opt-in
por parâmetro, e o trigger só muda comportamento em lote histórico.

---

## 5. O que torna isto "o mais seguro"

| Decisão | O que evita |
|---|---|
| Pull paginado em vez de webhook | O 413 do Vercel e a perda silenciosa |
| Job com cursor | Timeout/crash custa uma página, não a importação |
| Processar no cron, nunca no request | O teto de 60 s do webhook |
| Um canal por vez | Contenção no Postgres e na Evolution |
| **Dry-run primeiro** (contar sem gravar) | Descobrir o volume real antes de escrever qualquer linha |
| **Fase 1 sem mídia** | Storage e tempo — mídia é o que pesa; texto resolve a busca por histórico |
| **Janela de data** (ex.: 90 dias) | Importar anos quando meses bastam |
| Kill switch no job (`status = 'paused'`) | Parar no meio sem deploy |
| Reconciliação no fim | Inbox com ordem e contadores corretos |

E a mitigação que não é código: **testar com um número descartável
antes de qualquer número de produção.** O pareamento é o único momento
de risco irreversível, e ele acontece antes de uma linha ser importada.

---

## 6. Rollback

Importação por canal é reversível com o que já existe: `POST
/api/crm/channels/[id]/purge-threads` com `mode: 'delete'` apaga as
conversas daquele canal. Com `is_historical` (D2), dá para apagar **só o
que foi importado**, preservando as mensagens novas:

```sql
DELETE FROM crm_messages
WHERE is_historical = true
  AND thread_id IN (SELECT id FROM crm_threads WHERE channel_id = :channel_id);
```

---

## 7. O que foi implementado

| Área | Arquivo |
|---|---|
| Migration (coluna, trigger, jobs, RPC) | `supabase/migrations/20261065_whatsapp_history_import.sql` |
| Client (`findChats`, `findMessages`, `syncFullHistory`) | `src/lib/whatsapp/evolution-api.ts` |
| Modo importação na persistência | `src/lib/whatsapp/evolution-processor.ts` |
| Data real na criação da thread | `src/lib/whatsapp/webhook-processor.ts` |
| Executor do job (cursor + budget + claim) | `src/lib/services/crm-history-import.service.ts` |
| Rotas do job (criar/consultar/pausar) | `src/app/api/crm/channels/[id]/import-history/route.ts` |
| Cron | `src/app/api/cron/crm-history-import/route.ts` + `vercel.json` |
| UI (medir → importar, progresso) | `src/components/crm/channels/history-import-dialog.tsx` |
| Testes do envelope da API | `src/lib/whatsapp/evolution-history-envelope.test.ts` |

Duas decisões que mudaram durante a implementação:

- **Claim atômico no job.** O cron dispara a cada minuto e uma execução
  dura até 4 min: sem `UPDATE ... WHERE status = 'pending'` condicional,
  várias execuções pegariam o mesmo job e avançariam o cursor uma por
  cima da outra. Quem perde a corrida recebe zero linhas. Job em
  `running` sem heartbeat há 6 min é tratado como órfão de worker morto
  e pode ser retomado.
- **Envelope tolerante.** O formato de resposta do `findChats`/
  `findMessages` mudou entre versões (array cru → `{records}` →
  `{messages:{records}}`). O parser aceita as três em vez de assumir a
  da versão instalada — travado por teste.

Uma limitação conhecida: com janela de data (`since_days`), a rotina
ainda percorre a conversa inteira, pulando o que está fora da janela. A
ordem de retorno do `findMessages` não é garantida entre versões, então
parar cedo poderia truncar histórico válido. Custa tempo, não corretude.

---

## 8. Teste antes de usar em número de produção

1. Rodar a migration.
2. Parear um **número descartável** — a conexão precisa acontecer com
   `syncFullHistory` ligado para o histórico chegar na Evolution.
3. No card do canal: **Importar histórico → Medir (não grava)**. Isso
   percorre tudo contando. O resultado diz o volume real.
4. Se o volume for razoável, importar com janela de 90 dias e sem mídia.
5. Conferir no inbox: conversas com data original, sem badge de não-lida
   e sem notificação no sino.
6. Só então repetir no número de produção.

Rollback a qualquer momento:

```sql
DELETE FROM crm_messages
WHERE is_historical = true
  AND thread_id IN (SELECT id FROM crm_threads WHERE channel_id = :channel_id);
```

---

*Levantado e implementado em julho de 2026.*
