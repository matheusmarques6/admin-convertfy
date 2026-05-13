# Teste End-to-End — Pipeline Onboarding v2

> Roteiro completo de validação do sistema de Onboarding após a sprint final de produção. Bruno (CEO) ou qualquer usuário do time pode seguir esses passos para testar o fluxo completo no dia a dia.

**Branch**: `claude/resume-previous-session-UvATK`
**Data**: 2026-05-13
**Pré-requisitos**:
- Login admin no `/admin/onboarding`
- Acesso ao deal pipeline em `/admin/comercial/pipelines` (cenário 3)
- Variáveis de ambiente: `ANTHROPIC_API_KEY` (briefing) e opcional `N8N_BRIEFING_WEBHOOK_URL` (n8n custom)

---

## CENÁRIO 1 — Onboarding manual via modal

**Objetivo**: validar que o fluxo de criação manual funciona com todos os campos, gera link tokenizado e instancia tasks da Etapa 1.

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | Acesse `/admin/onboarding` | Kanban de 7 colunas carregado, header "Onboarding" no topo, lista vazia ou com onboardings existentes |
| 2 | Clique no botão **"+ Novo onboarding"** (canto superior direito) | Modal "Novo onboarding" abre com fundo escurecido |
| 3 | No combobox **Cliente**, busque por algum cliente existente (ex: "Bp") e selecione | Combobox fecha, nome do cliente preenchido |
| 4 | No combobox **Loja**, clique em **"+ Nova loja"** | Sub-form de criação de loja aparece com campos nome/url/plataforma |
| 5 | Preencha: nome="Loja Teste E2E", url="https://teste.com.br", plataforma=Shopify e clique **Criar loja** | Loja criada, combobox seleciona automaticamente a nova |
| 6 | Selecione **Plano** = "Pro" | OK |
| 7 | Em **MRR**, digite `2500` | Campo formata pra `R$ 25,00` (ou conforme entrada) — formato BRL |
| 8 | Em **WhatsApp do cliente**, digite `5531999998888` | Campo formata pra `+55 (31) 99999-8888` |
| 9 | Selecione **Idioma** = `Português (BR)` | OK |
| 10 | Selecione **Vertical** = `Moda` | OK |
| 11 | Em **Origem**, clique **"Manual"** (já vem selecionado) | Botão fica preto destacado |
| 12 | Clique **"Criar e copiar link"** | Toast aparece: "Onboarding criado · Link do formulário copiado pra clipboard". Modal fecha. **Navegação automática pra tela de detalhe do onboarding** |
| 13 | Ainda em `/admin/onboarding`, recarregue a página | Card aparece na coluna **"Entrada"** com richness alta: avatar inicial colorido, nome da loja, cliente · vertical, MRR R$ 25, WhatsApp parcialmente mascarado, badge de SLA com tempo |
| 14 | Cole o link copiado num browser (anônimo recomendado) | Formulário público abre — Etapa 1 de 6: "Sobre a loja" |

✅ **Cenário 1 OK se**: card no kanban tem todos os dados visuais, link copiado abre formulário público.

---

## CENÁRIO 2 — Cliente preenche formulário multi-step com briefing IA

**Objetivo**: validar wizard de 6 seções e briefing IA inline.

| # | Passo | Resultado esperado |
|---|---|---|
| 15 | No formulário público (passo 14 acima), preencha todos os campos da **Etapa 1: Sobre a loja** | Inputs respondem normalmente, validação inline (campos `*` em vermelho se vazios) |
| 16 | Clique **"Próxima etapa"** | Avança pra Etapa 2, progress bar atualiza pra ~33% |
| 17 | Repita pra Etapas 2 (Marca), 3 (Clientes), 4 (Histórico) e 5 (Objetivos) | Cada Etapa preenche, salva parcial em background |
| 18 | Na Etapa 5, clique **"Gerar briefing"** | Loading visual: spinner + skeleton de cards, header muda pra "Etapa final · gerando briefing" |
| 19 | Aguarde 30s-2min | A IA (Claude Sonnet 4.6) gera briefing estruturado. Tela atualiza sozinha. Aparecem 5 campos editáveis: Sobre a marca, Audiência, Tom de voz, Identidade Visual (paleta+fontes+refs), Ofertas. Plus campo verde "Algo que faltou?" |
| 20 | Edite qualquer campo se quiser ajustar | Edição funciona, valor atualiza |
| 21 | (Opcional) Adicione algo no campo verde "Algo que faltou ou que você quer destacar?" | OK |
| 22 | Clique **"Confirmar e finalizar onboarding"** | Loading no botão. Após sucesso: tela de "Recebido!" com check verde |
| 23 | No admin, atualize `/admin/onboarding` | Card avançou automaticamente da Etapa 2 (Cliente preenchendo) **direto pra Etapa 3 (Preview em produção)**. Briefing pill no card mostra "Briefing OK" verde |
| 24 | Abra o detail do onboarding | Aba **Briefing** mostra o briefing aprovado (readonly). Aba **Form do cliente** mostra todas as respostas. Aba **Checklist** mostra **N tasks da Etapa 3** já instanciadas (uma por checklist item) |

✅ **Cenário 2 OK se**: todas as 6 seções foram preenchidas, briefing apareceu, cliente confirmou, onboarding avançou sozinho pra Etapa 3, tasks novas apareceram em "Minhas tarefas" do designer.

---

## CENÁRIO 3 — Deal.won automático cria onboarding

**Objetivo**: validar trigger SQL `on_deal_stage_change_to_won` + cron handler `process-deal-won`.

| # | Passo | Resultado esperado |
|---|---|---|
| 25 | Vá em `/admin/comercial/pipelines` | Pipeline de Vendas carregada |
| 26 | Pegue um deal qualquer e arraste pra coluna **"Fechado Ganho"** (ou "Won"/"Ganho") | Deal move, toast "Deal atualizado" |
| 27 | Aguarde 1 minuto (cron `process-deal-won` roda a cada minuto) | Em ~1min, novo onboarding criado automaticamente |
| 28 | Vá pra `/admin/onboarding` | Card novo apareceu na coluna "Entrada" com `source = "deal_won"` (visivel no detail tab) |
| 29 | Vá em `/admin/me` (Minhas tarefas) | Tarefas da Etapa 1 aparecem pro CS (criar grupo WhatsApp, etc.) |
| 30 | Clique no badge sininho de notificações | Notificação inline: "Onboarding entrou em Entrada — [cliente] · [loja]" |

✅ **Cenário 3 OK se**: deal mover pra Won → onboarding aparece automaticamente em até 1 min sem intervenção manual, sem duplicação se já existia onboarding pra esse client+store.

---

## CENÁRIO 4 — Workflow completo etapa por etapa

**Objetivo**: validar avanço de coluna, conclusão de tasks, override e go-back.

| # | Passo | Resultado esperado |
|---|---|---|
| 31 | Pegue qualquer onboarding na coluna "Preview em produção" (Etapa 3) | OK |
| 32 | Abra o detail, aba **Checklist** | Lista de N tasks da etapa, cada uma com checkbox, role (designer), prazo restante (verde/amber/rosa) |
| 33 | Marque todas as tasks como concluídas (clique nos checkboxes) | Cada clique marca a task como `completed`, barra de progresso sobe pra 100% |
| 34 | Clique no botão **"Avançar coluna"** no header | Onboarding avança pra Etapa 4 (Aprovação do preview). Toast "Onboarding avançou de coluna". Card move no kanban |
| 35 | Em Etapa 4, sem completar tasks, clique **"Avançar coluna"** | Erro: "Checklist incompleto: N task(s) pendente(s)" |
| 36 | Clique no botão **"Forçar avanço"** (cor amber) no header | Modal abre listando todas as tasks pendentes + textarea de justificativa |
| 37 | Digite justificativa de mais de 10 chars e clique "Forçar avanço" | Onboarding avança. Override é registrado em `task_overrides` com seu user_id pra audit |
| 38 | (Opcional) Em qualquer etapa, clique **"Pedir ajustes"** (botão branco) | Modal abre com select de coluna destino + severidade + feedback. Volta uma coluna, cria nova versão (badge `v2` no card) |

✅ **Cenário 4 OK se**: tasks individuais marcam OK, validação bloqueia avanço com itens pendentes, override registra justificativa, go-back cria nova versão.

---

## CENÁRIO 5 — 3-dots menu no card

**Objetivo**: validar todas as ações disponíveis no menu do card.

| # | Passo | Resultado esperado |
|---|---|---|
| 39 | No kanban, hover em qualquer card e clique no ícone **`⋯`** | Menu dropdown aparece com 6 opções: Ver detalhes, Copiar link do form, Editar onboarding, Forçar avanço, Pedir ajustes, Arquivar |
| 40 | Clique **"Copiar link do form"** | Toast "Link copiado", URL completa no clipboard |
| 41 | Clique **"Forçar avanço"** | Navega pro detail com modal override aberto automaticamente |
| 42 | Clique **"Pedir ajustes"** | Navega pro detail com modal go-back aberto automaticamente |
| 43 | Clique **"Arquivar"** | Confirma ("Arquivar esse onboarding?"), depois `status = cancelled` (soft-delete). Card sai do kanban |

✅ **Cenário 5 OK se**: todas as ações executam sem erro de console.

---

## CENÁRIO 6 — Tutorial CMS + link público

**Objetivo**: validar fluxo do tutorial pro cliente.

| # | Passo | Resultado esperado |
|---|---|---|
| 44 | Acesse `/admin/onboarding-help` | Lista de tutoriais. Pelo menos 1 padrão criado pelo bootstrap ("Tutorial implementação") |
| 45 | Clique no tutorial pra editar | Editor abre com blocks. Pode adicionar blocos (texto/passo/imagem/video/code/faq/cta_whatsapp), reordenar com setas, deletar |
| 46 | Adicione um bloco **Imagem** e faça upload | Imagem sobe pro Supabase Storage (bucket `onboarding-assets`), URL aparece preview |
| 47 | Reordene blocos com as setas ↑↓ | Ordem persiste após reload |
| 48 | Mude status pra **Publicado** (toggle no header) | Badge muda pra emerald "Publicado" |
| 49 | Pegue um onboarding em Etapa 6 (Implementação) — `tutorial_token` é gerado automaticamente | OK |
| 50 | Abra o detail, aba **Briefing** ou no header — copie o "Link do tutorial" | Toast "Link copiado" |
| 51 | Cole o link em browser anônimo | Tutorial público abre com variáveis substituídas (`{{client_name}}` → nome real, etc.) |

✅ **Cenário 6 OK se**: tutorial editável, blocks reordenam, link público renderiza com vars.

---

## CENÁRIO 7 — Detail page completo

**Objetivo**: validar header rico, KPIs, tabs e ações.

| # | Passo | Resultado esperado |
|---|---|---|
| 52 | Abra o detail de qualquer onboarding | Header: nome da loja, cliente · company · platform, badge de versão se >v1, botões "Pedir ajustes" / "Forçar avanço" / "Avançar coluna" |
| 53 | Stepper visual mostra as 7 colunas | Coluna atual destacada na cor da coluna, anteriores em verde, futuras em cinza |
| 54 | Linha 1 de KPIs: Coluna atual, Briefing status, Pagamento, Contrato | OK |
| 55 | Linha 2 de KPIs: MRR, Plano, Vertical, WhatsApp (só aparecem se preenchidos) | OK |
| 56 | Banner roxo "Link do formulário do cliente" com status (Não enviado / Em andamento / Concluído) e botão Copiar/Abrir | OK |
| 57 | Tabs: Checklist (lista de tasks da etapa atual), Deliverables (form com fields configurados na coluna), Briefing (form link + tutorial link + briefing aprovado), Versões (histórico de revisões), Form do cliente (respostas) | Cada tab mostra dados reais |
| 58 | Aba Deliverables: preencha um campo `upload` com arquivo PDF | Upload funciona, arquivo gravado em storage com signed URL |
| 59 | Aba Deliverables: marque um `multi_checkbox` com várias opções | Selecionados aparecem como pills coloridas |
| 60 | Aba Versões: se onboarding teve "Pedir ajustes", lista versões com feedback do cliente | OK |

✅ **Cenário 7 OK se**: nada mostra "Task pendente" ou placeholder vazio.

---

## VALIDAÇÕES FINAIS

### Build & Quality
```bash
npm run build       # Sem erros, sem warnings
npm run lint        # 0 errors, 0 warnings
npx tsc --noEmit    # 0 erros TS
```

### Banco de dados
- Tabela `onboardings` tem todas as colunas novas: `plan`, `mrr_value`, `client_whatsapp`, `language`, `vertical`, `source`, `form_token_expires_at`
- Tabela `tasks` tem `onboarding_id`, `operational_column_id`, `assignee_role`, `version` populados em onboardings novos
- `task_deliverables` populadas conforme template de cada coluna
- `onboarding_versions` registra cada round-trip
- `task_overrides` registra cada uso do "Forçar avanço"

### Cron jobs (Vercel)
- `/api/cron/process-deal-won` rodando a cada minuto
- `/api/cron/onboarding-sla-check` rodando diário 9h UTC

### Logs
- Eventos `onboarding.created`, `onboarding.column_changed`, `onboarding.briefing_confirmed`, `onboarding.preview_rejected` em `events` table
- WhatsApp envios logados em `crm_messages` quando coluna avança

---

## TROUBLESHOOTING

### "Briefing não gera"
1. Verifique env `ANTHROPIC_API_KEY` configurada
2. Cliente pode ter saído antes — abra o link de novo, deve voltar ao mesmo passo
3. Se `briefing_status='not_started'` mas `briefing.error` populado, falha logada na DB. Veja `briefing.error` na aba Briefing do detail

### "Card não aparece após criar"
1. Recarregue a página (SWR cache)
2. Verifique status filtro — só `in_progress` aparece por default

### "Tasks não instanciam"
1. Verifique que a coluna tem `checklist_template` populado (`SELECT * FROM operational_pipeline_columns`)
2. Bootstrap idempotente roda na primeira chamada de `/api/onboardings` por org

### "WhatsApp não dispara ao avançar coluna"
1. Verifique que existe um `crm_channels` com `type='whatsapp'` e `is_active=true` na org
2. Token e phone_number_id válidos no `config` do canal
3. Cliente tem `client_whatsapp` ou `client.phone` preenchido
4. Coluna tem `whatsapp_template` (não null)

### "Deal.won não cria onboarding"
1. Stage do deal precisa se chamar "Fechado Ganho", "Ganho", "Won", "Closed Won" ou "Fechado" (case-sensitive) OU ter `stage_type='won'`
2. Trigger SQL `on_deal_stage_change_to_won` precisa estar ativo no banco
3. Cron `process-deal-won` precisa estar configurado em `vercel.json`

---

*Caso algum passo falhe, abra issue no GitHub mencionando o número do passo + screenshot do console DevTools.*
