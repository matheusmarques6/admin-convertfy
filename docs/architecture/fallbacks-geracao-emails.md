# Fallbacks do Pipeline de Geração de Emails (Epic AE)

> Mapa de **todos os caminhos de degradação/recuperação** do fluxo de geração,
> agente por agente. Formato: **condição de falha → degrada para → persiste no
> banco?** (`arquivo:linha`).
>
> Princípio geral: **o pipeline nunca trava por uma falha de agente.** Ou degrada
> pra um global (template/blueprint curado), ou marca o email `failed` com
> `failure_reason`. A telemetria de cada queda fica em `email_generation_runs`.

## Padrões recorrentes (valem pra todos)
- **Persistência condicional** — Montador (`if usedLlm`) e Blueprint (`if source==='ai'`) **só gravam quando o LLM gerou de verdade**. No fallback **não gravam** → preservam um resultado bom anterior e o consumidor cai no global.
- **Idempotência por claim atômico** — `UPDATE ... WHERE status = X`: se outro processo já avançou, a 2ª chamada vira `skipped` (sem erro). Usado em phase2, copy, watchdog.
- **Limites de retry** — `MAX_ARCHITECT_ATTEMPTS=2`, `attempts>=3` no watchdog, `maxRetries=2` no SDK.
- **Best-effort silencioso** — logo/resize/telemetria/notificação falham → logam `warn` e **seguem** (não derrubam o email).
- **Failed sempre persiste** — toda falha terminal grava `email_flow_emails.status='failed'` + `failure_reason`.

---

## 1. Briefing — cascata de 3 tiers (`briefing-generation.service.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| T1 Anthropic SDK timeout (40s) / erro | **T2: OpenRouter** (`gpt-5.3-chat`) | Não (continua cascata) |
| T2 sem `OPENROUTER_API_KEY` / timeout (20s) / JSON inválido | **T3: template determinístico** (`buildRawTemplate`) | Não |
| T3 (template) | **Nunca falha** — monta JSON do formulário com "a definir" | **SIM** (`briefing_generated_by='raw_template'`) |
| T3 erro de DB (excepcional) | `markBriefingFailed` → `status='not_started'`, `briefing={error}` | **SIM** |
| `status='generating'` há >90s (stuck) | **Watchdog**: libera retry no submit-data/retry-briefing → re-dispara `generateBriefing` | — |

## 2. Pesquisa & Diagnóstico (n8n externo + callbacks)
| Condição | Degrada para | Persiste? |
|---|---|---|
| Callback duplicado / `regeneration=true` | Pula re-enfileirar o Architect (só atualiza pesquisa) | Sobrescreve pesquisa |
| `pesquisa-completa` com job já ativo | Dedup: retorna `already_queued` | — |

## 3. Montador / Component Assembler (`architect/component-assembler.service.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| LLM falha **ou** output não é HTML (`looksLikeHtml`) | **Template global curado** (`email_reference_templates`) | **NÃO** (`if usedLlm` pula o upsert) |
| Sem template curado | **Concatenação top-1 das variantes** (`assembleReferenceHtml`) | **NÃO** |
| (qualquer fallback) | Telemetria `status='skipped'`, `model='fallback'`, `fallback_source` registrado | run gravado |

## 4. Blueprint (`architect/blueprint-generator.service.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| LLM falha **ou** JSON inválido (`parseBlueprintOutput→null`) | **`DEFAULT_BLUEPRINTS`** in-code | **NÃO** (`if source==='ai'` pula) |
| Flow×email sem default | **Blueprint mínimo** (hero+text+footer) | **NÃO** |
| Consumidor não acha store blueprint | `loadEffectiveBlueprint` → `email_blueprints` global → `DEFAULT_BLUEPRINTS` | — |

## 5. Orquestração Architect (`generate.service.ts`, `email-dispatch-queue.service.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| Architect não configurado (sem variantes/outlines) | Bypass do LLM → email nasce `architect='failed'` → consumidor usa global | — |
| Reference já existe pro flow×email | Skip-existing → email `'done'` (não re-paga LLM) | — |
| Architect falha num email | Retry até `MAX_ARCHITECT_ATTEMPTS=2`; depois `'failed'` (não bloqueia o batch) | — |
| Job `generating` há > `LEASE_MS` (360s) | Outro tick reclama o job (evita pagar Opus 2×) | — |

## 6. Copy (`email-copy-webhook.service.ts`, callback, `copy-chain-fallback.service.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| Sem `N8N_EMAIL_COPY_WEBHOOK_URL` / store/flows ausentes | `ok:false` + telemetria `agent='copy_dispatch' status='error'` | Não |
| `pesquisa_completa` + batch já em progresso | Skip (`batch_in_progress`) — idempotência | Não |
| Fetch n8n timeout (15s) / 4xx-5xx | `dispatchError`, telemetria `status='error'` | Não |
| Callback duplicado (status ≥ `copy_ready`) | 200 `idempotent:true`, nenhuma ação | Não |
| **`block_id` do callback não existe** | **Fallback por POSIÇÃO** (casa o bloco i com `position` i) | **SIM** (`email_blocks.content`) |
| Blocos não casaram (id+posição) | Log `warn`, conta, **continua** | Não |
| **Copy travada >15min (`copy_generating`)** | **Watchdog → `copy_generating_recovery` → `runCopyChainInProcess`** (LangChain in-process, `DEFAULT_COPY_SYSTEM_PROMPT`) | — |
| In-process: parse/subject vazio/email não achado | `markFailed` → `status='failed'`, `reason='copy_fallback_failed'` | **SIM** |

## 7. Imagem (`chains/image.chain.ts`, `image/mode-resolution.ts`, `product-image-guard.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| `product_ref` + `IMAGE_MULTIMODAL_ENABLED=false` | `text2img` (`fallback_text2img_disabled`) | Não |
| `product_ref` + sem `topProductImageUrl` | `text2img` (`fallback_text2img_no_product`) | Não |
| `product_ref` + URL de produto não usável (guard HEAD/GET) | `text2img` (`fallback_text2img_unreachable`) + descrição textual no prompt | Não |
| **Multimodal não suportado (4xx)** | **Retry 1× em text2img puro** | Não |
| **Role `system` não suportado (4xx)** | **Retry 1×** concatenando system+user | Não |
| OpenRouter timeout (90s) / parse falha / 4xx-5xx | `throw` → phase2 marca `image_failed` | **SIM** (failed) |
| **Sharp resize falha** | **Buffer original** (best-effort) | Sim (imagem sem resize) |
| **Signed URL falha** | **`getPublicUrl`** (fallback público) | Sim |

## 8. HTML (`chains/html.chain.ts`, `html/build-vars.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| Config `agent_type='html'` ausente | `DEFAULT_MODEL` + `DEFAULT_HTML_SYSTEM_PROMPT`/`USER_TEMPLATE` hardcoded | Não |
| `temperature` deprecated (opus-4.7/4.8) | Omite o parâmetro | Não |
| Reference por loja ausente | `loadGlobalReferenceTemplate` → global → `""` | Sim |
| **Logo SVG fetch falha/timeout(10s)/não-é-svg** | **`""`** (email **sem logo**, silencioso) | Sim |
| **Logo PNG: renovação da signed URL falha** | **URL armazenada direto** (pode expirar em 7d) | Sim |
| **Brand incompleta (strict)** | `throw BrandIncompleteError` → phase2 `failed` (`brand_incomplete`) | **SIM** |
| Brand incompleta (relaxed / TestTab) | Só falha se `brand=null`; cores/logo caem em defaults | Não |
| Timeout (200s) | `throw 'timeout'` → phase2 `html_failed` | **SIM** |
| Output sem `<!DOCTYPE>` | `postProcessHtml` best-effort (pode gravar HTML parcial) | Sim |

## 9. QA (`chains/qa.chain.ts`, `qa-vision.chain.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| Pre-checks determinísticos | **Sempre rodam** (html inválido, blocos vazios, links) — sem LLM | issues[] |
| **Config `agent_type='qa'` ausente** | **Noop seguro: `passed=true`**, só os pre-checks, `status='skipped'` | Sim |
| LLM timeout (60s) | Issue sintética `qa_timeout` (severity high) | Sim |
| LLM erro (não-timeout) | Issue sintética `qa_llm_error` | Sim |
| JSON inválido | **Retry 1×** ("REFORMAT: só JSON"); se falhar → só pre-checks | Sim |
| Zod inválido | Mesmo fallback do parse | Sim |
| **Vision (AE-15) timeout(10s)/erro/parse** | **Graceful: `issues:[]`** — nunca bloqueia o `passed` textual | Não |

## 10. Phase2-runner (`phase2-runner.service.ts`)
| Condição | Degrada para | Persiste? |
|---|---|---|
| Claim atômico falha (status ≠ `copy_ready`) | `skipped` (idempotente) | Não |
| Context load falha | `markEmailFailed` (`context_load_failed`) | **SIM** |
| Store sem niche/top_products | `warn` + **continua** (imagem genérica) | Não |
| Imagem `throw` | `image_failed` | **SIM** |
| HTML `BrandIncompleteError` | `brand_incomplete` | **SIM** |
| HTML timeout | `html_failed` | **SIM** |
| **QA agent crash (fora do runQaAgent)** | **`runQaAgentSafeFallback` → `passed=true, issues:[]`** | Sim |
| QA `passed=false` | `qa_failed` (+ `qa_issues`) | **SIM** |
| Notify/rollup falham | `warn` + continua (safe wrappers) | Não |

## 11. Watchdog (`cron/email-generation-watchdog`)
| Detecção | Ação | Persiste? |
|---|---|---|
| `copy_generating` > 15min | claim → `copy_generating_recovery` → `runCopyChainInProcess` | — |
| `copy_ready` parado > 3min | POST `/api/internal/run-phase2/[id]` (redispatch) | — |
| Redispatch falha 3× | `failed` (`stale_copy_ready_exhausted`) + notifica | **SIM** |
| `rendering/image_done/qa_running` > 10min | `failed` (`timeout_phase2`) + notifica | **SIM** |
| `attempts >= 3` (sinal de fila) | `failed` (`max_attempts_exhausted`) | **SIM** |
| Sem `INTERNAL_SECRET` | Skip do redispatch (log error) | Não |

---

## ⚠️ Fallbacks que hoje viraram o caminho PADRÃO (não exceção)
Pontos onde "fallback" não é raro — é o que roda na maioria das vezes. Importante porque mascaram o caminho ideal:
1. **Briefing cai 100% no T2** (`gpt-5.3-chat` via OpenRouter) — o T1 (Anthropic direto) falha sistematicamente (conta sem crédito). Funciona, mas o "tier primário" está morto.
2. **Imagem quase sempre `text2img`** — `product_ref` (multimodal) depende de `IMAGE_MULTIMODAL_ENABLED` (off) + URL de produto usável; na prática cai no genérico.
3. **Montador/Blueprint → global** quando o LLM falha — silencioso (telemetria `status='skipped'`); o email sai com estrutura genérica sem ninguém perceber na hora.
4. **QA sem config → `passed=true`** — se a linha ativa do QA sumir, **todo email passa sem validação de LLM** (só os pre-checks determinísticos).
5. **Logo SVG fetch falha → email sem logo** — degrada em silêncio (só `log.warn`).

## Como observar (telemetria)
- Fallbacks de LLM aparecem em `email_generation_runs` com `status='skipped'`/`'error'` e `error_message`/`fallback_source`.
- Falhas terminais em `email_flow_emails.status='failed'` + `failure_reason` (e `email_status_events` audita cada transição).
- Custo/uso unificado em `ai_usage_unified`.
