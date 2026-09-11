-- Watch time por Reel: o sinal nº 1 de ranking do Instagram em 2026.
--
-- Mosseri confirmou três sinais — watch time, sends por alcance e likes
-- por alcance. Nós já coletávamos `shares` (o "sends") e nunca coletamos
-- watch time; e `follows` sequer era PEDIDO para vídeo, porque
-- `SETS_VIDEO` no sync não listava o campo. Medido em 11/09/2026:
-- 0 de 69 Reels tinham `follows`, contra 10 de 10 carrosséis.
--
-- A coluna guarda MILISSEGUNDOS, que é o que a API devolve em
-- `ig_reels_avg_watch_time`. Ler como segundos multiplica a métrica por
-- mil e o número continua plausível — por isso o nome da coluna carrega
-- a unidade, e a conversão é função pura testada
-- (`segundosDeWatchTime`).

ALTER TABLE public.conteudo_ig_media
  ADD COLUMN IF NOT EXISTS avg_watch_time_ms numeric;

COMMENT ON COLUMN public.conteudo_ig_media.avg_watch_time_ms IS
  'ig_reels_avg_watch_time em MILISSEGUNDOS, como a Graph API devolve. Converter com segundosDeWatchTime().';
