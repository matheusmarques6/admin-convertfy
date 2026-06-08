# Pipeline de Geração de Emails (Epic AE)

> Visão de ponta a ponta do pipeline de geração automática de emails, já com a
> **inversão Montador→Blueprint** (Junho/2026) e o mapa das **gerações de teste**
> do hub `/admin/settings/email-generation`.

---

## 1. Visão geral

São **2 fases assíncronas** com um **gate manual** (confirmação de brand) no meio.
Cada caixa colorida é um status de `email_flow_emails`.

```mermaid
flowchart TD
    A["store_briefings.status = 'confirmed'"] -->|"trigger fn_on_briefing_confirmed"| B[("email_generation_queue_signals")]
    B -->|"cron watchdog (5min) consome o sinal"| C["consumeQueueSignal → startOnboarding()"]
    C --> D{{"dispatchEmailCopyWebhook()"}}

    D -->|"1 · se isArchitectConfigured()"| E["ARCHITECT"]
    E --> E1["Montador → store_email_references (HTML montado)"]
    E1 --> E2["Blueprint → store_email_blueprints (estrutura)"]
    D -->|"2 · SEED"| F["reconcileBlocksAdditive → email_blocks"]
    D -->|"3 · dispatch"| G["POST $N8N_EMAIL_COPY_URL"]

    G --> H["status: copy_generating"]
    H -->|"callback /api/webhooks/n8n/email-copy"| I["status: copy_ready"]

    I -. "PARA AQUI (AE-19)" .-> J["GATE 2 · designer confirma brand identity"]
    J -->|"trigger → sinal 'render'"| K["runPhase2InBackground()"]

    K --> K1["status: rendering · imagem + HTML"]
    K1 --> K2["status: qa_running · QA agent"]
    K2 --> L{"QA passou?"}
    L -->|sim| M["status: ready ✅"]
    L -->|não| N["status: failed ❌"]

    style M fill:#1f7a3d,color:#fff
    style N fill:#a11,color:#fff
    style J fill:#b58900,color:#fff
    style E fill:#1F1F1F,color:#fff
```

**Resumo:** `Architect (Montador→Blueprint) → Seed → Copy (N8N) → ⏸ Gate de brand → Render (Imagem→HTML→QA) → Ready`.

---

## 2. Fase Architect — a inversão (mudança de Junho/2026)

O Architect roda **dentro do dispatch da copy** (`email-copy-webhook.service.ts:285-303`),
**antes** do seed e do N8N, e só se a biblioteca estiver configurada
(`isArchitectConfigured()`). A ordem interna foi **invertida**: agora o Montador
monta o HTML primeiro, e o Blueprint extrai a estrutura desse HTML.

```mermaid
flowchart LR
    O["Outline / Estrutura geral<br/>(seções)"] --> M1["1º · Montador<br/>assembleStoreReference()"]
    LIB[("Biblioteca de<br/>componentes")] --> M1
    M1 -->|"HTML montado"| R[("store_email_references")]
    R -->|"LÊ o HTML"| B1["2º · Blueprint<br/>generateStoreBlueprint()"]
    B1 -->|"estrutura extraída"| BP[("store_email_blueprints")]

    style M1 fill:#1F1F1F,color:#fff
    style B1 fill:#1F1F1F,color:#fff
```

| Ordem | Agente | Lê | Grava |
|---|---|---|---|
| **1º** | Montador (`assembleStoreReference`) | seções do **outline** + biblioteca | `store_email_references` (HTML) |
| **2º** | Blueprint (`generateStoreBlueprint`) | o **HTML montado** | `store_email_blueprints` (estrutura) |

**Por quê:** antes o Blueprint *previa* a estrutura e o Montador tentava segui-la.
Agora o Blueprint é um **espelho fiel** do HTML que o Montador realmente produziu —
os dois artefatos saem coerentes entre si.

**Fallback em cascata** (o Architect é uma camada de *personalização*, nunca bloqueia):
blueprint da loja → blueprint global → `DEFAULT_BLUEPRINTS`; reference da loja → template global.

---

## 3. Quem consome os artefatos do Architect

```mermaid
flowchart LR
    BP[("store_email_blueprints")] --> S["SEED (seedBlocksFromBlueprint)<br/>cria email_blocks + needs_image"]
    BP --> H["HTML agent<br/>objective / messaging"]
    R[("store_email_references")] --> H2["HTML agent<br/>reference_html (a 'forma')"]
```

- **`store_email_blueprints`** → o **Seed** cria os `email_blocks` com `needs_image` correto; o **HTML agent** lê `objective`/`messaging`.
- **`store_email_references`** → o **HTML agent** usa como `reference_html` (a forma que ele segue). Sem reference da loja → template global.

---

## 4. Máquina de estados (`email_flow_emails.status`)

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> copy_generating: dispatch (startOnboarding)
    copy_generating --> copy_ready: callback N8N
    copy_generating --> copy_generating_recovery: watchdog (timeout 15min)
    copy_generating_recovery --> copy_ready: fallback in-process
    copy_ready --> rendering: GATE 2 (brand confirm)
    rendering --> qa_running: imagem + HTML ok
    qa_running --> ready: QA pass
    qa_running --> failed: QA fail
    rendering --> failed: timeout (10min)
    ready --> [*]
    failed --> [*]
```

Toda transição vira linha em `email_status_events` (audit + bus SSE via `pg_notify`).

### Resiliência — watchdog cron (5 min)

| Situação | Detecção | Ação |
|---|---|---|
| Copy travada | `copy_generating` > 15min | → `copy_generating_recovery` → fallback in-process |
| Fase 2 travada | `rendering`/`qa_running` > 10min | → `failed:timeout_phase2` |
| `copy_ready` parada | > 3min (após o gate) | re-dispara a fase 2 |

---

## 5. Gerações de TESTE (hub `/admin/settings/email-generation`)

Há **dois testes diferentes**, que exercitam **partes diferentes** do pipeline:

```mermaid
flowchart TD
    subgraph Hub["/admin/settings/email-generation"]
      direction LR
      T1["Aba 'Geradas' → Regenerar"]
      T2["Aba 'Testar' → Executar geração"]
    end
    T1 -->|"POST .../generate-blueprints"| AR["generateForEmails()<br/>= ARCHITECT"]
    AR --> ARO["Montador + Blueprint por loja<br/>(store_email_references + blueprints)"]
    T2 -->|"POST .../generate-email"| RE["generateEmail() (síncrono, ~300s)"]
    RE --> REO["seed → image → html → status 'ready'"]

    style AR fill:#1F1F1F,color:#fff
    style RE fill:#1F1F1F,color:#fff
```

### Teste A — Aba "Geradas" → **Regenerar** (testa o Architect)

| Item | Detalhe |
|---|---|
| **Rota** | `POST /api/admin/stores/[id]/generate-blueprints` |
| **Função** | `generateForEmails()` → `generateBlueprintAndReference()` por email |
| **O que roda** | Montador (HTML das seções do outline) → Blueprint (extrai do HTML) |
| **Grava** | `store_email_references` + `store_email_blueprints` |
| **Onde ver** | a própria aba mostra, por email, o **HTML montado** (iframe) + a **estrutura extraída** |
| **NÃO envolve** | copy, imagem ou HTML final — é só a camada de **estrutura/forma** |

### Teste B — Aba "Testar" → **Executar geração**

A aba **verifica se o email já tem copy** e ramifica (orquestrado por
`runTestGeneration` em `src/lib/agents/test-generation.service.ts`):

```mermaid
flowchart TD
    X["Executar geração"] --> Y{"Email tem copy?<br/>(algum bloco com content)"}
    Y -->|"SIM"| W1["Montador → Blueprint"]
    W1 --> W2["render síncrono: seed* → imagem → HTML"]
    W2 --> W3["status: ready ✅"]
    Y -->|"NÃO"| Z1["dispatch: Montador → Blueprint → seed → N8N"]
    Z1 --> Z2["status: dispatched · render virá depois (gate/callback)"]

    style W3 fill:#1f7a3d,color:#fff
    style Z2 fill:#1f4e8c,color:#fff
```

> \* No caminho **com copy**, o seed roda em modo `skipSeed` (não deleta os
> blocos), **preservando a copy** — o HTML usa `email_blocks.content`.

| Item | Detalhe |
|---|---|
| **Rota** | `POST /api/admin/stores/[id]/generate-email` |
| **Detecção de copy** | `emailHasCopy()` — algum `email_blocks.content` com ≥ 1 chave |
| **Com copy** | `generateBlueprintAndReference()` (Architect) → `generateEmail({ skipSeed: true })` (render síncrono) → `ready` |
| **Sem copy** | `dispatchEmailCopyWebhook({ flowIds:[flowId] })` — faz Architect + seed + N8N; render assíncrono depois → `dispatched` |
| **Polling** | só no caminho com copy: `GET .../generation-status/[batchId]` (tempo/tokens/custo por agente) |

Etapas exibidas na UI: **Montador → Blueprint → Seed → Copy → Imagem → HTML**.
Erros agora aparecem com a **mensagem real** (não mais `[object Object]`).

> Botão **"Pré-visualizar vars HTML"**: mostra as variáveis resolvidas que entram
> no prompt do HTML agent (debug), **sem** gerar nada.

### ⚠️ Notas

- No caminho **sem copy**, o N8N é disparado para o **flow inteiro** do email
  (`flowIds:[flowId]`), não só o email selecionado. O render vem depois, via
  gate de brand / callback (assíncrono) — por isso o status é `dispatched`.
- No caminho **com copy**, o Architect atualiza o reference/blueprint da loja e o
  HTML é regenerado **sobre a copy existente** (preservada pelo `skipSeed`).

---

## 6. Arquivos-chave

| Camada | Arquivo |
|---|---|
| Orquestrador do Architect | `src/lib/agents/architect/generate.service.ts` |
| Montador | `src/lib/agents/architect/component-assembler.service.ts` |
| Blueprint | `src/lib/agents/architect/blueprint-generator.service.ts` |
| Normalização das seções | `src/lib/agents/architect/outline-sections.ts` |
| Dispatch (Architect+Seed+N8N) | `src/lib/services/email-copy-webhook.service.ts` |
| Webhook de copy (N8N) | `src/app/api/webhooks/n8n/email-copy/route.ts` |
| Render (fase 2) | `src/lib/agents/phase2-runner.service.ts` |
| Render síncrono (teste) | `src/lib/agents/email-generation.service.ts` |
| Watchdog | `src/app/api/cron/email-generation-watchdog/route.ts` |
| Hub / abas | `src/components/email-generation/email-generation-workspace.tsx` |
| Aba "Geradas" | `src/components/email-generation/generated-inspector.tsx` |

---

*Atualizado: Junho/2026 — inversão Montador→Blueprint + aba "Geradas".*
