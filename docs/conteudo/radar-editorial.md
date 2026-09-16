# Radar editorial — o painel "Em alta" passa a acontecer

## O defeito: uma tela pronta que nunca rodou

Medido em produção antes de escrever código: **`conteudo_trends` com ZERO
linhas**. Não era bug de escrita — era falta de gatilho. O painel "Em alta" do
pipeline de Reels, o serviço `gerarTrends`, a busca na internet com fonte
conferida, a rota `POST /api/conteudo/trends`: tudo pronto desde set/2026, com
**um botão** como única entrada. Ninguém clicou.

É a pior forma de defeito desta parte do sistema: nada falha. A rota responde
200 quando chamada, e não é chamada. Na tela o sintoma aparece como "não há
assunto em alta", indistinguível de "o radar rodou e não achou nada".

## O que mudou

### 1. Cron diário (`/api/cron/conteudo-radar`, 06:40 BRT)

Uma rodada por org **que tem canal de Instagram ativo** — rodar para toda org
gastaria uma busca e uma chamada de modelo por dia para quem nunca abre o
painel. `varrerRadar` é fail-open por org: uma que falhe não leva as outras
junto.

**Zero não é sucesso.** Havendo org para rodar e nenhuma tendo rodado, a rota
responde 500. Cron mudo reportado como verde é como `crm-snapshot` passou
meses sem gravar uma linha. Org pulada por "rodou há pouco" não conta como
falha: é rodada bem-sucedida de ontem.

### 2. Validade (`lib/conteudo/trends/validade.ts`, puro, 9 testes)

O cron resolve o vazio e **cria o problema oposto**: rodada que só acrescenta
transforma o painel num arquivo, e um assunto de três semanas atrás passa a
disputar espaço com o de hoje sob o rótulo "em alta". Três regras:

1. **"Em alta" é a RODADA MAIS RECENTE, não uma janela de horas.** Todas as
   linhas de uma rodada compartilham o mesmo `gerado_em`, então o grupo é
   exato. Um número de horas seria chute; isto é medição. Consequência direta
   na ordem: **o 92 de três dias atrás não fica acima do 88 de hoje** — um
   decaimento por idade resolveria também, mas a curva seria inventada.
2. **Assunto expira em 14 dias, e expirar é ARQUIVAR, não apagar.** Quem virou
   ideia mantém o vínculo (`conteudo_ideias.trend_id`) e o histórico responde
   "o que o radar já propôs". Os 14 dias são DECISÃO, não medição: duas voltas
   do ciclo semanal do pipeline de Reels. Passadas duas semanas sem ninguém
   pegar o assunto, mantê-lo é mostrar ao time o que ele já declinou.
3. **Painel vazio depois de uma rodada NÃO é "nunca gerado".** São estados
   diferentes e pedem ações opostas ("ligue o radar" × "a última rodada foi há
   20 dias e tudo já venceu"). Por isso a idade da última rodada é lida
   INCLUSIVE das linhas arquivadas (`ultimaRodada`), e não derivada da lista
   ativa.

Duas guardas menores no mesmo módulo: data ilegível **não expira** (apagar o
que não se conseguiu medir é a mesma família de erro que contar não medido
como zero) e o desempate final é por `id`, para a ordem ser estável entre
renders.

### 3. Procedência por LINHA (migration 20261160)

O rodapé dizia se a busca na internet está configurada lendo o ambiente
**agora**. Com o painel alimentado por um botão isso bastava — a linha e a
leitura aconteciam no mesmo minuto. Com um cron diário deixa de bastar: uma
rodada de três dias atrás pode ter acontecido sem provedor de busca, e o
rodapé de hoje diria que ela teve fato externo.

`fonte = 'interno'` é esse caso. Na tela, os dois caminhos que chegam sem link
passam a ser distinguidos:

| situação | badge | o que significa |
|---|---|---|
| link conferido | `fonte` (link) | estava entre os resultados da busca |
| `fonte = 'web'`, sem url | **fonte não conferida** | a busca rodou e o link citado foi REMOVIDO por não estar entre os resultados servidos |
| `fonte = 'interno'` | **sem fato externo** | a rodada aconteceu sem busca; o assunto saiu do contexto da casa |

A referência marca "TEMA SENSÍVEL · CONFIRA AS FONTES" em bloco; aqui dá para
ser mais preciso, porque a linha guarda a procedência.

### 4. Limites que o cron tornou necessários

- **`jaTem` tem teto (24 títulos).** Sem ele, duas semanas de rodadas diárias
  mandariam ~80 títulos ao modelo com a instrução de evitá-los, e ele
  começaria a raspar o fundo do barril. "Não repita" quer dizer "não repita o
  que está fresco no painel".
- **`listarTrends` ordena por `gerado_em`, não por score.** É essa ordem que
  decide quem sobrevive ao `limit 40`: um top-40 por score cortaria justamente
  a rodada de hoje se ela viesse com notas baixas. A ordem da TELA é a do
  módulo puro.
- **`precisaRodar` recusa a segunda rodada do dia.** Retry da plataforma ou
  disparo manual não podem custar duas chamadas de modelo. `?forcar=1` fura a
  guarda quando alguém quer a rodada agora.

### 5. O teste que fecha a classe inteira do defeito

`src/lib/crons-agendados.test.ts`: **toda rota em `src/app/api/cron/*` tem de
ter horário em `vercel.json`**, e todo horário sob `/api/cron/` tem de apontar
para uma rota que existe. Cron que nunca dispara não falha — ele simplesmente
não acontece. Hoje as 42 rotas estão agendadas; o teste protege a próxima.

## O que ainda depende de rodar

O ambiente de desenvolvimento não tem `OPENROUTER_API_KEY` nem chave de busca,
então **a rodada ponta a ponta não foi executada daqui**. O que foi verificado:
o CHECK novo aplicado em produção, o typecheck, a suíte inteira, o build, e o
painel renderizado nos três estados (rodada fresca com card antigo ao lado,
"tudo venceu", "nunca rodou"). A primeira rodada real acontece no cron, ou no
botão "Buscar assuntos" do painel.
