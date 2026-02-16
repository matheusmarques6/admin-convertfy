import type { User } from "./user"
import type { ClientStore } from "./client"

// Organization & Agent Types
export type OrgRole = "owner" | "manager" | "coordinator" | "copywriter" | "designer" | "developer" | "support" | "analyst"
export type OrgType = "internal" | "agency" | "partner"

export interface Organization {
  id: string
  name: string
  slug: string
  type: OrgType
  settings: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  profile_id: string
  role: OrgRole
  job_title?: string
  is_active: boolean
  invited_by?: string
  invited_at: string
  invite_accepted_at?: string
  created_at: string
  updated_at: string
  // Joined data
  organization?: Organization
  profile?: User
  features?: OrgMemberFeature[]
  store_access?: AgentStoreAccess[]
}

export interface OrgMemberFormData {
  org_id: string
  profile_id?: string
  email?: string
  name?: string
  role: OrgRole
  job_title?: string
  features?: string[]
  store_ids?: string[]
}

export interface FeatureCatalog {
  key: string
  name: string
  description?: string
  category: string
  icon?: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface OrgMemberFeature {
  id: string
  org_member_id: string
  feature_key: string
  enabled: boolean
  granted_by?: string
  granted_at: string
  notes?: string
  // Joined data
  feature?: FeatureCatalog
}

export interface AgentStoreAccess {
  id: string
  org_member_id: string
  store_id: string
  can_view: boolean
  can_edit: boolean
  can_manage_onboarding: boolean
  can_manage_campaigns: boolean
  can_manage_reports: boolean
  assigned_by?: string
  assigned_at: string
  notes?: string
  // Joined data
  store?: ClientStore
  org_member?: OrgMember
}

export interface AgentStoreAccessFormData {
  org_member_id: string
  store_id: string
  can_view?: boolean
  can_edit?: boolean
  can_manage_onboarding?: boolean
  can_manage_campaigns?: boolean
  can_manage_reports?: boolean
  notes?: string
}
