/**
 * GET/PUT /api/settings/company
 *
 * Dados cadastrais da própria agência (Configurações → Conta). Irmã de
 * `/api/settings/profile` e `/api/settings/avatar`.
 *
 * O `org_id` é resolvido AQUI, a partir de `org_members` do usuário — não
 * viaja no corpo. A policy da tabela é `is_org_member()`, que diz "é membro
 * ativo de alguma org" e não confere QUAL: deixar o cliente escolher a org
 * no payload seria a única brecha do desenho.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { SupabaseClient } from "@supabase/supabase-js"

const log = logger.child("SettingsCompany")

export const dynamic = "force-dynamic"

const CAMPOS = [
  "company_name",
  "cnpj",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "logo_url",
] as const

const texto = z.string().trim().max(200).default("")

const companySchema = z.object({
  company_name: texto,
  // O CNPJ é guardado COMO DIGITADO: é um registro interno de uma linha e
  // ninguém o consome ainda (nenhum gerador de contrato, proposta ou
  // relatório lê CNPJ da casa). A normalização entra junto com o primeiro
  // consumidor, não antes dele.
  cnpj: texto,
  phone: texto,
  email: z.string().trim().max(200).default(""),
  address: texto,
  city: texto,
  state: texto,
  logo_url: z.string().trim().max(2000).default(""),
})

type CompanyPayload = z.infer<typeof companySchema>

function vazio(): CompanyPayload {
  return Object.fromEntries(CAMPOS.map((c) => [c, ""])) as CompanyPayload
}

/** A org do usuário. Sem ela não há onde ler nem gravar. */
async function resolverOrgId(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (error) {
    log.error("org_lookup_failed", error)
    throw new AppError("Erro ao resolver a organização", 500)
  }
  const orgId = (data?.org_id as string | undefined) ?? null
  if (!orgId) {
    throw new AppError("Usuário não pertence a nenhuma organização", 403)
  }
  return orgId
}

/** Código de "a tabela/coluna não existe" — a migration deste repo escorrega. */
function schemaAusente(code?: string): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST204"
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolverOrgId(supabase, user.id)

    const { data, error } = await supabase
      .from("company_settings")
      .select(CAMPOS.join(", "))
      .eq("org_id", orgId)
      .maybeSingle()

    if (error) {
      // Sem a migration 20261154, a tela ainda abre — com os campos vazios e
      // dizendo por quê. Erro engolido aqui foi exatamente o que fez o
      // formulário parecer "nunca preenchido" por meses.
      if (schemaAusente(error.code)) {
        log.warn("schema_missing", { code: error.code })
        return successResponse(request, {
          company: vazio(),
          schema_missing: true,
        })
      }
      log.error("company_load_failed", error)
      throw new AppError("Erro ao carregar dados da empresa", 500)
    }

    // O select por string dinâmica devolve `unknown` ao supabase-js; a forma
    // é garantida pela lista CAMPOS, que é a mesma do schema.
    const linha = (data ?? {}) as Partial<CompanyPayload>
    return successResponse(request, {
      company: { ...vazio(), ...linha },
      schema_missing: false,
    })
  } catch (error) {
    return errorResponse(request, error, "SettingsCompany")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolverOrgId(supabase, user.id)

    const parsed = companySchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || "Dados inválidos", 400)
    }

    // Upsert por org_id — é o UNIQUE da migration que torna isto idempotente.
    // O código anterior usava `onConflict: "id"` com um payload sem `id`:
    // conflito que nunca acontece, linha nova a cada clique em Salvar.
    const { error } = await supabase
      .from("company_settings")
      .upsert({ ...parsed.data, org_id: orgId }, { onConflict: "org_id" })

    if (error) {
      if (schemaAusente(error.code)) {
        log.error("schema_missing_on_write", { code: error.code })
        throw new AppError(
          "A tabela company_settings ainda não existe — aplique a migration 20261154_company_settings.sql",
          422,
        )
      }
      log.error("company_save_failed", error)
      throw new AppError("Erro ao salvar dados da empresa", 500)
    }

    return successResponse(
      request,
      { company: parsed.data },
      { message: "Informações da empresa atualizadas" },
    )
  } catch (error) {
    return errorResponse(request, error, "SettingsCompany")
  }
}
