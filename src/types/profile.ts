// ── Profile (espelho da tabela profiles do Supabase) ──────
//
// Centraliza o tipo de perfil interno. Componentes legados
// declaram interfaces locais (UserProfile, ProfileData) — novos
// codigos devem importar Profile daqui.
//
// Coluna `tags TEXT[]` adicionada pela migration
// 20260530_agent_email_generation.sql (Epic AE). Usada por
// notification.service para roteamento baseado em tag
// (ex: tag 'cto' para alertas de falha de geracao de email).

import type { UserRole } from "./user"

export interface Profile {
  id: string
  email: string
  name: string | null
  avatar_url?: string | null
  role?: UserRole
  /**
   * Tags livres para roteamento de notificacoes / segmentacao.
   * Default `[]`. Padrao identico ao usado em `clients.tags`.
   *
   * Rotas conhecidas:
   *   - 'cto' → recebe alertas de falha do pipeline AE
   *   - 'designer_lead' → reservada para uso futuro
   */
  tags: string[]
  created_at?: string
  updated_at?: string
}
