# Módulo Transcrições

Biblioteca de vídeo e áudio virada texto pesquisável, com timestamp,
locutores separados e ponte para a base da ConvertIA.

## Como funciona

```
link ou arquivo → fila → worker (baixar · áudio · transcrever · indexar) → biblioteca
                                                                      ↘ ConvertIA
```

O admin (Vercel) NUNCA processa mídia: ele enfileira, lê o banco e mostra.
O worker (container) faz o trabalho pesado. Fechar a aba não interrompe
nada — o estado vive na linha, não na sessão.

## Componentes

| Peça | Onde | Papel |
|---|---|---|
| Biblioteca e detalhe | `src/app/admin/transcricoes/` | Server Components + `loading.tsx` |
| Rotas | `src/app/api/transcricoes/` | Enfileirar, prévia, upload, edição, exportação |
| Leitura | `src/lib/services/transcricoes*.ts` | Árvore, biblioteca paginada, detalhe, busca híbrida |
| Módulos puros | `src/lib/transcricoes/` | URL, pipeline, chunking, exportação, sugestão (61 testes) |
| Worker | `worker/transcricoes/` | yt-dlp, ffmpeg, transcrição, indexação |
| Conector da IA | `src/lib/ai/connectors/transcricoes.ts` | `transcricoes_buscar/listar/ler` |
| Cron | `/api/cron/transcricoes-indexar` | Reindexa fala editada e faísca recém-ligada |

## Variáveis

**Admin (Vercel)**

```
OPENROUTER_API_KEY       transcrição, tópicos, embeddings
WORKER_URL                    opcional — prévia de link com duração
WORKER_SHARED_SECRET          obrigatório com WORKER_URL
TRANSCRICOES_UPLOAD_MAX_MB    teto do upload (default 50)
TRANSCRICOES_AUDIO_RETENCAO_DIAS  janela de retomada do áudio (default 3)
```

**O teto do upload é do PROJETO, não do bucket.** O bucket declara 4 GB, mas
o Supabase capa todo envio pelo limite global (Storage → Settings → Upload
file size limit), que nasce em **50 MB**. Passando disso, o endpoint
resumível responde `413 Maximum size exceeded` no meio do envio — sem dizer
onde mexer. Por isso a rota recusa antes de criar a linha, com a instrução na
mensagem. Ao aumentar o limite no painel, suba `TRANSCRICOES_UPLOAD_MAX_MB`
junto: prometer o que a plataforma recusa é pior que um teto baixo e honesto.

Sem `WORKER_URL`, a prévia cai no oEmbed da plataforma: título, canal e
capa reais, sem duração. A tela diz isso; nenhum campo é inventado.

**Worker (container)**

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
WORKER_SHARED_SECRET     habilita o HTTP da prévia
HTTP_PROXY               opcional — usado pelo yt-dlp
PORT                     default 8080
```

## Deploy do worker

```bash
docker build -f worker/transcricoes/Dockerfile -t convertfy-transcricoes .
docker run --env-file .env -p 8080:8080 convertfy-transcricoes
```

O build roda a partir da raiz do repositório porque o worker importa os
módulos puros de `src/lib/transcricoes`. Duplicar essa lógica é como as
duas metades passam a discordar em silêncio.

## Decisões que não podem ser afrouxadas

**Sem indicador de confiança.** O endpoint de transcrição não devolve
confiança por bloco. O que existe em `verbose_json` é `avg_logprob`,
log-probabilidade de token — não é porcentagem de acerto. Derivar "96% de
confiança" dali seria métrica inventada, e o dano é que alguém decide com
base nela.

**A etapa de transcrição não tem porcentagem.** Baixar reporta bytes,
extrair áudio reporta tempo processado; transcrever é uma chamada síncrona
ao provedor. O segmento fica em andamento sem número. Um teste em
`pipeline.test.ts` trava isso.

**Bloqueio de IP é rotina, não exceção.** YouTube, Instagram e TikTok
recusam IP de datacenter. `classificarErro` reconhece as frases reais do
yt-dlp, a mensagem é legível, o retry tem backoff com jitter e o
`HTTP_PROXY` é o slot previsto. Nunca vira "falha genérica".

**A URL normalizada é a chave de dedupe.** Variar com rastreador duplica o
vídeo na biblioteca; colapsar vídeos diferentes recusa o segundo e ele
nunca é transcrito. Os dois erros são silenciosos — daí os testes de
`url.ts`.

**O offset dos pedaços.** Áudio acima de 24 MB é dividido em blocos de 10
min e cada resultado leva `i * 600`. Errar isso invalida todos os
timestamps a partir do segundo pedaço, e o sintoma só aparece em vídeo
longo.

**Editar uma fala marca os chunks que a cobrem.** Sem isso a base de
conhecimento diverge do texto na tela e a busca devolve a versão antiga
sem avisar.

**Todo select de blocos é PAGINADO** (`lerBlocos`, em
`src/lib/transcricoes/blocos-io.ts`). O PostgREST desta instância corta a
resposta em 1.000 linhas e `.limit(20000)` não muda isso: numa aula de 47
min tudo parece funcionar, num vídeo de três horas a tela mostra a
transcrição pela metade, a exportação sai truncada, o `texto_completo` é
reescrito sem o fim e a indexação deixa dois terços fora da busca — tudo
em silêncio. Vale para a soma de duração da biblioteca (agregada na RPC
`transcricoes_resumo`) e para a indexação pendente por coleção
(`transcricoes_pendentes_por_colecao`) pela mesma razão.

**O claim só pega `aguardando` ou claim EXPIRADO.** A linha de um upload
nasce `processando` (para o card já aparecer com a barra do envio) e só
vira `aguardando` quando o navegador fecha o TUS. Aceitar qualquer
`processando` sem token fazia o worker roubar o arquivo pela metade. O
que a aba fechada deixa para trás é varrido pelo cron
(`transcricoes_expirar_uploads`).

**O offset dos pedaços vem do ffmpeg, não da multiplicação.** O
`-segment_time` corta na fronteira do quadro, então o pedaço passa um
pouco do alvo e o erro ACUMULA; o `-segment_list` traz o início real de
cada um.

**A faísca é herdada pelas subpastas.** Marcar a coleção pai inclui as
filhas na recuperação — é como o filtro da biblioteca já trata a árvore.
Sem isso, marcar "Convertfy Academy" não incluiria nada quando as aulas
moram nas filhas, e a tool responderia "nenhum trecho encontrado" para
conteúdo que está lá.

**"Não organizadas" é um lugar na tela e dois estados no banco**: a
coleção reservada (destino de quem entra sem sugestão) e `colecao_id
NULL` (o que sobra quando uma pasta é excluída — a FK é SET NULL). A
contagem e o filtro cobrem os dois; cobrir só o NULL deixava a peça
recém-criada fora da árvore.

**Renomear locutor toca uma linha.** Os blocos guardam o rótulo do
provedor (`speaker_0`); o nome humano vive em `transcricoes_locutores`.
Assim renomear não reescreve N mil falas e um reprocessamento consegue
remapear.

**Desligar a faísca não apaga embeddings.** Exclui da recuperação e
pronto — religar tem de ser instantâneo.

**O VÍDEO é descartado quando a transcrição fica pronta.** Sobram o texto,
os timestamps, a capa e o áudio. Guardar 500 MB por aula é barato — servir
esses 500 MB a cada play não é, e o egress é a conta que estoura. Quem toca
o vídeo passa a ser a plataforma de origem (`embed.ts`), do CDN dela.

O descarte roda **só depois de indexar**: falhar no meio do pipeline não
pode apagar a fonte antes de existir texto.

**O ÁUDIO fica por uma janela** (`TRANSCRICOES_AUDIO_RETENCAO_DIAS`, default
3), porque é ele — não o vídeo — que o pipeline usa para retranscrever, e é
~10x menor. Transcrição que sai ruim (idioma errado, jargão da coleção
faltando) tem esse prazo para ser refeita sem reenviar o arquivo. Quem
apaga é o cron do admin (`varrerAudioExpirado`), medindo por `concluido_em`.

A janela é MOSTRADA na ficha ("Áudio guardado até 09 set"). Sem isso o
usuário só descobriria o prazo tentando reprocessar e falhando — e a rota,
quando o prazo vence, diz quantos dias eram, em vez de um 409 seco.

**Só o YouTube deixa pular para o tempo.** O embed dele aceita `seekTo` por
`postMessage` (daí o `enablejsapi=1`). Instagram e TikTok embutem o vídeo e
ponto: clicar num trecho rola o texto e a tela DIZ isso. Prometer o pulo e
não entregar é pior que declarar o limite.

Os players embutidos precisam de `frame-src` no CSP (`next.config.mjs`).
Sem a diretiva o browser cai no `default-src` e, quando o CSP virar
enforcement, o player some sem erro visível.

## Modelo

Padrão `microsoft/mai-transcribe-2`, configurável POR COLEÇÃO
(`transcricoes_colecoes.modelo`). O painel de informações lê
`transcricoes.modelo`, o modelo que foi realmente usado — trocar o padrão
não reescreve o histórico.

A `phrase_list` da coleção é o parâmetro de maior impacto na qualidade:
sem ela "Omnisend" vira "omni send" e a busca nunca encontra.
