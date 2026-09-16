-- Identidade visual do template do time.
--
-- A prateleira de templates desenhava toda capa na família PADRÃO (a azul da
-- casa), porque `documentoDeEstrutura` nasce nela e ninguém chamava
-- `aplicarFamilia`. Escolher o template APLICA a identidade, então a prévia
-- mostrava uma peça e o clique entregava outra — o "Print de post" (preto,
-- cartão de perfil, sem contador) aparecia como slide azul.
--
-- Derivar a identidade do molde base não basta: a identidade é escolha da
-- PEÇA que virou template, e dois templates do mesmo molde base podem ter
-- capas opostas. Daí a coluna.
--
-- Nulo = "não foi gravada" (todo template criado antes disto): a leitura cai
-- no palpite do molde base, que é declarado em `familiaDaPrevia`.
alter table public.conteudo_meus_templates
  add column if not exists familia text;

comment on column public.conteudo_meus_templates.familia is
  'Identidade visual (FamiliaVisual) com que o template foi salvo. Nulo = herdar do molde base.';
