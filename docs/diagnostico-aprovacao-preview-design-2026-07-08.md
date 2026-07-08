# Diagnóstico — "Designer aprova o preview e nada é acionado" (08/07/2026)

Investigação feita em duas frentes: código (cadeia de gatilhos de aprovação → handoff → board)
e banco de produção (projeto Supabase `admin convertfy`). Horários em UTC (BRT = UTC-3).

## TL;DR

**O pipeline de design FOI acionado — mas de forma defeituosa e ele não aparece
como "projeto" no board de Projetos.** Três defeitos confirmados com evidência no
banco + uma etapa fantasma (`implementacao`) que o código não conhece e que fica
invisível para a equipe responsável. Detalhe por cenário abaixo.

---

## Cenário A — Aprovação da campanha "EMAIL 2 - TEASER 6.6 BRASIL" (07/08 01:27 UTC)

### Linha do tempo (evidência do banco)

| Hora (UTC) | Evento |
|---|---|
| 01:27:10 | Ryan Fernando (admin) aprova a campanha (`campaign_suggestions.decided_at`) |
| 01:27:10 | `approveSuggestion` **PULA** a instanciação do design — ver Bug 1 |
| 01:28:24.505 / .537 / .551 | Webhook n8n `campaign-copy-complete` cria **3 tasks duplicadas** "Criar a estrutura do email no Figma" — ver Bug 2 |
| 01:31:35 | Uma das 3 tasks é marcada `in_progress` (alguém começou a trabalhar) |

Estado atual: campanha em `estrutura`, `design_version=1`, 3 tasks âncora idênticas
(`870df0de` in_progress; `a5cc474e` e `fab82c65` pending), cada uma com seu
deliverable `figma_structure_link` required vazio.

### Bug 1 — A aprovação não instancia o design quando existe `design_task_id` legado

`src/lib/services/campaign-central/suggestion-approval.service.ts:176-193`:

```ts
let designTaskId: string | null = s.design_task_id ?? null
if (!designTaskId) {           // ← pulado!
  await instantiateCampaignStage(...)
}
```

A TEASER tinha `design_task_id = 04f16625` — uma **task legada de 15/06**
("[Design] EMAIL 2 - TEASER 6.6 BRASIL", sem `operational_column_id`, metadata vazio),
criada por um fluxo antigo. Como o campo não era nulo, a aprovação **não iniciou o
pipeline de design**. Ele só nasceu 74s depois pela "rede de segurança" (webhook
`campaign-copy-complete`). Se o n8n falhasse, o design nunca seria acionado —
exatamente o sintoma "aprovei e não aconteceu nada".

### Bug 2 — Corrida de idempotência cria tasks triplicadas

`src/lib/services/campaign-central/campaign-design-instantiate.service.ts:75-94` faz
check-then-insert ("já existem tasks pra campanha+coluna+versão?") **sem unique
constraint nem lock**. O n8n chamou o webhook 3× em paralelo (o contrato do webhook
diz "o n8n chama UMA vez ao terminar o lote" — `campaign-copy-complete/route.ts:5`,
não cumprido) e as 3 chamadas passaram juntas pela checagem → 3 inserts a 46ms de
distância.

**Consequência grave**: o handoff `estrutura → aprovacao` exige **TODAS** as tasks
da etapa `completed` (`campaign-design-handoff.service.ts:292`). O designer conclui
a task dele, as 2 duplicatas ficam pending → `not_ready` **silencioso** → a etapa
nunca avança. Ou seja: quando o designer "aprovar o preview" (concluir a estrutura),
**o handoff não vai acionar** enquanto as duplicatas existirem.

### Bug 3 — O grupo aparece no board de Projetos SEM identidade de projeto

O serviço de projeção manda o shape certo
(`campaign-design-board.service.ts:296-299`: `source_type: "campaign_design"`,
`stage_name`, `stage_color`, `stage_role`), mas a rota **sobrescreve**:

`src/app/api/productivity/route.ts:453-460` empurra `source_type:
"campaign_suggestion"` e **descarta** `stage_name`/`stage_color`/`stage_role`.

O board (`productivity-board.tsx:1316-1317`) só trata como projeto
`source_type === "campaign_design"`. Resultado: o grupo "Campanha · EMAIL 2 -
TEASER 6.6 BRASIL" **renderiza como grupo legado comum** — sem chip de etapa, sem
header rico — fácil de passar despercebido ("foi acionado mas não está mostrando
[como projeto]").

---

## Cenário B — Campanha "SOCIAL PROOF 26/06" na etapa fantasma `implementacao`

A coluna **"Implementacao" (position 5)** do pipeline "Design de Campanhas" foi
criada **manualmente no banco** — há **zero referências** a `implementacao` em
`src/lib/services/campaign-central/`. O código conhece só 4 etapas
(estrutura/aprovacao/producao/finalizacao). Efeitos:

1. **Invisível no board de Projetos para a equipe de implementação**:
   `campaign-stage-access.ts:23-31` não tem `implementacao` na matriz →
   `getCampaignStageResponsibleRole` retorna `null` → `canAccessCampaignStage`
   = `false` para todo mundo **exceto bypass (admin/dev/coo)**. As tasks
   "Corte modelo" / "Subir e-mails - Português/Inglês/Outras línguas"
   (assignee_role=`implementacao`, criadas 03/07 20:03) existem mas o grupo **não
   aparece** para quem tem a função `implementacao`.
2. O handoff não sabe avançar nem encerrar nessa etapa (`STAGE_ORDER` tem 4 slugs;
   `finalizacao` é tratada como terminal em `campaign-design-handoff.service.ts:285`).
3. `board-mapping.ts:51-56` não tem label pra ela (badge de sub-estágio fica vazio
   no Campaign Central).
4. Inconsistência de dados: as 4 tasks de `finalizacao` continuam `pending`, mas o
   `design_column_id` já aponta pra `implementacao` — avanço foi manual, fora do fluxo.

Observação: a task "Corte modelo" oscila `completed ↔ in_progress` (04/07 20:45,
21:00, 21:01; 08/07 01:28, 01:29 e 17:19) sempre com `actor_id = null` — o histórico
não captura o autor quando a escrita passa pelo admin client, então não dá para
atribuir; o padrão sugere toggles humanos, não automação.

---

## Cenário C — Onboarding: pilotos do preview (se o relato for desse fluxo)

- **Royal Luxury** está em `preview_producao` com **as 5 tasks `completed` desde
  11/06** e nunca avançou para "Aprovação do preview". Causa: o avanço exige os
  deliverables **required do template da etapa** preenchidos (4 uploads
  `piloto_*_files` + `language`) — estão vazios → `attemptOnboardingHandoff`
  retorna `not_ready` **silenciosamente** (`onboarding-task-completion.service.ts:326-340`),
  e o reconciliador diário (cron 09:00, `reconcileStuckHandoffs`) devolve o mesmo
  resultado todo dia.
- Gaps estruturais correlatos (mesma classe de bug):
  - `email-task-sync.service.ts:468-514` conclui a task de `emails_finais` direto
    no banco **sem chamar o handoff** → onboarding só destrava no cron do dia seguinte.
  - Não existe auto-complete de task de onboarding ao preencher deliverable (tasks
    de campanha têm; `deliverables/[deliverableId]/route.ts:59-76`) — o designer sobe
    os 4 pilotos mas precisa clicar "Concluir" em cada uma das 5 tasks.
  - Todos os handoffs automáticos são non-blocking: erro é só logado, o usuário
    recebe 200 e nada visível acontece.

---

## Correções recomendadas (por prioridade)

1. **Limpar as duplicatas da TEASER** (dado): cancelar `a5cc474e` e `fab82c65`,
   manter `870df0de` (in_progress). Sem isso o designer não consegue acionar o
   avanço da estrutura.
2. **Idempotência real no instanciador**: unique index parcial
   (ex.: `tasks(source_id, operational_column_id, version, slug) WHERE source_type='campaign_suggestion'`)
   + insert com `on conflict do nothing`, ou advisory lock por sugestão+etapa.
3. **Corrigir a rota `/api/productivity`**: repassar `cg.source_type`
   (`campaign_design`), `stage_name`, `stage_color`, `stage_role` em vez de
   sobrescrever com `campaign_suggestion` (route.ts:453-460).
4. **Registrar a etapa `implementacao`** na matriz (`campaign-stage-access.ts` →
   role `implementacao`), no `STAGE_ORDER`/bootstrap e nos labels — ou remover a
   coluna manual e modelar a implementação de outro jeito.
5. **Não pular a instanciação na aprovação** quando `design_task_id` aponta pra
   task legada (validar se a task tem `operational_column_id`; ou migração que
   limpe `design_task_id` órfãos).
6. **Onboarding**: expor o motivo do `not_ready` na UI (por que não avançou) e
   avaliar auto-complete ao preencher deliverables; para Royal Luxury, preencher
   os deliverables ou avançar manualmente.

## Arquivos-chave

- `src/lib/services/campaign-central/suggestion-approval.service.ts` (skip do design)
- `src/lib/services/campaign-central/campaign-design-instantiate.service.ts` (corrida)
- `src/lib/services/campaign-central/campaign-design-handoff.service.ts` (condições de avanço)
- `src/lib/permissions/campaign-stage-access.ts` (matriz sem `implementacao`)
- `src/app/api/productivity/route.ts:442-465` (projeção com source_type errado)
- `src/components/productivity/productivity-board.tsx:1316` (detecção de projeto)
- `src/lib/services/onboarding-task-completion.service.ts` (handoff onboarding)
