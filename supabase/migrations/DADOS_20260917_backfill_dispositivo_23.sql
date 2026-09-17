-- DADOS (não é migration): dispositivo das 23 variantes ATIVAS que
-- entraram na biblioteca depois do backfill de 14/09 e ficaram sem
-- classificação (17/09/2026).
--
-- Por que importa: `conflitoDeDispositivo` é FAIL-OPEN — variante sem
-- dispositivo nunca é eliminada, então as 23 concorrem em TODA posição da
-- seção delas. Medido na run 04e71599 (Hero Boxers welcome 1, 17/09): a
-- posição que pediu `body_tese` viu 11 finalistas, contra 1 da posição que
-- pediu `body_garantias`. As 12 body não classificadas são a diferença.
--
-- É CURADORIA, não código: cada linha foi classificada lendo nome,
-- descrição e output_schema pelo banco; decisões do dono em 17/09. A coluna
-- continua NULLABLE e editável na aba Componentes — a classificação abaixo
-- é PROPOSTA aplicada, reversível com o rollback do fim.
--
-- Endereçado por ID, nunca por nome: há nome duplicado na biblioteca
-- ("body 21" em duas variantes diferentes, uma de garantias e outra de
-- brinde com cupom). Idempotente: `where dispositivo is null`.
--
-- ── APLICADO em 17/09/2026 ────────────────────────────────────────────
--   ANTES:  ativas sem dispositivo = 23  (12 body · 7 products · 3 reviews · 1 hero)
--   DEPOIS: ativas sem dispositivo = 0
--   `body` perdeu 3 (viraram `offer`), `offer` ganhou 3.
--   Pool final (65 ativas, 19 combinações seção × dispositivo, nenhuma vazia):
--     body:     tese 4 · mecanismo_visual 3 · comparacao 2 · garantias 2 · passos 2
--     hero:     oferta_cupom 10 · apresentacao 4 · lineup 2 · pergunta 2
--     products: grade_sem_preco 10 · galeria 4 · unico_oferta 2
--     reviews:  3plus 4 · com_credencial 3
--     offer:    cupom 4 · sem_cupom 2 · lembrete 1
--     footer:   nav 3 · minimo 1
--   Seguem SEM variante ativa (lacunas de biblioteca, não deste arquivo):
--     `body_faq` · `products_grade_preco` · `reviews_2`

-- ── 1. Mudam de SEÇÃO: body → offer ───────────────────────────────────
-- Têm campo de cupom e são blocos de oferta. O vocabulário de `body` não
-- tem valor para oferta; o de `offer` tem. Elas nunca foram PEDIDAS como
-- body — sem dispositivo, só entravam por fail-open.
update email_component_variants set block_type = 'offer', dispositivo = 'offer_cupom'
  where id = '3ce59e7b-0b26-4ec7-9de7-5b8ddc9ca4bc' and dispositivo is null; -- body 11  (gift_coupon_code — vale-presente)
update email_component_variants set block_type = 'offer', dispositivo = 'offer_cupom'
  where id = 'd2d50046-f27b-42dc-92c6-9c0e83dd57cc' and dispositivo is null; -- body 20  (cart_coupon_code — recuperação de checkout)
update email_component_variants set block_type = 'offer', dispositivo = 'offer_cupom'
  where id = 'f8fd38f6-04d0-4337-a130-31e207510b59' and dispositivo is null; -- body 21  (gift_coupon_line — brinde)

-- ── 2. body (9) ───────────────────────────────────────────────────────
update email_component_variants set dispositivo = 'body_tese'              where id = '9e1b454a-7af8-46f4-bdcf-f65fb0c09509' and dispositivo is null; -- body 12 (alta: título + copy + botão sobre degradê)
update email_component_variants set dispositivo = 'body_mecanismo_visual'  where id = '3789f525-7a72-4409-8c80-19cd3a1c1991' and dispositivo is null; -- body 13 (alta: duas fotos lado a lado com etiqueta — prova visual)
update email_component_variants set dispositivo = 'body_passos'            where id = '8d87af44-1d73-4e09-a019-ec6efc1196e4' and dispositivo is null; -- body 14 (media: 3 itens "benefícios OU etapas" — sem numeração explícita)
update email_component_variants set dispositivo = 'body_mecanismo_visual'  where id = 'f32b479b-d0a9-4858-892a-f2864fb0e967' and dispositivo is null; -- body 15 (alta: foto grande + 4 chamadas com linha indicadora)
update email_component_variants set dispositivo = 'body_comparacao'        where id = '3c462f82-795f-4d85-8e5d-7b6e7b3b8125' and dispositivo is null; -- body 16 (alta: nós × eles, 6 critérios em 3 colunas)
update email_component_variants set dispositivo = 'body_tese'              where id = 'b005cbd3-94df-4d2a-af76-095fecfccb30' and dispositivo is null; -- body 17 (alta: headline + CTA + foto sangrada)
update email_component_variants set dispositivo = 'body_passos'            where id = 'f8e40d35-efa5-448f-9c5f-f720b993e51f' and dispositivo is null; -- body 18 (alta: 5 itens com círculo numerado)
update email_component_variants set dispositivo = 'body_mecanismo_visual'  where id = 'd6fb99f3-6243-4f33-92c9-d90105900c98' and dispositivo is null; -- body 19 (alta: 3 cards de atributo com ícone)
update email_component_variants set dispositivo = 'body_garantias'         where id = 'a2b509a4-2b74-42de-851d-01fe91735847' and dispositivo is null; -- body 21 (alta: trust_icon_1..3 + headline)

-- ── 3. products (7) ───────────────────────────────────────────────────
-- Nenhuma tem campo de preço — por isso nenhuma é `products_grade_preco`,
-- que segue sem variante ativa (lacuna já registrada em 14/09).
update email_component_variants set dispositivo = 'products_galeria'          where id = 'c43b3b63-88b8-4527-96d1-da10d19b840e' and dispositivo is null; -- produto 10  (media: 1 produto + depoimento, foto grande)
update email_component_variants set dispositivo = 'products_galeria'          where id = '57f25213-768b-4102-9617-3394fac595ce' and dispositivo is null; -- produtos 11 (alta: 1 produto, foto grande, 3 features)
update email_component_variants set dispositivo = 'products_grade_sem_preco'  where id = 'c772b4f0-f453-4f08-9862-34e8c1acc66a' and dispositivo is null; -- produto 12  (alta: grade 2×2, botão por card)
update email_component_variants set dispositivo = 'products_grade_sem_preco'  where id = 'ed0cf7b6-1f7e-4486-b97e-8430d9b49480' and dispositivo is null; -- produtos 13 (alta: 3–4 itens em linhas alternadas)
update email_component_variants set dispositivo = 'products_grade_sem_preco'  where id = '87bca4da-b37a-42bd-a792-c74b55bf9afb' and dispositivo is null; -- produto 14  (alta: grade 2×2 enxuta)
update email_component_variants set dispositivo = 'products_grade_sem_preco'  where id = 'ddad9b06-55f3-423e-8dc6-6f9f2629d104' and dispositivo is null; -- produto 15  (media: grade 2×2 com coupon_line no fim)
update email_component_variants set dispositivo = 'products_grade_sem_preco'  where id = '417bf754-cc2c-4b1d-93bb-f429a7f9d4b6' and dispositivo is null; -- produto 16  (alta: 2 produtos em cards bipartidos)

-- ── 4. reviews (3) ────────────────────────────────────────────────────
-- LIMITE DECLARADO: o vocabulário pula de `reviews_2` para `reviews_3plus`
-- e não nomeia "um depoimento". Decisão do dono (17/09): as de 1 usam
-- `reviews_com_credencial`, que é o que o selo `verified_label` entrega.
-- Quem controla a quantidade nelas passa a ser o requisito `n_itens` do
-- Estruturador, não o dispositivo.
update email_component_variants set dispositivo = 'reviews_3plus'           where id = 'a6a84ff1-3068-4ab4-8ced-9cd0f30fe661' and dispositivo is null; -- review 8  (alta: 3 depoimentos)
update email_component_variants set dispositivo = 'reviews_com_credencial'  where id = '3af5382a-4c22-4302-801c-4cd80ff2ce82' and dispositivo is null; -- review 9  (media: 1 depoimento com verified_label)
update email_component_variants set dispositivo = 'reviews_com_credencial'  where id = '32476827-5458-4cc6-af26-f7e428f81521' and dispositivo is null; -- review 10 (media: 1 depoimento com verified_label)

-- ── 5. hero (1) ───────────────────────────────────────────────────────
-- A CONFERIR com quem cadastrou: a descrição diz "bloco de oferta", mas o
-- schema não tem campo de cupom nem de percentual. Classificada pelo que o
-- schema entrega, não pelo que a descrição promete.
update email_component_variants set dispositivo = 'hero_apresentacao'  where id = 'e156f52e-4046-44be-a1e3-cc325a10e405' and dispositivo is null; -- hero seciton 19 (baixa: estética retrô, sem cupom)

-- ── Conferência ───────────────────────────────────────────────────────
-- select count(*) from email_component_variants where is_active and (dispositivo is null or dispositivo = '');
--   → esperado: 0
-- select block_type, dispositivo, count(*) from email_component_variants
--   where is_active group by 1,2 order by 1,2;
--   → `offer` ganha 3 · `body` perde 3 · nenhuma (seção × dispositivo) que
--     tinha variante pode ter ficado vazia.

-- ── Higiene de cadastro que este arquivo NÃO faz ──────────────────────
-- Nome com erro de digitação e espaço no fim ("hero seciton 19 ", "body 19 ")
-- e nome REPETIDO entre duas variantes diferentes ("body 21" ×2). Nome
-- duplicado faz o `buildAliasIndex` (catalog-builder.ts) descartar o apelido
-- por ambiguidade — o Curador não consegue escolher nenhuma das duas pelo
-- nome. Renomear é decisão de quem cadastrou, pela aba Componentes.

-- ── ROLLBACK ──────────────────────────────────────────────────────────
-- update email_component_variants set block_type = 'body', dispositivo = null
--   where id in ('3ce59e7b-0b26-4ec7-9de7-5b8ddc9ca4bc','d2d50046-f27b-42dc-92c6-9c0e83dd57cc','f8fd38f6-04d0-4337-a130-31e207510b59');
-- update email_component_variants set dispositivo = null where id in (
--   '9e1b454a-7af8-46f4-bdcf-f65fb0c09509','3789f525-7a72-4409-8c80-19cd3a1c1991','8d87af44-1d73-4e09-a019-ec6efc1196e4',
--   'f32b479b-d0a9-4858-892a-f2864fb0e967','3c462f82-795f-4d85-8e5d-7b6e7b3b8125','b005cbd3-94df-4d2a-af76-095fecfccb30',
--   'f8e40d35-efa5-448f-9c5f-f720b993e51f','d6fb99f3-6243-4f33-92c9-d90105900c98','a2b509a4-2b74-42de-851d-01fe91735847',
--   'c43b3b63-88b8-4527-96d1-da10d19b840e','57f25213-768b-4102-9617-3394fac595ce','c772b4f0-f453-4f08-9862-34e8c1acc66a',
--   'ed0cf7b6-1f7e-4486-b97e-8430d9b49480','87bca4da-b37a-42bd-a792-c74b55bf9afb','ddad9b06-55f3-423e-8dc6-6f9f2629d104',
--   '417bf754-cc2c-4b1d-93bb-f429a7f9d4b6','a6a84ff1-3068-4ab4-8ced-9cd0f30fe661','3af5382a-4c22-4302-801c-4cd80ff2ce82',
--   '32476827-5458-4cc6-af26-f7e428f81521','e156f52e-4046-44be-a1e3-cc325a10e405');
