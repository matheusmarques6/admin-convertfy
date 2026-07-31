# Importar histórico do WhatsApp (history sync) — catálogo de riscos

Avaliação pedida antes de decidir se ligamos a importação do histórico
que o WhatsApp entrega no pareamento (`syncFullHistory` + eventos
`MESSAGES_SET`/`CHATS_SET`/`CONTACTS_SET` da Evolution).

**Status: NÃO implementado.** Este documento existe para a decisão ser
tomada com os riscos à vista, não para descrever algo que já roda.

Cada afirmação abaixo está marcada como **[código]** (verificada neste
repositório, com arquivo:linha), **[plataforma]** (documentação oficial
de Vercel/Evolution) ou **[mercado]** (levantamento de terceiros —
indicativo, não medição nossa).

---

## 1. O que dá e o que não dá

| Pergunta | Resposta |
|---|---|
| Recuperar o histórico dos números **já conectados**? | **Não.** O WhatsApp só entrega histórico no momento do pareamento; não existe endpoint de busca retroativa. A janela desses números passou. |
| Recuperar histórico em **novas** conexões? | **Sim, parcialmente** — exige mudar 3 pontos do código, reparear o número e aceitar os riscos abaixo. |
| Recuperar "tudo desde sempre"? | **Não.** Vem o que o aparelho tem para entregar, e o volume varia. Há relato de o parâmetro ser [ignorado em algumas versões](https://github.com/EvolutionAPI/evolution-api/issues/843) da Evolution. |

### Escopo do sync: é por conta, não por sistema

O history sync entrega o histórico **da conta que está pareando**.
Conectar o número B traz as conversas do B — as conversas do número A
**não** voltam por causa disso. Elas só voltariam ao reparear o próprio
A, porque aí é o aparelho do A reenviando o que tem.

Um mesmo contato pode aparecer nos dois canais: são threads distintas
(`UNIQUE (channel_id, contact_external_id)`, migration
`20260508_crm_phase4_messaging.sql:66`), cada uma com o conteúdo que
aquele número trocou com ele. **[código]**

---

## 2. Onde o histórico morre hoje

Três pontos independentes o descartam — os mesmos três que precisariam
mudar. **[código]**

1. `src/lib/whatsapp/evolution-api.ts:238` — `createInstance()` envia só
   `instanceName`, `integration` e `qrcode`. Sem `syncFullHistory: true`,
   o padrão não sincroniza.
2. `src/lib/whatsapp/evolution-api.ts:165` — assinamos apenas
   `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE` e
   `CONNECTION_UPDATE`. O histórico vem em `MESSAGES_SET`, `CHATS_SET`,
   `CONTACTS_SET`.
3. `src/app/api/webhooks/evolution/[secret]/route.ts:36` — só três
   eventos entram na fila; o resto é ignorado na linha 81.

---

## 3. Risco de banimento do número

### Por que existe

A conexão via QR usa Baileys, uma reimplementação do protocolo do
WhatsApp Web obtida por engenharia reversa. Isso vale para toda a
categoria (Baileys, WAHA, Evolution) e contraria os termos de uso do
WhatsApp. **A regra prática do setor: se o sistema pede leitura de QR
code, é não-oficial e o número está sujeito a banimento.** **[mercado]**

Esse risco **já existe hoje**, com ou sem histórico — é inerente ao canal
"WhatsApp via QR (não-oficial)" que já está em produção. O sync não cria
o risco: **ele o concentra num momento específico.**

### O que o sync agrava

| Fator | Efeito |
|---|---|
| Novo pareamento | Cada QR novo é um evento de re-registro de dispositivo — sinal que a detecção observa. |
| Rajada logo após conectar | O sync puxa milhares de mensagens em minutos: padrão de tráfego atípico para um aparelho humano. |
| Repetição | Reparear vários números em sequência, ou o mesmo número várias vezes, multiplica o sinal. |

### Quão provável

Não existe número oficial: a Meta não publica critérios nem taxas de
banimento, e qualquer percentual vem de levantamento de fornecedor com
viés de amostra. O que há de referência: um levantamento aponta que
**68% de PMEs indianas usando automação não-oficial relataram ao menos um
banimento em 12 meses**, com detecção típica em **2–8 semanas** de uso.
**[mercado]** Trate como ordem de grandeza, não como medição do nosso
caso.

### Impacto

**Irreversível.** Número banido por uso de API não-oficial é banimento
permanente, sem canal de apelação prático. Se o número for o de
atendimento da operação, perde-se o número — não só o histórico.

### Mitigações

- Nunca reparear o número principal da operação para testar sync. Use um
  número descartável primeiro.
- Um número por vez, com dias de intervalo — não uma rodada de
  repareamentos no mesmo dia.
- Para qualquer número que a operação não pode perder, o caminho correto
  é a **Cloud API oficial** (o projeto já suporta: `provider =
  whatsapp_cloud`). A Cloud API não entrega histórico anterior, mas não
  banimento por ToS. **[código]**

---

## 4. Risco de crash e de perda silenciosa

Aqui a avaliação é mais dura, porque os pontos de quebra são
verificáveis no nosso código — não são hipóteses.

### 4.1 Limite de 4,5 MB do Vercel — o mais grave

Funções serverless do Vercel rejeitam requisições com corpo acima de
**4,5 MB**, com `413 FUNCTION_PAYLOAD_TOO_LARGE`. **[plataforma]**

Um `MESSAGES_SET` de history sync é um payload único com milhares de
mensagens. Pior: registramos o webhook com **`base64: true`**
(`evolution-api.ts:295`), então mídias vêm embutidas no JSON. **[código]**
Estourar 4,5 MB é o caso esperado, não a exceção.

O 413 acontece **na borda do Vercel, antes do nosso código rodar**. E o
nosso desenho assume que o retry é da fila interna, não da Evolution
(comentário em `webhooks/evolution/[secret]/route.ts:13`) — ou seja: o
evento **não é persistido, não é reprocessado e não aparece em log
nenhum**. Perda silenciosa. **[código]**

**Probabilidade: alta.** É o primeiro obstáculo e o mais provável de
ocorrer já no primeiro teste.

### 4.2 Processamento inline com `maxDuration = 60`

O webhook declara `maxDuration = 60` (`route.ts:34`) e, fora do modo
assíncrono (`ENABLE_ASYNC_WEBHOOK` + QStash), processa **inline** o
evento reivindicado (`route.ts:113-117`). **[código]**

Um lote de milhares de mensagens não termina em 60 s. Timeout no meio da
ingestão deixa o evento parcialmente processado.

### 4.3 Um UPDATE por mensagem inserida

`trg_crm_messages_update_thread` dispara **AFTER INSERT FOR EACH ROW** e
faz `UPDATE crm_threads` a cada mensagem
(`20260508_crm_phase4_messaging.sql:110-134`). **[código]**

Importar 5.000 mensagens = 5.000 UPDATEs, concentrados nas mesmas poucas
linhas de thread. Custo desproporcional e contenção de lock.

### 4.4 `unread_count` inflado

O mesmo trigger incrementa `unread_count` para toda mensagem `inbound`.
Histórico é quase todo inbound e antigo: o inbox abriria com centenas de
"não lidas" de meses atrás. **[código]**

### 4.5 Ordenação do inbox quebrada

O trigger sobrescreve `last_message_at` com a mensagem recém-inserida,
sem comparar datas. Se o histórico entrar fora de ordem cronológica —
comum em lote —, a thread fica com a data da **última linha inserida**,
não da mensagem mais recente. Como o inbox ordena por `last_message_at
DESC` (`api/crm/inbox/threads/route.ts`), conversas ativas podem
afundar na lista. **[código]**

### 4.6 `raw_payload` gigante

Persistimos o payload cru em `crm_webhook_events.raw_payload`
(`route.ts:91`). Com histórico + base64, cada linha vira dezenas de MB.
**[código]**

### 4.7 Memória da própria Evolution

Fora do nosso controle: há relato de container da Evolution passando de
**4 GB de RAM antes de crashar e reiniciar**
([issue #1419](https://github.com/EvolutionAPI/evolution-api/issues/1419)).
O sync é justamente a operação mais pesada em memória. Se a Evolution
reinicia no meio, o sync não recomeça — e a janela do pareamento já foi
gasta. **[mercado]**

---

## 5. Resumo

| Risco | Probabilidade | Impacto | Reversível |
|---|---|---|---|
| 413 no Vercel, histórico perdido em silêncio | Alta | Médio (não vem nada) | Sim (com ajuste) |
| Timeout de 60 s na ingestão | Alta | Médio (ingestão parcial) | Sim |
| `unread_count` / ordenação bagunçados | Alta | Baixo (cosmético, corrigível em SQL) | Sim |
| Crash de memória na Evolution | Média | Médio (perde a janela do pareamento) | Só com novo QR |
| **Banimento do número** | **Baixa a média por pareamento, cumulativa** | **Alto — perde o número** | **Não** |

O risco de crash é **provável e reparável**. O de banimento é **menos
provável e irreparável**. É esse segundo que deve pesar na decisão.

---

## 6. Se for para implementar

Ordem sugerida — os quatro primeiros itens são pré-requisito, não
melhoria:

1. **Não receber o histórico por webhook.** Assinar `MESSAGES_SET` joga o
   lote inteiro contra o limite de 4,5 MB de uma vez. O desenho melhor é
   ligar `syncFullHistory` para que a **Evolution** grave o histórico no
   banco dela (exige a persistência ligada lá — `DATABASE_SAVE_DATA_*`) e
   nós puxarmos em páginas, no nosso ritmo. O endpoint de leitura
   (`/chat/findMessages/{instance}`) **precisa ser confirmado na versão
   instalada** antes de assumir o desenho: nosso client não o
   implementa hoje.
2. **Desligar `base64` para essa rota** — baixar mídia depois, por
   referência, não embutida no JSON.
3. **Ingestão em lote fora do request**: fila + worker, com checkpoint
   para retomar de onde parou.
4. **Corrigir o trigger para lote**: `last_message_at` só avança
   (`GREATEST`), e `unread_count` não incrementa em importação
   histórica.
5. Testar em **um** número descartável e medir o volume real antes de
   qualquer número de produção.

A idempotência já está resolvida: `UNIQUE (thread_id, external_id)` em
`crm_messages` faz reprocessamento não duplicar. **[código]**

---

## 7. Recomendação

**Não ligar para os números atuais.** Para os já conectados o histórico é
inacessível de qualquer forma, e reparear só para tentar importar troca
um ganho incerto (o WhatsApp decide quanto entrega) por um risco
irreversível (banimento).

Se o histórico for realmente necessário, o teste deve começar por um
número descartável, com os itens 1–4 da seção 6 implementados antes.

---

## Fontes externas

- [Vercel — FUNCTION_PAYLOAD_TOO_LARGE (limite de 4,5 MB)](https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE)
- [Evolution API — lista de eventos de webhook](https://docs.evolution-api.com/docs/04-Webhooks/00-set-webhook/)
- [Evolution API — `syncFullHistory` ignorado (issue #843)](https://github.com/EvolutionAPI/evolution-api/issues/843)
- [Evolution API — acúmulo de memória até o serviço parar (issue #1419)](https://github.com/EvolutionAPI/evolution-api/issues/1419)
- [Evolution API — importação de histórico na prática (issue #480)](https://github.com/evolution-foundation/evolution-api/issues/480)

*Levantado em julho de 2026.*
