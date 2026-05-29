---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@qa (Quinn)"
Status: Draft
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
- [ ] `QaIssueType` enum em `src/types/email-generation.ts`:
  - `spam_score_alto`
  - `links_quebrados`
  - `blocos_vazios`
  - `tom_inconsistente`
  - `claim_nao_coberto`
  - `html_invalido`
  - `alt_text_ausente`
  - `cta_ambiguo`
- [ ] Documentado no comentário do tipo

### AC AE-5.2 — Prompt versionado em email_agent_configs
- [ ] Seed em `supabase/migrations/20260530b_qa_agent_seed.sql` inserindo 1 row em `email_agent_configs`:
  ```sql
  INSERT INTO email_agent_configs (agent_type, model, system_prompt, user_template, temperature, max_tokens, output_schema, is_active, version)
  VALUES ('qa', 'claude-sonnet-4-6', $SYSTEM_PROMPT, $USER_TEMPLATE, 0.2, 1500, $JSON_SCHEMA, true, 1);
  ```
- [ ] System prompt: define papel do agente, formato JSON estrito, tipos de issue
- [ ] User template: variáveis `{{html}}`, `{{blocks_json}}`, `{{briefing_json}}`, `{{brand_json}}`, `{{blueprint_objective}}`
- [ ] `output_schema` em JSONB: JSON Schema validando estrutura de `QaResult`

### AC AE-5.3 — Função runQaAgent
- [ ] Em `src/lib/agents/chains/qa.chain.ts`
- [ ] Assinatura:
  ```ts
  async function runQaAgent(input: {
    storeId: string
    emailId: string
    html: string
    blocks: Array<{ block_type: string; content: Record<string, unknown> }>
    briefing: StoreBriefing
    brand: StoreBrandIdentity
    blueprintObjective: string
  }): Promise<QaResult>
  ```
- [ ] Carrega config ativo: `SELECT * FROM email_agent_configs WHERE agent_type='qa' AND is_active=true LIMIT 1`
- [ ] Se nenhum config: retorna `{passed:true, issues:[], meta:{...}}` + log warn (degrade seguro)
- [ ] Renderiza prompt: substitui `{{var}}` no user_template
- [ ] Chama Anthropic Messages API (padrão direto, sem SDK — copiar de `html.chain.ts`)
- [ ] Parse JSON do output (com retry de 1x se primeira resposta não for JSON válido — pede pra reformatar)
- [ ] Valida contra `output_schema` usando `ajv` (já no projeto?) ou Zod equivalente
- [ ] Se schema falhar: retorna `{passed:false, issues:[{type:'html_invalido', severity:'high', message:'qa_output_invalid'}]}`

### AC AE-5.4 — Threshold de bloqueio
- [ ] `passed = !issues.some(i => i.severity === blockSeverity)`
- [ ] `blockSeverity` lido de `process.env.EMAIL_QA_BLOCK_SEVERITY ?? 'high'`
- [ ] Documentado no top do arquivo

### AC AE-5.5 — Verificações determinísticas pré-LLM
- [ ] ANTES de chamar Claude, fazer checks determinísticos rápidos:
  - **HTML válido**: parse rápido com regex/básico (presença de `<html>`, fechamento de tags top-level)
  - **Blocos vazios**: enumera blocks; se algum tem `content` vazio ou `headline === ''`, adiciona issue `blocos_vazios`
  - **Links quebrados**: regex extrai `href="..."` e valida que cada URL é válida (http/https + parseURL não throw). NÃO faz request HTTP (pra não inflar latência).
- [ ] Issues determinísticas são mescladas com issues do LLM no resultado final

### AC AE-5.6 — Telemetria
- [ ] Antes de retornar: INSERT em `email_generation_runs`:
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
- [ ] Latência alvo: p95 ≤ 8s (LLM call + parse)
- [ ] Max tokens output: 1500 (issues raramente passam de 5-10 itens)
- [ ] Se LLM call demora > 15s: timeout + retorna `{passed:false, issues:[{type:'html_invalido', severity:'high', message:'qa_timeout'}]}` + log error

### AC AE-5.8 — Testes
- [ ] Teste unit: html com bloco vazio → issue `blocos_vazios` adicionada determinísticamente
- [ ] Teste unit: html sem `<html>` → issue `html_invalido` adicionada
- [ ] Teste unit: link `href="javascript:..."` → issue `links_quebrados`
- [ ] Teste integration (com mock do Claude): output válido → passed=true
- [ ] Teste integration: Claude retorna issue severity=high → passed=false

---

## Tarefas

- [ ] Criar `src/types/email-generation.ts` (extender se já existe) com `QaIssue`, `QaIssueType`, `QaResult`
- [ ] Criar `src/lib/agents/chains/qa.chain.ts`
- [ ] Criar `supabase/migrations/20260530b_qa_agent_seed.sql` com prompt seed
- [ ] Integrar `runQaAgent` no `phase2-runner.service.ts` (story AE-3)
- [ ] Adicionar `EMAIL_QA_BLOCK_SEVERITY=high` em `.env.example`
- [ ] Testes em `src/lib/agents/chains/qa.chain.test.ts`

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
