import { createAdminClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

const log = logger.child('OnboardingNotifications');

// ─── Parameter Types ───────────────────────────────────────────────

export interface NotifyStepPendingParams {
  assigneeProfileId: string;
  stepName: string;
  clientName: string;
  storeName: string;
  onboardingId: string;
  stepId: string;
  orgId: string;
}

export interface NotifyStepBlockedParams {
  recipientProfileId: string;
  stepName: string;
  blockerName: string;
  storeName: string;
  reason: string;
  onboardingId: string;
  stepId: string;
  orgId: string;
}

export interface NotifyPhaseCompleteParams {
  recipientProfileIds: string[];
  phaseName: string;
  storeName: string;
  nextPhase: string | null;
  onboardingId: string;
  orgId: string;
}

export interface NotifyOnboardingCompleteParams {
  recipientProfileIds: string[];
  storeName: string;
  onboardingId: string;
  orgId: string;
}

// ─── Notification Functions ────────────────────────────────────────

/**
 * Notify assignee that their onboarding step is ready to start.
 * Never throws — logs errors instead.
 */
export async function notifyStepPending(params: NotifyStepPendingParams): Promise<void> {
  try {
    if (!params.assigneeProfileId) return;

    const supabase = createAdminClient();

    const { error } = await supabase.from('notifications').insert({
      user_id: params.assigneeProfileId,
      title: `Nova etapa de onboarding: ${params.stepName}`,
      body: `${params.clientName} - ${params.storeName}: etapa "${params.stepName}" está pronta para iniciar`,
      type: 'info',
      link: '/admin/board',
      metadata: {
        onboarding_id: params.onboardingId,
        step_id: params.stepId,
        step_name: params.stepName,
      },
    });

    if (error) {
      log.error('[notifyStepPending] Failed to create notification:', error);
    }
  } catch (err) {
    log.error('[notifyStepPending] Unexpected error:', err);
  }
}

/**
 * Notify onboarding manager that a step was blocked.
 * Never throws — logs errors instead.
 */
export async function notifyStepBlocked(params: NotifyStepBlockedParams): Promise<void> {
  try {
    if (!params.recipientProfileId) return;

    const supabase = createAdminClient();

    const { error } = await supabase.from('notifications').insert({
      user_id: params.recipientProfileId,
      title: `Etapa bloqueada: ${params.stepName}`,
      body: `${params.blockerName} bloqueou a etapa "${params.stepName}" do onboarding de ${params.storeName}. Motivo: ${params.reason}`,
      type: 'warning',
      link: `/admin/onboarding?id=${params.onboardingId}`,
      metadata: {
        onboarding_id: params.onboardingId,
        step_id: params.stepId,
        step_name: params.stepName,
      },
    });

    if (error) {
      log.error('[notifyStepBlocked] Failed to create notification:', error);
    }
  } catch (err) {
    log.error('[notifyStepBlocked] Unexpected error:', err);
  }
}

/**
 * Notify when a phase completes.
 * Never throws — logs errors instead.
 */
export async function notifyPhaseComplete(params: NotifyPhaseCompleteParams): Promise<void> {
  try {
    const profileIds = params.recipientProfileIds.filter(Boolean);
    if (profileIds.length === 0) return;

    const supabase = createAdminClient();

    const nextPhaseText = params.nextPhase
      ? ` Próxima fase: ${params.nextPhase}`
      : '';

    const rows = profileIds.map((userId) => ({
      user_id: userId,
      title: `Fase concluída: ${params.phaseName}`,
      body: `Todas as etapas da fase "${params.phaseName}" do onboarding de ${params.storeName} foram concluídas.${nextPhaseText}`,
      type: 'success' as const,
      link: `/admin/onboarding?id=${params.onboardingId}`,
      metadata: {
        onboarding_id: params.onboardingId,
        phase_name: params.phaseName,
      },
    }));

    const { error } = await supabase.from('notifications').insert(rows);

    if (error) {
      log.error('[notifyPhaseComplete] Failed to create notifications:', error);
    }
  } catch (err) {
    log.error('[notifyPhaseComplete] Unexpected error:', err);
  }
}

/**
 * Notify when an entire onboarding completes.
 * Never throws — logs errors instead.
 */
export interface NotifyNoMemberForRoleParams {
  recipientProfileIds: string[];
  stepName: string;
  roleName: string;
  storeName: string;
  onboardingId: string;
  stepId: string;
  orgId: string;
}

export interface NotifyStepReassignedParams {
  assigneeProfileId: string;
  stepName: string;
  clientName: string;
  storeName: string;
  onboardingId: string;
  stepId: string;
  orgId: string;
}

/**
 * Notify owners/managers when a step has no active member for the required role.
 * Never throws — logs errors instead.
 */
export async function notifyNoMemberForRole(params: NotifyNoMemberForRoleParams): Promise<void> {
  try {
    const profileIds = params.recipientProfileIds.filter(Boolean);
    if (profileIds.length === 0) return;

    const supabase = createAdminClient();

    const rows = profileIds.map((userId) => ({
      user_id: userId,
      title: `Etapa sem membro disponível: ${params.stepName}`,
      body: `A etapa "${params.stepName}" está pronta mas não há membro ativo com role "${params.roleName}" na organização.`,
      type: 'warning' as const,
      link: `/admin/onboarding?id=${params.onboardingId}`,
      metadata: {
        onboarding_id: params.onboardingId,
        step_id: params.stepId,
        step_name: params.stepName,
        role_name: params.roleName,
      },
    }));

    const { error } = await supabase.from('notifications').insert(rows);

    if (error) {
      log.error('[notifyNoMemberForRole] Failed to create notifications:', error);
    }
  } catch (err) {
    log.error('[notifyNoMemberForRole] Unexpected error:', err);
  }
}

/**
 * Notify new assignee when a step is reassigned to them.
 * Never throws — logs errors instead.
 */
export async function notifyStepReassigned(params: NotifyStepReassignedParams): Promise<void> {
  try {
    if (!params.assigneeProfileId) return;

    const supabase = createAdminClient();

    const { error } = await supabase.from('notifications').insert({
      user_id: params.assigneeProfileId,
      title: `Etapa reatribuída: ${params.stepName}`,
      body: `${params.clientName} - ${params.storeName}: a etapa "${params.stepName}" foi atribuída a você`,
      type: 'info',
      link: '/admin/board',
      metadata: {
        onboarding_id: params.onboardingId,
        step_id: params.stepId,
        step_name: params.stepName,
      },
    });

    if (error) {
      log.error('[notifyStepReassigned] Failed to create notification:', error);
    }
  } catch (err) {
    log.error('[notifyStepReassigned] Unexpected error:', err);
  }
}

export async function notifyOnboardingComplete(params: NotifyOnboardingCompleteParams): Promise<void> {
  try {
    const profileIds = params.recipientProfileIds.filter(Boolean);
    if (profileIds.length === 0) return;

    const supabase = createAdminClient();

    const rows = profileIds.map((userId) => ({
      user_id: userId,
      title: `Onboarding concluído: ${params.storeName}`,
      body: `Parabéns! O onboarding da loja ${params.storeName} foi concluído com sucesso.`,
      type: 'success' as const,
      link: `/admin/onboarding?id=${params.onboardingId}`,
      metadata: {
        onboarding_id: params.onboardingId,
      },
    }));

    const { error } = await supabase.from('notifications').insert(rows);

    if (error) {
      log.error('[notifyOnboardingComplete] Failed to create notifications:', error);
    }
  } catch (err) {
    log.error('[notifyOnboardingComplete] Unexpected error:', err);
  }
}
