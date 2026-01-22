import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Get client briefing
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createClient()
    const { clientId } = await params

    const { data: briefing, error } = await supabase
      .from('client_briefings')
      .select('*')
      .eq('client_id', clientId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching briefing:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      briefing,
    })
  } catch (error) {
    console.error('Error in briefing GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Create or update client briefing
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createClient()
    const { clientId } = await params
    const body = await request.json()

    // Check if briefing already exists
    const { data: existing } = await supabase
      .from('client_briefings')
      .select('id')
      .eq('client_id', clientId)
      .single()

    let briefing
    let error

    if (existing) {
      // Update existing briefing
      const result = await supabase
        .from('client_briefings')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq('client_id', clientId)
        .select()
        .single()

      briefing = result.data
      error = result.error
    } else {
      // Create new briefing
      const result = await supabase
        .from('client_briefings')
        .insert({
          client_id: clientId,
          ...body,
          form_submitted_at: new Date().toISOString(),
          form_source: 'manual',
        })
        .select()
        .single()

      briefing = result.data
      error = result.error
    }

    if (error) {
      console.error('Error saving briefing:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      briefing,
    })
  } catch (error) {
    console.error('Error in briefing POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Generate AI briefing summary
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createClient()
    const { clientId } = await params

    // Fetch briefing data
    const { data: briefing, error: fetchError } = await supabase
      .from('client_briefings')
      .select('*')
      .eq('client_id', clientId)
      .single()

    if (fetchError) {
      return NextResponse.json({ success: false, error: 'Briefing not found' }, { status: 404 })
    }

    // Generate AI summary (placeholder - integrate with OpenAI/Claude later)
    const aiSummary = generateBriefingSummary(briefing)

    // Update briefing with AI summary
    const { data: updated, error: updateError } = await supabase
      .from('client_briefings')
      .update({
        ai_briefing_summary: aiSummary,
        ai_generated_at: new Date().toISOString(),
      })
      .eq('client_id', clientId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating AI summary:', updateError)
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      briefing: updated,
    })
  } catch (error) {
    console.error('Error in briefing PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to generate briefing summary
function generateBriefingSummary(briefing: Record<string, unknown>): string {
  const parts: string[] = []

  if (briefing.store_name) {
    parts.push(`**Loja:** ${briefing.store_name}`)
  }

  if (briefing.platform) {
    parts.push(`**Plataforma:** ${briefing.platform}`)
  }

  if (briefing.monthly_revenue) {
    parts.push(`**Faturamento mensal:** ${briefing.monthly_revenue}`)
  }

  if (briefing.email_list_size) {
    parts.push(`**Tamanho da lista:** ${briefing.email_list_size} contatos`)
  }

  if (briefing.main_products) {
    parts.push(`**Produtos principais:** ${briefing.main_products}`)
  }

  if (briefing.target_audience) {
    parts.push(`**Público-alvo:** ${briefing.target_audience}`)
  }

  if (briefing.main_goals) {
    parts.push(`**Objetivos:** ${briefing.main_goals}`)
  }

  // Email flows status
  const flows: string[] = []
  if (briefing.has_welcome_flow) flows.push('Welcome')
  if (briefing.has_abandoned_cart_flow) flows.push('Abandoned Cart')
  if (briefing.has_post_purchase_flow) flows.push('Post-Purchase')

  if (flows.length > 0) {
    parts.push(`**Flows existentes:** ${flows.join(', ')}`)
  } else {
    parts.push(`**Flows existentes:** Nenhum`)
  }

  if (briefing.current_email_tool) {
    parts.push(`**Ferramenta atual:** ${briefing.current_email_tool}`)
  }

  return parts.join('\n\n')
}
