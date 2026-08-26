-- Telemetria de proveniência (plano docs/architecture/plano-telemetria-proveniencia.md)
--
-- prompt_segments: o prompt segmentado por ORIGEM, capturado NO MOMENTO da
--   montagem — [{cls, rotulo, texto?, chars, parte?, ref?, sha8?}].
--   Invariante (provada por teste): concat(segmentos, resolvendo refs) ==
--   prompt enviado, byte a byte.
-- input_summary: a aba Entrada estruturada — [{rotulo, cls, valor}].
--
-- Nullable de propósito: runs antigas e agentes ainda não migrados seguem
-- legíveis; a UI tem fallback para rendered_prompt/input_vars.

alter table email_generation_runs
  add column if not exists prompt_segments jsonb,
  add column if not exists input_summary jsonb;

comment on column email_generation_runs.prompt_segments is
  'Prompt segmentado por proveniência (agente/loja/biblioteca/upstream/curadoria/vault/sistema). Segmento grande vira {ref, sha8} resolvível via /api/admin/agents/prompt-segment.';
comment on column email_generation_runs.input_summary is
  'Entrada estruturada da run: [{rotulo, cls, valor}] — o que o agente recebeu, com origem.';
