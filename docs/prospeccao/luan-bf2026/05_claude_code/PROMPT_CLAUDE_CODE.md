# Prompt · Claude Code · admin-convertfy
## Operacionalizar a pipeline "Parceiro Luan · Black Friday 2026" no CRM

> Cole este arquivo inteiro no Claude Code, na raiz do repo `admin-convertfy`, com a pasta `luan-bf2026/` copiada para `docs/prospeccao/luan-bf2026/`.

---

## 1. Contexto

A Convertfy (agência de e-mail e SMS marketing para e-commerce) recebeu do parceiro **Luan Souza** (mentoria de dropshipping global, @oluanmsouza) a lista de leads do funil dele: reuniões, agendamentos e MQLs. Vamos prospectar esses leads ativamente pelo WhatsApp para vender implementação de e-mail e SMS antes da Black Friday de **27/11/2026**. O corte para fechar contrato é **23/10/2026**.

Os dados **já foram importados no Supabase de produção** em 17/09/2026. Sua tarefa **não é importar de novo**: é fazer o CRM do admin operar essa pipeline bem (visualização, cadência, respostas rápidas, fila diária, regras de coluna e relatório).

Leia antes de começar:
- `docs/prospeccao/luan-bf2026/04_abordagem/estrategia_e_cadencia.md` (regras de negócio)
- `docs/prospeccao/luan-bf2026/04_abordagem/scripts_whatsapp.md` (mensagens)
- `docs/prospeccao/luan-bf2026/03_crm_sql/` (SQL do que já foi feito)
- `BRIEFING.md` e `PLANO-EXECUCAO-AUTONOMA.md`, se existirem, para entender o estado do CRM e não reconstruir o que já existe.

## 2. Estado atual do banco (projeto Supabase `admin convertfy`, ref `ppygkfeffknypfncsnlv`)

- **Org:** `d1ae3cf9-558d-40cc-9272-4a5633894ef8`
- **Pipeline:** `pipelines.id = f67bb18f-70ae-4f78-a4ef-4f396d8920fa`, nome "Parceiro Luan · Black Friday 2026", scope `sales`, categoria "Comerciais"
- **Parceiro:** `crm_partners.id = 21c8b25d-0f8e-409c-9133-4d83a243c5a0` ("Luan Souza"), ligado em `deals.referrer_partner_id`
- **431 `crm_leads` + 431 `deals`**, todos com `source = 'parceiro:luan-souza'`, `source_type = 'indicacao'`
  - `crm_leads.created_by_external` = id da lista (`LUAN-0001` a `LUAN-0431`)
  - `deals.position` = ordem de prioridade dentro da coluna (menor = primeiro)
  - `deals.tags`: `parceiro-luan`, `bf2026`, `p1`..`p4`, `aluno-luan` (segmento A), `dados-revisar` (12 com alerta)
  - Telefone 2 e e-mail 2, quando existem, estão em `deals.notes` e `crm_leads.notes`

**Colunas (`pipeline_stages`)**

| order | nome | stage_type | sla_hours | id | deals |
|---|---|---|---|---|---|
| 1 | A · Aluno Luan | open | 24 | 2c0285cd-b20e-4154-8a4c-22f11ae74c1d | 75 |
| 2 | B · Fez call, não comprou | open | 48 | e9128a20-72f3-48d2-a8e3-88da9bedd126 | 119 |
| 3 | C · Agendou, não fez call | open | 48 | f02fc6d1-0859-467c-968d-b97a731a6600 | 106 |
| 4 | D · MQL sem conversa | open | 72 | 94febd93-a8eb-4065-b85b-b7106c0ad7c3 | 108 |
| 5 | Aguardando liberação Luan | open | 168 | 6bb709b9-7119-4cf7-997e-1d5a6975e754 | 23 |
| 6 | T1 · Abordado | open | 48 | a194900d-712b-45cb-bc62-73d21ece3ac9 | 0 |
| 7 | T2 · Follow-up com valor | open | 72 | d50c21e1-107c-48ce-85c4-2e14b4a78994 | 0 |
| 8 | T3 · Último toque | open | 48 | f48ff175-d639-421b-9715-6bc32a5b3f97 | 0 |
| 9 | Respondeu · qualificar | open | 24 | f0e3053b-af67-46c4-a96b-d63c22175f2e | 0 |
| 10 | Diagnóstico agendado | open | null | b0a4dc17-8875-43d7-bb17-20abe9df0799 | 0 |
| 11 | Diagnóstico feito | open | 24 | 727e3362-e802-4079-a0df-174a67463b8e | 0 |
| 12 | Proposta enviada | open | 48 | b2cde307-e4c6-4f4d-aaa0-11a2d7e3ddf8 | 0 |
| 13 | Ganho | won | null | 2e680c66-3836-46f6-b66e-ea7372485257 | 0 |
| 14 | Nutrir · loja sem vendas | archived | null | 16773d7c-2e82-43f6-a5de-6c4e587e35cb | 0 |
| 15 | Perdido · sem resposta | lost | null | 5a47f6f3-acb2-4e9c-b25a-3c767f4febfd | 0 |
| 16 | Perdido · sem interesse/fit | lost | null | a60e9978-0a6d-47c7-90c3-30b6e0ef4b04 | 0 |

**Campos de deal (`crm_custom_fields`, entity `deal`, gravados em `deals.custom_fields`)**

- **Já existiam:** `url_da_sua_loja` (url), `faturamento_medio_mensal` (select), `qual_o_pais_da_sua_loja` (select), `qual_seu_instagram` (text)
- **Criados, preenchidos no import:**
  - `segmento_parceiro` (select)
  - `prioridade` (select P1–P4)
  - `score_parceiro` (number)
  - `parceiro_etapa` (select Reunião/Agendamento/MQL)
  - `parceiro_status` (text)
  - `parceiro_qualificacao` (select)
  - `parceiro_closer` (text)
  - `parceiro_ultima_interacao` (date)
  - `angulo_abordagem` (text)
  - `alerta_dados` (text)
  - `tentativas_contato` (number, começa em 0)
  - chave extra `id_lista_parceiro`, que não tem definição de campo
- **Criados, preenchidos na operação:**
  - `maturidade_loja` (select: Sem loja / Em construção / No ar sem vendas / Vendendo)
  - `plataforma_loja` (select)
  - `ferramenta_email_atual` (select)
  - `nicho` (text)
  - `proximo_contato` (date)

**Vazios hoje:** `crm_quick_replies`, `crm_saved_views`, `crm_lost_reasons` (0 linhas). Nenhum stage usa `automation_on_enter` ou `required_fields` ainda.

**Outros pipelines relevantes:** "Onboarding 30d" ativo = `f3f2102d-5af8-4900-a526-1942108e267b`, primeira coluna "Pre-onboarding" = `9b94b504-e87f-443e-8fa4-bb2150c776c9`.

## 3. Tarefas (nesta ordem)

### T0 · Diagnóstico (sem escrever código)
1. Rode `03_crm_sql/03_verificacao.sql` e confirme os números da tabela acima. Se divergirem, pare e me avise.
2. Mapeie no código:
   - como o Kanban lê `pipelines`, `pipeline_stages` e `deals`;
   - se renderiza `crm_custom_fields` de deal;
   - como ordena os cards;
   - se existe motor de automação (`automation_on_enter`, `crm_automations`/`crm_automation_runs`), respostas rápidas, saved views e cron/jobs.
3. Me entregue um resumo curto do que já existe e do que falta **antes** de implementar.

### T1 · Kanban e card
- **Ordenação:** a coluna deve ordenar por `deals.position` asc (não por `created_at`). Se hoje não ordena assim, ajuste sem quebrar os outros pipelines. Se preciso, torne o sort configurável por pipeline.
- **Card compacto:** mostrar badge de `prioridade` (P1 verde, P2 amarelo, P3 laranja, P4 cinza), `segmento_parceiro`, ícone de alerta quando houver `alerta_dados` e `tentativas_contato`.
- **Drawer do deal:**
  - mostrar e permitir editar todos os campos de deal com os tipos e opções de `crm_custom_fields`;
  - bloco "Origem parceiro" somente leitura com os campos `parceiro_*`, `score_parceiro` e `angulo_abordagem`.
- **Filtros no topo da pipeline:** tag, prioridade, segmento, "com alerta", "follow-up vencido".
- **Aceite:** abrir a pipeline e ver as 5 colunas de entrada com as contagens de T0, na ordem de `position`, com os badges.

### T2 · Ação "Enviar mensagem" pelo WhatsApp (sem API, envio manual)
No card e no drawer, botão **Enviar T1 / T2 / T3** conforme a coluna atual. Ao clicar:
1. Monta o texto a partir da resposta rápida certa:
   - T1 usa `/t1a`, `/t1b`, `/t1c` ou `/t1d` conforme `segmento_parceiro`;
   - T2 usa `/t2`;
   - T3 usa `/t3`;
   - substitui `{nome}` pelo primeiro nome do deal.
2. Abre `https://wa.me/{telefone só dígitos}?text={texto urlencoded}` em nova aba.
3. Registra `crm_deal_activities`:
   - `type = 'wa_message'`;
   - `content` = texto enviado;
   - `metadata = {"toque":"T1","canal":"whatsapp_manual"}`.
4. Incrementa `custom_fields.tentativas_contato`.
5. Move o deal para a próxima coluna, atualiza `last_stage_changed_at` e grava `stage_change` em activities, conforme o padrão do projeto:
   - de A/B/C/D para T1;
   - de T1 para T2;
   - de T2 para T3.
6. Cria uma task (`type = 'task'`) com `due_at = now() + sla_hours` da nova coluna, conteúdo "Checar resposta do T{n}".

Bloqueios:
- Deal em **"Aguardando liberação Luan"** não mostra o botão. Mostra "Aguardando o parceiro liberar".
- Deal com tag `nao-contatar` não mostra o botão.
- Telefone com `alerta_dados` contendo "telefone": mostra aviso antes de abrir.

**Aceite:** clicar em Enviar T1 num deal do segmento A abre o WhatsApp com o texto `/t1a` preenchido, e o deal vai para T1 com activity, contador e task.

### T3 · Respostas rápidas e motivos de perda
1. Rode `03_crm_sql/04_seed_respostas_rapidas_e_motivos.sql`. Antes, ajuste `{nome}`/`{hora}` para a sintaxe de variável que o componente de respostas rápidas usa, se for diferente.
2. As respostas rápidas devem aparecer no inbox/thread do CRM (atalho `/`) e ser usadas pela T2.

### T4 · Regras de coluna
Use `pipeline_stages.required_fields` e o mecanismo existente. Se não houver, crie validação no service de movimentação de deal:
- **Sair de "Respondeu · qualificar":** exige `maturidade_loja`.
  - Se for "Vendendo", só pode ir para "Diagnóstico agendado", Ganho ou Perdido.
  - Se for outro valor, sugerir "Nutrir · loja sem vendas".
- **Entrar em "Diagnóstico agendado":** exige `url_da_sua_loja` e `proximo_contato` (data da call).
- **Entrar em "Perdido · …":** exige `lost_reason`, escolhido de `crm_lost_reasons`.
  - Se o motivo for "Pediu para não ser contatado", adiciona a tag `nao-contatar`.
- **Entrar em "Ganho":**
  - `status = 'won'`, `won_at = now()`;
  - cria um deal no pipeline "Onboarding 30d", coluna "Pre-onboarding", com o mesmo `lead_id`, título e `referrer_partner_id`;
  - atualiza `crm_partners.total_deals_won` (+1) e `last_referral_at`;
  - se houver valor, soma em `total_revenue_cents`.
- **Entrar em "Perdido" ou "Nutrir":** `status = 'lost'` ou `'archived'`, com `lost_at` quando aplicável.
- **Mover para fora de "Aguardando liberação Luan":** pede confirmação "O Luan liberou este lead?" e registra uma activity `note`.

### T5 · SLA e cadência automática
Job diário, usando o mecanismo de jobs/cron já existente no projeto; se não houver, crie uma rota protegida para Vercel Cron às 08:00 America/Sao_Paulo. O job faz:
1. **Deal em T1, T2 ou T3 com SLA vencido e sem activity recebida** (resposta do lead) desde a entrada na coluna:
   - T1 ou T2: marca como "follow-up vencido" (flag em `custom_fields.followup_vencido = true`) e cria task "Enviar T{n+1}". **Não** move sozinho: o envio é manual.
   - T3: move para "Perdido · sem resposta", `lost_reason = 'Sem resposta após 3 toques'`, com activity `system`.
2. **Deal em "Respondeu · qualificar" há mais de 24h:** task "Qualificar lead".
3. **Deal em "Aguardando liberação Luan":** toda segunda, uma task única "Revisar liberação com o Luan (N leads)".
4. **Idempotência:** chave por deal, dia e regra em `crm_automation_runs.idempotency_key`, ou equivalente.

**Resposta recebida:** se o inbox multicanal já registra mensagens recebidas (`crm_messages`/`crm_threads`), use isso para detectar resposta e mover automaticamente de T1/T2/T3 para "Respondeu · qualificar". Se não registra, adicione um botão "Respondeu" no card que faz esse movimento.

### T6 · Fila de hoje
Criar uma view (tela ou saved view) **"Fila de hoje · Luan"** com, nesta ordem:
1. Follow-ups vencidos (T1/T2) e tasks do dia.
2. Até **40 deals novos por dia**:
   - ordem por coluna de entrada: A, depois B, depois C, depois D;
   - dentro de cada coluna, por `position`;
   - exclui Aguardando Luan e `nao-contatar`.
3. O limite de 40 fica configurável.

Cada linha mostra nome, segmento, prioridade, ângulo e o botão Enviar.

### T7 · Saved views
Criar em `crm_saved_views` (`pipeline_id` da pipeline, `is_shared = true`), usando o formato de `filters` que o código espera:
- A · Aluno Luan
- B · Fez call
- C · Agendou
- D · MQL
- Follow-up vencido
- Com alerta de dados
- Vendendo (`maturidade_loja = Vendendo`)
- Nutrir (jan/2027)

### T8 · Relatório da campanha
Criar uma página ou aba em Relatórios filtrada por `source = 'parceiro:luan-souza'`.
- **Linhas:** por segmento (A, B, C, D, Aguardando).
- **Colunas:**
  - total;
  - abordados (tentativas ≥ 1);
  - responderam;
  - taxa de resposta;
  - vendendo;
  - % vendendo;
  - diagnósticos agendados e feitos;
  - propostas;
  - ganhos;
  - receita;
  - perdidos por motivo.
- **Extras:**
  - evolução diária de abordagens (meta de 40/dia);
  - contador de dias até 23/10 e até 27/11;
  - card do parceiro Luan com deals ganhos, receita e comissão devida (usar `crm_partners.commission_pct` se preenchido).

### T9 (fase 2, só depois de T0–T8) · Importador CSV genérico
Criar `/admin/crm/import`:
- upload de CSV;
- mapeamento de colunas para lead, deal e custom fields;
- escolha de pipeline e coluna por uma coluna do CSV;
- dedup por e-mail e últimos 8 dígitos do telefone na org;
- `created_by_external` para idempotência;
- preview e relatório de erros antes de gravar.

Use `02_base_tratada/importados_crm_431.csv` como caso de teste num **branch do Supabase**, nunca em produção.

## 4. Regras do projeto (obrigatórias)
- `org_id`, nunca `organization_id`.
- Migrations idempotentes, nome `YYYYMMDD_NN_descricao.sql`, com RLS desde o início usando `is_admin()`, `is_org_member()`, `is_org_owner()`, `current_org_id()`.
- Todo texto de interface em pt-BR e via `useVocabulary()`.
- Services publicam eventos e registram activities.
- Portar ou estender o que existe; não reconstruir.
- Typecheck e lint com zero warnings antes de cada commit. Um PR por dia de implementação. Código completo, sem stubs.
- Seeds de dados (T3, T7) são scripts de dados, não migrations de schema.

## 5. Checkpoints humanos (pare e me pergunte)
- Antes de qualquer `delete`/`update` em massa nos 431 deals (o `99_rollback.sql` só roda com meu ok).
- Antes de ativar o job de T5 em produção: rode primeiro em modo dry-run e me mostre o que ele faria.
- Se T0 mostrar números diferentes da tabela da seção 2.
- Se precisar alterar enums (`stage_type`, `crm_activity_type`, `deal_status`).

## 6. Entrega
Para cada tarefa, me devolva:
- o que mudou (arquivos);
- como testar;
- print ou descrição da tela;
- resultado de `03_verificacao.sql` ao final.
