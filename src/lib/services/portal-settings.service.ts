/**
 * Portal Settings Service
 *
 * Builds the portal settings payload (profile + notification preferences)
 * for a portal user.
 *
 * Extracted from portal/settings/route.ts so Server Components can call
 * it directly without an HTTP hop.
 */

import { SupabaseClient } from "@supabase/supabase-js"

export interface PortalSettingsData {
  profile: {
    id: string
    name: string
    email: string
    phone: string | null
    avatar_url: string | null
  }
  notifications: Record<string, unknown>
}

const DEFAULT_NOTIFICATIONS = {
  email_report_weekly: true,
  email_report_monthly: true,
  email_invoice_reminder: true,
  email_invoice_paid: true,
  email_campaign_sent: false,
  email_performance_alerts: false,
}

export async function buildPortalSettings(
  filter: { authUserId: string } | { portalUserId: string },
  client: SupabaseClient
): Promise<PortalSettingsData | null> {
  let query = client
    .from("client_portal_users")
    .select("id, name, email, phone, avatar_url, client_id")
    .eq("is_active", true)

  query =
    "authUserId" in filter
      ? query.eq("auth_user_id", filter.authUserId)
      : query.eq("id", filter.portalUserId)

  const { data: portalUser } = await query.single()

  if (!portalUser) return null

  const { data: notifications } = await client
    .from("client_notification_preferences")
    .select("*")
    .eq("portal_user_id", portalUser.id)
    .single()

  return {
    profile: {
      id: portalUser.id,
      name: portalUser.name,
      email: portalUser.email,
      phone: portalUser.phone,
      avatar_url: portalUser.avatar_url,
    },
    notifications: notifications || DEFAULT_NOTIFICATIONS,
  }
}
