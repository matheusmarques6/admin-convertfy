# Worker do módulo Transcrições: precisa de yt-dlp e ffmpeg, que são
# binários — daí o container em vez de função serverless.
#
# O build roda a partir da RAIZ do repositório (o worker importa os módulos
# puros de src/lib/transcricoes; duplicar essa lógica é como as duas metades
# passam a discordar em silêncio):
#
#   docker build -f worker/transcricoes/Dockerfile -t convertfy-transcricoes .

FROM node:22-bookworm-slim AS build
WORKDIR /build

COPY worker/transcricoes/package.json ./worker/transcricoes/
RUN cd worker/transcricoes && npm install --no-audit --no-fund

COPY tsconfig.json ./tsconfig.json
COPY src/lib/transcricoes ./src/lib/transcricoes
COPY src/lib/logger.ts ./src/lib/logger.ts
COPY worker/transcricoes ./worker/transcricoes

# esbuild resolve o alias `@/` do tsconfig e entrega um arquivo só.
RUN cd worker/transcricoes && npm run build

FROM node:22-bookworm-slim
# ffmpeg para extrair e dividir áudio; yt-dlp sai release toda semana e é
# onde mora o conserto de bloqueio de plataforma.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages "yt-dlp>=2025.1.1" \
    && apt-get purge -y python3-pip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /build/worker/transcricoes/dist ./dist
COPY --from=build /build/worker/transcricoes/node_modules ./node_modules
COPY --from=build /build/worker/transcricoes/package.json ./package.json

ENV NODE_ENV=production
# Trabalho em disco efêmero: o container é reciclável, o estado vive na linha.
ENV TMPDIR=/tmp/transcricoes
RUN mkdir -p /tmp/transcricoes

CMD ["node", "dist/worker.mjs"]
