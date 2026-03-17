# Revisao Geral — Auditoria Completa do Codebase

**Data:** 2026-03-17
**Agentes envolvidos:** QA, Dev, Architect, Data Engineer, Analyst, SM, PO

Auditoria completa do codebase por 7 agentes especializados.
~100 achados organizados em 3 sprints de correcao.

---

## Sprint 1 — Seguranca & Estabilidade (URGENTE)

| Story | Titulo | Severidade | Esforco | Status | Batch |
|-------|--------|-----------|---------|--------|-------|
| RG-S1 | Fix mass assignment em portal-users PATCH | CRITICAL | LOW | Reviewed | 1 |
| RG-S2 | Remover exec_sql RPC e debug endpoint | CRITICAL | LOW | Reviewed | 1 |
| RG-S6 | Adicionar requireRole no DELETE clients/manage | HIGH | LOW | Reviewed | 1 |
| RG-S3 | Fix cron auth bypass + requireCronAuth helper | CRITICAL | LOW | Reviewed | 2 |
| RG-S8 | timingSafeEqual em todos HMAC (combinar com S3) | ~~MEDIUM~~ **LOW** | LOW | Reviewed | 2 |
| RG-S7 | Nao skipar webhook verification quando secret ausente | HIGH | LOW | Reviewed | 3 |
| RG-S5 | Validar store_id ownership em integrations/save | HIGH | ~~LOW~~ **MEDIUM** | Reviewed | 4 |
| RG-D2 | Adicionar SET search_path em SECURITY DEFINER functions | CRITICAL | LOW | Ready for Dev | — |
| RG-D1 | Fix USING(true) em 7 tabelas | CRITICAL | MEDIUM | Ready for Dev | — |
| RG-D3 | Fix is_org_owner() deprecado em policies e helpers | HIGH | MEDIUM-HIGH | Ready for Dev | — |

## Sprint 2 — Metricas & Bugs

| Story | Titulo | Severidade | Esforco |
|-------|--------|-----------|---------|
| RG-M1 | Padronizar open rate (opens/delivered everywhere) | CRITICAL | MEDIUM |
| RG-M2 | Cap recovery rate em 100% + fix weighted averages | HIGH | LOW |
| RG-M3 | Fix timezone hardcoded no portal dashboard | HIGH | LOW |
| RG-M4 | Fix click rate unit inconsistency (decimal vs %) | MEDIUM | MEDIUM |
| RG-B1 | Tornar delete+insert transacional em sync-persistence | HIGH | MEDIUM |
| RG-B2 | Fix orgId empty string em portal-auth | HIGH | LOW |
| RG-B3 | Distinguir encryption error de missing key no cron | HIGH | LOW |
| RG-B4 | Fix self-fetch HTTP anti-pattern em portal store report | HIGH | HIGH |

## Sprint 3 — Refatoracao & Tech Debt

| Story | Titulo | Severidade | Esforco | Status |
|-------|--------|-----------|---------|--------|
| RG-A1 | AuthContext unificado (eliminar queries duplicadas) | HIGH | MEDIUM | Ready for Dev |
| RG-A2 | Extrair services das API routes gigantes | HIGH | HIGH | Ready for Dev |
| RG-A3 | Eliminar resolveOrgId duplicados + padronizar responses | MEDIUM | LOW | Ready for Dev |
| RG-D4a | Adicionar indexes nas FKs faltando | MEDIUM | LOW | Ready for Dev |
| RG-D4b | Adicionar paginacao em list endpoints | MEDIUM | MEDIUM | Ready for Dev |
| RG-S9 | Migrar rate limiting para Redis/Upstash | HIGH | MEDIUM-HIGH | Reviewed (Batch 5) |

**Nota:** RG-S8 movido para Sprint 1 Batch 2 (combinar com RG-S3). RG-S9 precisa decisao de infra antes de iniciar.

---

## Ordem Interna Recomendada (pos-review)

### Sprint 1
1. **RG-D2** (search_path) — fundacao de toda RLS, zero risco
2. **RG-S2** (debug endpoint) — deletar arquivos, zero risco
3. **RG-S1** (mass assignment) — 1 arquivo, alto impacto
4. **RG-S3** (cron auth + helper com timingSafeEqual)
5. **RG-S7** (webhook verification)
6. **RG-S5** (store ownership)
7. **RG-S6** (role check delete)
8. **RG-D1** (USING(true) 7 tabelas) — depende de D2
9. **RG-D3** (is_org_owner) — depende de D2, mais complexa

### Sprint 2
1. **RG-B2** (orgId empty string) — 1 linha, impacto alto
2. **RG-B3** (encryption error) — protege cron
3. **RG-M1** (open rate) — antes de M4
4. **RG-M2** (cap recovery + weighted avg)
5. **RG-M3** (timezone)
6. **RG-M4** (click rate units) — apos M1
7. **RG-B1** (transacional sync)
8. **RG-B4** (self-fetch) — idealmente apos A2

### Sprint 3
1. **RG-S9** (rate limiting) — protege endpoints publicos, priorizar
2. **RG-A1** (AuthContext)
3. **RG-A2** (extrair services) — dividir em A2a/A2b/A2c
4. **RG-A3** (resolveOrgId + responses) — apos A1
5. **RG-D4a** (indexes) — migration pura
6. **RG-D4b** (paginacao) — requer coordenacao frontend
7. **RG-S8** (timingSafeEqual) — residual de S3

## Dependencias Criticas

```
RG-D2 (search_path) → ANTES de → RG-D1, RG-D3
RG-S3 (cron auth helper) → cria helper para → RG-S8
RG-M1 (open rate) → ANTES de → RG-M4 (click rate)
RG-A2 (extract services) → desbloqueia → RG-B4 (self-fetch)
RG-A1 (AuthContext) → pode subsumir → RG-A3 (resolveOrgId)
RG-M1, RG-M2, RG-M3 → ANTES de → RG-A2 (evitar conflitos de merge)
```

## GAPs Identificados (nao cobertos por nenhuma story)

1. **Auditoria de endpoints sem autenticacao** — nenhuma story mapeia sistematicamente quais rotas sao acessiveis sem `requireAuth`
2. **CORS policy** — nenhuma story verifica se configuracao CORS esta correta ou se ha endpoints expostos indevidamente
3. **Observabilidade** — nenhuma story aborda structured logging, APM, ou error tracking (Sentry)
4. **Testes automatizados** — nenhuma story cria testes para validar os fixes de seguranca (regressoes futuras podem reintroduzir os mesmos problemas)
5. **`supabase/pipeline/*.sql`** — nao esta claro se esses arquivos sao aplicados em producao. Se sim, precisam do mesmo fix de `is_org_owner()` e `search_path`

## Review Consolidado RG-S (2026-03-17)

Revisao por 4 agentes: QA, DBM, Arquiteto, Dev. Todas as 8 vulnerabilidades CONFIRMADAS no codigo.

### Mudancas pos-review:
- **RG-S8 severidade:** MEDIUM → LOW (timing attacks impraticos em rede, best-practice only)
- **RG-S5 esforco:** LOW → MEDIUM (8+ callers, errata corrigida: updateStoreCredentials NAO aceita orgId)
- **RG-S8 sprint:** Movido de Sprint 3 para Sprint 1 Batch 2 (combinar com RG-S3)
- **RG-S2:** Achado novo — `client-stores.tsx:234` referencia endpoint a ser deletado
- **RG-S6:** Achado novo — CASCADE em 30+ tabelas torna delecao devastadora
- **RG-S7:** Risco de breaking change — tracking stores sem webhook_secret serao rejeitadas

### Ordem de execucao (batches):
1. **Batch 1 (paralelo):** S1 + S2 + S6 — isolados, zero dependencias
2. **Batch 2:** S3 + S8 — helper requireCronAuth com timingSafeEqual
3. **Batch 3:** S7 — webhook verification (verificar dados prod antes)
4. **Batch 4:** S5 — store ownership (Fase 1: integrations/save, Fase 2: demais callers)
5. **Batch 5:** S9 — Redis migration (precisa decisao infra)

## Notas de Seguranca

- **Testar TODAS as migrations RLS em Supabase branch database** antes de aplicar em producao — policies incorretas podem bloquear acesso de todos os usuarios
- **RG-D3 DROP CASCADE**: verificar dependentes antes de dropar `is_org_owner()` sem param
