# Epic 23 -- Formatacao Monetaria BRL (Currency Input)

## Motivacao

Inputs monetarios usam `<input type="number">` que interpreta `.` como decimal (padrao americano).
Usuarios brasileiros digitam `6.000` (seis mil reais) e o sistema salva `6.00` (seis reais).
Bug critico com impacto financeiro real.

## Escopo

| Story | Titulo | Prioridade |
|-------|--------|------------|
| 23.1 | Componente CurrencyInput + correcao nos formularios financeiros | CRITICAL |
| 23.2 | Validacao server-side + CHECK constraints no banco | HIGH |
| 23.3 | Correcao em formularios secundarios (deals, reports, automations) | MEDIUM |

## Decisoes Tecnicas

- **Componente custom** `CurrencyInput` sem biblioteca externa (stack ja usa shadcn/ui + Intl)
- **Centavos como source of truth** no state do componente (integer)
- **Schema do banco mantido** como `numeric(10,2)` -- adequado para BRL
- **Nenhum dado corrompido** encontrado (tabelas vazias ou com valores corretos)
- **Preview formatado** ao lado do input para confirmacao visual

## Agentes Consultados

- **Dev (Dex):** CurrencyInput custom, centavos internamente, zero impacto banco/API
- **QA (Quinn):** Severidade CRITICAL, 5+ caminhos afetados, pede validacao server-side + preview
- **DB (Data Engineer):** Schema ok, faltam CHECK constraints, API routes sem validacao de range
