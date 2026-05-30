---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@qa (Quinn)"
Status: In Review
Epic: AE - Agent Email Generation
Fase: Agente IA
Estimate: M
---

# Story AE-5 — QA Agent: valida HTML+copy+briefing antes de marcar `ready`

## User Story

**Como** plataforma de qualidade,
**quero** que um agente Claude valide cada email gerado contra o briefing antes de marcar `ready`,
**para que** o designer só veja emails que passaram em verificações automatizadas de spam, links, tom e cobertura de claims.

---

## Contexto

O fluxo (story AE-3) termina a fase 2 chamando `runQaAgent({ html, blocks, briefing, brand, blueprint })`. Esta story implementa o agente.

Resposta esperada:
```ts
type QaResult = {
  passed: boolean
  issues: Array<{
    type: QaIssueType
    severity: 'low' | 'medium' | 'high'
    message: string
    location?: string  // ex: "block:hero.headline" ou "html:line-42"
  }>
  meta: {
    model: string
    tokens_input: number
    tokens_output: number
    cost_cents: number
    duration_ms: number
  }
}
```

`passed` é derivado de: `issues.every(i => i.severity !== blockSeverity)` onde `blockSeverity = env.EMAIL_QA_BLOCK_SEVERITY || 'high'`.

---

## Acceptance Criteria

### AC AE-5.1 — Tipos de issue suportados
- [x] `QaIssueType` enum em `src/types/email-generation.ts` — 8 valores definidos pela AE-1, mantidos sem mudanca:
  - `spam_score_alto`
  - `links_quebrados`
  - `blocos_vazios`
  - `tom_inconsistente`
  - `claim_nao_coberto`
  - `html_invalido`
  - `alt_text_faltando` _(AE-1; story doc tinha `alt_text_ausente` — outdated)_
  - `compliance` _(AE-1; story doc tinha `cta_ambiguo` — outdated)_
- [x] Documentado no comentário do tipo (linhas 22-24 do arquivo)
- [x] `QaResult` + `QaResultMeta` adicionados

### AC AE-5.2 — Prompt versionado em email_agent_configs
- [x] Seed em `supabase/migrations/20260530d_qa_agent_seed.sql` (renomeado — `20260530b` ja existia da AE-2)
- [x] System prompt + user template com placeholders `{{html}}`, `{{blocks_json}}`, `{{briefing_json}}`, `{{brand_json}}`, `{{blueprint_objective}}`
- [x] `output_schema` em JSONB com schema completo dos 8 issue types
- [x] Idempotente via `WHERE NOT EXISTS` (alem do unique partial index existente)
- [ ] Validado em DB real (depende de `supabase db push` em ambiente staging)

Migration original sugerida no story:
  ```sql
  INSERT INTO email_agent_configs (agent_type, model, system_prompt, user_template, temperature, max_tokens, output_schema, is_active, version)
  VALUES ('qa', 'claude-sonnet-4-6', $SYSTEM_PROMPT, $USER_TEMPLATE, 0.2, 1500, $JSON_SCHEMA, true, 1);
  ```
- [x] System prompt: define papel do agente, formato JSON estrito, tipos de issue
- [x] User template: variáveis `{{html}}`, `{{blocks_json}}`, `{{briefing_json}}`, `{{brand_json}}`, `{{blueprint_objective}}`
- [x] `output_schema` em JSONB: JSON Schema validando estrutura de `QaResult`

### AC AE-5.3 — Função runQaAgent
- [x] Em `src/lib/agents/chains/qa.chain.ts`
- [x] Assinatura (com campos opcionais `flowId`, `batchId`, `triggeredBy` para telemetria)
- [x] Carrega config ativo de `email_agent_configs` (agent_type=qa, is_active=true)
- [x] Sem config → degrade seguro `{passed:true, issues:[], meta.model:'noop'}` + log warn
- [x] Renderiza placeholders `{{var}}` no user_template
- [x] Chama LangChain `ChatAnthropic` (padrao real do projeto — html.chain.ts/copy.chain.ts usam LangChain, story doc tinha info incorreta sobre Anthropic SDK direto)
- [x] Parse JSON tolerante (aceita markdown fences) + 1 retry pedindo reformatacao
- [x] Validacao Zod (`QaOutputSchema`) — Zod ja no projeto, ajv nao
- [x] Schema invalido → fallback `{passed:false, issues:[{type:'html_invalido', severity:'high', message:'qa_output_invalid'}]}`

### AC AE-5.4 — Threshold de bloqueio
- [x] `passed = !issues.some(i => SEVERITY_ORDER[i.severity] >= threshold)` — comparacao por nivel para que `EMAIL_QA_BLOCK_SEVERITY=medium` bloqueie tambem `high`
- [x] `blockSeverity` lido de `process.env.EMAIL_QA_BLOCK_SEVERITY ?? 'high'`
- [x] Documentado no top do arquivo (linhas 22-23)
- [x] `getBlockingSeverity()` exportada para testes/reuso

### AC AE-5.5 — Verificações determinísticas pré-LLM
- [x] `runDeterministicChecks(html, blocks)` exportada e roda ANTES do LLM:
  - **HTML válido**: regex `/<html\b/i` + `/<\/html\s*>/i` → issue `html_invalido` severity=high
  - **Blocos vazios**: enumera blocks; checa se algum value de `content` e nao-vazio → issue `blocos_vazios` severity=medium
  - **Links quebrados**: regex extrai `href="..."` (single/double quotes), aceita `#`/`mailto:`/`tel:`, rejeita `javascript:` schemes (high) e URLs que `new URL()` throwe (medium). NAO faz HTTP request.
- [x] Issues determinísticas mescladas com issues do LLM no resultado final
- [x] Cobertura de testes unitarios para cada um dos 3 checks

### AC AE-5.6 — Telemetria
- [x] Antes de retornar: INSERT em `email_generation_runs` via `logGenerationRun` em todos os caminhos (success, error, skipped/degrade-safe). Inclui `raw_output` truncado em 5000, `parsed_output` com `{passed, issues_count, issues_by_severity}`. `agent_config_id` passado quando config carregada.
- [ ] Validar persistencia real com DB ao integrar staging
- Original do story:
  ```ts
  {
    email_id, store_id, flow_id,
    agent: 'qa',
    agent_config_id: $configId,
    status: passed ? 'success' : 'error',
    model, tokens_input, tokens_output,
    cost_cents, duration_ms,
    rendered_prompt: $renderedUserPrompt.slice(0, 5000),  // truncate
    raw_output: $rawClaudeOutput.slice(0, 5000),
    parsed_output: { passed, issues_count: issues.length, issues_by_severity: {...} }
  }
  ```

### AC AE-5.7 — Performance budget
- [x] Max tokens: 1500 (seed)
- [x] Timeout 15s via `AbortController` → fallback `{passed:false, issues:[{type:'html_invalido', severity:'high', message:'qa_timeout'}]}` + log error + telemetria com `meta.model='qa-timeout'`
- [ ] Latência p95 ≤ 8s — depende de medicao em producao com Claude real (tuning pos-deploy)

### AC AE-5.8 — Testes
- [x] 17 testes em `src/lib/agents/chains/qa.chain.test.ts`, todos passando:
  - 6 testes de `runDeterministicChecks` (html_invalido, blocos_vazios em ambos os sentidos, links_quebrados javascript:, anchors/mailto/tel aceitos)
  - 3 testes de `getBlockingSeverity` (default, override, valor invalido)
  - 2 testes de degrade seguro (sem config: passed=true; com html invalido: propaga issues)
  - 6 testes com config + Claude mockado (issues vazias, severity high, severity low, retry fallback, JSON com fences, merge det+LLM)

---

## Tarefas

- [x] Estender `src/types/email-generation.ts` com `QaResult` + `QaResultMeta` (tipos `QaIssue`/`QaIssueType` ja existiam da AE-1)
- [x] Criar `src/lib/agents/chains/qa.chain.ts`
- [x] Criar `supabase/migrations/20260530d_qa_agent_seed.sql` com prompt seed (sufixo `d` porque `b` e `c` ja foram usados por AE-2/AE-4)
- [x] Integrar `runQaAgent` no `phase2-runner.service.ts` (substitui `runQaAgentMock`)
- [x] `EMAIL_QA_BLOCK_SEVERITY=high` em `.env.example` (ja adicionado na AE-3, validado)
- [x] Testes em `src/lib/agents/chains/qa.chain.test.ts` (17 testes)

---

## Dev Notes

### Exemplo de system prompt (rascunho — produto pode iterar)

```
Você é um QA reviewer de emails de marketing. Receberá HTML, blocos estruturados, briefing da loja e identidade da marca. Sua tarefa: identificar problemas que comprometam entrega, conversão ou alinhamento com a marca.

Retorne JSON estrito no formato:
{
  "passed": boolean,
  "issues": [
    { "type": "...", "severity": "low|medium|high", "message": "...", "location": "..." }
  ]
}

Tipos de issue permitidos:
- spam_score_alto: subject ou body com gatilhos clássicos de spam (ALL CAPS, "grátis !!!", múltiplos pontos de exclamação)
- links_quebrados: URLs malformadas, links sem href, mailto: quebrado
- blocos_vazios: bloco com headline/body vazio ou só placeholder
- tom_inconsistente: tom do texto diverge significativamente do `tom_voz` do briefing
- claim_nao_coberto: promessa no email (ex: "frete grátis acima de R$X") não corresponde ao briefing
- html_invalido: estrutura HTML quebrada, tags não fechadas
- alt_text_ausente: <img> sem atributo alt
- cta_ambiguo: botão sem texto claro ou destino ambíguo

Severity:
- high: bloqueia envio (spam_score_alto crítico, links_quebrados em CTA principal, claim_nao_coberto, html_invalido)
- medium: deve ser revisado mas pode passar
- low: nota informativa

Seja específico em `location`: use `block:hero.headline`, `html:line-N`, `subject` etc.
```

### Exemplo de user template

```
HTML:
```html
{{html}}
```

BLOCOS (JSON):
```json
{{blocks_json}}
```

BRIEFING (JSON):
```json
{{briefing_json}}
```

MARCA (JSON):
```json
{{brand_json}}
```

OBJETIVO DESTE EMAIL: {{blueprint_objective}}

Liste os issues no formato JSON especificado.
```

### Por que verificações determinísticas + LLM?

LLM é caro e lento. Verificações triviais (HTML mal-formado, blocos vazios) podem ser feitas em < 50ms sem custo. LLM cobre o que não é trivial: tom, claims, ambiguidade.

### Output schema (JSON Schema)

```json
{
  "type": "object",
  "required": ["passed", "issues"],
  "properties": {
    "passed": { "type": "boolean" },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "severity", "message"],
        "properties": {
          "type": { "enum": ["spam_score_alto","links_quebrados","blocos_vazios","tom_inconsistente","claim_nao_coberto","html_invalido","alt_text_ausente","cta_ambiguo"] },
          "severity": { "enum": ["low","medium","high"] },
          "message": { "type": "string" },
          "location": { "type": "string" }
        }
      }
    }
  }
}
```

---

## Reuso de padrões existentes

- Chains pattern: `src/lib/agents/chains/html.chain.ts`
- Anthropic call direto: copiar de `html.chain.ts`
- Telemetria: `src/lib/agents/callbacks/telemetry.callback.ts`
- Validação JSON Schema: verificar se `ajv` está no projeto; senão usar Zod gerado a partir do schema

---

## File List

### A criar
- `src/lib/agents/chains/qa.chain.ts`
- `src/lib/agents/chains/qa.chain.test.ts`
- `supabase/migrations/20260530b_qa_agent_seed.sql`

### A modificar
- `src/types/email-generation.ts` — adicionar `QaIssue`, `QaIssueType`, `QaResult`
- `src/lib/agents/phase2-runner.service.ts` (AE-3) — substituir mock por chamada real
- `.env.example` — adicionar `EMAIL_QA_BLOCK_SEVERITY`

---

## Dependencias

- **Bloqueado por**: AE-1 (`agent_type='qa'` no CHECK)
- **Em paralelo com**: AE-3 (que mocka inicialmente)
- **Bloqueia**: nada — qualidade do `ready` depende dela mas pipeline funciona com mock

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| QA agent reprova tudo (falso positivo) | Média | Threshold high; severity baixa não bloqueia; tunable via env |
| QA agent aprova claims fabricadas | Média | Iteração de prompt em produção; AE-8 permite editar versionado |
| Cost alto: Claude full toda vez | Média | Verificações determinísticas reduzem trabalho do LLM; max_tokens=1500 |
| LLM retorna JSON inválido | Média | Retry 1x + fallback `passed=false` se ainda inválido |
| Schema enum drift entre TS e SQL | Baixa | Tipos centralizados em `email-generation.ts` |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
| 2026-05-30 | @dev | Story implementada. qa.chain.ts com pre-checks deterministicos + LangChain ChatAnthropic + Zod + timeout 15s; phase2-runner integra runQaAgent real (mock removido); migration 20260530d seeda v1 do prompt; 17 testes verdes; typecheck OK. ACs 5.1-5.5, 5.7-5.8 fechados em codigo; 5.2/5.6 dependentes de DB real ficam abertos. |
