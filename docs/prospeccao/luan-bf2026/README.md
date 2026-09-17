# Lista parceiro Luan Souza · Prospecção BFCM 2026

Status em 17/09/2026: **431 leads importados** na pipeline "Parceiro Luan · Black Friday 2026" do CRM admin-convertfy.

| Pasta | Conteúdo |
|---|---|
| `01_dados_origem/` | 4 CSVs originais do Luan (reuniões, agendamentos, MQLs e o MQL antigo sem contato) |
| `02_base_tratada/leads_luan_bf2026.xlsx` | Planilha mestre: resumo, plano 4 semanas, scripts, leads, estrutura, campos, score, sem contato |
| `02_base_tratada/base_consolidada_457.csv` | Todos os leads únicos após dedup, com segmento e motivo de não importar |
| `02_base_tratada/importados_crm_431.csv` | Exatamente o que foi para o CRM |
| `02_base_tratada/sem_contato_4.csv` | Leads sem e-mail e telefone (pedir ao Luan) |
| `03_crm_sql/01_estrutura.sql` | Pipeline, colunas, campos e parceiro (já executado) |
| `03_crm_sql/02_import_leads.sql` | Import dos 431 (já executado; rodar de novo retorna 0) |
| `03_crm_sql/03_verificacao.sql` | Conferência de contagens |
| `03_crm_sql/04_seed_respostas_rapidas_e_motivos.sql` | Respostas rápidas e motivos de perda (a executar) |
| `03_crm_sql/99_rollback.sql` | Desfaz o import (destrutivo) |
| `04_abordagem/` | Estratégia, cadência, plano e scripts de WhatsApp |
| `05_claude_code/PROMPT_CLAUDE_CODE.md` | Prompt completo para o Claude Code do admin-convertfy |

## Números
- **Base:** 979 registros brutos, 457 leads únicos, 431 no CRM, 26 fora e 4 sem contato.
- **Fora do CRM (26):** 22 desqualificados, 2 leads de teste e 2 que já existiam no CRM.
- **Segmentos:** A 75 (P1), B 119 (P2), C 106 (P3), D 108 (P4), Aguardando Luan 23.

## Como usar com o Claude Code
Copie a pasta `luan-bf2026/` para `docs/prospeccao/` no repo `admin-convertfy`. Depois, cole o conteúdo de `05_claude_code/PROMPT_CLAUDE_CODE.md` no Claude Code.
