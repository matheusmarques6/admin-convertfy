# Epic 19 - Dashboard Revenue Data Integrity

**Status:** In Progress
**Prioridade:** P0 (Critica - dados incorretos na dashboard principal)
**Sprint:** Current

---

## Contexto

Diagnostico completo da dashboard admin revelou que TODOS os dados de receita, contagem de lojas e indicadores de atencao estao incorretos ou incompletos. Os problemas sao sistemicos e afetam todas as lojas.

## Problemas Identificados

### P1: Campaign Revenue = R$ 0 para TODAS as lojas (BUG CRITICO)
- `store_revenue_summary.klaviyo_campaign_revenue = 0.00` para todas as lojas com sync_status="ok"
- `klaviyo_campaign_metrics` TEM campanhas com conversion_value > 0
- Causa: sync parcial sobrescreve valores validos com zero quando campaign report falha

### P2: 4 de 8 lojas com erros persistentes de credenciais
- BRINQUEMAIS: chave com caractere Unicode (U+2022)
- ToysLand: missing scope `metrics:read`
- Almira: missing scope `accounts:read`
- Vivazz: rate limit severo (11s Retry-After)

### P3: Blue Wolf ausente do cache 30d/90d
- Rate limit em 7d/15d causa break por `consecutiveRateLimits >= 2`
- Dashboard padrao (30d) nao mostra Blue Wolf

### P4: Rate limiting severo na Klaviyo Reporting API
- 8 lojas x 4 periodos x 3 requests = ~96 requests por cron run
- Retry-After de ate 5.8 horas para Blue Wolf

## Stories

| Story | Titulo | Prioridade | Status |
|-------|--------|------------|--------|
| 19.1 | Fix partial sync overwriting valid revenue data | P0 | Ready |
| 19.2 | Improve cron rate limit strategy + period ordering | P1 | Backlog |
| 19.3 | Operational: fix 4 stores with credential errors | P1 (Ops) | Backlog |

## Metricas de Sucesso

- [ ] Dashboard mostra campaign_revenue > 0 para lojas com campanhas ativas
- [ ] Todas as 8 lojas com Klaviyo aparecem no cache 30d
- [ ] Cron completa sem rate limit para todas as lojas
- [ ] 0 lojas com erros persistentes de credenciais

---

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-03-05 | Epic criado a partir de diagnostico completo da dashboard | @sm + @data-engineer + @dev + @qa + @architect |
