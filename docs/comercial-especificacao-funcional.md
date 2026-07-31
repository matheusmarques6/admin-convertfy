# Área Comercial — Especificação Funcional

Documento de referência para redesign da área Comercial do admin Convertfy.
Descreve **o que existe e o que cada coisa faz** — não prescreve como deve
parecer. Todas as telas, campos, ações e estados listados aqui já estão
implementados e em uso.

**Contexto do produto:** o admin é a ferramenta interna de uma agência de
marketing/e-commerce. A área Comercial cobre a **aquisição de clientes**:
da entrada do lead (anúncio, formulário, indicação, prospecção ativa) até
o fechamento do contrato. O pós-venda vive em outra área (Operacional) e
está fora deste documento.

**Idioma da interface:** português do Brasil. **Moeda:** BRL.

---

## 1. Estrutura de navegação

O admin é dividido em três *workspaces* que o usuário alterna por um
seletor no topo da barra lateral: **Comercial**, **Operacional** e
**Geral**. Cada workspace troca o conteúdo inteiro do menu lateral.

O menu do workspace Comercial tem 4 grupos, nesta ordem:

| Grupo | Itens |
|---|---|
| *(sem rótulo)* | Dashboard |
| Vendas | Pipelines · Leads · Formulários |
| Atendimento | Inbox · Canais · Automações · Reuniões |
| Análise | Funil · Reports |

Elementos globais presentes em todas as telas:

- **Busca global** (atalho `Cmd/Ctrl + K`): paleta de comandos que
  encontra páginas e navega até elas.
- **Atalhos de teclado** em sequência `g + letra`: `g+d` Dashboard,
  `g+p` Pipelines, `g+l` Leads, `g+f` Funil, `g+r` Reports, `g+i` Inbox,
  `g+a` Automações. Ficam inativos enquanto o foco está num campo de texto.
- **Menu da conta** no rodapé da barra lateral: dados do usuário,
  alternância de tema claro/escuro, configurações, sair.
- **Notificações** e **assistente de IA** (chat flutuante).

### Controle de acesso

Existem 6 funções: `admin`, `dev`, `coo`, `suporte`, `designer`,
`implementacao`. Cada item de menu é liberado por função — `admin` e `dev`
veem tudo. Hoje, no Comercial: `suporte` vê todos os itens; `coo` vê apenas
Inbox, Canais e Automações; `designer` e `implementacao` não veem nada do
Comercial. Um usuário pode acumular funções, e o acesso é a união delas.

---

## 2. Conceitos e entidades

Entender estas 5 entidades é suficiente para entender a área inteira.

### Lead
Pessoa/empresa que demonstrou interesse, **antes** de virar uma
negociação. Campos: nome, email, telefone, empresa, cargo, origem
(`source`), UTMs, endereço, tags, responsável, notas, campos
personalizados, data de criação e do último contato. Tem uma **nota de
qualificação por IA** (0–100) com justificativa em texto.

Status possíveis: **Novo**, **Qualificado**, **Desqualificado**,
**Convertido**, **Perdido**.

Um lead **converte** em negociação (opcionalmente criando também um
cliente). Depois de convertido, guarda o vínculo com a negociação gerada.

### Pipeline (funil de vendas)
Um quadro com etapas ordenadas. A agência opera vários em paralelo — hoje
existem, por exemplo, "Funil Inbound" (anúncios e formulário do site),
"Funil Outbound" (prospecção ativa) e "Indicações & Parceiros", cada um
com etapas próprias. Cada pipeline tem nome, descrição, cor, categoria
(agrupa no menu), favorito, responsável padrão e um formato de exibição:
**kanban** (colunas) ou **estado** (lista agrupada).

### Etapa (coluna do pipeline)
Nome, cor, ordem e um **tipo**: Aberto, Ganho, Perdido ou Arquivado.
Pode ter **SLA em horas** (tempo máximo que um deal deveria ficar ali),
descrição e **critério de saída** (o que precisa acontecer para avançar).
Etapas também podem ser marcadas com uma **etapa canônica do funil**
(MQL, Agendamento, Reunião ou Venda) — é o que alimenta o dashboard de
Funil (seção 3.8).

### Negociação (deal)
Oportunidade dentro de um pipeline. Campos: título, valor, moeda,
probabilidade (0–100), data prevista de fechamento, etapa atual,
responsável, origem, UTMs, tags, notas, campos personalizados, vínculos
com lead/cliente/loja, parceiro que indicou, valor recebido
(*cash collect*), motivo de ganho e motivo de perda.

Status: **Aberto**, **Ganho**, **Perdido**, **Arquivado**. Ao ganhar ou
perder, a data é registrada automaticamente. Todo movimento entre etapas
fica gravado num **histórico** e gera item na linha do tempo.

### Conversa (thread)
Fio de mensagens com um contato num canal (WhatsApp/Instagram). Pode ser
vinculada a um lead ou negociação. Tem status (**Aberta**, **Pendente**,
**Resolvida**), responsável, tags e contador de não lidas.

---

## 3. Telas

### 3.1 Dashboard comercial

Visão de resultado do time. Um seletor de janela (7, 30, 90, 180, 365
dias) controla a tela inteira.

**4 indicadores:**
- **Pipeline value** — soma do valor das negociações abertas + quantidade
- **Ganhos** — valor fechado na janela + quantidade
- **Win rate** — % de ganhos sobre negociações fechadas, com placar de
  ganhas × perdidas
- **Ciclo médio** — dias entre criação e fechamento das ganhas

**Três blocos abaixo:**
- **Por pipeline** — valor aberto, quantidade e ganhos de cada pipeline
- **Por origem** — mesmo recorte, agrupado pela origem do lead
- **Últimos ganhos** — as 5 negociações mais recentes fechadas

**Estado vazio:** quando não há nenhuma negociação na janela, a tela
convida a aumentar o intervalo ou ir para os pipelines.

### 3.2 Pipelines

Tela de duas partes: uma **lista lateral de pipelines** (agrupados por
categoria, com favoritos no topo e contagem de negociações) e o **quadro**
do pipeline selecionado. Ao entrar sem escolher um, abre o primeiro.

**Quadro kanban:** uma coluna por etapa, cada uma com título, cor,
quantidade e soma de valores. Os cards são arrastáveis entre colunas.

**Card de negociação** mostra: título, valor, empresa/cliente, avatar do
responsável, tags, indicador de SLA estourado, tempo parado na etapa e
atalhos rápidos para abrir WhatsApp e enviar email.

**Ações no quadro:**
- Criar negociação (escolhendo pipeline, etapa, valor, responsável, tags,
  vínculo com lead ou cliente)
- Arrastar entre etapas; mover para **outro pipeline**
- Ao arrastar para uma etapa do tipo *Perdido*, o sistema **exige um
  motivo de perda** (opções comuns: sem fit, preço, timing, concorrente,
  no-show, sem resposta, outro)
- Abrir o painel lateral da negociação (ver 3.3)
- Configurar o pipeline (ver 3.9)

**Filtros** (painel lateral, com chips do que está ativo e remoção
individual): responsável, origem, tags, status e faixa de valor. Há também
busca por texto.

**Formato "estado"**: alternativa ao kanban para pipelines que funcionam
como lista de situações em vez de fluxo — mesma informação, agrupada
verticalmente.

### 3.3 Negociação — painel lateral e página completa

A negociação abre em **painel lateral** (a partir do quadro) ou em
**página inteira** (mais espaço, mesma informação).

**Cabeçalho:** título editável no lugar, valor, etapa atual, responsável,
status, e trilha visual das etapas mostrando onde está e o que já passou.

**Registrar atividade** — 4 abas de composição:
- **Nota** — texto livre
- **Tarefa** — texto + prazo
- **Ligação** — registro de chamada
- **Email** — registro de email enviado

**Linha do tempo:** tudo que aconteceu, em ordem, com filtro por tipo
(tudo, mensagens, notas, tarefas, ligações). Mudanças de etapa entram
automaticamente.

**Abas da página completa:** Histórico · Atividades · Negócios · Arquivos
· Atendimentos (cada uma com contador).

**Painel de contato:** nome, email, telefone, empresa, endereço — todos
editáveis no lugar. Funciona mesmo quando a negociação não tem cliente nem
lead vinculado.

**Bloco de origem (UTMs):** fonte, mídia, campanha, termo, conteúdo,
identificadores de clique do Google e da Meta, e site de origem.

**Outras ações:** mudar etapa, marcar ganho/perdido com motivo, trocar
responsável, editar tags, anexar arquivos, abrir conversa de WhatsApp num
popup sem sair da tela, mover de pipeline, arquivar.

### 3.4 Leads

**Lista** com busca (nome, email, empresa, telefone) e filtro por status.
Colunas: nome, empresa, email, origem, status, nota de IA e responsável.
Em telas pequenas vira lista de cards. Clicar abre o painel lateral.

**Painel/página do lead** — 3 abas:
- **Visão geral** — dados de contato editáveis, origem, UTMs, tags,
  responsável, nota de qualificação da IA com justificativa
- **Atividades** — linha do tempo
- **Notas**

**Ações:** criar lead, editar, atribuir responsável, adicionar
tags/notas, **converter em negociação** (escolhendo pipeline e etapa, e
opcionalmente criando um cliente junto), descartar.

**Importação em massa (assistente por etapas):** envio de CSV →
mapeamento de colunas para campos (com sugestão automática por nome de
coluna) → pré-visualização → importação. Pode criar negociações junto com
os leads.

### 3.5 Formulários

Construtor de formulários públicos de captação. A lista mostra cada
formulário com status, visualizações e número de envios.

**Editor com 6 abas:**
1. **Conteúdo** — título, descrição, textos dos botões
2. **Estilo** — temas prontos e ajustes visuais do formulário publicado
3. **Campos** — construtor: texto curto, texto longo, email, telefone,
   número, seleção, múltipla escolha, checkbox, data, URL, CPF, CNPJ,
   CEP. Cada campo tem rótulo, obrigatoriedade, ajuda e **mapeamento para
   um campo do lead** (nome, email, telefone, empresa, origem)
4. **Após envio** — mensagem de agradecimento ou redirecionamento
5. **Rastreamento** — pixel da Meta, ID do Google Ads, Google Analytics,
   token de conversões da Meta (envio server-side) e rótulo de conversão
6. **Instalar** — link público e código para incorporar no site

**Destino do envio:** cada formulário aponta para um pipeline e etapa —
quem preenche vira lead e, se configurado, negociação. O envio captura
UTMs, identificadores de clique (Google/Meta), site de origem, IP e
navegador. Leads repetidos são identificados pelo email.

### 3.6 Inbox

Central de conversas dos canais conectados, em três colunas:

- **Lista de conversas** — busca, filtros por status e por responsável,
  contador de não lidas, atualização em tempo real
- **Conversa** — histórico de mensagens (texto, imagem, áudio, documento),
  identificação de quem enviou, horário e status de entrega
- **Painel de contexto** — dados do contato e vínculo com lead/negociação

**Ações:** responder; gravar e enviar áudio; anexar mídia; usar
**respostas rápidas** salvas; enviar **template aprovado da Meta**;
atribuir responsável; mudar status; aplicar tags; marcar como lida;
vincular a um lead ou negociação.

**Janela de atendimento:** o WhatsApp só permite mensagem livre por 24h
após o último contato do cliente. Uma barra mostra o tempo restante e,
quando a janela fecha, indica que só é possível enviar template aprovado.

### 3.7 Canais

Cadastro dos canais de mensagem. Três tipos: **WhatsApp oficial (Cloud
API)**, **WhatsApp via QR Code** e **Instagram**.

Cada canal mostra nome, número/conta, status de conexão e data de
conexão. Ações: conectar (leitura de QR Code para o tipo QR), verificar
estado real da conexão, reiniciar a sessão, desconectar o número, remover
o canal e **migrar conversas** de um canal desativado para o ativo (para
não perder histórico ao trocar de número/instância).

### 3.8 Funil

Painel de funil de aquisição cruzando CRM com investimento em anúncios.

**Cinco etapas:** Leads → MQLs → Agendamentos → Reuniões → Vendas, com a
taxa de conversão entre cada par. "Leads" conta os leads criados no
período; as demais contam negociações que **entraram** na etapa
correspondente dentro do período.

**Seis indicadores de um lado:** investimento, faturamento total, ROAS,
taxa de conversão, ticket médio, cash collect.
**Seis do outro:** custo por lead, custo por MQL, custo por agendamento,
custo por reunião, CPA e taxa de cash collect.

**Controles:** pipeline, período (7/15/30/90 dias ou intervalo
personalizado), filtros de UTM (fonte, mídia, campanha) e atualização.

**Três configurações (em diálogos):**
- **Meta Ads** — conectar a conta de anúncios, sincronizar, desconectar,
  e consultar o padrão de UTM usado nos anúncios
- **Investimento** — lançar manualmente valor investido por dia,
  plataforma e conta
- **Etapas** — dizer qual etapa do funil cada coluna de cada pipeline
  representa (MQL, Agendamento, Reunião, Venda ou fora do funil)

**Três painéis recolhíveis:**
- **Criativos que mais performaram** — por anúncio: gasto, leads, CPL,
  vendas, CPA, receita e ROAS
- **Investimento por conta** — quanto veio de cada conta de anúncio
- **Vendas do período** — lista das vendas com campo editável de valor
  recebido (cash collect)

**Aviso ativo:** se nenhuma etapa estiver mapeada como MQL, Agendamento,
Reunião ou Venda, a tela avisa que o funil está incompleto e oferece o
atalho para mapear.

### 3.9 Configuração de pipelines

Diálogo de configuração acessível pelo quadro:

- **Geral** — nome, cor, descrição, categoria, formato (kanban/estado),
  responsável padrão, favorito
- **Etapas** — criar, renomear, recolorir, reordenar (arrastando), definir
  tipo (Aberto/Ganho/Perdido/Arquivado), SLA em horas, descrição e
  critério de saída. Ao excluir uma etapa que ainda tem negociações, o
  sistema **exige escolher para qual etapa migrá-las**; e nunca permite
  deixar o pipeline sem etapas
- **Campos personalizados** — criar campos extras para leads e negociações
- **Arquivar** o pipeline

### 3.10 Automações

Lista de automações com status (ativa/inativa) e execuções recentes.

**Construtor visual** em forma de fluxograma, com blocos conectáveis:

- **Gatilho** — negociação mudou de etapa, negociação criada, lead criado,
  mensagem recebida, manual ou agendado
- **Condição** — ramifica o fluxo conforme dados da negociação/lead
- **Esperar** — pausa por um tempo
- **Enviar WhatsApp**
- **Criar atividade**
- **Atribuir responsável**
- **Mover de etapa**
- **Atualizar negociação**
- **Ação de IA** — executa um prompt e aplica o resultado na entidade

Cada bloco tem um painel de configuração próprio. A automação pode ser
executada manualmente para teste, e mantém histórico de execuções.

### 3.11 Reuniões

Agenda de reuniões, integrada ao Google Calendar. Mostra as próximas e as
realizadas, com título, horário, duração, participantes, link da reunião e
status: **Agendada**, **Realizada**, **Cancelada**, **Não compareceu**.
Ações: criar reunião, marcar como realizada com anotações, cancelar.

### 3.12 Reports

Séries temporais do comercial, com janela selecionável (7/30/90/180/365
dias) e exportação em CSV:

- Pipeline value × ganhos
- Win rate e ciclo médio
- Funil de leads por status ao longo do tempo
- Indicadores da carteira (saúde, NPS, receita recorrente, lojas ativas,
  conversas abertas)

---

## 4. Fluxos principais

**Entrada de lead → venda:**
Anúncio ou site → formulário público → lead criado (com UTMs) →
negociação no pipeline configurado → contato pelo Inbox → reunião →
proposta → ganho/perda com motivo registrado.

**Prospecção ativa:** importação de CSV ou cadastro manual → sequência de
contatos registrada na linha do tempo → conversão em negociação.

**Indicação:** lead com parceiro indicador vinculado → mesmo fluxo, com
atribuição do crédito ao parceiro.

**Ciclo de análise:** o Funil mostra onde há gargalo entre etapas; os
Reports mostram a evolução no tempo; o Dashboard mostra o resultado da
janela atual.

---

## 5. Estados que a interface precisa cobrir

Para cada listagem e painel:

- **Carregando** — a maioria das telas busca dados após abrir
- **Vazio inicial** — nunca houve registro (convida a criar o primeiro)
- **Vazio por filtro** — há registros, mas nenhum corresponde à busca
  (convida a ajustar os filtros) — é um caso diferente do anterior
- **Erro de carregamento**
- **Salvando** — edição no lugar e arrastar-e-soltar dão retorno imediato
- **Conflito/bloqueio** — ações que exigem decisão antes de concluir:
  motivo de perda obrigatório, migração de negociações ao excluir etapa,
  janela de 24h fechada no WhatsApp, funil sem etapas mapeadas

Volumes reais para dimensionar as telas: um pipeline pode ter dezenas de
negociações por coluna; a lista de leads carrega 100 por vez; a lista de
criativos do funil mostra até 50 linhas; a linha do tempo de uma
negociação, até 100 itens.

---

## 6. Restrições técnicas

- **Aplicação web responsiva** (Next.js + React + Tailwind CSS). Precisa
  funcionar em desktop e em telas pequenas — hoje algumas tabelas viram
  listas de cards no mobile.
- **Tema claro e escuro** — o admin tem alternância; o menu lateral é
  sempre escuro e a tela de Funil também.
- **Densidade de informação alta**: é ferramenta de uso diário e
  intensivo, não site institucional. Telas de trabalho (kanban, listas,
  inbox) priorizam ver muita coisa de uma vez.
- **Acessibilidade**: navegação por teclado e foco visível são
  requisitos — há atalhos globais e o kanban é operável sem mouse.
- **Ícones**: biblioteca Lucide.

---

## 7. Glossário

| Termo | Significado |
|---|---|
| **Lead** | Contato interessado, ainda não virou negociação |
| **MQL** | Lead qualificado por marketing — passou no filtro inicial |
| **Deal / Negociação** | Oportunidade de venda dentro de um pipeline |
| **Pipeline / Funil** | Quadro com as etapas da venda |
| **Etapa / Stage** | Coluna do pipeline |
| **Win rate** | % de negociações ganhas sobre as fechadas |
| **Pipeline value** | Soma do valor das negociações abertas |
| **Ciclo médio** | Tempo médio entre criar e ganhar |
| **UTM** | Parâmetros na URL que identificam a origem do tráfego |
| **ROAS** | Retorno sobre o investimento em anúncios |
| **CPL / CPA** | Custo por lead / custo por aquisição (venda) |
| **Ticket médio** | Faturamento dividido pelo número de vendas |
| **Cash collect** | Valor efetivamente recebido (≠ valor contratado) |
| **SLA** | Prazo máximo aceitável numa etapa |
| **Thread** | Conversa com um contato num canal de mensagem |
| **Janela de 24h** | Prazo do WhatsApp para responder com mensagem livre |
