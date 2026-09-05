# Worker de Transcrições

Container que roda o pipeline pesado do módulo Transcrições. Não roda na
Vercel de propósito: `yt-dlp` e `ffmpeg` são binários com sistema de
arquivos, e o teto de tempo do serverless não cobre o download de um vídeo
de uma hora.

## Etapas

| # | Etapa | Ferramenta | Porcentagem? |
|---|-------|-----------|--------------|
| 0 | Baixando | `yt-dlp` | sim (bytes) |
| 1 | Extraindo áudio | `ffmpeg` | sim (tempo processado) |
| 2 | Transcrevendo | OpenRouter | **não** — é uma chamada só |
| 3 | Indexando | OpenRouter (LLM + embeddings) | sim (chunks) |

A etapa 2 não reporta porcentagem porque não existe porcentagem para
reportar. A UI mostra o segmento "em andamento" sem número; inventar um é o
que faz o usuário achar que travou em 70%.

## Retomada

O estado vive na linha (`etapa`, `progresso`, `media_path`, `audio_path`).
Se o container cair durante a indexação, a próxima execução retoma dali —
não rebaixa nem retranscreve. O claim é atômico (`transcricoes_claim` com
`FOR UPDATE SKIP LOCKED`): duas execuções sobrepostas não processam a
mesma linha e a transcrição não é cobrada duas vezes.

## Variáveis

```
SUPABASE_URL                 obrigatória
SUPABASE_SERVICE_ROLE_KEY    obrigatória
OPENROUTER_API_KEY           obrigatória (transcrição, tópicos, embeddings)
HTTP_PROXY                   opcional — usado pelo yt-dlp
WORKER_ID                    opcional (default: hostname)
WORKER_CONCURRENCY           opcional (default 1)
POLL_INTERVAL_MS             opcional (default 5000)
```

`HTTP_PROXY` existe porque YouTube, Instagram e TikTok bloqueiam IPs de
datacenter. Isso é comportamento esperado em produção, não exceção: sem
proxy o worker ainda funciona, faz retry com backoff e o card mostra a
mensagem legível do bloqueio.

## Rodar

```bash
docker build -t convertfy-transcricoes ./worker/transcricoes
docker run --env-file .env convertfy-transcricoes
```

Local, sem container (precisa de `yt-dlp` e `ffmpeg` no PATH):

```bash
cd worker/transcricoes && npm install && npm start
```

## Heartbeat

A cada ciclo o worker grava em `transcricoes_worker`. O rodapé da
biblioteca lê dali: heartbeat com mais de 5 minutos e a tela diz que o
serviço pode estar fora, em vez de exibir um horário que não significa
nada.
