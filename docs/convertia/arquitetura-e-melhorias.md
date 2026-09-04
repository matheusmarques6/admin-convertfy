# ConvertIA — arquitetura atual e melhorias propostas (set/2026)

Levantamento feito sobre o código em `src/app/api/ai/convertia/*`,
`src/lib/ai/*` e `src/components/convertia/*`. Serve de base para a
próxima rodada de evolução (base de conhecimento do Obsidian incluída).

## 1. Como funciona hoje

```
composer ──POST /api/ai/convertia/chat (SSE)──▶ rota (720 linhas)
                                                 │ auth · rate limit (memória) · budget diário
                                                 │ conversa (cria/valida) · histórico (24 msgs)
                                                 │ resolveConnectors → tools (built-in + MCP)
                                                 │ system prompt (≈14 blocos + guidance + dossiê da loja + skills)
                                                 │ loop de tools (até 10/18 rodadas, orçamento 280 s)
                                                 │   ├─ guard "consulte antes de responder" (heurísticas regex)
                                                 │   ├─ streamOpenRouterChat (1 chamada por rodada)
                                                 │   └─ executa tools · persiste parcial a cada 2,5 s
                                                 └─ grava resposta final + telemetria (ai_usage_events)
bootstrap ──GET──▶ conversas · lojas + credenciais presentes · skills · MCPs · budget
```

| Camada | Onde | Observação |
|---|---|---|
| UI | `convertia-chat.tsx` (2.000 linhas) | rail, composer, menus, parser do SSE, bolhas, voz e anexos num único componente |
| Motor | `chat/route.ts` | um handler faz tudo: contexto, prompt, loop, persistência, telemetria |
| Modelos | `convertia-models.ts` | lista fixa; fallback para o padrão quando o slug não existe no OpenRouter |
| Conectores | `connectors/*` | métricas (4 tools), CRM (5), Shopify (11), Omnisend (catálogo + guia + operação), Klaviyo (6), relatório (1), imagem (1), MCP (até 40 por servidor) |
| Contexto da loja | `ai-context.service.ts` | dossiê montado por turno, cache de 90 s |
| Guard-rails | `convertia-limits.ts`, `ai-rate-limit.ts`, heurísticas | US$ 5/dia por usuário; 15 msgs/min **em memória** |
| Persistência | `ai_chat_conversations`, `ai_chat_messages` | resposta final em `content`, narração em `meta.progress`, fontes em `meta.sources` |

## 2. O que funciona bem

- Loop de tools com orçamento de tempo explícito (nunca deixa a função
  morrer sem persistir).
- Persistência progressiva e retomada por F5 (set/2026).
- Guard de retenção: análise sem consulta e negativa sem verificação
  são descartadas e o modelo recebe um "nudge".
- Guidance por conector no system prompt (o Omnisend ensina a si mesmo).
- Custo real do OpenRouter alimenta o guard-rail diário.

## 3. Onde dói

1. **Custo de input cresce a cada turno.** O system prompt (com o dossiê
   da loja e as skills) e as ~70 definições de tool são reenviados
   inteiros em TODA rodada de TODO turno, sem cache de prompt. Numa
   conversa de 10 turnos com 4 rodadas cada, o mesmo bloco de ~15k
   tokens é cobrado 40 vezes.
2. **Lista de tools do MCP é buscada por mensagem.** `buildMcpConnector`
   chama `tools/list` no servidor externo a cada turno — latência antes
   do primeiro token e dependência de disponibilidade do MCP para a
   conversa começar. A tabela já tem `tool_count`/`last_checked_at`.
3. **O modelo esquece o que consultou.** O histórico reenviado é só
   user/assistant. Os resultados das tools de turnos anteriores não
   voltam, então "e o popup que você achou?" força uma nova consulta (ou
   uma resposta de memória).
4. **Histórico sem sumarização.** Corte seco em 24 mensagens: conversa
   longa perde o começo sem aviso.
5. **Rate limit em memória** não vale em serverless (cada instância tem
   o seu contador).
6. **Não dá para parar.** Não existe cancelamento: o turno vai até o fim
   mesmo que o usuário perceba o erro no primeiro parágrafo.
7. **Tarefa longa morre no relógio.** Passou de 280 s, a resposta é
   cortada com "tempo esgotado" e o trabalho não continua.
8. **Confirmação de ação destrutiva é só texto no prompt.** "Confirme
   antes de enviar campanha" depende do modelo obedecer; não há gate na
   UI nem token de aprovação.
9. **Sem memória entre conversas.** Preferência do cliente, tom da marca
   aprendido, decisão tomada ontem — tudo recomeça do zero (o dossiê da
   loja cobre só o que está cadastrado).
10. **Sem base de conhecimento.** A ConvertIA não lê o vault (o Curador
    lê; o chat, não). É a causa do "burrinha".
11. **Componente e rota monolíticos.** 2.000 + 720 linhas sem testes de
    unidade do loop nem do parser do SSE.
12. **Sem avaliação.** O único sinal de qualidade é o 👍 por mensagem;
    trocar de modelo padrão é no feeling.

## 4. Melhorias propostas (prioridade × esforço)

| # | Melhoria | Ganho | Esforço |
|---|---|---|---|
| 1 | **Cache de prompt** (`cache_control` do Anthropic via OpenRouter) no system prompt + dossiê + tools; ordenar o prompt com o estável primeiro | −50% a −80% do custo de input em conversas longas; primeiro token mais rápido | baixo |
| 2 | **Cache da lista de tools do MCP** em `ai_mcp_servers` (refresh por cron de hora em hora e no botão "testar"); `tools/list` só quando o cache está vazio | −1 chamada externa por mensagem; chat abre mesmo com o MCP fora | baixo |
| 3 | **Memória de consulta da conversa**: guardar em `meta.sources` um resumo de 300 chars por resultado de tool e injetar "o que já foi consultado nesta conversa" no prompt dos turnos seguintes | fim do "achei de novo"; menos tool calls | médio |
| 4 | **Sumário rolante** da conversa em `context.summary` quando passar de 24 mensagens (mini-modelo barato) | conversa longa não perde o começo | médio |
| 5 | **Rate limit no banco** (contar `ai_usage_events` do último minuto) ou Upstash | limite real em serverless | baixo |
| 6 | **Botão Parar**: `meta.cancel_requested=true` via PATCH; o loop checa entre rodadas e antes de cada tool | controle do usuário; economia de custo | baixo |
| 7 | **Continuação em job** quando o orçamento acaba: enfileirar `ai_chat_jobs` com o estado do loop e retomar por cron (mesmo padrão do `crm-automation-resume`) | tarefas de 10+ minutos terminam | alto |
| 8 | **Gate de confirmação na UI** para tools destrutivas: a tool devolve `needs_confirmation` com o resumo da ação → botão "Confirmar" → reenvio com token de aprovação | segurança que não depende de obediência do modelo | médio |
| 9 | **Base de conhecimento do Obsidian** (grafo + busca semântica + advisors) — plano já combinado | respostas com o conteúdo da casa | alto |
| 10 | **Memória de organização** (`ai_memories`: fato, escopo loja/org, origem, aprovado) alimentada pela IA com aprovação humana | continuidade entre conversas | médio |
| 11 | **Refatorar**: `use-convertia-stream.ts` (parser SSE testável), `composer.tsx`, `message.tsx`, `rail.tsx`; rota em `system-prompt.ts`, `tool-loop.ts`, `persist.ts` com testes do loop usando stream mockado | manutenção; testes de regressão do loop | médio |
| 12 | **Conjunto de avaliação**: 30 perguntas reais (das conversas com 👍) rodadas semanalmente em 3 modelos com rubrica; painel em Custo de IA | escolher modelo e prompt com dado | médio |
| 13 | **Roteamento por rodada**: modelo barato nas rodadas de planejamento/tool-call, modelo forte só na resposta final | −30% a −50% de custo em tarefas longas | médio |
| 14 | **Retry com backoff nas tools externas** (429 do Omnisend/Klaviyo/Shopify) e erro estruturado para o modelo (`{code, retry_after}`) | menos "erro ao consultar" que vira resposta ruim | baixo |
| 15 | **Telemetria por rodada**: tokens e latência por rodada e por tool em `ai_usage_events.context` | achar onde o tempo e o dinheiro vão | baixo |

## 5. Ordem sugerida

1. Itens 1, 2, 5, 6, 14, 15 — uma semana, risco baixo, ganho imediato de
   custo e controle.
2. Item 9 (Obsidian) com o item 3 — é o que muda a qualidade das respostas.
3. Itens 8 e 7 — segurança e tarefas longas.
4. Itens 11 e 12 — manutenção e método para evoluir com dado.
5. Itens 4, 10 e 13 — refino.
