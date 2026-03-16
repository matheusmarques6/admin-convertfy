# Epic 15 — DB/RLS Infrastructure Bugs & Portal Data Integrity

**Status:** Ready for Development
**Prioridade:** High
**Owner:** @dev (Dex)
**SM:** @sm (River)

---

## Contexto

Auditoria completa da infraestrutura de dados (dashboard, campanhas, flows) revelou um conjunto de bugs críticos de RLS, tabelas órfãs e falhas de isolamento multi-tenant que comprometem a integridade dos dados e a segurança do sistema.

---

## Problemas Identificados

| # | Severidade | Problema |
|---|-----------|---------|
| 1 | 🔴 HIGH | RLS policies em `klaviyo_campaigns` e `campaign_metrics` chamam `is_admin(auth.uid())` com argumento, mas a função atual é `is_admin()` sem parâmetros → erro em runtime ao avaliar RLS |
| 2 | 🟡 MEDIUM | Tabelas órfãs da migration `20250125_10_klaviyo_metrics.sql` (`klaviyo_campaigns`, `campaign_metrics`, `campaign_metrics_history`, `campaign_alerts`, `klaviyo_sync_config`, `klaviyo_sync_jobs`) nunca utilizadas — sistema usa `klaviyo_campaign_metrics` e `klaviyo_flow_metrics` |
| 3 | 🟡 MEDIUM | `email_logs` sem coluna `org_id` — sem isolamento multi-tenant; qualquer usuário autenticado pode inserir log sem tenant context |
| 4 | 🟡 MEDIUM | `dashboard_cache` write policy (`USING(true)`) sem `WITH CHECK` tenant guard — depende exclusivamente de application-level guard |
| 5 | 🔴 HIGH | Políticas legacy `USING: true` / `WITH CHECK: true` em `clients`, `client_stores`, `invoices`, `meetings`, `reports` — anulam via OR semantics todas as políticas hardened das stories anteriores |

---

## Stories

- **15.1** — Fix RLS Signature Mismatch: Todas as 6 tabelas legacy (nomes corrigidos, escopo expandido)
- **15.2** — Migrar código para remover referências às tabelas legacy (klaviyo-sync.ts, sync-reports)
- **15.2b** — DROP das tabelas legacy no banco (bloqueada por 15.1 + 15.2)
- **15.3** — Add org_id to email_logs for Multi-tenant Isolation
- **15.4** — Harden dashboard_cache: Migrar writes para adminClient + Policy Guard
- **15.5** — Drop Legacy Bypass RLS Policies (USING: true / WITH CHECK: true) em 5 tabelas de negócio

> Stories 15.1, 15.2, 15.2b e 15.4 foram revisadas e corrigidas pelo @qa após análise de código.

---

## Dependências

```
15.1 ──→ 15.2 ──→ 15.2b
15.3 (independente)
15.4: Fase A (código) ──→ Fase B (migration)
15.5 (independente — porém dev deve confirmar policies de substituição antes de dropar)
```

- **15.1** não tem bloqueios — implementar primeiro
- **15.2** bloqueada por 15.1
- **15.2b** bloqueada por 15.1 + 15.2
- **15.3** independente — pode rodar em paralelo com qualquer outra
- **15.4** independente de 15.1/15.2 — Fase A (código) precede Fase B (migration) dentro da própria story
- **15.5** independente de sequência, mas requer auditoria prévia de policies remanescentes por tabela

---

## Definition of Done

- [ ] Todas as 5 stories completas e revisadas
- [ ] Migrations aplicadas sem erros no Supabase
- [ ] Nenhuma regressão em endpoints de campaigns/flows/report
- [ ] RLS policies validadas no Supabase Dashboard — zero políticas com `USING: true` ou `WITH CHECK: true` em tabelas de negócio
- [ ] Typecheck + lint passando
