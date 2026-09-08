import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';

const log = logger.child('Notification');

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface CreateNotificationData {
  user_id: string;
  title: string;
  body?: string;
  type?: NotificationType;
  link?: string;
  event_id?: string;
  metadata?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body?: string;
  type: NotificationType;
  link?: string;
  read: boolean;
  read_at?: string;
  event_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Teto do badge do sino — a UI mostra "99+" acima disso. */
export const UNREAD_BADGE_CAP = 100;

class NotificationService {
  /**
   * Create a new notification
   */
  async create(data: CreateNotificationData): Promise<Notification | null> {
    const supabase = createClient();

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: data.user_id,
        title: data.title,
        body: data.body,
        type: data.type || 'info',
        link: data.link,
        event_id: data.event_id,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) {
      log.error('[NotificationService] Failed to create notification:', error);
      return null;
    }

    return notification;
  }

  /**
   * Create notifications for multiple users
   */
  async createBulk(
    userIds: string[],
    data: Omit<CreateNotificationData, 'user_id'>
  ): Promise<number> {
    const supabase = createClient();

    const notifications = userIds.map((userId) => ({
      user_id: userId,
      title: data.title,
      body: data.body,
      type: data.type || 'info',
      link: data.link,
      event_id: data.event_id,
      metadata: data.metadata || {},
    }));

    const { data: result, error } = await supabase
      .from('notifications')
      .insert(notifications)
      .select();

    if (error) {
      log.error('[NotificationService] Failed to create bulk notifications:', error);
      return 0;
    }

    return result?.length || 0;
  }

  /**
   * Server-side variant of createBulk using the admin client. Required by
   * pipeline contexts (cron, background runners) where the browser client
   * does not have an authenticated session and RLS would block inserts.
   *
   * Returns the number of rows actually inserted.
   */
  async createBulkAdmin(
    userIds: string[],
    data: Omit<CreateNotificationData, 'user_id'>
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      title: data.title,
      body: data.body,
      type: data.type || 'info',
      link: data.link,
      event_id: data.event_id,
      metadata: data.metadata || {},
    }));
    const { data: inserted, error } = await admin
      .from('notifications')
      .insert(notifications)
      .select('id');
    if (error) {
      log.error('createBulkAdmin.insert_failed', {
        userCount: userIds.length,
        error: error.message,
      });
      return 0;
    }
    return inserted?.length ?? 0;
  }

  /**
   * Get unread notifications for a user
   */
  async getUnread(userId: string, limit = 10): Promise<Notification[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      log.error('[NotificationService] Failed to get unread notifications:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get all notifications for a user
   */
  async getAll(userId: string, limit = 50): Promise<Notification[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      log.error('[NotificationService] Failed to get notifications:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const supabase = createClient();

    // RPC com TETO em vez de count exact. A tabela chegou a 18 mil linhas
    // não lidas (cron de onboarding), e o badge só mostra "99+" — contar
    // além disso era varredura pura. `userId` fica no filtro por
    // compatibilidade de assinatura; quem decide é a RLS (auth.uid()).
    const { data, error } = await supabase.rpc('unread_notifications_count', {
      p_cap: UNREAD_BADGE_CAP,
    });

    if (error) {
      log.error('[NotificationService] Failed to get unread count:', error);
      return 0;
    }

    void userId;
    return typeof data === 'number' ? data : 0;
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) {
      log.error('[NotificationService] Failed to mark as read:', error);
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      log.error('[NotificationService] Failed to mark all as read:', error);
    }
  }

  /**
   * Delete a notification
   */
  async delete(notificationId: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      log.error('[NotificationService] Failed to delete notification:', error);
    }
  }

  /**
   * Notify users by role
   */
  async notifyByRole(
    roles: string[],
    data: Omit<CreateNotificationData, 'user_id'>
  ): Promise<number> {
    const supabase = createClient();

    // Get users with the specified roles
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id')
      .in('role', roles);

    if (error || !users?.length) {
      log.error('[NotificationService] Failed to get users by role:', error);
      return 0;
    }

    const userIds = users.map((u) => u.id);
    return this.createBulk(userIds, data);
  }

  /**
   * Notify users by tag (e.g. 'cto', 'designer_lead', 'cs_lead').
   *
   * Queries `profiles WHERE tags && ARRAY[$tags]` (overlap operator — qualquer
   * tag em comum dispara). Padrao alinhado com Epic AE (story AE-7) para
   * rotear alertas operacionais sem mudar schema. Usa admin client porque
   * o caller tipico e service-side (cron, runner em background).
   *
   * **NAO envia email** — quem orquestra (ex: generation-notify.service)
   * decide se quer email transacional adicional.
   *
   * Retorna numero de profiles que receberam notificacao in-app.
   * Logs `notifyByTag.empty_audience` em warn se zero — alerta ops para
   * configurar a tag (ex: marcar 1 profile como CTO antes do deploy).
   */
  async notifyByTag(
    tags: string[],
    data: Omit<CreateNotificationData, 'user_id'>
  ): Promise<number> {
    if (!tags.length) {
      log.warn('notifyByTag.empty_tags', { tags });
      return 0;
    }

    // Import dinamico para nao puxar admin client em bundles client-side
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();

    // `overlaps` corresponde ao operador `&&` (Postgres array overlap).
    // PostgREST: .overlaps('tags', tagsArray) gera `tags=ov.{a,b}`.
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id')
      .overlaps('tags', tags);

    if (error) {
      log.error('notifyByTag.query_failed', {
        tags,
        error: error.message,
      });
      return 0;
    }

    const userIds = (profiles ?? []).map((p) => p.id as string);
    if (userIds.length === 0) {
      log.warn('notifyByTag.empty_audience', { tags });
      return 0;
    }

    // createBulk usa o browser client por design legacy — para garantir
    // que a INSERT passe RLS quando chamada de cron/server, fazemos o
    // insert direto via admin client aqui.
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      title: data.title,
      body: data.body,
      type: data.type || 'info',
      link: data.link,
      event_id: data.event_id,
      metadata: data.metadata || {},
    }));

    const { data: inserted, error: insertErr } = await admin
      .from('notifications')
      .insert(notifications)
      .select('id');

    if (insertErr) {
      log.error('notifyByTag.insert_failed', {
        tags,
        userCount: userIds.length,
        error: insertErr.message,
      });
      return 0;
    }

    const count = inserted?.length ?? 0;
    log.info('notifyByTag.fired', {
      tags,
      recipients_count: count,
    });
    return count;
  }

  /**
   * Notify client owner
   */
  async notifyClientOwner(
    clientId: string,
    data: Omit<CreateNotificationData, 'user_id'>
  ): Promise<void> {
    const supabase = createClient();

    const { data: client, error } = await supabase
      .from('clients')
      .select('owner_id')
      .eq('id', clientId)
      .single();

    if (error || !client?.owner_id) {
      log.error('[NotificationService] Failed to get client owner:', error);
      return;
    }

    await this.create({ ...data, user_id: client.owner_id });
  }
}

export const notificationService = new NotificationService();
