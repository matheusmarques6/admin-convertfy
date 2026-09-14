-- DADOS (não é migration): backfill de `dispositivo` e `anatomia_slug` nas
-- 44 variantes de `email_component_variants` (B3, 14/09/2026).
--
-- É CURADORIA, não código: cada linha foi classificada lendo nome,
-- descrição, when_use e output_schema da variante (levantamento pelo banco,
-- decisão do dono em 14/09). A coluna continua NULLABLE e editável na aba
-- Componentes — a classificação abaixo é PROPOSTA aplicada, reversível com
-- o rollback do fim. Confiança por linha: alta | media | baixa (baixa = o
-- vocabulário não tem o valor exato; o mais próximo foi usado e o Bruno
-- decide se cria valor novo ou reclassifica).
--
-- Lacunas que o backfill REVELA (nenhuma variante ativa):
--   products_grade_preco  — nenhuma grade mostra preço (só produtos 4, item único)
--   reviews_2             — os de 2 depoimentos (review 1/2/3) têm credencial
--   body_faq              — só body 7, INATIVA e sem schema
--   body_passos           — só body 10, INATIVA
--   hero_apresentacao     — nenhuma hero sem oferta/pergunta/lineup
-- São exatamente as famílias da rodada inicial do gerador (B4).

-- ── hero ──────────────────────────────────────────────────────────────
update email_component_variants set dispositivo = 'hero_lineup'       where id = 'dc6c363c-7d4f-4c70-a163-632bcadfdce6'; -- hero section 10 (alta: rotina/kit/linha)
update email_component_variants set dispositivo = 'hero_lineup'       where id = '43f9b0ec-9ebc-4657-b1ef-9cfd5a521895'; -- welcome - hero sectiion 8 (alta)
update email_component_variants set dispositivo = 'hero_pergunta'     where id = '3e241d7f-5f84-4017-a553-880736a450dc'; -- welcome - hero section 2 (alta: headline é pergunta comparativa)
update email_component_variants set dispositivo = 'hero_oferta_cupom' where id = 'd9e34a1f-7bc7-47e8-9081-53600b104dd2'; -- welcome - hero section 3 (alta: cupom de captação)
update email_component_variants set dispositivo = 'hero_oferta_cupom' where id = 'e447ef06-95e2-4c5d-9b6f-c3e0b895f8d2'; -- welcome - hero section 4 (alta: entrega cupom)
update email_component_variants set dispositivo = 'hero_oferta_cupom' where id = '8858709f-ef36-45d8-98f4-7d8711628cba'; -- welcome - hero section 5 (alta: resgate do cupom)
update email_component_variants set dispositivo = 'hero_oferta_cupom' where id = '72c32ec8-bbd2-4d2c-a938-3c24b65848cd'; -- welcome - hero section 6 (alta: percentual + coupon_line)
update email_component_variants set dispositivo = 'hero_oferta_cupom' where id = 'c90713ff-9821-4d92-98c1-c22008fb9609'; -- welcome - hero section 7 (media: oferta SEM cupom — o vocabulário só tem oferta_cupom; contrato tem_cupom=false distingue)
update email_component_variants set dispositivo = 'hero_pergunta'     where id = '85006b06-b7db-498e-af9d-4db11be4fd5f'; -- welcome - hero section 9 (alta: "posso ajudar?")

-- ── body ──────────────────────────────────────────────────────────────
update email_component_variants set dispositivo = 'body_passos'            where id = '42c883e5-6c4a-43df-b18f-e7ee866e4ae7'; -- body 10 - listicle 3 dicas (alta; INATIVA)
update email_component_variants set dispositivo = 'body_tese'              where id = 'd5fb804f-8934-4c39-b011-950e20802498'; -- body 2 - bridge textos linha produtos (media: título + 2 parágrafos + colagem)
update email_component_variants set dispositivo = 'body_garantias'         where id = '4e9726d1-40fe-40ce-aa81-c2a33b062603'; -- body 3 - bridge features cards (alta: 3 selos circulares de valores)
update email_component_variants set dispositivo = 'body_comparacao'        where id = '63736c6c-7d1b-4c7c-83ea-bae15599f1d7'; -- body 4 - bridge fundo cards (alta: nós × os outros)
update email_component_variants set dispositivo = 'body_comparacao'        where id = '7d1c214a-abb1-44b6-bb5e-95777fb0f306'; -- body 5 - comparison table (alta; INATIVA)
update email_component_variants set dispositivo = 'body_mecanismo_visual'  where id = '35a68bb0-7a74-40bc-a342-32ef68605aaf'; -- body 6 - skin minimalism 101 (baixa; INATIVA, sem schema)
update email_component_variants set dispositivo = 'body_faq'               where id = 'd699e212-57df-4b68-a80c-2b2aa81372c0'; -- body 7 - bridge FAQ (alta; INATIVA, sem schema)
update email_component_variants set dispositivo = 'body_tese'              where id = '753d7e86-f909-4322-93d8-99f0f2381c01'; -- body 8 - cards vidro (baixa: explorar catálogo por ocasião — título + sub + CTA + composição)
update email_component_variants set dispositivo = 'body_mecanismo_visual'  where id = '2daabd5e-f366-4130-b6f8-636ad77781f4'; -- body 9 - key features pílulas (media; INATIVA, sem schema)

-- ── footer ────────────────────────────────────────────────────────────
update email_component_variants set dispositivo = 'footer_nav'    where id = '35b5d8fd-59b5-4e0f-92ab-a180745242e0'; -- footer 1 (alta: menu 2×3)
update email_component_variants set dispositivo = 'footer_nav'    where id = '85557ad0-dc20-48fa-8baf-b14c2e1a147b'; -- footer 2 (alta: 5 botões)
update email_component_variants set dispositivo = 'footer_minimo' where id = 'a2bb5abd-931e-4884-aae7-627b11c75f19'; -- footer 3 - dark (alta: 3 links)
update email_component_variants set dispositivo = 'footer_nav'    where id = '7ba06b7c-8a6a-423b-9478-262fb3c2ce1d'; -- footer 4 - dark (alta: mega-menu 7 links)

-- ── offer ─────────────────────────────────────────────────────────────
update email_component_variants set dispositivo = 'offer_sem_cupom' where id = '3cee424b-5278-4503-9fa7-2afca3b5d13f'; -- offer 1 (alta: condição comercial sem imagem, sem cupom)
update email_component_variants set dispositivo = 'offer_sem_cupom' where id = '304bf7ce-6a23-4c68-b3a5-c37f551aaa5f'; -- offer 2 (media: duas ofertas de data comemorativa, sem código)
update email_component_variants set dispositivo = 'offer_lembrete'  where id = 'da0b6e11-c681-48af-ae88-316429e25c05'; -- offer 3 (alta: lembrete de cupom não usado)
update email_component_variants set dispositivo = 'offer_cupom'     where id = '69ede46f-1534-431c-bdab-2d7be60ce236'; -- offer 4 (alta; INATIVA: manifesto + cupom)
update email_component_variants set dispositivo = 'offer_cupom'     where id = '5a34dbaf-6710-4282-8b7b-3c03921bd6fc'; -- offer 5 (alta; INATIVA: diferenciais + cupom no fim)
update email_component_variants set dispositivo = 'offer_cupom'     where id = '1e45ed32-01c4-487c-bb60-f986623a3270'; -- offer 6 (alta: carrinho + cupom)

-- ── products ──────────────────────────────────────────────────────────
update email_component_variants set dispositivo = 'products_grade_sem_preco' where id = '640b0a34-8632-4041-8378-38fe804c1516'; -- produto 8 - 4 produtos (alta)
update email_component_variants set dispositivo = 'products_unico_oferta'    where id = '8ef65206-2f01-408f-ab07-c17f57cc136c'; -- produtos 2 - Three Ingredients (baixa: 1 foto central + 3 marcadores de composição; sem oferta — candidato a body_mecanismo_visual)
update email_component_variants set dispositivo = 'products_galeria'         where id = 'a15a6331-8761-4025-8d70-574c18fcd40b'; -- produtos 3 - grid 4 produtos (media: foto de campanha em arco + lista de novidades)
update email_component_variants set dispositivo = 'products_unico_oferta'    where id = '7bd9e98b-f016-4495-8245-88df69b8f4e1'; -- produtos 4 - um produto (alta: preço antes/depois + prazo)
update email_component_variants set dispositivo = 'products_grade_sem_preco' where id = '7ef1a9f4-5141-4732-b58c-15628ac8e4a8'; -- produtos 5 - 3 produtos mesmo fundo (media: selo de percentual, sem preço em moeda)
update email_component_variants set dispositivo = 'products_grade_sem_preco' where id = 'fc41efe6-a2dc-493a-ab92-75e30fd13198'; -- produtos 6 (alta: 2 produtos, foto/nome/descrição)
update email_component_variants set dispositivo = 'products_galeria'         where id = 'cee34b0a-030c-43df-93b6-c54de6f00569'; -- produtos 7 - dois produtos (media: painéis com foto grande + 3 miniaturas)
update email_component_variants set dispositivo = 'products_grade_sem_preco' where id = '9c00bf11-22e4-4675-98aa-499aee857d7d'; -- produtos 8 - 9 produtos (alta)
update email_component_variants set dispositivo = 'products_grade_sem_preco' where id = '2f115df3-1ddd-4ca4-bb45-e3337cef5546'; -- produtos 9 - 4 produtos (alta: grade de tamanhos, sem preço)

-- ── reviews ───────────────────────────────────────────────────────────
update email_component_variants set dispositivo = 'reviews_com_credencial' where id = 'd48deaa4-6d8b-4a09-95fb-e512b676c8d8'; -- review 1 (alta: 2 depoimentos com cargo/autoridade)
update email_component_variants set dispositivo = 'reviews_com_credencial' where id = '7dafa6ca-65de-4907-b52c-dad83ecd63a4'; -- review 2 (alta: review_x_credential)
update email_component_variants set dispositivo = 'reviews_com_credencial' where id = 'cff6c8d8-a0da-4c80-90fa-1875174a75a1'; -- review 3 (alta: idem review 2)
update email_component_variants set dispositivo = 'reviews_3plus'          where id = 'f8ed9f85-f0f3-47f3-879a-2dd65aba0f86'; -- review 5 (alta: 3 depoimentos)
update email_component_variants set dispositivo = 'reviews_3plus'          where id = '956b9e76-2c97-448e-bbfd-4a97f082e1dd'; -- review 6 (alta: 3 por variante)
update email_component_variants set dispositivo = 'reviews_3plus'          where id = 'a8468e9f-c8d8-4c71-b416-6a4f6f5ca0f9'; -- review 7 (alta: 3 em zigue-zague + cupom)
update email_component_variants set dispositivo = 'reviews_3plus'          where id = 'd92f812f-d83e-4e82-99a6-11286eba0e07'; -- review 8 (alta: 3 UGC)

-- ── anatomia_slug: slug da nota do vault quando existe, senão o nome ────
update email_component_variants v
   set anatomia_slug = d.slug
  from email_vault_docs d
 where d.kind = 'variante' and d.variant_id = v.id and v.anatomia_slug is null;

-- Sem a extensão unaccent neste projeto: translate cobre os acentos do pt-BR.
update email_component_variants
   set anatomia_slug = regexp_replace(regexp_replace(translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')
 where anatomia_slug is null;

-- Verificação
-- select dispositivo, count(*) filter (where is_active) as ativas, count(*) as total
--   from email_component_variants group by 1 order by 1;

-- Rollback
-- update email_component_variants set dispositivo = null, anatomia_slug = null;
