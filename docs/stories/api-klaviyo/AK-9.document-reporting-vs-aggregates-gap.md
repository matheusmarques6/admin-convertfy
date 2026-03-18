---
Prioridade: Low
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "3 - Medium/Low"
Dependencias: "Epic AK validado em producao"
---

# Story AK-9 — Documentar Gap Reporting vs Metric Aggregates

## Story

**Como** desenvolvedor do time,
**Quero** ter documentacao clara sobre a diferenca semantica entre Reporting API e Metric Aggregates,
**Para que** futuras decisoes sobre fonte de dados de revenue sejam informadas e nao causem confusao.

## Contexto

### Problema

Existem 2 formas de obter revenue no Klaviyo:

| | Reporting API | Metric Aggregates |
|---|---|---|
| Endpoints | `*-values-reports`, `*-series-reports` | `/metric-aggregates/` |
| Atribuicao | Data de **envio** da mensagem | Data do **evento** (Placed Order) |
| Revenue | Atribuida ao flow/campaign que enviou | Atribuida ao momento do pedido |
| Janela | Configurable attribution window | Event timestamp |
| UI match | Igual ao dashboard do Klaviyo | Diferente do dashboard |

### Consequencia

Para o mesmo periodo, `sum(flow_revenue + campaign_revenue)` via reports ≠ `storeRevenue` via metric-aggregates. Isso e **esperado** mas nao esta documentado no codebase, o que causa confusao.

### Decisao Tomada

Decidimos MANTER a Reporting API (`flow-values-reports`, `campaign-values-reports`) como fonte de dados para flow/campaign breakdown. `metric-aggregates` e usado APENAS para receita total da loja. A documentacao deve explicar essa decisao e as diferencas semanticas para referencia futura.

## Acceptance Criteria

### AK-9.1 — Documentacao inline no codigo

- [ ] Adicionar bloco de comentario em `klaviyo-sync.service.ts` explicando:
  - A diferenca entre Reporting API e Metric Aggregates
  - Por que escolhemos Metric Aggregates (performance, cap diario)
  - A diferenca semantica esperada (<5% para periodos >= 7d)
  - Referencia ao changelog da Klaviyo para atribuicao
- [ ] Adicionar comentario em `report-summary.ts` se aplicavel

### AK-9.2 — Documentacao no CLAUDE.md

- [ ] Atualizar secao "Decisao: Receita Total via Klaviyo" com:
  - Explicacao da diferenca semantica
  - Threshold aceitavel (<5%)
  - Data da decisao e razao (Epic AK, Marco 2026)

### AK-9.3 — ADR (Architecture Decision Record)

- [ ] Criar `docs/architecture/adr-klaviyo-revenue-source.md` com:
  - Contexto: 2 fontes de dados com semantica diferente
  - Decisao: Reporting API mantida para flow/campaign (consistencia com Klaviyo UI). Metric Aggregates usado APENAS para receita total.
  - Razoes: dados identicos ao dashboard Klaviyo (requisito de negocio), divergencia de ate 20% em periodos curtos inaceitavel
  - Trade-offs: diferenca de <5% em atribuicao para periodos curtos
  - Status: Accepted

## Impacto Esperado

- Elimina confusao futura sobre discrepancias de revenue
- Decisao arquitetural documentada e justificada
- Novos desenvolvedores entendem rapidamente o modelo de dados

## Arquivos Afetados

- `src/lib/services/klaviyo-sync.service.ts` — comentarios
- `src/lib/integrations/klaviyo/report-summary.ts` — comentarios
- `CLAUDE.md` — secao de decisoes
- `docs/architecture/adr-klaviyo-revenue-source.md` (novo)

---

## Revisao Multi-Agente

### @dev — Anotacoes de Implementacao

- **Complexidade: TRIVIAL**. So documentacao, zero mudanca de codigo funcional.
- Fazer APOS AK-3 estar deployada e validada em producao, para documentar o estado final (nao o intermediario).
- O ADR deve seguir formato padrao: Context, Decision, Consequences, Status.

### @qa — Anotacoes de Qualidade

- **Revisao**: Verificar que a documentacao e factualmente correta. Cruzar com dados reais (comparar Reporting API vs Metric Aggregates para 2-3 lojas).
- **Completude**: O ADR deve mencionar a diferenca observada em producao (% real, nao estimativa).

### @data-engineer — Anotacoes de Dados

- **Contribuicao principal**: Fornecer dados reais de comparacao entre as duas fontes. Executar query para 3 lojas x 3 periodos e documentar a diferenca media.
- **Schema documentation**: Adicionar ao ADR um diagrama mostrando o fluxo de dados: Klaviyo → metric-aggregates → store_revenue_summary / klaviyo_flow_metrics / klaviyo_campaign_metrics.

### @architect — Anotacoes Arquiteturais

- **ADR obrigatorio**: Toda decisao arquitetural que envolve trade-offs de dados deve ter ADR. Esta e uma decisao de longo prazo que afeta a integridade dos dados de revenue.
- **Formato**: Recomendar formato Lightweight ADR (titulo, data, status, contexto, decisao, consequencias). NAO precisa de formato pesado.

### @analyst — Anotacoes de Impacto

- **Valor indireto alto**: Documentacao evita que futuras decisoes revertam a mudanca sem entender o contexto (ex: "por que nossos numeros sao diferentes do dashboard do Klaviyo?").
- **Stakeholder communication**: Se clientes ou equipe de vendas questionarem discrepancias, o ADR serve como referencia tecnica.
- **Sugestao**: Incluir no ADR um FAQ com perguntas tipicas: "Por que meu revenue no admin e diferente do Klaviyo?" → Explicacao + threshold aceitavel.