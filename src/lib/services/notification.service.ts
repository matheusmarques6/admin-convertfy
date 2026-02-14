import { createClient } from '@/lib/supabase/client';

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
      console.error('[NotificationService] Failed to create notification:', error);
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
      console.error('[NotificationService] Failed to create bulk notifications:', error);
      return 0;
    }

    return result?.length || 0;
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
      console.error('[NotificationService] Failed to get unread notifications:', error);
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
      console.error('[NotificationService] Failed to get notifications:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const supabase = createClient();

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.error('[NotificationService] Failed to get unread count:', error);
      return 0;
    }

    return count || 0;
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
      console.error('[NotificationService] Failed to mark as read:', error);
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
      console.error('[NotificationService] Failed to mark all as read:', error);
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
      console.error('[NotificationService] Failed to delete notification:', error);
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
      console.error('[NotificationService] Failed to get users by role:', error);
      return 0;
    }

    const userIds = users.map((u) => u.id);
    return this.createBulk(userIds, data);
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
      console.error('[NotificationService] Failed to get client owner:', error);
      return;
    }

    await this.create({ ...data, user_id: client.owner_id });
  }
}

export const notificationService = new NotificationService();
