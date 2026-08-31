-- =============================================================
-- Os selos da variante "produtos 5 - 3 produtos mesmo fundo" viram contrato.
--
-- Incidente Innova Bay, Welcome 1 (28/08): o email saiu com três selos
-- cinzas escritos "SELO 1 / OFF 1", "SELO 2 / OFF 2", "SELO 3 / OFF 3"
-- sobre os cards de produto. Não foi falha de agente nenhum — o selo é
-- texto fixo no `html` da variante e NÃO existe no `output_schema` dela
-- (17 campos: título, subtítulo, nome/3 features/CTA de cada produto).
--
-- O schema é o contrato: o que não está nele não entra em
-- `email_blocks.fields`, não vai no payload do n8n, não volta como copy,
-- não é ancorado pelo `copy_merge` e nenhum agente de formatação tem
-- alçada para tocar. O run daquele email reportou `56/56` mergeados e
-- `sem_lugar: []` — perfeito, porque o selo nunca esteve entre os 56.
-- O texto de exemplo da biblioteca atravessou o pipeline como moldura.
--
-- SÃO SEIS CAMPOS, não três: o selo tem duas linhas separadas por `<br>`
-- ("SELO 1<br>OFF 1"). Um campo único ancoraria o run costurado inteiro e
-- o splice engoliria o `<br>` junto com a frase antiga — o selo viraria uma
-- linha só. Dois campos por selo preservam a arte.
--
-- Ancoragem conferida no HTML real: os 6 examples são distintos, cada um
-- aparece UMA vez no índice de texto (a cópia do Outlook vive dentro de
-- `<!--[if mso]>`, que o parse5 não indexa) e `msoMirrorSplices` já espelha
-- a troca no bloco VML — as duas cópias saem com o mesmo texto. "SELO 1"
-- (6 chars) e "OFF 1" (5) passam do MIN_EXAMPLE_LEN de 4, e as únicas 6
-- ocorrências de "OFF" no arquivo são as dos próprios selos: sem colisão.
--
-- Emails já gerados não mudam (o contrato está snapshotado em
-- `email_blocks.fields`); o reconcile do seed-blocks grava o contrato novo
-- na próxima geração.
-- =============================================================

DO $$
DECLARE
  v_id uuid := '7ef1a9f4-5141-4732-b58c-15628ac8e4a8';
  v_schema jsonb;
  v_novo jsonb;
  n int;
BEGIN
  SELECT output_schema INTO v_schema
  FROM email_component_variants WHERE id = v_id;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'variante % não encontrada — nada a fazer', v_id;
    RETURN;
  END IF;

  FOR n IN 1..3 LOOP
    -- Valor do desconto (linha de cima do selo).
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_schema) f
      WHERE f->>'key' = format('product_%s_badge_value', n)
    ) THEN
      v_novo := jsonb_build_object(
        'key',      format('product_%s_badge_value', n),
        'label',    format('Selo do produto %s — valor', n),
        'type',     'text_short',
        'nature',   'copy',
        'source',   'schema',
        'example',  format('SELO %s', n),
        'max_len',  8,
        'min_len',  null,
        'guidance', 'Linha de cima do selo redondo. Valor do desconto ou do benefício, curtíssimo — ex.: 20%, R$50, 2X1. Cabem 8 caracteres.',
        'required', false
      );
      v_schema := v_schema || jsonb_build_array(v_novo);
    END IF;

    -- Rótulo (linha de baixo do selo).
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_schema) f
      WHERE f->>'key' = format('product_%s_badge_label', n)
    ) THEN
      v_novo := jsonb_build_object(
        'key',      format('product_%s_badge_label', n),
        'label',    format('Selo do produto %s — rótulo', n),
        'type',     'text_short',
        'nature',   'copy',
        'source',   'schema',
        'example',  format('OFF %s', n),
        'max_len',  8,
        'min_len',  null,
        'guidance', 'Linha de baixo do selo, em caixa alta — ex.: OFF, GRÁTIS, HOJE. Cabem 8 caracteres.',
        'required', false
      );
      v_schema := v_schema || jsonb_build_array(v_novo);
    END IF;
  END LOOP;

  UPDATE email_component_variants
  SET output_schema = v_schema, updated_at = now()
  WHERE id = v_id;

  RAISE NOTICE 'output_schema da variante % agora tem % campos',
    v_id, jsonb_array_length(v_schema);
END $$;
