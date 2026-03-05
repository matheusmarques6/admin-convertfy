# Analise de Cron Jobs - 2026-03-05

## Resumo dos Cron Jobs

### Registrados no `vercel.json`

| Rota | Schedule | Frequencia | Auth `CRON_SECRET` |
|------|----------|------------|---------------------|
| `/api/cron/sync-reports` | `*/30 * * * *` | A cada 30 min | Sim |
| `/api/cron/store-alerts-check` | `0 8 * * 1` | Segunda 8h UTC | Sim (com fallback) |
| `/api/cron/tracking-sync` | `0 */6 * * *` | A cada 6 horas | Sim |

### NAO registrado no `vercel.json` (BUG)

| Rota | Auth `CRON_SECRET` | Problema |
|------|---------------------|----------|
| `/api/cron/board-automation` | **NAO** | Nunca executa automaticamente + sem protecao de auth |

---

## Status de Execucao (consultado em 2026-03-05 ~20:30 UTC)

### `sync-reports` - FUNCIONANDO

**Lock atual:**
- `is_running: true` (execucao em andamento as 20:30 UTC)
- Ultima finalizacao: `2026-03-05 20:03:16 UTC`
- Executa a cada 30 min conforme esperado

**Resultados no banco:**
- **20 registros `ok`** (5 lojas x 4 periodos)
- **12 registros `error`** (3 lojas x 4 periodos)

**Lojas sincronizando com sucesso (status=ok):**

| Loja | 7d | 15d | 30d | 90d |
|------|-----|------|------|------|
| Blessed Choice | ok (20:01) | ok (20:01) | ok (20:01) | ok (20:02) |
| Blue Wolf | ok (20:01) | ok (18:02) | ok (20:01) | ok (17:32) |
| Innova Bay | ok (20:02) | ok (18:03) | ok (20:02) | ok (18:03) |
| Karm | ok (17:30) | ok (17:01) | ok (17:30) | ok (17:01) |
| Vivazz | ok (20:31) | ok (20:31) | ok (20:31) | ok (20:31) |

**Lojas com erro:**

| Loja | Erro | Acao Necessaria |
|------|------|-----------------|
| **BRINQUEMAIS** (`5eb17440`) | `[INVALID_KEY] Non-ASCII character in API key ...7466` | Pedir ao cliente para re-salvar a chave Klaviyo pelo portal (caractere bullet U+2022 na key) |
| **ToysLand** (`deebaa77`) | `[PERMISSION] Missing scopes: metrics:read` | Cliente precisa gerar nova API key com scope `metrics:read` |
| **Almira** (`f22f5a20`) | `[PERMISSION] Missing scopes: accounts:read` | Cliente precisa gerar nova API key com scope `accounts:read` |

**Nota:** Blessed Choice tem `klaviyo_validation_error: "Erro Klaviyo API: HTTP 400"` de 2026-03-04, mas os syncs recentes (2026-03-05) estao passando com sucesso. Pode ter sido um erro transiente.

**Anomalia `campaign_revenue = 0`:** Todas as lojas com sucesso mostram `klaviyo_campaign_revenue = 0.00` e toda a receita vai para `flow_revenue`. Investigar se campaigns nao estao sendo atribuidas corretamente ou se nenhuma loja usa campaigns.

### `tracking-sync` - SEM DADOS

- **0 lojas** com tracking habilitado (`tracking_config.enabled = true`)
- **0 registros** na tabela `order_tracking_cache`
- O cron executa a cada 6h mas nao tem dados para processar (nenhuma loja ativou tracking)
- **Status:** Funcional, mas ocioso

### `store-alerts-check` - SEM EVIDENCIA DIRETA

- Executa apenas 1x/semana (segunda 8h UTC)
- Nao ha tabela de lock dedicada para verificar ultima execucao
- Provavelmente funcionando, mas sem como confirmar sem logs da Vercel

### `board-automation` - NAO EXECUTA

- **NAO esta no `vercel.json`** — nunca e disparado pela Vercel
- **NAO valida `CRON_SECRET`** — endpoint aberto (qualquer um pode chamar)
- Responsavel por: checar feedbacks atrasados + contratos expirando
- **Impacto:** Automacoes de board/tasks nunca rodam automaticamente

---

## Problemas Identificados

### P1: `board-automation` fora do cron (CRITICO)
- **O que:** Endpoint existe mas nao esta registrado no `vercel.json`
- **Impacto:** Feedbacks atrasados e contratos expirando nunca sao checados automaticamente
- **Fix:** Adicionar ao `vercel.json` + adicionar validacao de `CRON_SECRET`

### P2: `board-automation` sem autenticacao (SEGURANCA)
- **O que:** Unico cron que NAO valida `CRON_SECRET`
- **Impacto:** Qualquer pessoa pode triggar o endpoint
- **Fix:** Adicionar validacao `Bearer ${CRON_SECRET}` igual aos outros crons

### P3: Lojas com chaves Klaviyo invalidas (OPERACIONAL)
- **BRINQUEMAIS:** Key corrompida com caractere Unicode (Story 16.6, AC 16.6.3 — pendente)
- **ToysLand:** Key sem scope `metrics:read`
- **Almira:** Key sem scope `accounts:read`
- **Fix:** Contatar clientes para re-gerar/re-salvar as chaves

### P4: `campaign_revenue` sempre zero (INVESTIGAR)
- **O que:** Todas as 5 lojas com sucesso mostram `campaign_revenue = 0`
- **Possivel causa:** Nenhuma loja usa campaigns, ou bug na atribuicao
- **Fix:** Verificar no Klaviyo se essas lojas realmente nao tem campaigns com receita

### P5: Lock potencialmente stale (MONITORAR)
- **O que:** Lock `sync_reports` esta com `is_running: true` desde 20:30 UTC
- **Mitigacao existente:** Stale lock timeout de 10 min ja implementado no codigo
- **Fix:** Apenas monitorar. Se persistir, verificar se cron esta crashando sem liberar lock

---

## Acoes Recomendadas

### Imediatas (codigo) — CORRIGIDOS
1. [x] Adicionar `board-automation` ao `vercel.json` com schedule `0 9 * * 1-5` (seg-sex 9h UTC)
2. [x] Adicionar validacao `CRON_SECRET` no `board-automation/route.ts`

### P6: `store-alerts-check` com auth fraca (MENOR)
- **O que:** Usa `if (cronSecret && ...)` em vez de `if (!cronSecret || ...)`
- **Impacto:** Se `CRON_SECRET` fosse removido, o endpoint ficaria aberto. Risco baixo pois CRON_SECRET esta definido.
- **Fix:** Padronizar para `if (!cronSecret || ...)` igual aos outros 3 crons

### Operacionais (contato com clientes)
3. [ ] BRINQUEMAIS: Pedir para re-salvar chave Klaviyo pelo portal
4. [ ] ToysLand: Pedir para gerar nova key com scope `metrics:read`
5. [ ] Almira: Pedir para gerar nova key com scope `accounts:read`

### Investigacao
6. [ ] Verificar por que `campaign_revenue = 0` em todas as lojas
7. [ ] Confirmar se `store-alerts-check` esta executando (verificar logs Vercel)

---

## Relatorio QA - 2026-03-05

### Escopo da Verificacao
Alteracoes em `vercel.json` e `src/app/api/cron/board-automation/route.ts`.

### Checklist de Validacao

| Check | Resultado |
|-------|-----------|
| TypeScript compila sem erros (`tsc --noEmit`) | PASS |
| Lint sem novos warnings | PASS (warnings pre-existentes, nenhum novo) |
| `vercel.json` e JSON valido | PASS |
| Todos os 4 crons listados no `vercel.json` | PASS |
| Cron expressions com 5 campos validos | PASS (4/4) |
| `board-automation` valida `CRON_SECRET` | PASS |
| Padrao de auth identico a `sync-reports` e `tracking-sync` | PASS (`!cronSecret \|\|` pattern) |
| Import `NextResponse` presente | PASS |
| Logica de negocio do endpoint inalterada | PASS (apenas auth guard adicionado antes) |
| Nenhum arquivo nao-relacionado modificado | PASS |

### Testes Unitarios
- **Status:** 294 passing, 5 failing (pre-existentes)
- **Causa dos failures:** Configuracao Jest/Babel nao suporta `satisfies` keyword do TS
- **Impacto nas mudancas:** Nenhum — falhas sao pre-existentes e nao relacionadas

### Ressalvas / Debt Encontrado
1. **P6 (novo):** `store-alerts-check` usa logica de auth mais fraca (`if (cronSecret && ...)` vs `if (!cronSecret || ...)`). Sem risco imediato pois `CRON_SECRET` esta definido, mas inconsistente com os outros 3 crons.
2. **Testes Jest quebrados:** 21 test suites falham por config Babel. Nao e escopo desta mudanca mas deve ser endereçado.

### Veredito
**APROVADO** — As mudancas estao corretas, consistentes e seguras para deploy.
