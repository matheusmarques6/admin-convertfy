import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST - Register a new feedback call
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      store_id,
      client_id,
      conducted_by,
      conducted_at,
      duration_minutes,
      notes,
      action_items,
      next_call_date,
      result_percentage,
      klaviyo_revenue,
      total_revenue,
    } = body

    if (!store_id || !client_id || !conducted_by) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: store_id, client_id, conducted_by' },
        { status: 400 }
      )
    }

    // Insert the feedback call
    const { data: feedbackCall, error } = await supabase
      .from('store_feedback_calls')
      .insert({
        store_id,
        client_id,
        conducted_by,
        conducted_at: conducted_at || new Date().toISOString(),
        duration_minutes: duration_minutes || null,
        notes: notes || null,
        action_items: action_items || null,
        next_call_date: next_call_date || null,
        result_percentage: result_percentage || null,
        klaviyo_revenue: klaviyo_revenue || null,
        total_revenue: total_revenue || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating feedback call:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // The trigger will automatically update client_stores.next_feedback_date

    return NextResponse.json({
      success: true,
      feedbackCall,
      message: 'Feedback call registered successfully'
    })
  } catch (error) {
    console.error('Error in feedback POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET - Get feedback call history for a store
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('store_id')
    const clientId = searchParams.get('client_id')
    const limit = parseInt(searchParams.get('limit') || '10')

    let query = supabase
      .from('store_feedback_calls')
      .select(`
        *,
        profiles:conducted_by (
          id,
          full_name,
          avatar_url
        ),
        client_stores:store_id (
          store_name,
          platform
        ),
        clients:client_id (
          name,
          company
        )
      `)
      .order('conducted_at', { ascending: false })
      .limit(limit)

    if (storeId) {
      query = query.eq('store_id', storeId)
    }

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    const { data: calls, error } = await query

    if (error) {
      console.error('Error fetching feedback calls:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      calls: calls || []
    })
  } catch (error) {
    console.error('Error in feedback GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update store feedback settings
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      store_id,
      feedback_frequency,
      next_feedback_date,
    } = body

    if (!store_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: store_id' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}

    if (feedback_frequency) {
      updateData.feedback_frequency = feedback_frequency
    }

    if (next_feedback_date) {
      updateData.next_feedback_date = next_feedback_date
    }

    const { data, error } = await supabase
      .from('client_stores')
      .update(updateData)
      .eq('id', store_id)
      .select("id, store_name, feedback_frequency, next_feedback_date, last_feedback_date, feedback_notes")
      .single()

    if (error) {
      console.error('Error updating store feedback settings:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      store: data,
      message: 'Feedback settings updated successfully'
    })
  } catch (error) {
    console.error('Error in feedback PATCH:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
