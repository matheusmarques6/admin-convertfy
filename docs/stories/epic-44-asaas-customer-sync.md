# Epic 44 — Asaas Customer Bidirectional Sync

## Contexto

Quando um cliente é editado na plataforma (email, nome, telefone, endereço), as alterações são salvas apenas no banco local (Supabase). O método `AsaasService.updateCustomer()` existe em `src/lib/integrations/asaas.ts:68` mas **nunca é chamado** por nenhum código. Resultado: dados divergem entre plataforma e Asaas.

## Problema Reportado

> Quando o e-mail é alterado na plataforma, ele não é atualizado na Asaas. O cliente cadastrado dentro da Asaas aparece alterado na plataforma, mas não na Asaas.

## Escopo do Epic

| Story | Título | Esforço | Prioridade |
|-------|--------|---------|------------|
| 44.1 | Propagar alterações de cliente para Asaas no save | MEDIUM | P0 |
| 44.2 | (Futuro) Sync queue + cron para resiliência | HIGH | P2 |
| 44.3 | (Futuro) Webhook bidirecional CUSTOMER_UPDATED | MEDIUM | P2 |

## Referências

- Asaas API: `PUT /v3/customers/{id}` — todos os campos opcionais
- Documentação: https://docs.asaas.com/reference/atualizar-cliente-existente
- Auth header: `access_token: {api_key}`
