import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export interface OnboardingClient {
  id: string
  name: string
  email: string | null
  company: string | null
  status: string
  onboarding_stage: 'entrada' | 'design_producao' | 'implementando' | 'estrutura_pronta' | 'concluido' | null
  onboarding_started_at: string | null
  onboarding_completed_at: string | null
  onboarding_assigned_to: string | null
  onboarding_assigned_to_name: string | null
  onboarding_notes: string | null
  created_at: string
  // Briefing info
  has_briefing: boolean
  store_url: string | null
  platform: string | null
  // Store count
  stores_count: number
  has_integrations: boolean
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const stage = searchParams.get('stage')
    const includeCompleted = searchParams.get('include_completed') === 'true'

    // Fetch clients with onboarding info
    let query = supabase
      .from('clients')
      .select(`
        id,
        name,
        email,
        company,
        status,
        onboarding_stage,
        onboarding_started_at,
        onboarding_completed_at,
        onboarding_assigned_to,
        onboarding_notes,
        created_at,
        profiles:onboarding_assigned_to (
          name
        ),
        client_briefings (
          id,
          store_url,
          platform
        ),
        client_stores (
          id,
          is_active,
          shopify_access_token,
          klaviyo_private_key
        )
      `)
      .order('created_at', { ascending: false })

    // Filter by stage if provided
    if (stage) {
      query = query.eq('onboarding_stage', stage)
    } else if (!includeCompleted) {
      // By default, exclude completed unless explicitly requested
      query = query.or('onboarding_stage.neq.concluido,onboarding_stage.is.null')
    }

    const { data: clients, error } = await query

    if (error) {
      console.error('Error fetching onboarding clients:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Process clients
    const processedClients: OnboardingClient[] = (clients || []).map((client) => {
      const profileData = client.profiles as unknown as { name: string } | null
      const briefingData = client.client_briefings as unknown as Array<{ id: string; store_url: string; platform: string }> | null
      const storesData = client.client_stores as unknown as Array<{ id: string; is_active: boolean; shopify_access_token: string; klaviyo_private_key: string }> | null

      const briefing = briefingData?.[0] || null
      const stores = storesData || []
      const activeStores = stores.filter(s => s.is_active)
      const hasIntegrations = activeStores.some(s => s.shopify_access_token || s.klaviyo_private_key)

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        company: client.company,
        status: client.status,
        onboarding_stage: client.onboarding_stage,
        onboarding_started_at: client.onboarding_started_at,
        onboarding_completed_at: client.onboarding_completed_at,
        onboarding_assigned_to: client.onboarding_assigned_to,
        onboarding_assigned_to_name: profileData?.name || null,
        onboarding_notes: client.onboarding_notes,
        created_at: client.created_at,
        has_briefing: !!briefing,
        store_url: briefing?.store_url || null,
        platform: briefing?.platform || null,
        stores_count: activeStores.length,
        has_integrations: hasIntegrations,
      }
    })

    // Group by stage for Kanban view
    const stages = {
      entrada: processedClients.filter(c => c.onboarding_stage === 'entrada' || c.onboarding_stage === null),
      design_producao: processedClients.filter(c => c.onboarding_stage === 'design_producao'),
      implementando: processedClients.filter(c => c.onboarding_stage === 'implementando'),
      estrutura_pronta: processedClients.filter(c => c.onboarding_stage === 'estrutura_pronta'),
      concluido: processedClients.filter(c => c.onboarding_stage === 'concluido'),
    }

    return NextResponse.json({
      success: true,
      clients: processedClients,
      stages,
      summary: {
        total: processedClients.length,
        entrada: stages.entrada.length,
        design_producao: stages.design_producao.length,
        implementando: stages.implementando.length,
        estrutura_pronta: stages.estrutura_pronta.length,
        concluido: stages.concluido.length,
      }
    })
  } catch (error) {
    console.error('Error in onboarding API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Create a new client for onboarding (from form submission)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      name,
      email,
      phone,
      company,
      // Briefing fields
      store_name,
      store_url,
      platform,
      contact_name,
      contact_email,
      contact_phone,
      contact_whatsapp,
      shopify_store_url,
      shopify_access_token,
      klaviyo_public_key,
      klaviyo_private_key,
      monthly_revenue,
      products_count,
      main_products,
      target_audience,
      brand_voice,
      competitors,
      current_email_tool,
      email_list_size,
      has_welcome_flow,
      has_abandoned_cart_flow,
      has_post_purchase_flow,
      main_goals,
      expected_results,
      timeline_expectations,
      additional_notes,
    } = body

    // Create the client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: name || store_name || 'Novo Cliente',
        email: email || contact_email,
        phone: phone || contact_phone,
        company: company || store_name,
        status: 'onboarding',
        onboarding_stage: 'entrada',
        onboarding_started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (clientError) {
      console.error('Error creating client:', clientError)
      return NextResponse.json({ success: false, error: clientError.message }, { status: 500 })
    }

    // Create the briefing
    const { error: briefingError } = await supabase
      .from('client_briefings')
      .insert({
        client_id: client.id,
        store_name,
        store_url,
        platform,
        contact_name,
        contact_email: contact_email || email,
        contact_phone: contact_phone || phone,
        contact_whatsapp,
        shopify_store_url,
        shopify_access_token,
        klaviyo_public_key,
        klaviyo_private_key,
        monthly_revenue,
        products_count,
        main_products,
        target_audience,
        brand_voice,
        competitors,
        current_email_tool,
        email_list_size,
        has_welcome_flow,
        has_abandoned_cart_flow,
        has_post_purchase_flow,
        main_goals,
        expected_results,
        timeline_expectations,
        additional_notes,
        form_submitted_at: new Date().toISOString(),
        form_source: 'manual',
      })

    if (briefingError) {
      console.error('Error creating briefing:', briefingError)
      // Don't fail the request, just log the error
    }

    // Create a store if we have the URL
    if (store_url || shopify_store_url) {
      const { error: storeError } = await supabase
        .from('client_stores')
        .insert({
          client_id: client.id,
          store_name: store_name || name || 'Loja Principal',
          store_url: store_url || shopify_store_url,
          platform: platform || 'shopify',
          shopify_access_token,
          klaviyo_private_key,
          is_active: true,
        })

      if (storeError) {
        console.error('Error creating store:', storeError)
      }
    }

    return NextResponse.json({
      success: true,
      client,
    })
  } catch (error) {
    console.error('Error in onboarding POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
