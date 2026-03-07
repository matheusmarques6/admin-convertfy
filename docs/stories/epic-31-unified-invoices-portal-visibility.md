# Epic 31 - Unified Invoices: Portal Visibility for All Charges

## Contexto
Cobranças criadas pelo admin na aba "Financeiro" de um cliente (via PIX direto, Wise, Boleto, Cartão) são gravadas na tabela `client_charges`, mas o portal do cliente lê exclusivamente da tabela `invoices`. Resultado: cobranças manuais são invisíveis para o cliente no portal.

Agravante: o dashboard do portal já soma ambas as tabelas (linhas 434-442 de `portal/dashboard/route.ts`), criando inconsistência visível — o total no dashboard não bate com a listagem de faturas.

## Estratégia
**Fase 1 (esta epic):** Criar VIEW `unified_invoices` que faz UNION ALL das duas tabelas. Migrar todos os consumers de leitura para a VIEW.

**Fase 2 (backlog futuro):** Unificar em tabela única `invoices`, deprecar `client_charges`. Gatilho: quando qualquer feature exigir escrita unificada (ex: pagamento pelo portal).

## Stories
- 31.1 - DB Migration: CREATE VIEW unified_invoices + indexes + RLS
- 31.2 - Portal endpoints: migrar leitura para unified_invoices
- 31.3 - Admin/performance endpoints: simplificar union manual
- 31.4 - Tratamento UX para cobranças sem Asaas (payment links)

## Decisão Arquitetural (ADR-FIN-001)
- **Status:** Aprovado
- **Decisão:** VIEW unificada como contrato de leitura, write paths inalterados
- **Motivo:** Menor blast radius, rollback trivial (DROP VIEW), zero migração de dados
- **Ressalvas:** Tratar gap de payment links para cobranças manuais, normalizar campos na VIEW
- **Tech-debt remanescente:** Duas tabelas separadas (resolver na Fase 2)
