-- ============================================================
-- Buckets de storage do onboarding: fonte de verdade declarativa
--
-- Contexto: uploads do onboarding usavam UM bucket (`onboarding-assets`)
-- criado on-demand por dois endpoints com visibilidade CONFLITANTE:
--   - /api/upload/onboarding          -> createBucket(public: false)  [interno]
--   - /api/forms/[token]/upload       -> createBucket(public: true)   [público]
-- Ambos com `.createBucket(...).catch(() => {})` (engolem "já existe").
-- Quem criava primeiro vencia a corrida; como o interno criava PRIVADO,
-- o `public:true` do form nunca era aplicado e o getPublicUrl() do cliente
-- retornava 404 ("Bucket not found").
--
-- Solução (ADR: dois buckets):
--   - `onboarding-assets`  PRIVADO  -> deliverables/tutoriais internos
--   - `onboarding-public`  PÚBLICO  -> uploads do form do cliente
--
-- Esta migration é a FONTE DE VERDADE dos buckets (declarativa em
-- storage.buckets) e mata a corrida dos ensureBucket dos endpoints —
-- os ensureBucket ficam apenas como defesa extra e idempotente.
--
-- Idempotente: ON CONFLICT no insert + UPDATE incondicional do privado.
-- ============================================================

-- 1. Garante o bucket PÚBLICO do form do cliente (logo, refs, manual).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-public',
  'onboarding-public',
  true,
  15728640, -- 15MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Garante que o bucket interno permaneça PRIVADO (corrige instâncias onde
--    o race o deixou público ou vice-versa).
UPDATE storage.buckets SET public = false WHERE id = 'onboarding-assets';
