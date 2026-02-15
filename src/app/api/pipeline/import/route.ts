import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import * as XLSX from "xlsx"

interface ImportRow {
  name?: string
  email?: string
  phone?: string
  company?: string
  website?: string
  status?: string
  tags?: string
  [key: string]: string | undefined
}

const VALID_STATUSES = ["active", "inactive", "churned", "prospect", "onboarding"]

// POST /api/pipeline/import - Import clients from Excel
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const pipelineId = formData.get("pipeline_id") as string | null

    if (!file) {
      return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })
    }

    if (!pipelineId) {
      return NextResponse.json({ error: "pipeline_id é obrigatório" }, { status: 400 })
    }

    // Read Excel file
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: "array" })

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: "Planilha vazia" }, { status: 400 })
    }

    const sheet = workbook.Sheets[sheetName]
    const rows: ImportRow[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nenhum dado encontrado na planilha" }, { status: 400 })
    }

    // Normalize column names (lowercase, trim, remove accents)
    const normalizedRows = rows.map((row) => {
      const normalized: Record<string, string> = {}
      for (const [key, value] of Object.entries(row)) {
        const normalKey = key
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, "_")
        normalized[normalKey] = String(value || "").trim()
      }
      return normalized
    })

    // Map columns - support Portuguese and English names
    const columnMap: Record<string, string> = {
      nome: "name",
      name: "name",
      email: "email",
      "e-mail": "email",
      telefone: "phone",
      phone: "phone",
      tel: "phone",
      empresa: "company",
      company: "company",
      site: "website",
      website: "website",
      url: "website",
      status: "status",
      tags: "tags",
    }

    const adminClient = createAdminClient()
    const results = {
      total: normalizedRows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; error: string }[],
    }

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i]
      const rowNum = i + 2 // +2 because row 1 is header, rows are 1-indexed

      // Map to client fields
      const clientData: Record<string, unknown> = {}
      const customFields: Record<string, string> = {}

      for (const [col, value] of Object.entries(row)) {
        if (!value) continue
        const mappedField = columnMap[col]
        if (mappedField) {
          clientData[mappedField] = value
        } else {
          // Unknown columns go to custom_fields
          customFields[col] = value
        }
      }

      // Validate required field: name
      if (!clientData.name) {
        results.errors.push({ row: rowNum, error: "Campo 'nome' é obrigatório" })
        results.skipped++
        continue
      }

      // Validate status
      if (clientData.status && !VALID_STATUSES.includes(clientData.status as string)) {
        clientData.status = "prospect" // default
      }
      if (!clientData.status) {
        clientData.status = "prospect"
      }

      // Handle tags (comma-separated string → array)
      if (clientData.tags) {
        clientData.tags = (clientData.tags as string)
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean)
      } else {
        clientData.tags = []
      }

      // Add custom fields if any
      if (Object.keys(customFields).length > 0) {
        clientData.custom_fields = customFields
      }

      // Set owner to current user
      clientData.owner_id = user.id

      try {
        // Check if client already exists by email
        if (clientData.email) {
          const { data: existing } = await adminClient
            .from("clients")
            .select("id")
            .eq("email", clientData.email as string)
            .maybeSingle()

          if (existing) {
            // Update existing client (this triggers import rules via UPDATE trigger)
            const { error } = await adminClient
              .from("clients")
              .update(clientData)
              .eq("id", existing.id)

            if (error) {
              results.errors.push({ row: rowNum, error: error.message })
              results.skipped++
            } else {
              results.updated++
            }
            continue
          }
        }

        // Create new client (this triggers import rules via INSERT trigger)
        const { error } = await adminClient
          .from("clients")
          .insert(clientData)

        if (error) {
          results.errors.push({ row: rowNum, error: error.message })
          results.skipped++
        } else {
          results.created++
        }
      } catch (err) {
        results.errors.push({
          row: rowNum,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        })
        results.skipped++
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error("Import error:", error)
    return NextResponse.json(
      { error: "Erro ao processar importação" },
      { status: 500 }
    )
  }
}
