# N8N API Integration

Documentacao dos endpoints de integracao machine-to-machine entre o admin-convertfy e o N8N.

---

## Autenticacao

Todos os endpoints sob `/api/n8n/` usam autenticacao via **shared secret** no header HTTP.

```
Header: x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

| Aspecto | Detalhe |
|---------|---------|
| Metodo | Shared secret com `crypto.timingSafeEqual` |
| Env var | `N8N_WEBHOOK_SECRET` |
| Header | `x-webhook-secret` |
| Erros | `401` secret invalido/ausente, `500` env var nao configurada |
| Helper | `src/lib/api/n8n-auth.ts` → `requireWebhookSecret()` |

### Uso do helper

```typescript
import { requireWebhookSecret } from "@/lib/api/n8n-auth"

export async function GET(request: NextRequest) {
  try {
    requireWebhookSecret(request) // throws 401 ou 500
    // ... logica do endpoint
  } catch (error) {
    return errorResponse(request, error, "Context")
  }
}
```

O helper aceita parametros opcionais para reutilizar com outros secrets:

```typescript
requireWebhookSecret(request, "ONBOARDING_WEBHOOK_SECRET", "X-Webhook-Secret")
```

---

## Endpoints

### GET /api/n8n/store-briefing

Retorna o briefing atual de uma loja para uso na geracao de copies de campanha.

**Arquivo:** `src/app/api/n8n/store-briefing/route.ts`

#### Request

```
GET /api/n8n/store-briefing?store_id=<uuid>
Header: x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| `store_id` | UUID (query string) | Sim | ID da loja em `client_stores` |

#### Responses

**200 - Loja com briefing:**

```json
{
  "success": true,
  "store": {
    "id": "941c124b-a8a3-4e46-9099-958b71114ce0",
    "store_name": "Karm",
    "platform": "shopify"
  },
  "briefing": {
    "id": "f1a2b3c4-d5e6-7890-abcd-ef1234567890",
    "version": 3,
    "generated_by": "auto",
    "created_at": "2026-03-01T15:30:00.000Z",
    "data": {
      "dados_loja": {
        "nome": "Karm",
        "url": "https://karm.com.br",
        "plataforma": "shopify",
        "nicho": "moda masculina",
        "pais": "BR",
        "idioma": "pt-BR",
        "frete_gratis": "acima_valor"
      },
      "codigo_colaborador": {
        "shopify_code": "abc123"
      },
      "materiais_identidade": {
        "logo_url": "https://...",
        "design_direction": "Minimalista, tons escuros",
        "design_file_url": null,
        "brand_manual_url": "https://..."
      },
      "foco_campanhas": {
        "abordagem": "qualidade",
        "descricao": "Foco em qualidade e exclusividade..."
      },
      "publico": {
        "target_audience": "Homens 25-45, classe A/B",
        "price_sensitivity": "quality",
        "perfil": "Consumidor que valoriza qualidade..."
      },
      "perfil_marca": {
        "tipo": "premium",
        "descricao": "Marca premium focada em..."
      },
      "resumo_performance": {
        "klaviyo": {
          "receita_total_30d": 50000,
          "receita_campanhas_30d": 20000,
          "receita_flows_30d": 15000
        }
      },
      "analise_anuncios": {
        "meta_ads": {
          "gasto_total": 5000,
          "receita_total": 25000,
          "roas": 5.0
        }
      },
      "detalhes_adicionais": {
        "notas": "Cliente prefere tons quentes...",
        "conceito_frete": "Frete gratis acima de R$299"
      }
    }
  }
}
```

**200 - Loja sem briefing:**

```json
{
  "success": true,
  "store": {
    "id": "941c124b-a8a3-4e46-9099-958b71114ce0",
    "store_name": "Karm",
    "platform": "shopify"
  },
  "briefing": null
}
```

**400 - Parametro ausente:**

```json
{
  "error": "store_id e obrigatorio"
}
```

**401 - Auth invalida:**

```json
{
  "error": "Unauthorized"
}
```

**404 - Loja nao encontrada (ou UUID invalido):**

```json
{
  "error": "Loja nao encontrada"
}
```

#### Cache

O endpoint retorna `Cache-Control: private, max-age=300` (5 minutos). Briefings mudam raramente (dias/semanas), entao o cache e seguro.

#### Notas

- Usa `createAdminClient()` (bypass RLS) — N8N nao tem sessao de usuario
- UUID invalido retorna 404 (validacao por regex antes da query)
- O `briefing.data` contem o `BriefingData` completo (tipo em `src/types/onboarding.ts:193-233`)
- Se a loja nao tem briefing, o N8N deve usar os dados basicos do payload de campanha (`store_name`, `country`, `language`) como fallback

---

## Webhooks (N8N → Admin)

Alem dos endpoints que o N8N consome, existem webhooks que o N8N chama de volta:

| Endpoint | Metodo | Secret | Descricao |
|----------|--------|--------|-----------|
| `/api/campaigns/webhook-callback` | POST | `N8N_WEBHOOK_SECRET` | Callback com resultado da geracao de copies |
| `/api/onboarding/webhook` | POST | `ONBOARDING_WEBHOOK_SECRET` | Callback com briefing gerado |

---

## Fluxo de Geracao de Copies

```
1. Usuario clica "Gerar Copies" no admin
2. POST /api/campaigns/generate
   → Valida lojas (client_id, multi-client)
   → Cria registro em campaign_generations
   → Dispara webhook N8N com {store_id, store_name, country, language, version}

3. N8N recebe o webhook
4. Para cada loja:
   → GET /api/n8n/store-briefing?store_id=X
   → Recebe briefing completo da loja
   → Gera copies usando briefing como contexto

5. N8N envia resultado:
   → POST /api/campaigns/webhook-callback
   → Admin atualiza status da geracao (done/error)

6. Frontend faz polling de status a cada 5s
   → GET /api/campaigns/generate/[id]
```

---

## Variaveis de Ambiente

| Variavel | Obrigatoria | Usada por |
|----------|-------------|-----------|
| `N8N_WEBHOOK_SECRET` | Sim | `/api/n8n/*`, `/api/campaigns/webhook-callback` |
| `N8N_CAMPAIGNS_WEBHOOK_URL` | Sim | Disparo do webhook de geracao de copies |
| `ONBOARDING_WEBHOOK_SECRET` | Sim | `/api/onboarding/webhook` |

---

## Estrutura de Arquivos

```
src/
├── lib/api/
│   └── n8n-auth.ts              # Helper requireWebhookSecret()
├── app/api/
│   ├── n8n/
│   │   └── store-briefing/
│   │       └── route.ts         # GET - buscar briefing
│   ├── campaigns/
│   │   ├── generate/
│   │   │   └── route.ts         # POST - iniciar geracao
│   │   └── webhook-callback/
│   │       └── route.ts         # POST - callback do N8N
│   └── onboarding/
│       ├── store-briefing/
│       │   └── route.ts         # GET/PATCH/POST - briefing (auth usuario)
│       └── webhook/
│           └── route.ts         # POST - callback onboarding
```

---

*Ultima atualizacao: Marco 2026*
