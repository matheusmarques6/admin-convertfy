-- ============================================================
-- DIAGNÓSTICO — imagens órfãs no bucket onboarding-visual-assets
-- ============================================================
-- Medido em 08/09/2026: o bucket tinha 2.489 MB, dos quais 2.036 MB em
-- 1.186 arquivos que NENHUMA linha do banco referencia. A origem é o
-- agente de imagem da fase 2: PNG de 1,7 MB de média (maior: 4,9 MB),
-- e a maioria das gerações não chega a e-mail pronto — 61 `ready`
-- contra 356 `failed` e 1.726 `draft`.
--
-- Como ler o resultado: `situacao` = 'orfao' é candidato a exclusão;
-- `apagar` = 'sim' recorta os com mais de 30 dias (793 arquivos,
-- 1.740 MB na medição).
--
-- ⚠️ O QUE ESTA QUERY *NÃO* PROVA. Órfão aqui significa "nada no NOSSO
-- banco aponta". Se um HTML foi copiado para o Klaviyo e o e-mail foi
-- depois regenerado, a imagem antiga fica órfã aqui e VIVA no e-mail já
-- enviado — apagá-la quebra a peça no destino. Isso só se confere no
-- Klaviyo, buscando o UUID do arquivo na URL da imagem. Conferir antes
-- de apagar não é zelo excessivo: é a única verificação possível.
--
-- ⚠️ TODA FONTE NOVA QUE GRAVAR NESTE BUCKET ENTRA NO `ref`. A primeira
-- versão desta query varria só as tabelas de e-mail e classificou como
-- órfão o avatar de contato do inbox que tinha acabado de ser gravado —
-- apagar por aquela lista teria derrubado as fotos de perfil. Por isso
-- as 15 fontes abaixo e a exclusão explícita de `avatar-%`: a trava não
-- substitui a varredura, é o cinto de segurança dela.
-- ============================================================

WITH ref AS (
  SELECT DISTINCT (m)[1] AS arquivo FROM (
    -- Pipeline de e-mail
    SELECT regexp_matches(content::text,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g') AS m
      FROM email_blocks WHERE content::text LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(COALESCE(html,'')||' '||COALESCE(html_marked,'')||' '||COALESCE(html_pre_refiner,''),'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM email_flow_emails WHERE html LIKE '%email-assets%' OR html_marked LIKE '%email-assets%' OR html_pre_refiner LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(html,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM store_email_references WHERE html LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(COALESCE(html,'')||' '||COALESCE(image_map::text,''),'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM email_reference_templates WHERE html LIKE '%email-assets%' OR image_map::text LIKE '%email-assets%'
    -- Campanhas e estúdio de imagem
    UNION ALL SELECT regexp_matches(COALESCE(image_url,'')||' '||COALESCE(image_path,''),'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM campaign_store_emails WHERE COALESCE(image_url,'')||COALESCE(image_path,'') LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(image_url,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM campaign_image_results WHERE image_url LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(COALESCE(image_url,'')||' '||COALESCE(image_path,''),'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM campaign_cut_maps WHERE COALESCE(image_url,'')||COALESCE(image_path,'') LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(image_url,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM image_studio_results WHERE image_url LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(produto_heroi_image_url,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM store_image_overrides WHERE produto_heroi_image_url LIKE '%email-assets%'
    -- Os que NÃO são e-mail e moram no mesmo bucket (a lição desta query)
    UNION ALL SELECT regexp_matches(contact_avatar_url,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM crm_threads WHERE contact_avatar_url LIKE '%email-assets%'          -- foto do contato do inbox
    UNION ALL SELECT regexp_matches(content,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM ai_chat_messages WHERE content LIKE '%email-assets%'                -- imagem gerada pela ConvertIA
    UNION ALL SELECT regexp_matches(config::text,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM crm_channels WHERE config::text LIKE '%email-assets%'               -- avatar do canal (módulo Conteúdo)
    UNION ALL SELECT regexp_matches(dados::text,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM conteudo_documentos WHERE dados::text LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(kit::text,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM conteudo_brand_kits WHERE kit::text LIKE '%email-assets%'
    UNION ALL SELECT regexp_matches(estrutura::text,'email-assets/([0-9a-zA-Z._-]+\.(?:png|jpg|jpeg|webp))','g')
      FROM conteudo_meus_templates WHERE estrutura::text LIKE '%email-assets%'
  ) s
),
obj AS (
  SELECT o.name AS caminho,
         regexp_replace(o.name,'^.*/','') AS arquivo,
         (regexp_match(o.name,'^stores/(?:org-)?([0-9a-fA-F-]{36})/'))[1] AS pasta_id,
         (o.metadata->>'size')::bigint AS bytes,
         o.created_at
    FROM storage.objects o
   WHERE o.bucket_id = 'onboarding-visual-assets'
     AND o.name LIKE '%/email-assets/%'
     -- Avatar nunca é candidato, mesmo que a varredura acima falhe.
     AND o.name NOT LIKE '%/avatar-%'
)
SELECT COALESCE(cs.store_name,'(sem loja no banco)') AS loja,
       o.arquivo,
       round(o.bytes/1048576.0, 2) AS tamanho_mb,
       o.created_at::date AS criado_em,
       extract(day FROM now()-o.created_at)::int AS dias,
       CASE WHEN r.arquivo IS NULL THEN 'orfao' ELSE 'em uso' END AS situacao,
       CASE WHEN r.arquivo IS NULL AND o.created_at < now() - interval '30 days'
            THEN 'sim' ELSE 'nao' END AS apagar,
       o.caminho AS caminho_no_storage
  FROM obj o
  LEFT JOIN ref r ON r.arquivo = o.arquivo
  LEFT JOIN client_stores cs ON cs.id::text = o.pasta_id
 WHERE r.arquivo IS NULL
 ORDER BY o.created_at;
