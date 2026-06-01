# 04 — Referência do Payload e Callback n8n

| Campo | Valor |
|-------|-------|
| **Epic** | AE — Agent Email Generation |
| **Schema atual desde** | commit `830a2a9` (2026-06-01) |
| **Última atualização** | 2026-06-01 |

---

Este doc define o **contrato** entre admin-convertfy e o workflow n8n. Para devs externos do workflow, este é o doc de integração.

## Endpoints

| Direção | Método | URL | Auth |
|---------|--------|-----|------|
| Admin → n8n | POST | `${N8N_EMAIL_COPY_WEBHOOK_URL}` | Header `x-webhook-secret: ${N8N_WEBHOOK_SECRET}` |
| n8n → Admin (callback) | POST | `${APP_URL}/api/webhooks/n8n/email-copy` | Header `x-webhook-secret: ${N8N_WEBHOOK_SECRET}` |

Ambos validam o mesmo secret. Sem TLS mútuo. Os endpoints do callback são públicos com auth via header.

---

## Payload de saída — `email_copy.requested`

Schema atual depois da expansão de Contexto (commit `830a2a9`).

### Estrutura top-level

```jsonc
{
  "event": "email_copy.requested",
  "timestamp": "2026-06-01T14:32:08.123Z",
  "trigger_source": "briefing_confirmed" | "manual_store_button",
  "callback": {
    "url": "https://admin.convertfy.me/api/webhooks/n8n/email-copy",
    "secret": "<N8N_WEBHOOK_SECRET>"
  },
  "store": { /* ver abaixo */ },
  "brand_identity": { /* ver abaixo */ } | null,
  "briefing": { /* ver abaixo */ } | null,
  "top_products": [ /* ver abaixo */ ],
  "competitors": [ /* ver abaixo */ ],
  "flows": [ /* ver abaixo */ ]
}
```

### `store` — contexto completo da loja

Fonte: `client_stores` (29 colunas top-level) + sub-objetos derivados.

```jsonc
{
  "store": {
    "id": "uuid",
    "store_name": "Mobility rx",
    "store_url": "https://mobilityrx.com.br",
    "platform": "shopify" | "woocommerce" | "vtex" | "custom",
    "language": "pt-BR" | "en" | "es" | ...,
    "niche": "string",

    "brand": {
      "thesis": "string",          // brand_thesis
      "about": "string",           // brand_about
      "pillars": ["..."],          // brand_pillars (text[])
      "presence": "string"         // brand_presence
    },

    "icp": {
      "persona": "string",         // icp_persona
      "demographics": "string",    // icp_demographics
      "day_in_life": "string",     // icp_day_in_life
      "motivations": "string",     // icp_motivations
      "frictions": "string"        // icp_frictions
    },

    "tone": {
      "description": "string",     // tone_description
      "do": ["..."],               // tone_do (text[])
      "dont": ["..."],             // tone_dont
      "use_words": ["..."],        // tone_use_words
      "avoid_words": ["..."]       // tone_avoid_words
    },

    "positioning": {
      "slogan": "string | null",
      "diferencial": "string | null",
      "persona": "string | null",        // resumo curto
      "tom_de_voz": "amigavel" | "formal" | "tecnico" | ... | null,
      "posicionamento_preco": "premium" | "midmarket" | "low_cost" | null,
      "hashtags": ["#exemplo", ...]
    },

    "visual": {
      "cores": [ { "hex": "#1F1F1F", "label": "Preto principal" }, ... ],
      "fontes": { "heading": "Inter", "body": "Inter" } | null,
      "brand_manual_url": "string | null",
      "research_doc_url": "string | null"
    },

    "story": {
      "story": "string | null",          // store_story
      "milestones": [ { "year": 2024, "title": "..." } ]
    },

    "ads_review": {
      "score": 10.0 | null,              // 0-10
      "summary": "string | null",
      "sub_scores": { /* jsonb livre */ } | null,
      "strengths": ["..."],
      "opportunities": ["..."],
      "risks": ["..."],
      "reviewed_at": "ISO string | null"
    },

    "operations": {
      "ticket_medio_cents": 18900 | null,
      "taxa_conversao": 0.024 | null,        // decimal (2.4%)
      "faturamento_medio_cents": 250000000 | null,
      "margem_media": 0.42 | null,
      "recorrencia": 0.18 | null,            // % de pedidos recorrentes
      "frete_medio_cents": 1500 | null,
      "frete_prazo": "3-5 dias úteis" | null,
      "frete_cobertura": "todo Brasil" | null
    },

    "audience": {
      "lista_total": 25430 | null,
      "lista_engajados_30": 8120 | null,
      "lista_engajados_90": 14300 | null,
      "lista_crescimento_mensal": 0.05 | null,
      "sms_consent_pct": 0.32 | null
    }
  }
}
```

### `brand_identity` — logos e cores (snapshot por versão)

Fonte: `store_brand_identities` (versão mais recente).

```jsonc
{
  "brand_identity": {
    "logo_url": "https://...png ou .svg",    // logo_main_png ?? logo_main_svg
    "primary_colors": ["#1F1F1F", "#FFFFFF"],
    "secondary_colors": ["#888"],
    "font_heading": "Inter",
    "font_body": "Inter",
    "voice": ["confiante", "técnico", "direto"]
  }
}
```

Pode vir `null` se a loja ainda não tem brand identity criada. Diferente de `store.visual.cores` (mesmo dado mas a partir de `client_stores` — em sync via UI da loja).

### `briefing` — briefing estruturado (legacy)

Fonte: `store_briefings` (versão mais recente). Pode vir `null` para lojas onde o briefing é capturado direto em `client_stores` (caso da maioria das lojas pós-AE-23).

```jsonc
{
  "briefing": {
    "marca": { /* JSONB livre, schema legado */ },
    "briefing": { /* JSONB livre, schema legado */ }
  }
}
```

Para lojas novas, n8n deve ler de `store.brand`, `store.icp`, `store.tone`, e ignorar este campo.

### `top_products` — produtos top

Fonte: `store_top_products` (ordenado por `rank`, limit 5).

```jsonc
{
  "top_products": [
    {
      "rank": 1,
      "name": "MobillityRX Shoulder Relief",
      "price": 69.00,
      "currency": "BRL",
      "image_url": "https://cdn.shopify.com/...",
      "url": "https://mobilityrx.com.br/products/shoulder-relief",
      "external_id": "gid://shopify/Product/123"
    }
    /* ... até 5 produtos */
  ]
}
```

### `competitors` — concorrentes mapeados

Fonte: `client_competitors`.

```jsonc
{
  "competitors": [
    {
      "name": "Concorrente X",
      "url": "https://...",
      "posicionamento": "string | null",
      "notas": "string | null"
    }
  ]
}
```

### `flows` — flows + emails + blocks + blueprints + references

Estrutura por flow. n8n itera, gera copy para cada email do flow.

```jsonc
{
  "flows": [
    {
      "flow_id": "uuid",
      "flow_type": "welcome" | "abandoned_cart" | "browse_abandonment" | ...,
      "flow_name": "Welcome Series",

      "reference": {
        "id": "uuid",
        "name": "Welcome v3 — direto"
      } | null,

      "emails": [
        {
          "email_id": "uuid",
          "email_number": 1,
          "name": "Welcome — boas-vindas",

          "blueprint": {
            "objective": "Acolher o novo lead e dar contexto da marca",
            "messaging": "Foco em diferencial técnico, evitar promoção",
            "subject_hint": "Bem-vindo(a) à <brand>!"
          } | null,

          "blocks": [
            {
              "block_id": "uuid",
              "position": 1,
              "type": "heading" | "body" | "cta" | "image" | "spacer" | ...,
              "label": "Título principal"
            }
          ]
        }
      ]
    }
  ]
}
```

**Resolução de `reference`**:
1. Tenta achar reference com `flow_type = X AND email_number = N` (mais específico).
2. Fallback: reference com `flow_type = X AND email_number IS NULL` (genérico do flow).
3. Se nenhuma ativa em `email_reference_templates`, vai `null`.

**Resolução de `blueprint`**: lookup direto por `flow_type:email_number` em `email_blueprints`.

---

## Payload do callback — `/api/webhooks/n8n/email-copy`

**Direção**: n8n → admin-convertfy. **Chamado uma vez por email completo**.

### Headers obrigatórios

```
Content-Type: application/json
x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

Falta do secret → 401.

### Body

```jsonc
{
  "store_id": "uuid",                   // obrigatório, valida que email pertence à loja
  "email_id": "uuid",                   // obrigatório
  "subject": "string",                  // min 1 char
  "preheader": "string | null",         // opcional
  "blocks": [
    {
      "block_id": "uuid",
      "content": {
        /* Conteúdo livre. Depende do block_type.
           Exemplos típicos:
           heading: { text: "..." }
           body:    { text: "...", markdown: "..." }
           cta:     { text: "Comprar", url: "https://..." }
           image:   { prompt: "...", alt: "..." }
        */
      }
    }
  ],
  "meta": {
    "model": "claude-opus-4-7" | "gpt-4o" | ...,
    "tokens_input": 1234,
    "tokens_output": 567,
    "duration_ms": 4500
  }
}
```

### Comportamento

| Status do email no DB | Comportamento do callback |
|-----------------------|---------------------------|
| `draft` / `in_progress` / `copy_generating` / `copy_generating_recovery` | Persiste blocks, atualiza email, marca `copy_ready` |
| `copy_ready` / `rendering` / `qa_running` / `ready` / `failed` | **Idempotente no-op** (200 sem alterar dado) — log `already_processed` |

### Resposta

```jsonc
// 200 — sucesso
{
  "data": {
    "ok": true,
    "email_id": "uuid",
    "status": "copy_ready"
  }
}

// 200 — idempotente
{
  "data": {
    "ok": true,
    "email_id": "uuid",
    "already_processed": true,
    "current_status": "ready"
  }
}

// 401 — secret inválido
{ "error": "Unauthorized", "code": "invalid_webhook_secret" }

// 404 — email não pertence à loja
{ "error": "Email não pertence a esta loja", "code": "not_found" }

// 422 — body inválido (Zod)
{ "error": "...", "code": "validation_error", "details": { /* zod issues */ } }
```

---

## Códigos de erro do dispatch (saída)

Quando `dispatchEmailCopyWebhook` retorna `{ ok: false, reason }`:

| Reason | Causa | Ação |
|--------|-------|------|
| `no_url_configured` | `N8N_EMAIL_COPY_WEBHOOK_URL` ausente | Configurar env na Vercel |
| `store_not_found` | `storeId` inválido | Conferir UUID |
| `no_flows` | Loja sem flows em `email_flows` | Criar flows no workspace |
| `no_emails` | Flows sem emails | Adicionar emails ao flow |
| `flows_query_failed` / `emails_query_failed` / `blocks_query_failed` | Erro SQL | Ver log `email_copy.webhook.*.error` |

E erros do POST HTTP em si:
- `timeout` → n8n não respondeu em 15s
- `HTTP <status>` → n8n retornou erro

---

## Exemplo completo de payload (loja real)

Loja: **Mobility rx**, trigger: confirmação de briefing.

```jsonc
{
  "event": "email_copy.requested",
  "timestamp": "2026-06-01T14:32:08.123Z",
  "trigger_source": "briefing_confirmed",
  "callback": {
    "url": "https://admin.convertfy.me/api/webhooks/n8n/email-copy",
    "secret": "<redacted>"
  },
  "store": {
    "id": "a7e8c2d1-1234-...",
    "store_name": "Mobility rx",
    "store_url": "https://mobilityrx.com.br",
    "platform": "shopify",
    "language": "pt-BR",
    "niche": "Saúde e Mobilidade",
    "brand": {
      "thesis": "Soluções técnicas de mobilidade para reduzir dor crônica em adultos ativos",
      "about": "Marca brasileira fundada em 2022, focada em produtos baseados em fisiologia esportiva",
      "pillars": ["evidência clínica", "design ergonômico", "preço justo"],
      "presence": "DTC + Amazon"
    },
    "icp": {
      "persona": "Adultos 35-55 com dor articular recorrente, ativos fisicamente",
      "demographics": "SP/RJ, classe média/alta, profissionais liberais",
      "day_in_life": "Acorda cedo, faz exercício, trabalha em casa, sente desconforto à tarde",
      "motivations": "Continuar ativo sem dor, evitar medicação, voltar a esportes",
      "frictions": "Cético a 'mais um' produto, busca recomendação médica"
    },
    "tone": {
      "description": "Técnico-acolhedor; usa termos clínicos mas explica sem jargão",
      "do": ["citar pesquisa", "ser preciso", "humanizar com exemplo"],
      "dont": ["prometer cura", "linguagem pop", "exagerar resultados"],
      "use_words": ["evidência", "ergonomia", "biomecânica"],
      "avoid_words": ["milagre", "garantido", "remédio"]
    },
    "positioning": {
      "slogan": "Mobilidade técnica, dor com prazo de validade",
      "diferencial": "Único no Brasil com selo CREFITO de homologação",
      "persona": "Atleta amador acima dos 40",
      "tom_de_voz": "tecnico_acolhedor",
      "posicionamento_preco": "midmarket",
      "hashtags": ["#mobilidadetecnica", "#sembloqueio"]
    },
    "visual": {
      "cores": [
        { "hex": "#1F1F1F", "label": "Preto principal" },
        { "hex": "#0D9488", "label": "Verde médico" }
      ],
      "fontes": { "heading": "Inter", "body": "Inter" },
      "brand_manual_url": "https://drive.google.com/...",
      "research_doc_url": null
    },
    "story": {
      "story": "Fundada por fisioterapeuta e engenheiro biomédico após pesquisa de 3 anos",
      "milestones": [
        { "year": 2022, "title": "Fundação" },
        { "year": 2024, "title": "Selo CREFITO" }
      ]
    },
    "ads_review": {
      "score": 10.0,
      "summary": "Performance excepcional, CAC abaixo do benchmark",
      "sub_scores": { "creative": 9.5, "targeting": 10, "lp": 9.8 },
      "strengths": ["UGC autêntico", "Selo médico no creative"],
      "opportunities": ["Expandir TOFU", "Testar formato carrossel"],
      "risks": ["Dependência alta de Meta", "Frequência alta"],
      "reviewed_at": "2026-05-15T10:00:00Z"
    },
    "operations": {
      "ticket_medio_cents": 18900,
      "taxa_conversao": 0.024,
      "faturamento_medio_cents": 850000000,
      "margem_media": 0.55,
      "recorrencia": 0.31,
      "frete_medio_cents": 1500,
      "frete_prazo": "3-5 dias úteis",
      "frete_cobertura": "todo Brasil"
    },
    "audience": {
      "lista_total": 25430,
      "lista_engajados_30": 8120,
      "lista_engajados_90": 14300,
      "lista_crescimento_mensal": 0.05,
      "sms_consent_pct": 0.32
    }
  },
  "brand_identity": {
    "logo_url": "https://cdn.../logo_main.svg",
    "primary_colors": ["#1F1F1F", "#0D9488"],
    "secondary_colors": ["#FFFFFF"],
    "font_heading": "Inter",
    "font_body": "Inter",
    "voice": ["confiante", "técnico"]
  },
  "briefing": null,
  "top_products": [
    {
      "rank": 1,
      "name": "MobillityRX Shoulder Relief",
      "price": 69.00,
      "currency": "BRL",
      "image_url": "https://cdn.shopify.com/...",
      "url": "https://mobilityrx.com.br/products/shoulder-relief",
      "external_id": "gid://shopify/Product/8881234567"
    }
  ],
  "competitors": [
    { "name": "Concorrente X", "url": "...", "posicionamento": "low cost", "notas": "Sem selo médico" }
  ],
  "flows": [
    {
      "flow_id": "f1-uuid",
      "flow_type": "welcome",
      "flow_name": "Welcome Series",
      "reference": { "id": "ref-uuid", "name": "Welcome — técnico-acolhedor v3" },
      "emails": [
        {
          "email_id": "e1-uuid",
          "email_number": 1,
          "name": "Welcome 1 — apresentação",
          "blueprint": {
            "objective": "Acolher e contar a tese técnica",
            "messaging": "Brand thesis + CREFITO + 1 produto",
            "subject_hint": "Bem-vindo(a) à Mobility rx"
          },
          "blocks": [
            { "block_id": "b1", "position": 1, "type": "heading", "label": "Título principal" },
            { "block_id": "b2", "position": 2, "type": "body", "label": "Apresentação" },
            { "block_id": "b3", "position": 3, "type": "cta", "label": "CTA produto" }
          ]
        }
      ]
    }
  ]
}
```

---

## Próximos docs

- [`05-troubleshooting.md`](./05-troubleshooting.md) — Quando o payload chega mas algo dá errado
