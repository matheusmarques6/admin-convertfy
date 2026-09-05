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
WORKER_URL               opcional — prévia de link com duração
WORKER_SHARED_SECRET     obrigatório com WORKER_URL
```

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

**Renomear locutor toca uma linha.** Os blocos guardam o rótulo do
provedor (`speaker_0`); o nome humano vive em `transcricoes_locutores`.
Assim renomear não reescreve N mil falas e um reprocessamento consegue
remapear.

**Desligar a faísca não apaga embeddings.** Exclui da recuperação e
pronto — religar tem de ser instantâneo.

## Modelo

Padrão `microsoft/mai-transcribe-2`, configurável POR COLEÇÃO
(`transcricoes_colecoes.modelo`). O painel de informações lê
`transcricoes.modelo`, o modelo que foi realmente usado — trocar o padrão
não reescreve o histórico.

A `phrase_list` da coleção é o parâmetro de maior impacto na qualidade:
sem ela "Omnisend" vira "omni send" e a busca nunca encontra.
