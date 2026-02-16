import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("SetupDatabase")

// POST - Set up database tables
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const results: { table: string; status: string; error?: string }[] = []

    // 1. Create client_stores table
    const { error: storesError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS client_stores (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          url VARCHAR(500),
          platform VARCHAR(100),
          klaviyo_api_key VARCHAR(255),
          klaviyo_list_id VARCHAR(100),
          shopify_store_domain VARCHAR(255),
          shopify_api_key VARCHAR(255),
          shopify_api_secret VARCHAR(255),
          shopify_access_token TEXT,
          klaviyo_public_key VARCHAR(100),
          klaviyo_private_key TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    })

    if (storesError) {
      // Try direct insert to test if table exists
      const { error: testError } = await supabase
        .from("client_stores")
        .select("id")
        .limit(1)

      if (testError && testError.message.includes("does not exist")) {
        results.push({ table: "client_stores", status: "error", error: "Tabela não existe. Execute a migração SQL manualmente." })
      } else {
        results.push({ table: "client_stores", status: "exists" })
      }
    } else {
      results.push({ table: "client_stores", status: "created" })
    }

    // 2. Create client_subscriptions table
    const { error: subsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS client_subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          value DECIMAL(10,2) NOT NULL,
          cycle TEXT NOT NULL,
          payment_method TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          start_date DATE NOT NULL,
          next_due_date DATE NOT NULL,
          asaas_subscription_id TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    })

    if (subsError) {
      const { error: testError } = await supabase
        .from("client_subscriptions")
        .select("id")
        .limit(1)

      if (testError && testError.message.includes("does not exist")) {
        results.push({ table: "client_subscriptions", status: "error", error: "Tabela não existe. Execute a migração SQL manualmente." })
      } else {
        results.push({ table: "client_subscriptions", status: "exists" })
      }
    } else {
      results.push({ table: "client_subscriptions", status: "created" })
    }

    // 3. Create client_charges table
    const { error: chargesError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS client_charges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          subscription_id UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
          description TEXT NOT NULL,
          value DECIMAL(10,2) NOT NULL,
          due_date DATE NOT NULL,
          payment_date DATE,
          status TEXT NOT NULL DEFAULT 'pending',
          payment_method TEXT NOT NULL,
          actual_payment_method TEXT,
          asaas_payment_id TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    })

    if (chargesError) {
      const { error: testError } = await supabase
        .from("client_charges")
        .select("id")
        .limit(1)

      if (testError && testError.message.includes("does not exist")) {
        results.push({ table: "client_charges", status: "error", error: "Tabela não existe. Execute a migração SQL manualmente." })
      } else {
        results.push({ table: "client_charges", status: "exists" })
      }
    } else {
      results.push({ table: "client_charges", status: "created" })
    }

    const hasErrors = results.some(r => r.status === "error")

    return NextResponse.json({
      success: !hasErrors,
      results,
      message: hasErrors
        ? "Algumas tabelas não puderam ser criadas automaticamente. Execute o SQL de migração no Supabase SQL Editor."
        : "Todas as tabelas estão configuradas!",
    })
  } catch (error) {
    return errorResponse(request, error, "SetupDatabase")
  }
}

// GET - Check database status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const tables = [
      "client_stores",
      "client_subscriptions",
      "client_charges",
      "invoices",
      "clients",
    ]

    const status: Record<string, { exists: boolean; count?: number; error?: string }> = {}

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })

      if (error) {
        status[table] = { exists: false, error: error.message }
      } else {
        status[table] = { exists: true, count: count || 0 }
      }
    }

    return NextResponse.json({
      success: true,
      tables: status,
    })
  } catch (error) {
    return errorResponse(request, error, "SetupDatabase")
  }
}
