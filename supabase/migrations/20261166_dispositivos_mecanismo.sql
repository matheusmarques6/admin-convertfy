-- Dispositivo = o MECANISMO (17/09) — os 22 nomes viram 34, sem prefixo de seção.
--
-- APLICADA em produção em 17/09/2026 (registrada como
-- `20260917212341_dispositivos_mecanismo`). Conferido depois: 72 variantes,
-- ZERO sem dispositivo, ZERO com prefixo antigo, 34 valores no CHECK, backup
-- com as 72 linhas do estado anterior. Nas 65 ATIVAS: 31 dos 33 mecanismos
-- pedíveis têm variante (faltam `oferta_adiada` e `duvida_antecipada`), 13
-- têm uma só, e nenhuma ativa ficou `nao_classificado`.
--
-- Fonte única: `src/lib/agents/shared/dispositivos.ts`. Um teste lê este
-- arquivo e compara o CHECK com a lista de lá — valor novo no código sem
-- migration reprova, que é a lição do `copy_fit` (quatro dias sem gravar
-- run porque o CHECK não tinha o valor).
--
-- POR QUÊ. O vocabulário de 14/09 dizia três coisas ao mesmo tempo (seção,
-- tema e mecanismo) e por isso não separava nada. Medido nas 72 variantes:
-- `hero_oferta_cupom` cobria 10 das 18 heroes, `products_grade_sem_preco`
-- 10 das 16 peças de produto (definida pelo que NÃO tem), e o prefixo
-- repetia `block_type` enquanto ESCONDIA o mesmo mecanismo cruzando seções
-- — o marcador que aponta um detalhe na foto era `body_mecanismo_visual`
-- numa peça e `products_unico_oferta` em outra.
--
-- Quatro dispositivos vivem em DUAS seções de fato, e é por isso que a
-- seção deixou de ser derivada do nome: `codigo_entregue` (hero 3 +
-- offer 1), `lineup_de_colecao` (hero 2 + products 1), `mecanismo_apontado`
-- (body 1 + products 1) e `prova_por_relato` (reviews 2 + products 1).
--
-- ORDEM DO DEPLOY, e por que ela degrada nos dois sentidos. Código novo com
-- banco velho: nenhuma variante casa com nenhum pedido, `conflitoDeDispositivo`
-- elimina tudo, `filtrarPorRequisitos` é fail-open no CONJUNTO (zerou a
-- seção, devolve todas) e o pipeline volta ao comportamento pré-B3. Banco
-- novo com código velho: idem, pelo mesmo caminho. Degradação, não queda —
-- mas o ideal é aplicar isto na MESMA janela do deploy.
--
-- O de/para é TOTAL: as 72 variantes do banco em 17/09 estão nomeadas aqui,
-- uma a uma. `nao_classificado` é valor de CONTROLE e vai só para as duas
-- que nunca foram julgadas (body 6 e body 9, ambas já inativas e sem
-- `output_schema`): ele elimina a variante de toda posição que pede algo,
-- que é o ponto — bloquear a escolha às cegas.

BEGIN;

-- 1. Backup do estado anterior. É o que permite o rollback do fim e o que
--    responde "qual era o nome antigo desta variante" depois do corte.
CREATE TABLE IF NOT EXISTS bkp_dispositivo_20260917 AS
SELECT id, name, block_type, dispositivo AS dispositivo_antigo, now() AS copiado_em
FROM email_component_variants;

-- 2. O CHECK velho sai ANTES dos UPDATEs — senão ele rejeita os nomes novos.
ALTER TABLE email_component_variants DROP CONSTRAINT IF EXISTS ecv_dispositivo_check;

-- 3. O de/para, endereçado por ID. Nunca por nome: há nome REPETIDO na
--    biblioteca ("body 21" aparece duas vezes), e casar por nome
--    reclassificaria a variante errada em silêncio.
UPDATE email_component_variants v
SET dispositivo = m.novo
FROM (VALUES
    ('9bc6a6c7-2fb8-4b66-bffa-0d64b6d28063','prazo_declarado'),
    ('e156f52e-4046-44be-a1e3-cc325a10e405','moldura_de_genero'),
    ('43f9b0ec-9ebc-4657-b1ef-9cfd5a521895','lineup_de_colecao'),
    ('dc6c363c-7d4f-4c70-a163-632bcadfdce6','lineup_de_colecao'),
    ('2ce07010-4b17-4f44-931a-f5f0b014b444','oferta_em_manchete'),
    ('bd4965fe-9606-49ca-bdbf-f260571acb3a','campanha_nomeada'),
    ('fea49994-d150-40fa-a8e9-513686563686','oferta_em_manchete'),
    ('54881d0b-bcda-42ef-a56e-706f7ecc415b','campanha_nomeada'),
    ('28b9815c-466f-4621-b432-2babcab6e012','abertura_editorial'),
    ('7f3a72a6-e24c-4aa6-b4ca-14df7f3d80b5','abertura_editorial'),
    ('d5fe8ba1-05df-4803-9807-fc1e51019203','abertura_editorial'),
    ('3e241d7f-5f84-4017-a553-880736a450dc','pergunta_ao_leitor'),
    ('d9e34a1f-7bc7-47e8-9081-53600b104dd2','codigo_entregue'),
    ('e447ef06-95e2-4c5d-9b6f-c3e0b895f8d2','codigo_entregue'),
    ('8858709f-ef36-45d8-98f4-7d8711628cba','codigo_entregue'),
    ('72c32ec8-bbd2-4d2c-a938-3c24b65848cd','oferta_em_manchete'),
    ('c90713ff-9821-4d92-98c1-c22008fb9609','oferta_em_manchete'),
    ('85006b06-b7db-498e-af9d-4db11be4fd5f','oferta_de_ajuda'),
    ('42c883e5-6c4a-43df-b18f-e7ee866e4ae7','lista_enumerada'),
    ('9e1b454a-7af8-46f4-bdcf-f65fb0c09509','tese_declarada'),
    ('3789f525-7a72-4409-8c80-19cd3a1c1991','antes_e_depois'),
    ('8d87af44-1d73-4e09-a019-ec6efc1196e4','lista_enumerada'),
    ('f32b479b-d0a9-4858-892a-f2864fb0e967','mecanismo_apontado'),
    ('3c462f82-795f-4d85-8e5d-7b6e7b3b8125','comparacao_pareada'),
    ('b005cbd3-94df-4d2a-af76-095fecfccb30','tese_declarada'),
    ('f8e40d35-efa5-448f-9c5f-f720b993e51f','lista_enumerada'),
    ('d6fb99f3-6243-4f33-92c9-d90105900c98','lista_enumerada'),
    ('d5fb804f-8934-4c39-b011-950e20802498','cena_de_uso'),
    ('a2b509a4-2b74-42de-851d-01fe91735847','remocao_de_risco'),
    ('4e9726d1-40fe-40ce-aa81-c2a33b062603','tese_declarada'),
    ('63736c6c-7d1b-4c7c-83ea-bae15599f1d7','comparacao_pareada'),
    ('7d1c214a-abb1-44b6-bb5e-95777fb0f306','comparacao_pareada'),
    ('35a68bb0-7a74-40bc-a342-32ef68605aaf','nao_classificado'),
    ('d699e212-57df-4b68-a80c-2b2aa81372c0','duvida_antecipada'),
    ('753d7e86-f909-4322-93d8-99f0f2381c01','catalogo_por_ocasiao'),
    ('2daabd5e-f366-4130-b6f8-636ad77781f4','nao_classificado'),
    ('3ce59e7b-0b26-4ec7-9de7-5b8ddc9ca4bc','codigo_entregue'),
    ('d2d50046-f27b-42dc-92c6-9c0e83dd57cc','codigo_relembrado'),
    ('f8fd38f6-04d0-4337-a130-31e207510b59','oferta_condicionada'),
    ('3cee424b-5278-4503-9fa7-2afca3b5d13f','oferta_condicionada'),
    ('304bf7ce-6a23-4c68-b3a5-c37f551aaa5f','oferta_condicionada'),
    ('da0b6e11-c681-48af-ae88-316429e25c05','codigo_relembrado'),
    ('69ede46f-1534-431c-bdab-2d7be60ce236','oferta_adiada'),
    ('5a34dbaf-6710-4282-8b7b-3c03921bd6fc','oferta_adiada'),
    ('1e45ed32-01c4-487c-bb60-f986623a3270','carrinho_dinamico'),
    ('c43b3b63-88b8-4527-96d1-da10d19b840e','prova_por_relato'),
    ('c772b4f0-f453-4f08-9862-34e8c1acc66a','vitrine_paralela'),
    ('87bca4da-b37a-42bd-a792-c74b55bf9afb','vitrine_paralela'),
    ('ddad9b06-55f3-423e-8dc6-6f9f2629d104','vitrine_paralela'),
    ('417bf754-cc2c-4b1d-93bb-f429a7f9d4b6','vitrine_paralela'),
    ('640b0a34-8632-4041-8378-38fe804c1516','vitrine_narrada'),
    ('57f25213-768b-4102-9617-3394fac595ce','produto_unico_aprofundado'),
    ('ed0cf7b6-1f7e-4486-b97e-8430d9b49480','vitrine_narrada'),
    ('8ef65206-2f01-408f-ab07-c17f57cc136c','mecanismo_apontado'),
    ('a15a6331-8761-4025-8d70-574c18fcd40b','lineup_de_colecao'),
    ('7bd9e98b-f016-4495-8245-88df69b8f4e1','produto_unico_aprofundado'),
    ('7ef1a9f4-5141-4732-b58c-15628ac8e4a8','vitrine_narrada'),
    ('fc41efe6-a2dc-493a-ab92-75e30fd13198','vitrine_narrada'),
    ('cee34b0a-030c-43df-93b6-c54de6f00569','galeria_de_angulos'),
    ('9c00bf11-22e4-4675-98aa-499aee857d7d','vitrine_paralela'),
    ('2f115df3-1ddd-4ca4-bb45-e3337cef5546','escassez_por_estoque'),
    ('d48deaa4-6d8b-4a09-95fb-e512b676c8d8','prova_por_autoridade'),
    ('32476827-5458-4cc6-af26-f7e428f81521','prova_por_relato'),
    ('f8ed9f85-f0f3-47f3-879a-2dd65aba0f86','prova_por_volume'),
    ('956b9e76-2c97-448e-bbfd-4a97f082e1dd','prova_com_vitrine'),
    ('a8468e9f-c8d8-4c71-b416-6a4f6f5ca0f9','prova_com_vitrine'),
    ('a6a84ff1-3068-4ab4-8ced-9cd0f30fe661','prova_por_volume'),
    ('3af5382a-4c22-4302-801c-4cd80ff2ce82','prova_por_relato'),
    ('35b5d8fd-59b5-4e0f-92ab-a180745242e0','menu_de_saida'),
    ('85557ad0-dc20-48fa-8baf-b14c2e1a147b','menu_de_saida'),
    ('a2bb5abd-931e-4884-aae7-627b11c75f19','assinatura_minima'),
    ('7ba06b7c-8a6a-423b-9478-262fb3c2ce1d','menu_de_saida')
) AS m(id, novo)
WHERE v.id = m.id::uuid;

-- 4. Rede para o que tiver nascido entre a medição e a aplicação: valor do
--    vocabulário ANTIGO que sobrou volta a NULL, não a `nao_classificado`.
--    NULL é fail-open (a variante concorre e o editor mostra o aviso âmbar
--    "ATIVA e sem dispositivo"); `nao_classificado` a ELIMINA de toda
--    posição, e eliminar em silêncio uma variante que alguém acabou de
--    cadastrar é o pior desfecho dos dois.
DO $$
DECLARE n INT;
BEGIN
  UPDATE email_component_variants
  SET dispositivo = NULL
  WHERE dispositivo IS NOT NULL
    AND dispositivo NOT IN ('oferta_em_manchete','campanha_nomeada','oferta_condicionada','oferta_adiada','codigo_entregue','codigo_relembrado','prazo_declarado','tese_declarada','lista_enumerada','mecanismo_apontado','antes_e_depois','comparacao_pareada','duvida_antecipada','pergunta_ao_leitor','cena_de_uso','remocao_de_risco','oferta_de_ajuda','moldura_de_genero','abertura_editorial','vitrine_paralela','vitrine_narrada','produto_unico_aprofundado','galeria_de_angulos','lineup_de_colecao','catalogo_por_ocasiao','escassez_por_estoque','carrinho_dinamico','prova_por_autoridade','prova_por_relato','prova_por_volume','prova_com_vitrine','menu_de_saida','assinatura_minima','nao_classificado');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    RAISE NOTICE 'dispositivos fora do de/para zerados (reclassificar à mão): %', n;
  END IF;
END $$;

-- 5. O CHECK novo. A lista é a mesma de `DISPOSITIVOS`, na mesma ordem.
ALTER TABLE email_component_variants ADD CONSTRAINT ecv_dispositivo_check
  CHECK (dispositivo IS NULL OR dispositivo IN (
        'oferta_em_manchete','campanha_nomeada','oferta_condicionada','oferta_adiada',
        'codigo_entregue','codigo_relembrado','prazo_declarado',
        'tese_declarada','lista_enumerada','mecanismo_apontado','antes_e_depois',
        'comparacao_pareada','duvida_antecipada','pergunta_ao_leitor','cena_de_uso',
        'remocao_de_risco','oferta_de_ajuda','moldura_de_genero','abertura_editorial',
        'vitrine_paralela','vitrine_narrada','produto_unico_aprofundado','galeria_de_angulos',
        'lineup_de_colecao','catalogo_por_ocasiao','escassez_por_estoque','carrinho_dinamico',
        'prova_por_autoridade','prova_por_relato','prova_por_volume','prova_com_vitrine',
        'menu_de_saida','assinatura_minima',
        'nao_classificado'
  ));

COMMENT ON COLUMN email_component_variants.dispositivo IS
  'O MECANISMO do bloco — o que ele faz com o leitor. Vocabulário fechado de 34 valores (17/09), sem prefixo de seção; ver src/lib/agents/shared/dispositivos.ts. NULL = ainda não classificada (filtro fail-open). nao_classificado = julgada e sem mecanismo, elimina de toda posição.';

COMMIT;

-- ── Conferência ───────────────────────────────────────────────────────
-- select dispositivo, count(*) from email_component_variants
--   where is_active group by 1 order by 2 desc, 1;
-- Nenhuma ativa deve sair com dispositivo do vocabulário antigo:
-- select count(*) from email_component_variants where dispositivo is null;

-- ── Rollback ──────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE email_component_variants DROP CONSTRAINT IF EXISTS ecv_dispositivo_check;
-- UPDATE email_component_variants v SET dispositivo = b.dispositivo_antigo
--   FROM bkp_dispositivo_20260917 b WHERE b.id = v.id;
-- ALTER TABLE email_component_variants ADD CONSTRAINT ecv_dispositivo_check
--   CHECK (dispositivo IS NULL OR dispositivo IN (
--     'hero_apresentacao','hero_oferta_cupom','hero_pergunta','hero_lineup',
--     'body_tese','body_mecanismo_visual','body_garantias','body_comparacao','body_faq','body_passos',
--     'products_grade_preco','products_grade_sem_preco','products_unico_oferta','products_galeria',
--     'reviews_2','reviews_3plus','reviews_com_credencial',
--     'offer_cupom','offer_sem_cupom','offer_lembrete',
--     'footer_nav','footer_minimo'
--   ));
-- COMMIT;
