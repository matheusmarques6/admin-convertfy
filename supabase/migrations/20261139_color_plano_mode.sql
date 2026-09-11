-- Alavanca do agente Cores & Botões decidindo o RITMO das faixas e os botões.
--
-- Até esta frente o `color_format` nunca alterava a aparência da peça: ele
-- trocava valores de cor por valores da paleta, e o resultado era mais
-- conforme, não diferente. Escurecer uma faixa, inverter o botão que ficou
-- dentro dela e inserir um CTA onde falta MUDAM o desenho — e por isso
-- entram atrás de um interruptor, no padrão de `montador_mode`,
-- `seletor_mode` e `blueprint_mode`.
--
--   off    → comportamento anterior: só as ops de VALOR são aplicadas.
--            O plano continua sendo decidido e gravado.
--   shadow → o agente decide tudo, o plano vai para `parsed_output` da run e
--            NADA de faixa ou botão é aplicado. É onde se lê se as decisões
--            fazem sentido antes de deixá-las mexer em peça de cliente: o
--            system passou de 6.580 para ~19.500 chars, e o risco dessa
--            mudança não é o custo (US$ 0,015/e-mail), é a obediência.
--   on     → aplica.
--
-- Default `shadow`: a frente nasce medindo. O código também cai em `shadow`
-- quando a leitura falha — errar para o lado de decidir-e-não-aplicar é
-- barato; errar para o lado de aplicar sem querer, não.
alter table email_generation_settings
  add column if not exists color_plano_mode text not null default 'shadow'
  check (color_plano_mode in ('off','shadow','on'));

comment on column email_generation_settings.color_plano_mode is
  'Cores & Botões: off = só ops de valor (comportamento pré-frente); shadow = decide e grava o plano sem aplicar faixa/botão; on = aplica. Ver src/lib/agents/html/color-plano-mode.ts.';
