-- 20261176 — o ciclo de calibração chega ao Seletor (S4, 19/09).
--
-- O Seletor decide o ALVO do toque por loja e era o único dos três agentes
-- da fase 1 sem os dois lados do ciclo (orientação do COO servida no
-- prompt + 👍/👎 por run). Mesmas tabelas, mesma tela, mesma rota: só o
-- CHECK de `agente` ganha o valor. Padrão da 20261111 (Curador).
--
-- 'seletor' é o nome humano E o nome da run (email_generation_runs.agent).

alter table public.estruturador_feedback
  drop constraint if exists estruturador_feedback_agente_check;

alter table public.estruturador_feedback
  add constraint estruturador_feedback_agente_check
  check (agente in ('estruturador', 'curador', 'seletor'));

alter table public.estruturador_orientacoes
  drop constraint if exists estruturador_orientacoes_agente_check;

alter table public.estruturador_orientacoes
  add constraint estruturador_orientacoes_agente_check
  check (agente in ('estruturador', 'curador', 'seletor'));

comment on table public.estruturador_orientacoes is
  'Diretrizes do COO servidas em <orientacao_do_coo> ao agente da coluna `agente` (estruturador | curador | seletor). Não é vault: efeito imediato, sem curadoria no Obsidian. Nome da tabela é histórico.';

comment on table public.estruturador_feedback is
  'Julgamento humano de UMA run, por agente (estruturador | curador | seletor). Vira rascunho de nota do vault — nunca entra direto no prompt. Nome da tabela é histórico.';
