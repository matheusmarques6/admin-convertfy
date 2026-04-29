# Template — Email pro Suporte Omnisend

> **Objetivo:** confirmar oficialmente se existe endpoint público (ou via parceria) que exponha **revenue por campanha individual** e **revenue por automation individual**, dado que `/api/analytics/{statistics,reports}` só retorna agregado.
>
> **Resposta esperada em 24-48h.** Se confirmar que não existe → encerramos o capítulo. Se confirmar que existe via parceiro/private API → abrimos negociação.

---

## Para quem mandar

- **support@omnisend.com** (suporte geral)
- Se houver contato de Customer Success Manager (CSM) para o plano da Azzurro / Convertfy, mandar pra ele em CC

## Assunto sugerido

```
[API question] Per-campaign and per-automation revenue attribution via API
```

## Corpo do email

```
Hi Omnisend team,

We're building an analytics dashboard at Convertfy (https://app.convertfy.me)
that aggregates Shopify + Klaviyo + Omnisend data for our agency clients.
One of our clients, Azzurro Milano (account ID 69cf47e89e686fa8d87f90c6 —
brand created March 2026, currently on a paid plan), uses Omnisend.

We've fully integrated the public API and the aggregate metrics are
working perfectly:

  POST /api/analytics/reports (Omnisend-Version: 2026-preview)
  → totals match the Sales dashboard exactly:
    attributedRevenue: €19,591.11
    sent: 73,493
    opened: 50,549 (openRate: 37.1%)
    clicked: 9,620

However, we cannot find a way to retrieve **per-campaign or per-automation
revenue** through the public API. Our investigation:

1. POST /api/analytics/reports rejects dimensions `campaign`, `workflow`,
   `automation`, `messageType`, `messageID`, `campaignID` for revenue
   metrics — error: "unsupported dimension 'X' for metric
   'attributedRevenue'". The only supported dimension is `timestamp`.

2. POST /api/analytics/statistics has the same restriction.

3. GET /v3/campaigns/{id} returns engagement (sent/opened/clicked/bounced)
   but no revenue field.

4. GET /api/campaigns/{id} (preview) returns only configuration, no stats.

5. There is no /v3/automations or /v5/automations/{id} endpoint that
   returns stats or revenue (all 404).

Yet your Sales dashboard at app.omnisend.com/reports/sales DOES show
the breakdown:

  From Omnisend €19,520.01 total
    - Campaigns: €2,144.35 (10.9% of revenue)
    - Automation: €17,375.66 (89% of revenue)

Three questions:

1. Is per-campaign / per-automation revenue attribution available via
   any other public endpoint or API version we haven't tried?

2. Is there a partner API, private endpoint, or upcoming public release
   that exposes this data? We're happy to apply for partner access if
   that's the path.

3. Some third-party integrations (Supermetrics, etc) extract per-campaign
   metrics. Are they using a private API, webhooks, or some workflow we
   could replicate?

For reference, our test queries that returned 400 "unsupported dimension":

  POST /api/analytics/reports
  Body:
  {
    "queries": [{
      "alias": "by_campaign",
      "metrics": [{"name": "attributedRevenue"}, {"name": "attributedOrders"}],
      "dateRange": {"interval": "custom", "from": "2026-03-30T00:00:00Z",
                    "to": "2026-04-29T23:59:59Z"},
      "dimensions": [{"name": "campaign"}]
    }]
  }
  → 400 "unsupported dimension 'campaign' for metric 'attributedRevenue'"

Same error for `workflow`, `automation`, `messageType`, `campaignID`,
`automationID`, `messageID`, `message`, `channel`, `activity`.

We want to give our clients the same per-campaign visibility your Sales
dashboard provides, ideally without requiring them to switch to manual
exports or a separate analytics tool.

Thanks for your time. Looking forward to hearing back!

—
[Your name]
[Your role at Convertfy]
[Convertfy contact email]
```

---

## Cenários de resposta esperada

### Cenário 1 — "Não existe na API pública, mas temos partner program"

**Ação:** aplicar pro partner program. Custo provavelmente envolve uma reunião comercial. Ganho: dado real.

### Cenário 2 — "Não existe, e não temos planos imediatos"

**Ação:** aceitar a limitação. A UX honesta atual (`—` com tooltip) já trata isso. Fechamos o capítulo. Pode-se votar/pedir como feature request via uservoice deles.

### Cenário 3 — "Existe, você está usando o endpoint errado"

**Ação:** seguir a documentação que enviarem. Provavelmente requer 1-2 commits para integrar. Refatorar a UX honesta para mostrar dado real.

### Cenário 4 — "Existe via webhook de eventos"

**Ação:** investigar webhook de `Order Placed` com attribution metadata. Pode ser que o Supermetrics use isso. Implementaria handler em `/api/webhooks/omnisend` e cruzaria com tabela de mensagens enviadas.

---

## Quando esperar resposta

- **Enterprise/parceiros:** geralmente <24h
- **Plano padrão:** 24-48h, podendo ir pra 5 dias úteis em casos complexos
- **Dica:** colocar "API question" no assunto costuma encaminhar pra time técnico (pula tier 1)

## Se não responderem em 5 dias

- Mandar follow-up curto referenciando o ticket original
- Tentar via Twitter `@omnisend`
- Verificar se há fórum de developers ativo
