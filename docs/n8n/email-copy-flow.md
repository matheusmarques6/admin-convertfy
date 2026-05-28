# n8n Flow — Email Copy Generation

Este flow substitui o agente Claude interno de copy. **Sem dependência de Google Docs / Drive** — toda referência e contexto vem no payload do webhook.

## Entradas e saídas

**Trigger:** Webhook node recebe POST em `N8N_EMAIL_COPY_WEBHOOK_URL` com header `x-webhook-secret`.

**Saída:** HTTP Request node faz POST para `callback.url` (do payload) com `x-webhook-secret: callback.secret` — **um POST por email completo** (streaming).

## Payload de entrada (resumo)

```json
{
  "event": "email_copy.requested",
  "trigger_source": "briefing_confirmed | manual_store_button",
  "callback": { "url": "https://app.convertfy.me/api/webhooks/n8n/email-copy", "secret": "..." },
  "store": { id, store_name, language, brand, icp, tone },
  "brand_identity": { logo_url, primary_colors, secondary_colors, font_heading, font_body, voice },
  "briefing": { marca, briefing },
  "top_products": [...],
  "flows": [
    {
      "flow_id": "uuid",
      "flow_type": "welcome",
      "reference": { "name", "copy", "html" },
      "emails": [
        {
          "email_id": "uuid",
          "email_number": 1,
          "blueprint": { "objective", "messaging", "subject_hint" },
          "blocks": [
            { "block_id": "uuid", "position": 1, "type": "hero", "label": "Hero" },
            ...
          ]
        }
      ]
    }
  ]
}
```

## Estrutura recomendada do flow

1. **Webhook (POST)** — recebe e valida o payload
2. **Split In Batches** sobre `flows[]`
3. **Split In Batches** sobre `flows[i].emails[]`
4. **Code node** — monta o contexto para o FAZEDOR DE COPY juntando:
   - `briefing.marca` + `briefing.briefing` (tom, nicho, persona, etc.)
   - `store.brand`, `store.icp`, `store.tone` (Pesquisa & Diagnóstico)
   - `top_products[]` (5 produtos)
   - `flows[i].reference.copy` (texto de referência)
   - `flows[i].emails[j].blueprint` (objetivo, mensagem, subject_hint)
   - `flows[i].emails[j].blocks[]` (estrutura: position, type, label)
5. **FAZEDOR DE COPY (OpenRouter Chat)** — gera JSON com content por bloco:
   - Output: `{ "blocks": [{ "block_id": "...", "content": { headline, body, cta_text, code, hint, products } }] }`
6. **GERADOR DE ASSUNTO E PREHEADER (OpenRouter Chat)** — gera `subject` (≤50 chars) e `preheader` (≤90 chars) baseados em copy + tom + subject_hint
7. **TRADUTOR (condicional)** — só roda se `store.language != "pt-BR"`. Traduz subject, preheader e content dos blocos
8. **HTTP Request (POST)** para `callback.url`:
   - Headers: `x-webhook-secret: callback.secret`, `Content-Type: application/json`
   - Body:

```json
{
  "store_id": "{{store.id}}",
  "email_id": "{{flows[i].emails[j].email_id}}",
  "subject": "{{gerado}}",
  "preheader": "{{gerado}}",
  "blocks": [
    { "block_id": "{{block_id}}", "content": { "headline", "body", "cta_text", "code", "hint", "products" } }
  ],
  "meta": {
    "model": "openai/gpt-...",
    "tokens_input": 0,
    "tokens_output": 0,
    "duration_ms": 0
  }
}
```

## Schema de `content` por tipo de bloco

| Tipo | Campos esperados |
|------|------------------|
| `hero` | `headline`, `body`, `cta_text` |
| `text` | `headline`, `body`, `cta_text` (opcional) |
| `coupon` | `headline`, `body`, `code`, `hint`, `cta_text` |
| `products` | `headline`, `body`, `products: [{ name, price, image_url, url, cta_text }]` |
| `cta` | `headline`, `body`, `cta_text` |
| `footer` | `body` (texto de rodapé) |

Os campos que não fazem sentido para o tipo podem ser omitidos.

## Erros e timeout

- O receiver retorna 404 se `email_id` não existe ou não pertence ao `store_id` — implementar retry no n8n com backoff
- Timeout por email recomendado: 60s
- Em caso de falha em um email, **continuar processando os demais** — o sistema mostra cada email no status que conseguiu (alguns `copy_ready`, outros ainda `in_progress`)

## Status do email no app

- `in_progress` — webhook saiu, n8n trabalhando
- `copy_ready` — callback recebido com sucesso
- `ready` — após designer rodar Imagem + HTML internamente

## Onde rebuildar o flow no n8n

O flow original tinha 2 dependências de Google que devem ser removidas:
- ❌ "Get a document" (Google Docs) — substituir pelo dado de `flows[i].reference` do payload
- ❌ "Create a document" / "Update a document" (Google Docs) — substituir pelo HTTP Request POST para `callback.url`

Tudo o que estava nos Google Docs agora viaja em JSON no webhook — escalável, versionável e independente do Drive.
