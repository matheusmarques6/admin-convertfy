# Pipelines pre-configurados

8 pipelines criados pela migration `20260507_crm_phase1_seed.sql`. Cada
estagio tem `sla_hours` (tempo maximo aceitavel) e `exit_criteria` (criterio
objetivo para avancar).

## Sales (4 pipelines)

### 1. Inbound
Lead chegou organicamente (form, ads, landing). Estagios:
- Novo lead → Tentativa de contato → Demo agendada → Demo realizada → Proposta enviada → Negociacao → Ganho / Perdido

### 2. Outbound
Prospeccao ativa (cold call, cold email, LinkedIn). Estagios:
- Lista construida → Cadencia ativa → Conversa iniciada → Discovery → Demo agendada → Demo realizada → Proposta → Ganho / Perdido

### 3. Indicacoes
Lead via parceiro/cliente. Estagios:
- Indicacao recebida → Contato feito → Demo agendada → Demo realizada → Proposta → Ganho / Perdido

### 4. Implementacoes (sales tecnico)
Setup tecnico pos-fechamento. Estagios:
- Kickoff → Discovery tecnico → Setup ambiente → Migracao dados → Validacao → Go-live → Concluido

## Customer Success (4 pipelines)

### 5. Onboarding 30d
Operacional pos-go-live, 30 dias. Estagios:
- D0 Welcome → D7 Check-in → D14 Treinamento → D21 Review → D30 Graduado

### 6. Gestao de Carteira (state-board)
Layout `state` — lojas se movem entre estados, nao avancam linearmente:
- ATIVO / EM_RISCO / CHURN_PREVISTO / RECUPERADO / CHURN_CONFIRMADO

### 7. Feedback Mensal
NPS + survey recorrente. Estagios:
- Pendente envio → NPS enviado → Resposta recebida → Acao definida → Concluido

### 8. Tickets
Suporte. Estagios:
- Aberto → Em analise → Em execucao → Aguardando cliente → Resolvido → Fechado

## Tags pre-cadastradas

Inbound, Outbound, Ads Facebook/Google/YouTube/TikTok, Form site, Indicacao,
Demo solicitada, Black Friday, Renovacao, Upsell, Urgente.
