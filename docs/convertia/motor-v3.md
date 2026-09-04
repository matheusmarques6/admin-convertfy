# ConvertIA — motor v3 (set/2026)

Implementação do pacote de melhorias combinado em
`arquitetura-e-melhorias.md` (itens 1–5, 7–15; o 6 — rate limit no
banco — ficou de fora por decisão do usuário). Tudo em
`src/lib/ai/convertia/` + a rota `POST /api/ai/convertia/chat`.

## Mapa

```
chat/route.ts ── auth · body · conversa · loja · conectores · prompt ──▶ runToolLoop ──▶ finalizeTurn
                                                                          │                  │
                              system-prompt.ts (estável | dinâmico)       │      persist.ts · continuation.ts · summary.ts
                              prompt-cache.ts (cache_control)             │
                              consult-memory.ts (digest das consultas)    ├── telemetry.ts (rodadas · tools · cache)
                              memories.ts (ai_memories)                   ├── tool-errors.ts (erro estruturado + retry)
                              knowledge.ts (Obsidian: advisors + tools)   ├── cancel.ts (botão Parar)
                                                                          └── gate de confirmação (ConnectorTool.confirm)
cron: convertia-continue (1 min) · convertia-maintenance (1 h) · convertia-eval (segunda 05h UTC)
```

| # | Entrega | Onde | Como funciona |
|---|---|---|---|
| 1 | Cache de prompt | `prompt-cache.ts`, `openrouter-chat.ts` | System em DOIS blocos (estável marcado com `cache_control`, dinâmico fora) + marcador no último turno do usuário. Só `anthropic/*`. `usage.prompt_tokens_details.cached_tokens` vira `tokens_cached` na telemetria (`cache_hit_ratio`). |
| 2 | Cache de tools do MCP | `connectors/mcp-tools-cache.ts`, `registry.ts` | `ai_mcp_servers.tools_cache/tools_cached_at`. O chat lê do banco; cache >6 h é usado E renovado em background; botão Testar e cron horário renovam. Sessão MCP só abre na 1ª `tools/call`. |
| 3 | Telemetria por rodada/tool | `telemetry.ts`, UI da mensagem, card "Desempenho" | `meta.usage.rounds[]` (modelo, papel, ms, tokens, cache, desfecho) e `tools[]` (ms, erro, retries); mesmo objeto em `ai_usage_events.context`. Rodapé da resposta + painel expandido; `/api/ai/convertia/perf-stats`. |
| 4 | Retry + erro estruturado | `tool-errors.ts`, `mcp-client.ts` | Exceção da tool → `{error:{code, retry_after_s, http_status, hint}}`; transitórios (429/timeout/5xx) repetem até 2× com backoff dentro do orçamento. O system prompt ensina o que fazer com cada `code`. `tools/call` do MCP repete em 429/502/503. |
| 5 | Botão Parar | `cancel.ts`, `chat/cancel/route.ts` | O cliente NÃO aborta o fetch: marca `meta.cancel_requested`; o loop lê por polling (1,5 s), aborta a chamada em voo ao modelo e para entre tools. O turno fecha limpo (`status: cancelled`). |
| 7 | Gate de confirmação | `ConnectorTool.confirm`, loop, UI | Tool irreversível (enviar campanha, DELETE, supressão, MCP `destructiveHint`) devolve `needs_confirmation`; `meta.pending_confirmation` + card Confirmar/Cancelar. Aprovar = novo POST com `approve` → a rota executa a chamada ANTES da 1ª rodada e o modelo relata. Uso único (`resolved_at`). |
| 8 | Memória de consulta | `consult-memory.ts` | `sources[].digest` (~300 chars) por resultado; o bloco "o que já foi consultado" entra no system DINÂMICO (não invalida o cache). |
| 9 | Base de conhecimento | `knowledge-*.ts`, migration 20261115 | Sync GitHub → `ai_knowledge_notes` (título, pasta, tags, wikilinks normalizados, aliases, embedding). Conector "Conhecimento": buscar (semântica + full-text), ler com conexões (cita/citada por/tags), listar. Advisors = pasta `Advisors/` ou `tipo: advisor`, selecionáveis no `+`. Só `status: aprovado`. |
| 10 | Memória entre conversas | `memories.ts`, `/api/ai/memories`, migration 20261114 | `ai_memories` por org ou loja. Tool `convertia_lembrar` propõe (pending); painel "Memórias" aprova/rejeita/cria; só aprovadas entram no bloco estável. |
| 11 | Sumário rolante | `summary.ts` | Conversa > 24 mensagens: Kimi resume o que saiu da janela (incremental), grava em `context.summary`; injetado no bloco dinâmico. Pós-turno + cron horário. |
| 12 | Continuação em job | `continuation.ts`, cron `convertia-continue` | Orçamento acabou DEPOIS de executar tools → `ai_chat_jobs` com o estado do loop; o cron retoma da rodada, grava na mesma mensagem; UI repõe por polling (até 25 min). Relatório (precisa de cookie) fica fora. |
| 13 | Roteamento por rodada | loop (`cheapModel`), "Modo econômico" | Rodadas rodam no Kimi K3; se ele responder final ou pedir ESCRITA, a rodada é refeita no modelo escolhido. Off por padrão (toggle no menu de modelo, localStorage). |
| 14 | Avaliação | `eval.ts`, `/api/ai/convertia/eval`, cron semanal | Casos = perguntas dos 👍 (dedupe por hash) ou à mão; lote roda em 3 modelos com tools SÓ de leitura; juiz (Sonnet 4.6) dá nota 0–10 na rubrica (dados ×3, correção ×3, acionabilidade ×2, formato, concisão). Card "Avaliação" em Custo de IA. |
| 15 | Refatoração | `tool-loop.ts` (+ 13 testes com stream mockado), `finalize.ts`, `persist.ts` | A rota só autentica, monta contexto e abre o stream. O mesmo loop roda na rota, no job e na avaliação. |

## Contratos que não podem quebrar

- **`meta` é MERGE, nunca replace**: `ai_chat_message_progress()` faz
  `meta || patch`. Parar e Confirmar gravam flags na mesma coluna que a
  persistência parcial atualiza a cada 2,5 s.
- **Ordem do system prompt é estável** (cache por prefixo): mover um
  bloco para cima invalida o cache dos abaixo. Tudo que muda por turno
  (data, consultas, sumário, modo profundo) vai no bloco dinâmico.
- **Avaliação e job nunca executam o que precisa de cookie** e a
  avaliação filtra `write: true`.
- **Confirmação é uso único** (`resolved_at`) e só pelo dono da conversa.

## Variáveis de ambiente novas

| Var | Default | Uso |
|---|---|---|
| `VAULT_KNOWLEDGE_BASE_PATH` | `Admin Convertfy/Conhecimento` | pasta do vault com a base de conhecimento |
| `VAULT_KNOWLEDGE_ADVISORS_FOLDER` | `Advisors` | subpasta cujas notas viram advisors |
| `OPENAI_API_KEY` | — | embeddings (`text-embedding-3-small`); sem ela a busca é full-text |

`VAULT_REPO`, `VAULT_GITHUB_TOKEN`, `VAULT_BRANCH` e o webhook são os
mesmos do vault de emails — o mesmo push sincroniza as duas pastas.

## O que depende do usuário

1. Criar a pasta de conhecimento no vault (ou apontar
   `VAULT_KNOWLEDGE_BASE_PATH` para a existente) e marcar as notas com
   `status: aprovado`; advisors em `Advisors/`.
2. `OPENAI_API_KEY` na Vercel para a busca semântica.
3. Conferir os slugs dos modelos Claude 5 no OpenRouter (o fallback
   cobre, mas a lista de avaliação usa `anthropic/claude-opus-4.8` e
   `claude-sonnet-4.6`, que existem).
