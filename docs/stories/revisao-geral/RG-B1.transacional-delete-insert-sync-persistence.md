---
Prioridade: High
Sprint: 2 - Metricas & Bugs
Assignee: "@dev"
Revisao: "@qa, @data-engineer"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "2 - Metricas & Bugs"
Esforco: MEDIUM
---

# Story RG-B1 — Tornar Delete+Insert Transacional em sync-persistence

## Story

**Como** engenheiro de infraestrutura,
**Quero** que operacoes de delete+insert em metricas e audiences sejam atomicas,
**Para que** uma falha no insert nao resulte em perda de dados.

## Contexto

### Problema

`sync-persistence.service.ts` usa padrao delete-then-insert em 3 locais:

1. **Flow metrics** (lines 36-68): DELETE all flow metrics → INSERT new ones
2. **Campaign metrics** (lines 70-102): DELETE all campaign metrics → INSERT new ones
3. **Audiences** (lines 403-437): DELETE all audiences → INSERT new ones

Se o INSERT falha (constraint violation, transient DB error), os dados deletados sao perdidos ate o proximo cron run. Pior: uma leitura do portal entre o DELETE e INSERT vera zero metricas.

### Impacto real

Com cron a cada 30min e portal sendo consultado ao mesmo tempo, ha uma janela (2-5 segundos de network round-trip) onde dados aparecem zerados.

## Acceptance Criteria

### AC1: Metricas — usar pure upsert
- [ ] Opcao A (preferida): Remover DELETE, usar `.upsert()` com `onConflict` adequado
- [ ] Opcao B: Criar RPC PL/pgSQL que wrapa DELETE+INSERT em uma transaction
- [ ] Garantir que metricas antigas (periodos que nao existem mais) sejam limpas periodicamente

### AC2: Audiences — usar pure upsert
- [ ] Mesmo approach para audiences
- [ ] `onConflict` por `store_id` + `audience_type` + `audience_id` (ou similar)

### AC3: Testar atomicidade
- [ ] Verificar que leitura concorrente nunca ve zero metricas durante sync
- [ ] Verificar que insert failure nao apaga dados existentes

## Notas Tecnicas

Se onConflict nao for viavel (chaves compostas complexas), criar RPC:
```sql
CREATE OR REPLACE FUNCTION upsert_flow_metrics(
  p_store_id UUID,
  p_period TEXT,
  p_metrics JSONB
) RETURNS void AS $$
BEGIN
  DELETE FROM klaviyo_flow_metrics WHERE store_id = p_store_id AND period = p_period;
  INSERT INTO klaviyo_flow_metrics SELECT * FROM jsonb_populate_recordset(null::klaviyo_flow_metrics, p_metrics);
END;
$$ LANGUAGE plpgsql;
```

## Arquivos Afetados

- `src/lib/services/sync-persistence.service.ts`
- Possivelmente nova migration para RPC ou constraint de upsert
