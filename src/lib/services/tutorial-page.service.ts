/**
 * Tutorial Page Service — render publico do tutorial pra cliente.
 *
 * Substitui variaveis {{client_name}}, {{store_name}}, {{platform_name}}
 * em texto/markdown dos blocks antes de retornar pro front publico.
 */

import { createAdminClient } from "@/lib/supabase/server"
import type { TutorialBlock, TutorialPage } from "@/types/onboarding-pipeline"

const PLATFORM_LABEL: Record<string, string> = {
  klaviyo: "Klaviyo",
  omnisend: "Omnisend",
  mailchimp: "Mailchimp",
  activecampaign: "ActiveCampaign",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  other: "sua plataforma de email",
}

export interface RenderedTutorial {
  page: TutorialPage
  context: {
    client_name: string
    store_name: string
    platform_name: string
    platform_login_link: string | null
  }
}

export async function renderTutorialByToken(
  token: string,
): Promise<RenderedTutorial | null> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select(
      "id, org_id, client:clients(name), store:client_stores(store_name, platform)",
    )
    .eq("tutorial_token", token)
    .maybeSingle()
  if (!onb) return null

  // Type narrowing — Supabase pode retornar array (relation)
  type Rel<T> = T | T[] | null
  const clientRow = onb.client as Rel<{ name: string }>
  const storeRow = onb.store as Rel<{ store_name: string; platform: string | null }>
  const client = Array.isArray(clientRow) ? clientRow[0] : clientRow
  const store = Array.isArray(storeRow) ? storeRow[0] : storeRow

  const { data: page } = await admin
    .from("tutorial_pages")
    .select("*")
    .eq("org_id", onb.org_id)
    .eq("slug", "onboarding-implementacao")
    .eq("status", "published")
    .maybeSingle()
  if (!page) return null

  const { data: blocks } = await admin
    .from("tutorial_blocks")
    .select("*")
    .eq("page_id", page.id)
    .order("position", { ascending: true })

  const ctx = {
    client_name: client?.name ?? "cliente",
    store_name: store?.store_name ?? "sua loja",
    platform_name:
      PLATFORM_LABEL[(store?.platform ?? "other").toLowerCase()] ??
      "sua plataforma",
    platform_login_link: null,
  }

  const renderedBlocks = (blocks ?? []).map((b) => ({
    ...b,
    content: renderContent(b.content, ctx),
  })) as TutorialBlock[]

  return {
    page: { ...(page as TutorialPage), blocks: renderedBlocks },
    context: ctx,
  }
}

function renderContent(
  content: Record<string, unknown>,
  ctx: Record<string, string | null>,
): Record<string, unknown> {
  function replace(value: unknown): unknown {
    if (typeof value === "string") {
      return value.replace(
        /\{\{\s*([a-zA-Z_]+)\s*\}\}/g,
        (_, key) => (ctx[key] ?? `{{${key}}}`),
      )
    }
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = replace(v)
      }
      return out
    }
    return value
  }
  return replace(content) as Record<string, unknown>
}

export async function listTutorialPages(orgId: string): Promise<TutorialPage[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("tutorial_pages")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
  return (data ?? []) as TutorialPage[]
}

export async function getTutorialPageWithBlocks(
  orgId: string,
  pageId: string,
): Promise<TutorialPage | null> {
  const admin = createAdminClient()
  const { data: page } = await admin
    .from("tutorial_pages")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", pageId)
    .maybeSingle()
  if (!page) return null
  const { data: blocks } = await admin
    .from("tutorial_blocks")
    .select("*")
    .eq("page_id", pageId)
    .order("position", { ascending: true })
  return { ...(page as TutorialPage), blocks: (blocks ?? []) as TutorialBlock[] }
}
