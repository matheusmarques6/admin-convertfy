import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Update onboarding stage for a client
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createClient()
    const { clientId } = await params
    const body = await request.json()

    const {
      onboarding_stage,
      onboarding_assigned_to,
      onboarding_notes,
    } = body

    const updateData: Record<string, unknown> = {}

    if (onboarding_stage !== undefined) {
      updateData.onboarding_stage = onboarding_stage
    }
    if (onboarding_assigned_to !== undefined) {
      updateData.onboarding_assigned_to = onboarding_assigned_to || null
    }
    if (onboarding_notes !== undefined) {
      updateData.onboarding_notes = onboarding_notes
    }

    const { data: client, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .select()
      .single()

    if (error) {
      console.error('Error updating client onboarding:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      client,
    })
  } catch (error) {
    console.error('Error in onboarding PATCH:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get single client onboarding details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createClient()
    const { clientId } = await params

    // Fetch client with all related data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select(`
        *,
        profiles:onboarding_assigned_to (
          id,
          name,
          email
        )
      `)
      .eq('id', clientId)
      .single()

    if (clientError) {
      console.error('Error fetching client:', clientError)
      return NextResponse.json({ success: false, error: clientError.message }, { status: 500 })
    }

    // Fetch briefing
    const { data: briefing } = await supabase
      .from('client_briefings')
      .select('*')
      .eq('client_id', clientId)
      .single()

    // Fetch onboarding history
    const { data: history } = await supabase
      .from('onboarding_history')
      .select(`
        *,
        profiles:changed_by (
          name
        )
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    // Fetch stores
    const { data: stores } = await supabase
      .from('client_stores')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)

    return NextResponse.json({
      success: true,
      client,
      briefing,
      history: history || [],
      stores: stores || [],
    })
  } catch (error) {
    console.error('Error in onboarding GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
