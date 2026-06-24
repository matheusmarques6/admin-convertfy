/**
 * Serviço de criação/convite de membro de organização.
 *
 * Núcleo extraído de `POST /api/admin/org-members` para ser reutilizado tanto
 * pela UI completa (`TeamMemberDialog` → `/api/admin/org-members`) quanto pelo
 * modal simples de "Convidar membro" (`/api/team/invite`). Mantém o fluxo
 * idêntico: cria (ou resolve) o auth user + `profiles`, insere em `org_members`,
 * atribui features e acesso a lojas, envia o e-mail de boas-vindas com a senha
 * provisória e registra a atividade.
 *
 * A validação de permissão (system admin OU owner/manager da org) fica nas
 * rotas — cada uma tem seu próprio gate.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { generateTempPassword } from "@/lib/utils/generate-password"
import { emailService } from "@/lib/email"
import { logger } from "@/lib/logger"
import type { OrgRole } from "@/types"

const log = logger.child("OrgMemberInvite")

export interface InviteOrgMemberInput {
  orgId: string
  /** Funções da conta (1+). A primeira é gravada em `org_members.role`; todas
   *  são gravadas em `org_member_roles`. */
  roles: OrgRole[]
  /** Se informado, adiciona um profile existente à org (não cria auth user). */
  profileId?: string
  /** Obrigatórios quando `profileId` não é informado (cria novo usuário). */
  email?: string
  name?: string
  jobTitle?: string | null
  storeIds?: string[]
  /** Profile id de quem está convidando (para `invited_by` e logs). */
  invitedBy: string
}

interface OrgMemberWithJoins {
  id: string
  organization?: { id: string; name: string; slug: string } | null
  profile?: { id: string; name: string; email: string } | null
  [key: string]: unknown
}

export interface InviteOrgMemberResult {
  member: OrgMemberWithJoins
  /** Senha provisória — só presente quando um novo auth user foi criado. */
  tempPassword: string | null
}

/**
 * Cria (ou resolve) o membro de organização. Lança `AppError` em falhas,
 * exatamente como o handler original — o caller envolve com `errorResponse`.
 */
export async function inviteOrgMember(
  input: InviteOrgMemberInput,
): Promise<InviteOrgMemberResult> {
  if (!input.orgId || !input.roles || input.roles.length === 0) {
    throw new AppError("Campos obrigatórios: org_id, roles[]", 400)
  }
  const primaryRole = input.roles[0]
  // Dedup preservando a ordem da seleção do usuário.
  const allRoles = Array.from(new Set(input.roles))

  const admin = createAdminClient()

  let profileId = input.profileId
  let tempPasswordForResponse: string | null = null

  if (!profileId) {
    if (!input.email || !input.name) {
      throw new AppError(
        "Se profile_id não for informado, email e name são obrigatórios",
        400,
      )
    }

    const email = input.email.toLowerCase()

    // Reusar profile existente pelo email, se houver
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single()

    if (existingProfile) {
      profileId = existingProfile.id
    } else {
      // Criar auth user; tratar caso de auth user órfão (já existe sem profile)
      let authUserId: string
      const tempPassword = generateTempPassword()

      const { data: authUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            name: input.name,
            is_agent: true,
            must_change_password: true,
          },
        })

      if (createError) {
        const isDuplicate =
          createError.message?.toLowerCase().includes("already") ||
          (createError as { status?: number }).status === 422

        if (isDuplicate) {
          log.debug("Auth user already exists, searching by email")

          let page = 1
          let foundUserId: string | null = null

          while (!foundUserId) {
            const { data: usersPage } = await admin.auth.admin.listUsers({
              page,
              perPage: 50,
            })
            const users = usersPage?.users || []
            const match = users.find((u) => u.email?.toLowerCase() === email)
            if (match) {
              foundUserId = match.id
              log.debug("Found orphan auth user:", match.id)
            } else if (users.length < 50) {
              break
            } else {
              page++
              if (page > 20) break // Safety cap
            }
          }

          if (!foundUserId) {
            log.error("Auth reports duplicate but user not found:", createError)
            throw new AppError(
              "Erro ao criar usuário: " + createError.message,
              500,
            )
          }

          authUserId = foundUserId
        } else {
          log.error("Create user error:", createError)
          throw new AppError("Erro ao criar usuário: " + createError.message, 500)
        }
      } else {
        log.debug("User created successfully:", authUser.user.id)
        authUserId = authUser.user.id
        tempPasswordForResponse = tempPassword
      }

      // Resolver/criar o profile do auth user
      const { data: existingProfileById } = await admin
        .from("profiles")
        .select("id")
        .eq("id", authUserId)
        .single()

      if (existingProfileById) {
        profileId = existingProfileById.id
      } else {
        const { data: newProfile, error: profileError } = await admin
          .from("profiles")
          .insert({
            id: authUserId,
            email,
            name: input.name,
            // role usa o default do banco
          })
          .select()
          .single()

        if (profileError) {
          log.error("Profile error:", profileError.message)
          throw new AppError("Erro ao criar perfil: " + profileError.message, 500)
        }

        profileId = newProfile.id
      }
    }
  }

  // Já é membro desta org?
  const { data: existingMember } = await admin
    .from("org_members")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("profile_id", profileId)
    .single()

  if (existingMember) {
    throw new AppError("Este usuário já é membro desta organização", 400)
  }

  // Criar org member (role single = primaryRole; junção carrega todas)
  const { data: member, error: insertError } = await admin
    .from("org_members")
    .insert({
      org_id: input.orgId,
      profile_id: profileId,
      role: primaryRole,
      job_title: input.jobTitle || null,
      invited_by: input.invitedBy,
      invite_accepted_at: new Date().toISOString(),
    })
    .select(
      `
        *,
        organization:organizations(id, name, slug),
        profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
      `,
    )
    .single()

  if (insertError) {
    log.error("Insert error:", insertError)
    throw new AppError("Erro ao criar membro: " + insertError.message, 500)
  }

  // Persistir TODAS as funções na junction (fonte de verdade do gating).
  const roleInserts = allRoles.map((role) => ({
    org_member_id: member.id,
    role,
    granted_by: input.invitedBy,
  }))
  const { error: rolesError } = await admin
    .from("org_member_roles")
    .insert(roleInserts)

  if (rolesError) {
    log.error("Roles insert error:", rolesError)
    throw new AppError("Erro ao atribuir funções: " + rolesError.message, 500)
  }

  // Acesso a lojas (opcional)
  if (input.storeIds && input.storeIds.length > 0) {
    const accessInserts = input.storeIds.map((storeId) => ({
      org_member_id: member.id,
      store_id: storeId,
      can_view: true,
      assigned_by: input.invitedBy,
    }))
    await admin.from("agent_store_access").insert(accessInserts)
  }

  // E-mail de boas-vindas com a senha provisória (não bloqueante)
  if (tempPasswordForResponse && input.email) {
    try {
      await emailService.sendWelcomeWithPassword({
        to: input.email.toLowerCase(),
        name: input.name || "Usuário",
        email: input.email.toLowerCase(),
        tempPassword: tempPasswordForResponse,
        orgName: member.organization?.name,
      })
      log.info("Welcome email sent to new org member", { email: input.email })
    } catch (emailError) {
      log.warn("Failed to send welcome email (member was still created)", {
        email: input.email,
        error: (emailError as Error).message,
      })
    }
  }

  // Log de atividade
  await admin.from("activities").insert({
    user_id: input.invitedBy,
    type: "member_added",
    description: `Membro "${member.profile?.name}" adicionado à organização`,
    metadata: { member_id: member.id, roles: allRoles },
  })

  return { member, tempPassword: tempPasswordForResponse }
}
