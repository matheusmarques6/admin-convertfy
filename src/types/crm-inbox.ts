/**
 * Tipos compartilhados do inbox CRM (lista, thread, mensagens, templates
 * e quick replies). Fonte da verdade pros componentes de
 * src/components/crm/inbox/*.
 */

export interface ThreadSummary {
  id: string
  status: string
  contact_name: string | null
  contact_external_id: string
  contact_avatar_url: string | null
  last_message_at: string
  last_message_preview: string | null
  last_message_direction: string | null
  unread_count: number
  assigned_to: string | null
  is_window_open?: boolean | null
  window_expires_at?: string | null
  tags?: string[]
  assignee?: { id: string; name: string; avatar_url: string | null } | null
  channel?: { id: string; type: string; provider?: string | null; display_name: string } | null
}

export interface InboxMessage {
  id: string
  external_id?: string | null
  /** Autor do comentário do Instagram ("@usuario") — metadata->>sender_username. */
  sender_username?: string | null
  direction: "inbound" | "outbound"
  content_type: string
  body: string | null
  media_url: string | null
  media_mime: string | null
  media_storage_path?: string | null
  media_filename?: string | null
  media_size?: number | null
  sent_by_kind: string
  status: string
  created_at: string
  error_code?: string | null
  error_message?: string | null
  sender?: { id: string; name: string; avatar_url: string | null } | null
}

export interface ThreadDetail {
  thread: {
    id: string
    contact_name: string | null
    contact_external_id: string
    contact_avatar_url?: string | null
    status: string
    assigned_to: string | null
    lead_id: string | null
    deal_id: string | null
    client_id: string | null
    channel_id: string
    last_message_at?: string | null
    last_message_direction?: string | null
    is_window_open?: boolean | null
    window_expires_at?: string | null
    tags?: string[]
    /** {kind:"comments", media_id} nas threads de comentário do Instagram. */
    metadata?: Record<string, unknown> | null
    channel?: { id: string; type: string; provider?: string | null; display_name: string }
    assignee?: { id: string; name: string; avatar_url: string | null } | null
    // Vínculos com o resto do CRM: a API sempre devolveu e a tela nunca
    // mostrou — é o contexto que evita atender às cegas.
    lead?: { id: string; name: string | null; status: string | null } | null
    deal?: {
      id: string
      title: string | null
      status: string | null
      value?: number | null
      pipeline_id: string | null
      stage_id: string | null
    } | null
    client?: { id: string; name: string | null; email: string | null; phone: string | null } | null
  }
  messages: InboxMessage[]
}

export interface WhatsAppTemplate {
  id: string
  name: string
  language: string
  category: string | null
  status: string
  header_type: string | null
  header_text: string | null
  body_text: string | null
  body_variables: number
  footer_text: string | null
  use_count: number
}

export interface QuickReply {
  id: string
  shortcut: string
  title: string | null
  body: string
}

export interface OrgMemberOption {
  profileId: string
  name: string
  avatarUrl: string | null
}
