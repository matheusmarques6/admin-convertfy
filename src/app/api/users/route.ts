import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, role')
      .order('full_name')

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      users: users || []
    })
  } catch (error) {
    console.error('Error in users API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
