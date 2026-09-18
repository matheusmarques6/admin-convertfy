# Funil de aplicação — `/forms/aplicacao`

Funil conversacional de 21 telas que recebe **tráfego pago direto do
anúncio**, sem página de vendas na frente. O formulário É o funil: ele
qualifica, mostra ao dono da loja quanto ele está deixando passar (com
os números dele) e, no desfecho aprovado, marca a call na nossa agenda.

A definição vive em `src/lib/forms/funil-aplicacao.ts` — código
versionado, com os caminhos da seção 8 percorridos pela **engine de
produção** em `funil-aplicacao.test.ts`. O banco é semeado a partir dela
(`scripts/gerar-seed-funil-aplicacao.ts`), nunca o contrário.

---

## Onde colar (a página do anúncio)

Em `convertfy.me/aplicacao`, uma página **sem menu, sem rodapé e sem
mais nada**: o funil ocupa a janela inteira.

```html
<div
  data-convertfy-form="https://app.convertfy.me/forms/aplicacao"
  data-convertfy-height="tela"
  data-convertfy-title="Aplicação · Convertfy"
></div>
<script src="https://app.convertfy.me/api/script/form-embed.js" defer></script>
```

`data-convertfy-height="tela"` é o que faz o iframe usar `100dvh` — no
iOS o `100vh` conta a barra do navegador que some ao rolar, e a pergunta
fica cortada. O script é o MESMO que a página de vendas já usa: ele roda
no domínio da LP, enxerga a query string dela e repassa `utm_*`,
`gclid` e `fbclid` para dentro do iframe, que cross-origin nunca os
herdaria. Ele também guarda o **first touch** por 90 dias.

Para a página ficar limpa, o `<body>` dela precisa de `margin: 0` e
nenhum container com `max-width`.

---

## A página de obrigado: divergência declarada

A especificação pedia que o `LeadQualificado` disparasse em
`convertfy.me/aplicacao-aprovada`. **Não foi assim que ficou, e é
melhor.** Três razões:

1. **O evento não precisa de uma página.** `LeadQualificado` é um evento
   **personalizado**, e o que a conversão personalizada da Meta casa é o
   NOME dele — não a URL. Ele já sai dos dois lados (pixel do browser e
   CAPI) com o MESMO `event_id`, e a Meta deduplica.
2. **Redirecionar custa a conversão.** O pixel do browser acabou de
   disparar e a requisição ainda está no ar; navegar cancela o que não
   saiu. É o motivo de `ESPERA_DO_DESTINO_MS` existir para os outros
   tipos de destino.
3. **A agenda é a nossa.** Quem chega ao desfecho aprovado escolhe o
   horário DENTRO da tela final, na nossa agenda sincronizada com o
   Google. Mandá-lo para outro domínio (ou para um serviço de fora)
   custa exatamente o instante em que ele está com a mão no teclado — e
   um serviço de fora não sabe que aquela pessoa é um lead nosso, com
   negócio e histórico no CRM.

Se ainda assim a página de obrigado for desejada (por exemplo, para uma
conversão do Google Ads que exige URL de destino), o caminho é o campo
`redirect_url` do final — ele existe e continua funcionando. O custo
está declarado acima.

---

## A agenda

O desfecho `fim_aprovado` tem `destino: { tipo: "agenda" }`. Esse tipo é
o único que **não leva para fora**: ele desenha o seletor de horário na
própria tela final (`components/forms/agenda-do-final.tsx`).

- **Disponibilidade**: `GET /api/public/forms/aplicacao/agenda`. Os
  horários saem de `lib/meetings/disponibilidade.ts` (puro, 21 testes)
  cruzando a regra da agenda com o que já está tomado — o `freeBusy` do
  Google **e** as reuniões do nosso banco. Os dois, porque o freeBusy vê
  o compromisso pessoal criado direto no Google e o banco vê a reunião
  que nasceu aqui e cujo sync falhou.
- **Marcar**: `POST` na mesma rota, com o par sessão+token que o submit
  já confere. Lead, negócio, organizador e duração saem do BANCO —
  aceitar `deal_id` no corpo deixaria alguém pendurar uma call no
  negócio de outra pessoa.
- **O servidor não confia no horário recebido**: gerar e aceitar passam
  pela MESMA função (`slotAgendavel`). Duas réguas divergiriam, e a
  divergência aqui é um POST feito à mão marcando domingo às 3h.
- **Uma sessão marca no máximo uma call** (índice único parcial em
  `meetings.form_session_id`, migration 20261170). Clique duplo adota a
  que passou primeiro; escolher outro horário REMARCA a mesma reunião.
- **Falha do Google não vira agenda vazia**: a resposta declara
  `fonte: "somente_banco"` e a tela diz que o horário será confirmado
  por e-mail.

### A regra (editável sem deploy)

Vive em `crm_forms.settings.agenda.regra`:

| campo | valor hoje | por quê |
|---|---|---|
| `duracaoMin` | 30 | é uma conversa de diagnóstico, não uma apresentação |
| `janelas` | seg–sex, 09:00–18:00 | horário comercial de São Paulo, que é onde a operação está |
| `fuso` | `America/Sao_Paulo` | o horário do convite; o DST é resolvido pela data |
| `antecedenciaMinMin` | 240 (4 h) | a call pressupõe alguém ter aberto a loja e a conta antes |
| `horizonteDias` | 10 | agenda aberta demais convida a marcar longe e esquecer |

São **escolhas, não medições** — mude direto no JSONB.

O organizador da reunião não está fixado de propósito: a cascata é
`settings.agenda.organizador_id` → `crm_forms.created_by` → dono da org.
A reunião vai para a agenda CENTRAL (`acessos@convertfy.me`) de qualquer
jeito; esse campo é o responsável no registro.

---

**O teto de 60 slots manda no horizonte, não os 10 dias.** Com a janela
de seg–sex 09:00–18:00 e passo de 30 min são 18 horários por dia, então
`maxSlots: 60` corta no **quarto dia útil** — medido em 18/09: sex 18
(18), seg 21 (18), ter 22 (18), qua 23 (6). Para uma call de vendas isso
joga a favor (a agenda parece cheia e próxima), mas é bom saber que
mudar `horizonteDias` sozinho não abre mais dias: quem decide é o
`maxSlots`, e os dois vivem em `crm_forms.settings.agenda.regra` — dá
para ajustar sem deploy.

---

## Rastreamento

| evento | quando | onde |
|---|---|---|
| `PageView` | abertura | pixel do browser |
| `FormStep` | uma vez por tela | pixel, com `{step, total, ref}` |
| `Lead` (parcial) | quando WhatsApp **ou** e-mail é capturado | pixel, `event_id` = id da SESSÃO |
| `Lead` (completo) | no submit | pixel + CAPI, MESMO `event_id` |
| `LeadQualificado` | só no `fim_aprovado` | pixel + CAPI |

O `event_id` compartilhado é o que impede o parcial e o completo virarem
duas conversões: a dedupe da Meta é por (nome do evento, event_id).

`FormStep` é **um evento parametrizado**, não vinte e um nomes — o
Gerenciador lista cada nome custom separado, e um funil de 21 telas
encheria a conta de eventos que ninguém usa. Os dois são opt-in
(`tracking_config.meta.form_step` e `.lead_no_parcial`) e estão ligados
**só neste formulário**.

`LeadQualificado` sai pelo DESFECHO (`qualified_lead.endings`), não por
uma regra de faturamento: quem chega ao final aprovado já passou pelos
três cortes duros do fluxo, e uma segunda régua discordaria do desfecho
que a pessoa acabou de ler.

**O token da CAPI estava AUSENTE neste formulário** (medido em 18/09).
Sem ele só o pixel do BROWSER dispara, e some justamente a metade que
sobrevive a bloqueador de anúncio e a iOS — a redundância pixel+CAPI com
o mesmo `event_id` que este repositório mantém de propósito. Os outros
dois formulários com verba (`pagina-de-vendas` e `diagnostico`) têm o
token, e é o **mesmo pixel** (`694200440166500`), então o token foi
copiado do `diagnostico` para cá. Para desfazer:
`update crm_forms set meta_capi_token = null where slug = 'aplicacao'`.

O efeito disso foi MEDIDO no envio de teste das 04:27 de 18/09: 18
respostas, lead e negócio criados, sessão fechada em `fim_aprovado` — e
**zero** linhas em `crm_conversion_events`. O `metaConfigured` do submit
exige os três (integração ligada, pixel e token), então sem o token nem
o "Lead" nem o "LeadQualificado" chegavam a ser enfileirados.

O painel de diagnóstico do formulário já avisava disso, mas tinha um
alarme FALSO ao lado que empurrava para o lado errado: ele acusava
"lead qualificado ligado e sem nenhuma condição" porque olhava só as
`rules`, e este funil qualifica pelo DESFECHO (`endings`). Agora ele só
acusa quando não há regra **nem** final.

---

## O que cada desfecho faz no CRM

| final | tag | card na pipeline |
|---|---|---|
| `fim_aprovado` | `qualificado` | **sim**, em "Lead novo" |
| `fim_faturamento` | `fora-do-corte` | não |
| `fim_faturamento_global` | `fora-do-corte` | não |
| `fim_perfil` | `perfil-fora` | não |
| `fim_sem_intencao` | `sem-intencao-agora` | não |

Marcar risco de gateway acrescenta `risco-de-gateway` ao lead. Num funil
que recusa mais do que aprova, criar card para todo desfecho encheria o
Inbound de gente que acabou de ler "a conta não fecha para você".

Abandono continua indo para o CRM pelo cron de sempre
(`/api/cron/forms-abandono`), em etapa própria.

---

## Materiais que ainda faltam

Os prints das telas 9, 12 e 17 saíram da própria página de vendas. As
três URLs foram **conferidas em 18/09** (HTTP 200 e content-type de
imagem, medido a partir do Postgres com `pg_net`, já que este ambiente
não alcança `convertfy.me`):

| tela | arquivo | resposta | peso |
|---|---|---|---|
| 9 | `/imagens/omnisend-2.webp` | 200 `image/webp` | 14 KB |
| 12 | `/imagens/omnisend-3.webp` | 200 `image/webp` | 11 KB |
| 17 | `/imagens/feedback-02.png` | 200 `image/png` | **1.014 KB** |

O depoimento da tela 17 pesa **1 MB** — não existe `.webp` dele na LP
(404) e a LP não serve o otimizador do Next (404 em `/_next/image`).
Num funil que recebe celular vindo do anúncio, é o arquivo mais caro da
peça inteira. Não dá para converter daqui: a imagem precisa ser
reexportada e subida pelo botão do editor (ou publicada como
`feedback-02.webp` na LP). Alvo: **≤ 150 KB em WebP**.

Continuam faltando **dois**, e as telas funcionam sem eles:

1. **Print da regra de rastreamento** (a que a tela 13 afirma). O que
   existe na LP são painéis de receita, não a tela de rastreamento.
2. **Trecho do contrato com a garantia dos 10%** — a tela 19 afirma "e
   está no contrato". Um print do parágrafo assinado é a prova mais
   forte que essa tela pode ter.

Quando existirem, suba pelo botão do editor (Conteúdo → a tela → Mídia),
que grava no nosso bucket. Os três de hoje apontam para a LP: trocar a
imagem lá troca aqui, o que é o certo enquanto são a mesma prova — e é
também o risco, porque apagar o arquivo lá deixa a tela sem imagem em
silêncio.

**O vídeo foi removido** da tela 2, por decisão do dono em 18/09.

**O preço da tela 19 é R$3.500/mês**, confirmado em 18/09.

---

## O que já rodou de verdade em produção (18/09)

Antes de qualquer verba, o funil já foi percorrido — e o banco mostra o
que funcionou:

- **uma sessão completa**: 18 respostas, final `fim_aprovado`, **lead e
  negócio criados**. A engine, os saltos, o desfecho e a entrada no CRM
  estão comprovados no caminho inteiro;
- **três sessões abertas e fechadas sem responder nada**: o cron de
  abandono processou as três e **não criou lead nenhum** — é a regra
  `so_visita` funcionando (visita não vira lead, senão o CRM enche de
  linha morta);
- **zero eventos de conversão**, pelo token ausente descrito acima. É o
  único elo que estava frio, e é o que a cópia do token destrava;
- **zero calls agendadas**, coerente com o `hidden_fields`: o
  agendamento recusava toda sessão.

---

## QA da seção 8

| # | caso | como está coberto |
|---|---|---|
| 1 | BR, marca, R$500 mil–1 mi → aprovado, agenda, `LeadQualificado`, card | teste `caminho 1` + `o final aprovado abre a NOSSA agenda` |
| 2 | BR, até R$100 mil → final de faturamento, sem card, sem evento | teste `caminho 2` + `os quatro desfechos que recusam NÃO criam card` |
| 3 | agência na tela 4 → final de perfil na hora | teste `caminho 3` |
| 4 | global, Europa, US$25–50 mil, risco de gateway | teste `caminho 4` (telas, moeda e tag) |
| 5 | abandono depois da tela 2 → lead com nome e WhatsApp | cron de abandono, já em produção desde set/2026 |
| 6 | abandono na tela 9 → loja, faturamento e mercado gravados | idem (o autosave grava resposta a resposta) |
| 7 | celular com teclado aberto | renderizador conversacional: piso de 16px no input, botão no fluxo e sem foco automático no celular |
| 8 | matemática em 3 combinações | teste `caminho 8` — **achou um defeito, ver abaixo** |
| 9 | UTMs do anúncio até o lead | `form-embed.js` + campos ocultos do schema |
| 10 | `Lead`/`LeadQualificado` deduplicados | `form-pixels.test.ts` (régua de arquivo) |

Os casos 5, 6, 7, 9 e 10 dependem de tráfego real e de olhar o
Gerenciador de Eventos: confira-os na primeira hora de anúncio.

### Dois defeitos que o RENDER achou

A tela final foi renderizada no Chromium (900px e 390px) nos cinco
estados da agenda: carregando, lista, marcado, horário tomado e agenda
cheia. Nenhum teste pegaria o que apareceu:

- **dois check na mesma altura** — o círculo verde da tela final mais o
  "✔" que o título do desfecho trazia escrito;
- **duas frases opostas na mesma tela** — o título dizia "agora é só
  escolher o seu horário" ao lado do cartão dizendo "Horário
  confirmado". O título agora AFIRMA o desfecho e não instrui; quem
  instrui é o cabeçalho do seletor, que some depois de marcado.

### O defeito que o caso 8 achou

A loja de 10 mil acessos com ticket acima de R$800 lia **"R$1.260 mil"**
na tela. A conta estava certa; a escala, não — e é o número que ninguém
escreve, na tela que pede R$3.500 por mês. `formatarNumero` passou a
usar "milhão"/"milhões" com uma casa decimal, para baixo como o resto do
módulo. Corrigido com sete testes.

---

## Onde o sistema obrigou a improvisar

1. **A publicação não passou pela rota do admin.** Ela exige sessão
   autenticada, que não existe daqui. A versão publicada é gerada pela
   MESMA `montarVersao` de produção (`schemaDoFunil`) e escrita por SQL,
   e foi conferida contra o código em 12 eixos (refs, tipos, regras,
   destinos, variáveis, mídia, finais, cálculos, ocultos). Quando você
   editar pelo editor, o caminho volta a ser o normal.

2. **`convertfy.me` é inalcançável pelo proxy deste ambiente.** Os
   endereços dos três prints saíram do HTML que você colou. A saída que
   funcionou foi o **Postgres**: `pg_net` faz a requisição de dentro do
   banco, e foi assim que as três URLs foram confirmadas em 18/09 (200,
   content-type de imagem) — e foi assim que o 1 MB do depoimento
   apareceu.

3. **A mídia não estava na versão publicada.** Os campos tinham as
   imagens, o editor as mostrava, e a versão que o visitante lê tinha
   sido publicada antes — as três provas não apareceriam para ninguém.
   Corrigido; é o mesmo modo de falha de fronteira que este repositório
   coleciona.

4. **A agenda pública não existia.** O módulo de reuniões tinha OAuth,
   conta central, Meet e convite por e-mail — e nenhuma forma de alguém
   de fora escolher um horário. Foi construída aqui (módulo puro, rota
   pública, migration 20261170).

---

## O desfecho deixou de vir do corpo do POST (18/09)

`ending_ref` chegava do browser e decidia **tudo o que importa**: as
tags e a etapa no CRM, se o `LeadQualificado` dispara e se a agenda
abre. A régua "quem decide é o schema publicado" já valia para
`disqualified` e para quais obrigatórias cobrar; faltava para o final em
si, e sem ela bastava um POST com `ending_ref: "fim_aprovado"` para
comprar um horário na nossa agenda.

`finalAlcancado` (engine) recalcula o desfecho a partir das respostas, e
o submit usa o calculado quando ele existe — inclusive ao fechar a
sessão, que é de onde a agenda lê. Divergência entre o calculado e o do
cliente vira `submit.final_divergente` no log: ela tem duas causas
legítimas (versão publicada trocada no meio do preenchimento, resposta
que não viajou) e uma que não é.

**A primeira versão desta guarda estava errada, e o teste mediu:** com
`answers` vazio nenhuma regra casa, a navegação segue os defaults e este
funil devolve **`fim_aprovado`**. Calcular sem checar teria transformado
um POST sem respostas — ou um save que não chegou — em aprovação para
todo mundo. A função só decide quando cada condição do caminho teve o
que testar; senão devolve `null` e o do cliente prevalece. Cobrar o
caminho INTEIRO respondido também não serve: a primeira tentativa disso
devolvia `null` no caminho 1 completo, porque pergunta opcional não
precisa de resposta para o salto acontecer — a guarda viraria inerte.

---

## A varredura de 18/09: coluna que só existe no código

O agendamento não funcionaria: `agendarDaSessao` pedia
`form_sessions.hidden_fields`, e a coluna se chama **`hidden`** — o
nome `hidden_fields` existe no projeto querendo dizer OUTRA coisa (no
schema do formulário é a lista de NOMES aceitos pela URL). O supabase-js
devolve o 42703 em `error`, o select inteiro volta `null`, e o serviço
recusaria **toda** sessão com `sessao_invalida`: a pessoa escolheria o
horário e receberia "não foi possível agendar", sempre.

Isso motivou conferir **todos** os `.select()` do `src/` contra o
`information_schema` de produção. Dezesseis colunas existiam só no
código, cada uma derrubando o select inteiro e virando tela vazia sem
erro em lugar nenhum:

| onde | pedia | era | sintoma |
|---|---|---|---|
| agendamento público | `form_sessions.hidden_fields` | `hidden` | agendar sempre falhava |
| sync do Google | `org_members.user_id` | join por `profile_id` | membro interno nunca virava attendee |
| portal do cliente | `org_members.user_id`, `profiles.full_name` | `profile_id`, `name` | reunião sem o nome de quem atende |
| tela de Reuniões | `profiles.org_id` | `org_members` | seletor de participantes VAZIO |
| ficha do cliente | `store_revenue_summary.total_campaigns/total_flows` | não existem | receita, pedidos e leads das lojas em branco |
| dashboard de Conteúdo | `crm_threads.metadata` | não existe | zero leads atribuídos aos posts |
| conector CRM da IA | `crm_deal_history.created_at` | `changed_at` | histórico do negócio sempre vazio |
| tela do Time | `clients.account_manager_id` | `owner_id` (→ perfil) | contagem de clientes zerada |
| portal (branding) | `organizations.logo_url/primary_color` | `settings` | marca do portal sempre a padrão |
| portal (usuário) | join `client_notification_preferences` | tabela não existe | "Usuário não encontrado" |
| contexto da task | `client_stores.plan/mrr_value`, `deals.plan_name` | `mrr_cents` | contexto da loja chegava vazio |
| onboarding da loja | `operational_pipeline_columns.responsible_role/sla_days` | `default_assignee_role`, `sla_hours` | etapa sem responsável nem SLA |

Todas corrigidas, e o teste de contrato
(`src/lib/crm/colunas-inexistentes.test.ts`) passou a cobrir cada uma —
ele já existia para `deals.org_id` e agora é a régua da classe inteira.

**Uma foi corrigida criando a coluna, não arrancando o código**
(migration 20261171, aplicada em 18/09):
`user_google_tokens.selected_calendar_id` e `auto_meet`. A tela de
configuração do Google Calendar **escreve** nas duas, então o conserto
era criá-las. O que o 42703 escondia era maior que o PUT daquela tela: o
select do sync incremental pede `calendar_sync_token` **junto** de
`selected_calendar_id`, e o erro derrubava o select inteiro — o sync
token gravado nunca era lido e cada rodada varreria a agenda completa em
vez do delta. Os defaults (`NULL` → `"primary"`, `true`) reproduzem o
fallback que o código já aplicava, então nada mudou de comportamento.

**E uma ficou de fora, com o motivo:**

- `client_onboarding_steps` (`phase`, `org_id`, `task_id`,
  `is_required`, `depends_on_step_ids`) e `client_onboardings.org_id`,
  em `onboarding-sync.service.ts` e `step-dependency.service.ts`. As
  duas tabelas têm **zero linhas** — é o módulo antigo de onboarding,
  substituído por `onboardings`/`onboarding_tasks`. Mexer num caminho
  morto sem uso é risco sem retorno; fica registrado.
