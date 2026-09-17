-- ═══════════════════════════════════════════════════════════════════
-- /forms/diagnostico — funil novo, na régua do funil de referência
-- (Social Scout) e com faixas na MOEDA de quem responde.
--
-- DADOS, não schema: reaplicável, e escrito para ser lido pelo time
-- comercial. Rodado em 17/09/2026.
--
-- Medido ANTES: o diagnóstico tinha 2 envios e 7 sessões (o próprio
-- time testando) — mexer nele não alcança tráfego. Quem está com verba
-- em cima é o "pagina-de-vendas" (57 envios, o último hoje), e ele NÃO
-- é tocado aqui.
--
-- O que muda, e por quê:
--
-- 1. **Contato numa tela só** (nome, sobrenome, WhatsApp, e-mail). É o
--    que o funil de referência faz, e o que a nossa engine passou a
--    suportar. Quatro telas para quatro campos de contato é o trecho
--    mais caro do formulário: ninguém abandona por digitar o e-mail,
--    abandona por ver quatro telas antes de qualquer pergunta.
--
-- 2. **Nome e sobrenome separados**, como lá. O motivo é a CAPI: o
--    `fn`/`ln` hasheado é o que casa a pessoa, e o split por espaço
--    erra em nome composto ("João Pedro Silva" → ln "Pedro Silva").
--
-- 3. **Região antes do faturamento**, e as faixas na moeda dela. Era o
--    buraco: uma loja de US$50 mil/mês (≈ R$250 mil) marcava
--    "Até R$100 mil", caía na recusa e nunca mais era falada. Perder
--    lead bom por causa da UNIDADE é o pior desfecho de um funil de
--    qualificação.
--
-- 4. **O corte deixa de comparar texto.** O salto e a regra do
--    `LeadQualificado` passam a comparar o PISO em real da faixa
--    (`<ref>__piso_brl`, calculado no servidor). Uma condição para as
--    três moedas, e renomear uma opção no editor não desliga mais o
--    evento em silêncio — o defeito que já custou um mês de evento sem
--    sair.
--
-- 5. **Gargalo e orçamento**, as duas perguntas de fit do funil de
--    referência, adaptadas: o piso de lá é um projeto de US$3.500 uma
--    vez; o nosso é MENSALIDADE. Medido no banco em 17/09: assinatura
--    ativa mínima R$2.497, média R$4.425. A pergunta muda de FORMA,
--    não só de número.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_form  uuid := 'd1a6405d-0000-4000-8000-000000000001';
  -- Os ids das perguntas que JÁ EXISTEM são preservados: eles são o
  -- endereço das respostas gravadas (`form_submissions.data`) e da
  -- regra de rastreamento. Gerar ids novos desligaria as duas.
  f_nome  uuid := 'd1a6405d-0000-4000-8000-0000000000f1';
  f_email uuid := 'd1a6405d-0000-4000-8000-0000000000f2';
  f_zap   uuid := 'd1a6405d-0000-4000-8000-0000000000f3';
  f_fat   uuid := 'd1a6405d-0000-4000-8000-0000000000f4';
  f_url   uuid := 'd1a6405d-0000-4000-8000-0000000000f5';
  f_ig    uuid := 'd1a6405d-0000-4000-8000-0000000000f6';
  f_sobre uuid := 'd1a6405d-0000-4000-8000-0000000000f7';
  f_reg   uuid := 'd1a6405d-0000-4000-8000-0000000000f8';
  f_gar   uuid := 'd1a6405d-0000-4000-8000-0000000000f9';
  f_orc   uuid := 'd1a6405d-0000-4000-8000-0000000000fa';
  v_versao int;
  v_org uuid;
BEGIN

  -- ── 1. As perguntas ────────────────────────────────────────────────
  -- O rótulo de quem divide a tela fica CURTO: numa tela agrupada o
  -- título grande é o da tela, e "Antes de tudo — como você se chama?"
  -- ao lado de outros três campos vira ruído.
  UPDATE crm_form_fields SET
    field_type = 'text', label = 'Nome', placeholder = 'Seu primeiro nome',
    description = NULL, required = true, position = 0,
    map_to_lead_field = 'first_name'
  WHERE id = f_nome;

  INSERT INTO crm_form_fields
    (id, form_id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field)
  VALUES
    (f_sobre, v_form, 'text', 'Sobrenome', 'Seu sobrenome', NULL, true, 1, '[]'::jsonb, '{}'::jsonb, 'last_name')
  ON CONFLICT (id) DO UPDATE SET
    field_type = EXCLUDED.field_type, label = EXCLUDED.label,
    placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
    required = EXCLUDED.required, position = EXCLUDED.position,
    map_to_lead_field = EXCLUDED.map_to_lead_field;

  UPDATE crm_form_fields SET
    label = 'WhatsApp', placeholder = '(11) 99999-9999',
    description = NULL, required = true, position = 2,
    validation = '{"countryCode": true}'::jsonb
  WHERE id = f_zap;

  UPDATE crm_form_fields SET
    label = 'E-mail', placeholder = 'voce@sualoja.com',
    description = NULL, required = true, position = 3
  WHERE id = f_email;

  UPDATE crm_form_fields SET
    label = 'Endereço da loja',
    placeholder = 'https://sualoja.com.br',
    description = 'A gente abre e olha antes da conversa.',
    required = true, position = 4
  WHERE id = f_url;

  UPDATE crm_form_fields SET
    label = '@ do Instagram', placeholder = '@sualoja',
    description = NULL, required = false, position = 5
  WHERE id = f_ig;

  -- Região: é ela que decide a moeda das faixas de faturamento.
  INSERT INTO crm_form_fields
    (id, form_id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field)
  VALUES
    (f_reg, v_form, 'select', 'Para onde a sua loja vende?', NULL,
     'Se vende para vários lugares, escolha o principal.', true, 6,
     '["Brasil","Estados Unidos","Europa","LATAM (fora do Brasil)","Vários países"]'::jsonb,
     '{}'::jsonb, 'custom_deal:regiao_de_venda')
  ON CONFLICT (id) DO UPDATE SET
    field_type = EXCLUDED.field_type, label = EXCLUDED.label,
    description = EXCLUDED.description, required = EXCLUDED.required,
    position = EXCLUDED.position, options = EXCLUDED.options,
    map_to_lead_field = EXCLUDED.map_to_lead_field;

  -- Faturamento: as opções gravadas aqui são a escada em REAL, e valem
  -- só enquanto a região não foi respondida. A partir dela, quem manda
  -- é `opcoes_por_moeda` no schema — a lista sai do código
  -- (`lib/forms/moeda`), com o piso em real viajando junto.
  UPDATE crm_form_fields SET
    label = 'Qual o faturamento médio mensal da loja?',
    description = 'Uma média dos últimos 3 meses já serve.',
    required = true, position = 7,
    options = '["Até R$100k","R$100k – R$200k","R$200k – R$500k","R$500k – R$1M","R$1M – R$5M","Acima de R$5M"]'::jsonb
  WHERE id = f_fat;

  -- Gargalo: a pergunta de fit, com a SAÍDA escrita na própria opção.
  -- Quem ainda não vende se reconhece e sai — sem precisar mentir para
  -- passar, que é o que uma lista sem saída produz.
  INSERT INTO crm_form_fields
    (id, form_id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field)
  VALUES
    (f_gar, v_form, 'select', 'O que mais trava o seu faturamento hoje?', NULL,
     'Escolha o que mais pesa. É por onde a conversa começa.', true, 8,
     '["Tráfego caro — o CPA não fecha","A base não compra de novo","E-mail e automação parados ou mal feitos","Tenho volume, mas a margem some","Ainda estou montando a loja / não vendo ainda"]'::jsonb,
     '{}'::jsonb, 'custom_deal:principal_gargalo')
  ON CONFLICT (id) DO UPDATE SET
    field_type = EXCLUDED.field_type, label = EXCLUDED.label,
    description = EXCLUDED.description, required = EXCLUDED.required,
    position = EXCLUDED.position, options = EXCLUDED.options,
    map_to_lead_field = EXCLUDED.map_to_lead_field;

  -- Orçamento. O funil de referência pergunta por um projeto de
  -- US$3.500 uma vez; aqui é mensalidade recorrente, e o número é o
  -- medido: R$2.497 é a menor assinatura ativa hoje.
  INSERT INTO crm_form_fields
    (id, form_id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field)
  VALUES
    (f_orc, v_form, 'select',
     'Nosso trabalho começa em R$2.497 por mês. Cabe no seu orçamento?', NULL,
     'Perguntamos agora para não tomar o seu tempo depois.', true, 9,
     '["Sim, cabe","Depende do retorno — quero entender antes","Não, agora não faz sentido"]'::jsonb,
     '{}'::jsonb, 'custom_deal:orcamento_mensal')
  ON CONFLICT (id) DO UPDATE SET
    field_type = EXCLUDED.field_type, label = EXCLUDED.label,
    description = EXCLUDED.description, required = EXCLUDED.required,
    position = EXCLUDED.position, options = EXCLUDED.options,
    map_to_lead_field = EXCLUDED.map_to_lead_field;

  -- ── 2. A versão publicada ──────────────────────────────────────────
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_versao
  FROM form_versions WHERE form_id = v_form;
  -- `form_versions.org_id` é NOT NULL e vem do formulário: a versão
  -- pertence à mesma organização, e é por ele que a RLS a alcança.
  SELECT org_id INTO v_org FROM crm_forms WHERE id = v_form;

  INSERT INTO form_versions (form_id, org_id, version, schema)
  VALUES (v_form, v_org, v_versao, jsonb_build_object(
    'version', v_versao,
    'locale', 'pt-BR',
    'display_mode', 'conversational',
    'hidden_fields', '[]'::jsonb,
    'settings', jsonb_build_object(
      'mostrar_progresso', true,
      'rotulo_avancar', 'OK',
      'enter_avanca', true
    ),
    'blocks', jsonb_build_array(
      -- Tela 1 — contato
      jsonb_build_object(
        'ref', f_nome::text, 'type', 'text', 'alias', 'nome',
        'label', 'Nome', 'placeholder', 'Seu primeiro nome',
        'description', NULL, 'required', true, 'options', '[]'::jsonb,
        'map_to_lead_field', 'first_name',
        'titulo_da_tela', 'Para começar, como falamos com você?'
      ),
      jsonb_build_object(
        'ref', f_sobre::text, 'type', 'text', 'alias', 'sobrenome',
        'label', 'Sobrenome', 'placeholder', 'Seu sobrenome',
        'description', NULL, 'required', true, 'options', '[]'::jsonb,
        'map_to_lead_field', 'last_name', 'mesma_tela', true
      ),
      jsonb_build_object(
        'ref', f_zap::text, 'type', 'phone', 'alias', 'whatsapp',
        'label', 'WhatsApp', 'placeholder', '(11) 99999-9999',
        'description', NULL, 'required', true, 'options', '[]'::jsonb,
        'validation', jsonb_build_object('countryCode', true),
        'map_to_lead_field', 'phone', 'mesma_tela', true
      ),
      jsonb_build_object(
        'ref', f_email::text, 'type', 'email', 'alias', 'email',
        'label', 'E-mail', 'placeholder', 'voce@sualoja.com',
        'description', 'Mandamos o diagnóstico por aqui — sem lista de e-mails.',
        'required', true, 'options', '[]'::jsonb,
        'map_to_lead_field', 'email', 'mesma_tela', true
      ),
      -- Tela 2 — a loja
      jsonb_build_object(
        'ref', f_url::text, 'type', 'url', 'alias', 'loja',
        'label', 'Endereço da loja', 'placeholder', 'https://sualoja.com.br',
        'description', 'A gente abre e olha antes da conversa.',
        'required', true, 'options', '[]'::jsonb,
        'map_to_lead_field', 'custom_deal:url_da_sua_loja',
        'titulo_da_tela', 'Prazer, {{nome}}. Onde fica a sua loja?'
      ),
      jsonb_build_object(
        'ref', f_ig::text, 'type', 'text', 'alias', 'instagram',
        'label', '@ do Instagram', 'placeholder', '@sualoja',
        'description', NULL, 'required', false, 'options', '[]'::jsonb,
        'map_to_lead_field', 'custom_deal:qual_seu_instagram', 'mesma_tela', true
      ),
      -- Tela 3 — região (decide a moeda da tela 4)
      jsonb_build_object(
        'ref', f_reg::text, 'type', 'select', 'alias', 'regiao',
        'label', 'Para onde a sua loja vende?',
        'description', 'Se vende para vários lugares, escolha o principal.',
        'required', true,
        'options', jsonb_build_array(
          jsonb_build_object('label', 'Brasil', 'value', 'Brasil'),
          jsonb_build_object('label', 'Estados Unidos', 'value', 'Estados Unidos'),
          jsonb_build_object('label', 'Europa', 'value', 'Europa'),
          jsonb_build_object('label', 'LATAM (fora do Brasil)', 'value', 'LATAM (fora do Brasil)'),
          jsonb_build_object('label', 'Vários países (worldwide)', 'value', 'Vários países')
        ),
        'map_to_lead_field', 'custom_deal:regiao_de_venda'
      ),
      -- Tela 4 — faturamento na moeda da região
      jsonb_build_object(
        'ref', f_fat::text, 'type', 'select', 'alias', 'faturamento',
        'label', 'Qual o faturamento médio mensal da loja?',
        'description', 'Uma média dos últimos 3 meses já serve.',
        'required', true,
        'opcoes_por_moeda', true,
        'moeda_de', f_reg::text,
        'options', jsonb_build_array(
          jsonb_build_object('label', 'Até R$100k', 'value', 'Até R$100k', 'piso', 0, 'moeda', 'BRL'),
          jsonb_build_object('label', 'R$100k – R$200k', 'value', 'R$100k – R$200k', 'piso', 100000, 'moeda', 'BRL'),
          jsonb_build_object('label', 'R$200k – R$500k', 'value', 'R$200k – R$500k', 'piso', 200000, 'moeda', 'BRL'),
          jsonb_build_object('label', 'R$500k – R$1M', 'value', 'R$500k – R$1M', 'piso', 500000, 'moeda', 'BRL'),
          jsonb_build_object('label', 'R$1M – R$5M', 'value', 'R$1M – R$5M', 'piso', 1000000, 'moeda', 'BRL'),
          jsonb_build_object('label', 'Acima de R$5M', 'value', 'Acima de R$5M', 'piso', 5000000, 'moeda', 'BRL')
        ),
        'map_to_lead_field', 'custom_deal:faturamento_medio_mensal',
        -- UMA condição para as três moedas: o piso em real da faixa.
        -- Listar os seis rótulos abaixo do corte funcionaria hoje e
        -- voltaria a ser o defeito que o piso existe para fechar.
        'logic', jsonb_build_array(jsonb_build_object(
          'logic', 'or', 'goto', 'ending:abaixo-do-corte',
          'conditions', jsonb_build_array(jsonb_build_object(
            'ref', f_fat::text || '__piso_brl', 'operator', 'lt', 'value', 200000
          ))
        ))
      ),
      -- Tela 5 — gargalo, com saída explícita
      jsonb_build_object(
        'ref', f_gar::text, 'type', 'select', 'alias', 'gargalo',
        'label', 'O que mais trava o seu faturamento hoje?',
        'description', 'Escolha o que mais pesa. É por onde a conversa começa.',
        'required', true,
        'options', jsonb_build_array(
          jsonb_build_object('label', 'Tráfego caro — o CPA não fecha', 'value', 'Tráfego caro — o CPA não fecha'),
          jsonb_build_object('label', 'A base não compra de novo', 'value', 'A base não compra de novo'),
          jsonb_build_object('label', 'E-mail e automação parados ou mal feitos', 'value', 'E-mail e automação parados ou mal feitos'),
          jsonb_build_object('label', 'Tenho volume, mas a margem some', 'value', 'Tenho volume, mas a margem some'),
          jsonb_build_object('label', 'Ainda estou montando a loja / não vendo ainda', 'value', 'Ainda estou montando a loja / não vendo ainda')
        ),
        'map_to_lead_field', 'custom_deal:principal_gargalo',
        'logic', jsonb_build_array(jsonb_build_object(
          'logic', 'or', 'goto', 'ending:sem-fit',
          'conditions', jsonb_build_array(jsonb_build_object(
            'ref', f_gar::text, 'operator', 'in',
            'value', jsonb_build_array('Ainda estou montando a loja / não vendo ainda')
          ))
        ))
      ),
      -- Tela 6 — orçamento
      jsonb_build_object(
        'ref', f_orc::text, 'type', 'select', 'alias', 'orcamento',
        'label', 'Nosso trabalho começa em R$2.497 por mês. Cabe no seu orçamento?',
        'description', 'Perguntamos agora para não tomar o seu tempo depois.',
        'required', true,
        'options', jsonb_build_array(
          jsonb_build_object('label', 'Sim, cabe', 'value', 'Sim, cabe'),
          jsonb_build_object('label', 'Depende do retorno — quero entender antes', 'value', 'Depende do retorno — quero entender antes'),
          jsonb_build_object('label', 'Não, agora não faz sentido', 'value', 'Não, agora não faz sentido')
        ),
        'map_to_lead_field', 'custom_deal:orcamento_mensal',
        'logic', jsonb_build_array(jsonb_build_object(
          'logic', 'or', 'goto', 'ending:sem-orcamento',
          'conditions', jsonb_build_array(jsonb_build_object(
            'ref', f_orc::text, 'operator', 'in',
            'value', jsonb_build_array('Não, agora não faz sentido')
          ))
        ))
      )
    ),
    'endings', jsonb_build_array(
      jsonb_build_object(
        'ref', 'ok',
        'title', 'Pronto, {{nome}}. Recebemos.',
        'description', 'Nosso time vai olhar {{loja}} e te chamar no WhatsApp em até 1 dia útil com o diagnóstico.',
        'button_label', NULL, 'button_url', NULL, 'redirect_url', NULL
      ),
      jsonb_build_object(
        'ref', 'abaixo-do-corte',
        'title', 'Obrigado, {{nome}}.',
        -- O número em dólar vem da MESMA taxa declarada que o piso usa
        -- (`TAXA_PARA_BRL`). Falar só em real deixaria quem respondeu
        -- em dólar sem entender por que foi recusado.
        'description', 'Hoje o nosso trabalho se paga em lojas acima de R$200 mil por mês (cerca de US$40 mil). Abaixo disso a conta não fecha para você, e a gente prefere dizer isso agora. Guardamos seu contato e avisamos quando fizer sentido.',
        'button_label', NULL, 'button_url', NULL, 'disqualified', true, 'redirect_url', NULL
      ),
      jsonb_build_object(
        'ref', 'sem-fit',
        'title', 'Valeu, {{nome}}.',
        'description', 'A gente trabalha em cima de base e histórico de compra — com a loja ainda sem vendas não há o que otimizar, e cobrar por isso seria vender o que não entrega. Volte a falar com a gente quando estiver vendendo: o contato fica guardado.',
        'button_label', NULL, 'button_url', NULL, 'disqualified', true, 'redirect_url', NULL
      ),
      jsonb_build_object(
        'ref', 'sem-orcamento',
        'title', 'Obrigado pela sinceridade, {{nome}}.',
        'description', 'Sem orçamento para a mensalidade não faz sentido ocupar uma hora sua numa call de diagnóstico. Guardamos o contato e o que você contou sobre {{loja}} — quando mudar, a conversa começa de onde parou.',
        'button_label', NULL, 'button_url', NULL, 'disqualified', true, 'redirect_url', NULL
      )
    )
  ));

  UPDATE crm_forms SET
    published_version_id = (SELECT id FROM form_versions WHERE form_id = v_form AND version = v_versao),
    -- O rascunho sai: ele é anterior a este funil e, se ficasse, o
    -- próximo Publicar devolveria o formulário antigo.
    draft_schema = NULL,
    -- A régua do evento passa a ser aritmética, e vale para as três
    -- moedas. SEM `field_label`: o campo derivado não existe em
    -- `crm_form_fields`, e o label resolveria para a pergunta errada.
    tracking_config = jsonb_set(
      COALESCE(tracking_config, '{}'::jsonb),
      '{qualified_lead}',
      jsonb_build_object(
        'enabled', true,
        'event_name', 'LeadQualificado',
        'logic', 'and',
        'rules', jsonb_build_array(jsonb_build_object(
          'field_id', f_fat::text || '__piso_brl',
          'operator', 'gte',
          'value', '200000'
        ))
      )
    )
  WHERE id = v_form;

  RAISE NOTICE 'Funil do diagnóstico publicado na versão %', v_versao;
END $$;

COMMIT;
